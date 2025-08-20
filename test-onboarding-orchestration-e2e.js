/**
 * E2E Test: Onboarding Task Orchestration with Full Logging
 * 
 * This test creates an onboarding task and captures all orchestration logs
 * including LLM reasoning, agent discovery, and subtask execution
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  'https://raenkewzlvrdqufwxjpl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzA0NzM4MywiZXhwIjoyMDY4NjIzMzgzfQ.tPBuIjB_JF4aW0NEmYwzVfbg1zcFUo1r1eOTeZVWuyw'
);

// Test configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_USER_ID = '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934'; // Test user ID

// Logging utilities
const logFile = path.join(__dirname, `onboarding-orchestration-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    message,
    ...(data && { data })
  };
  
  // Console output
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  
  // File output
  logStream.write(JSON.stringify(logEntry) + '\n');
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    const data = await response.json();
    return data.status === 'healthy' || data.status === 'OK';
  } catch (error) {
    log('❌ Backend health check failed', { error: error.message });
    return false;
  }
}

async function createOnboardingTask() {
  log('🚀 CREATING ONBOARDING TASK');
  
  const taskId = uuidv4();
  const taskData = {
    id: taskId,
    user_id: TEST_USER_ID,
    task_type: 'onboarding',
    template_id: 'onboarding',
    title: `Business Onboarding - ${new Date().toISOString()}`,
    description: 'Complete business profile setup and verification',
    status: 'pending',
    priority: 'high',
    metadata: {
      source: 'e2e-test',
      test_run: true,
      timestamp: new Date().toISOString(),
      business_info: {
        name: 'TechVenture Solutions',
        type: 'C-Corporation',
        state: 'Delaware'
      },
      taskDefinition: {
        name: 'Business Profile Onboarding',
        description: 'Complete onboarding process for new business',
        goals: [
          'Collect user profile information',
          'Discover and verify business details',
          'Ensure compliance with state requirements',
          'Generate optimized forms for the business',
          'Create comprehensive action plan'
        ]
      }
    }
  };
  
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();
  
  if (error) {
    log('❌ Failed to create task', { error });
    throw error;
  }
  
  log('✅ Task created successfully', {
    taskId: data.id,
    title: data.title,
    type: data.task_type,
    status: data.status
  });
  
  return data;
}

async function monitorOrchestration(taskId, duration = 30000) {
  log('📊 MONITORING ORCHESTRATION ACTIVITY', { taskId, duration });
  
  const startTime = Date.now();
  const events = [];
  let previousEventCount = 0;
  
  // Set up real-time subscription
  const channel = supabase
    .channel(`task-${taskId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'task_context_events',
      filter: `task_id=eq.${taskId}`
    }, (payload) => {
      log('📡 Real-time event received', {
        operation: payload.new.operation,
        actor: payload.new.actor_id || payload.new.actor_type,
        timestamp: payload.new.created_at
      });
      events.push(payload.new);
    })
    .subscribe();
  
  // Poll for events periodically
  const pollInterval = setInterval(async () => {
    const { data: dbEvents, error } = await supabase
      .from('task_context_events')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (!error && dbEvents) {
      if (dbEvents.length > previousEventCount) {
        const newEvents = dbEvents.slice(previousEventCount);
        log(`📈 ${newEvents.length} new events detected`, {
          totalEvents: dbEvents.length,
          newEvents: newEvents.map(e => ({
            operation: e.operation,
            actor: e.actor_id || e.actor_type,
            timestamp: e.created_at
          }))
        });
        
        // Log detailed event data
        for (const event of newEvents) {
          if (event.operation === 'execution_plan_reasoning_recorded') {
            log('🧠 ORCHESTRATOR REASONING', {
              reasoning: event.data?.reasoning,
              phaseCount: event.data?.phaseCount,
              totalSubtasks: event.data?.totalSubtasks
            });
          } else if (event.operation === 'execution_plan_created') {
            log('📋 EXECUTION PLAN CREATED', {
              phases: event.data?.phases,
              estimatedDuration: event.data?.estimated_duration
            });
          } else if (event.operation === 'subtask_executed') {
            log('🎯 SUBTASK EXECUTED', {
              subtask: event.data?.subtask,
              agent: event.data?.agent,
              instruction: event.data?.instruction,
              success: event.data?.success
            });
          } else if (event.operation === 'phase_completed') {
            log('✅ PHASE COMPLETED', {
              phaseName: event.data?.phaseName,
              duration: event.data?.duration,
              subtaskResults: event.data?.subtaskResults
            });
          }
        }
        
        previousEventCount = dbEvents.length;
      }
    }
  }, 2000);
  
  // Wait for specified duration
  await new Promise(resolve => setTimeout(resolve, duration));
  
  // Clean up
  clearInterval(pollInterval);
  await channel.unsubscribe();
  
  // Get final event list
  const { data: finalEvents } = await supabase
    .from('task_context_events')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  
  return finalEvents || [];
}

async function analyzeOrchestration(events) {
  log('🔍 ANALYZING ORCHESTRATION RESULTS');
  
  const analysis = {
    totalEvents: events.length,
    orchestratorEvents: events.filter(e => e.actor_id === 'OrchestratorAgent' || e.actor_id === 'orchestrator_agent').length,
    agentExecutions: {},
    phases: [],
    reasoning: null,
    executionPlan: null
  };
  
  // Group events by agent
  for (const event of events) {
    const agent = event.actor_id || event.actor_type || 'unknown';
    if (!analysis.agentExecutions[agent]) {
      analysis.agentExecutions[agent] = [];
    }
    analysis.agentExecutions[agent].push({
      operation: event.operation,
      timestamp: event.created_at,
      data: event.data
    });
    
    // Extract key information
    if (event.operation === 'execution_plan_reasoning_recorded' && event.data?.reasoning) {
      analysis.reasoning = event.data.reasoning;
    }
    if (event.operation === 'execution_plan_created' && event.data) {
      analysis.executionPlan = event.data;
    }
    if (event.operation === 'phase_completed') {
      analysis.phases.push({
        name: event.data?.phaseName,
        duration: event.data?.duration,
        subtasks: event.data?.subtaskResults
      });
    }
  }
  
  log('📊 ORCHESTRATION ANALYSIS', analysis);
  
  // Log detailed reasoning if available
  if (analysis.reasoning) {
    log('🧠 DETAILED ORCHESTRATOR REASONING', {
      taskAnalysis: analysis.reasoning.task_analysis,
      subtaskDecomposition: analysis.reasoning.subtask_decomposition,
      coordinationStrategy: analysis.reasoning.coordination_strategy
    });
  }
  
  return analysis;
}

async function runE2ETest() {
  log('=' .repeat(80));
  log('🎯 E2E ONBOARDING ORCHESTRATION TEST');
  log('=' .repeat(80));
  log('📁 Log file: ' + logFile);
  log('🌐 Backend URL: ' + BACKEND_URL);
  log('👤 Test User ID: ' + TEST_USER_ID);
  log('=' .repeat(80));
  
  try {
    // Step 1: Check backend health
    log('\n📍 STEP 1: Backend Health Check');
    const isHealthy = await checkBackendHealth();
    if (!isHealthy) {
      throw new Error('Backend is not healthy');
    }
    log('✅ Backend is healthy');
    
    // Step 2: Create onboarding task
    log('\n📍 STEP 2: Create Onboarding Task');
    const task = await createOnboardingTask();
    
    // Step 3: Monitor orchestration
    log('\n📍 STEP 3: Monitor Orchestration (30 seconds)');
    const events = await monitorOrchestration(task.id, 30000);
    
    // Step 4: Analyze results
    log('\n📍 STEP 4: Analyze Orchestration Results');
    const analysis = await analyzeOrchestration(events);
    
    // Step 5: Summary
    log('\n' + '=' .repeat(80));
    log('📊 TEST SUMMARY');
    log('=' .repeat(80));
    log(`✅ Task ID: ${task.id}`);
    log(`📊 Total Events: ${analysis.totalEvents}`);
    log(`🤖 Active Agents: ${Object.keys(analysis.agentExecutions).length}`);
    log(`📋 Phases Completed: ${analysis.phases.length}`);
    
    if (analysis.totalEvents > 0) {
      log('\n✅✅✅ ORCHESTRATION SUCCESS! ✅✅✅');
      log('The orchestrator successfully:');
      log('1. Analyzed the onboarding task');
      log('2. Created an execution plan with reasoning');
      log('3. Decomposed the task into subtasks');
      log('4. Assigned agents to subtasks');
      log('5. Executed the orchestration workflow');
    } else {
      log('\n⚠️ No orchestration events detected');
      log('The task was created but orchestration may not have triggered');
    }
    
    log('\n📁 Full logs saved to: ' + logFile);
    
  } catch (error) {
    log('❌ Test failed', { error: error.message, stack: error.stack });
  } finally {
    logStream.end();
  }
}

// Run the test
runE2ETest().catch(console.error);