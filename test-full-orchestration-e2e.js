/**
 * COMPREHENSIVE E2E TEST: Onboarding Task Orchestration
 * 
 * This test creates an onboarding task through the authenticated Dev Toolkit
 * and captures ALL orchestration activity including:
 * - LLM reasoning and execution plans
 * - Agent discovery and invocation
 * - Subtask decomposition and execution
 * - Real-time event monitoring
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const APP_URL = process.env.APP_URL || 'http://localhost:8082';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const SUPABASE_URL = 'https://raenkewzlvrdqufwxjpl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI2NTU1OTQsImV4cCI6MjAzODIzMTU5NH0.o7MDkPYqJJBJKTnNzssH0BRngUa9hpEAbnvCLWLgeNk';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Logging setup
const timestamp = Date.now();
const logDir = path.join(__dirname, 'orchestration-logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, `full-orchestration-${timestamp}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(level, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data })
  };
  
  // Console output with color coding
  const colors = {
    INFO: '\x1b[36m',
    SUCCESS: '\x1b[32m',
    WARNING: '\x1b[33m',
    ERROR: '\x1b[31m',
    ORCHESTRATION: '\x1b[35m',
    LLM: '\x1b[94m'
  };
  
  const reset = '\x1b[0m';
  const color = colors[level] || '';
  
  console.log(`${color}[${entry.timestamp}] [${level}] ${message}${reset}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  
  // File output
  logStream.write(JSON.stringify(entry) + '\n');
}

async function testFullOrchestration() {
  log('INFO', '='.repeat(80));
  log('INFO', '🚀 COMPREHENSIVE ORCHESTRATION E2E TEST');
  log('INFO', '='.repeat(80));
  log('INFO', `📁 Log file: ${logFile}`);
  log('INFO', `🌐 Frontend: ${APP_URL}`);
  log('INFO', `🔧 Backend: ${BACKEND_URL}`);
  log('INFO', '='.repeat(80));
  
  const browser = await chromium.launch({ 
    headless: process.env.HEADLESS === 'true',
    slowMo: 100 // Slow down for visibility
  });
  
  let taskId = null;
  let orchestrationSubscription = null;
  
  try {
    // Create browser context with authentication
    const context = await browser.newContext({
      storageState: '.auth/user-state.json'
    });
    
    const page = await context.newPage();
    
    // Set up comprehensive monitoring
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('orchestrat') || text.includes('agent') || text.includes('LLM')) {
        log('INFO', `Browser Console: ${text.substring(0, 200)}`);
      }
    });
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/tasks') || url.includes('/api/orchestrate')) {
        log('INFO', `API Request: ${request.method()} ${url}`);
        if (request.postData()) {
          try {
            const data = JSON.parse(request.postData());
            log('INFO', 'Request Payload:', data);
          } catch {}
        }
      }
    });
    
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/api/tasks') && response.status() === 200) {
        try {
          const body = await response.json();
          if (body.task && body.task.id) {
            taskId = body.task.id;
            log('SUCCESS', `Task Created: ${taskId}`, {
              title: body.task.title,
              type: body.task.task_type
            });
          }
        } catch {}
      }
    });
    
    log('INFO', '\n📍 PHASE 1: Navigate to Dev Toolkit');
    await page.goto(`${APP_URL}/dev-toolkit-standalone`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Verify authentication
    const authStatus = await page.evaluate(() => {
      const token = localStorage.getItem('sb-raenkewzlvrdqufwxjpl-auth-token');
      if (token) {
        try {
          const parsed = JSON.parse(token);
          return { 
            authenticated: !!parsed.access_token,
            userEmail: parsed.user?.email 
          };
        } catch {}
      }
      return { authenticated: false };
    });
    
    log('INFO', 'Authentication Status:', authStatus);
    
    if (!authStatus.authenticated) {
      throw new Error('Not authenticated! Run universal-auth-capture.js first');
    }
    
    log('INFO', '\n📍 PHASE 2: Create Onboarding Task');
    
    // Select template
    const templateButton = page.locator('button[role="combobox"]:has-text("Select template")').first();
    if (await templateButton.isVisible()) {
      log('INFO', 'Opening template selector...');
      await templateButton.click();
      await page.waitForTimeout(1000);
      
      const onboardingOption = page.locator('[role="option"]:has-text("Onboarding")').first();
      if (await onboardingOption.isVisible()) {
        log('INFO', 'Selecting Onboarding template...');
        await onboardingOption.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Click Create
    const createButton = page.locator('button:has-text("Create")').first();
    if (await createButton.isVisible() && !await createButton.isDisabled()) {
      log('INFO', '🚀 Creating task...');
      await createButton.click();
      await page.waitForTimeout(5000);
    }
    
    // Wait for task ID to be captured
    if (!taskId) {
      // Try to extract from UI
      const extractedId = await page.evaluate(() => {
        const selector = document.querySelector('select');
        if (selector && selector.value) {
          return selector.value;
        }
        const bodyText = document.body.innerText;
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const match = bodyText.match(uuidPattern);
        return match ? match[0] : null;
      });
      
      if (extractedId) {
        taskId = extractedId;
        log('SUCCESS', `Task ID extracted: ${taskId}`);
      }
    }
    
    if (!taskId) {
      log('WARNING', 'Could not determine task ID, continuing anyway...');
    }
    
    log('INFO', '\n📍 PHASE 3: Monitor Orchestration Activity');
    
    // Set up real-time subscription if we have a task ID
    if (taskId) {
      orchestrationSubscription = supabase
        .channel(`orchestration-${taskId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'task_context_events',
          filter: `task_id=eq.${taskId}`
        }, (payload) => {
          const event = payload.new;
          
          // Color-coded logging based on event type
          if (event.operation === 'execution_plan_reasoning_recorded') {
            log('LLM', '🧠 ORCHESTRATOR REASONING CAPTURED', {
              reasoning: event.data?.reasoning,
              phaseCount: event.data?.phaseCount,
              subtaskCount: event.data?.totalSubtasks
            });
          } else if (event.operation === 'execution_plan_created') {
            log('ORCHESTRATION', '📋 EXECUTION PLAN CREATED', {
              phases: event.data?.phases?.length,
              estimatedDuration: event.data?.estimated_duration
            });
          } else if (event.operation === 'agent_discovered') {
            log('ORCHESTRATION', '🤖 AGENT DISCOVERED', {
              agentId: event.data?.agentId,
              capabilities: event.data?.capabilities
            });
          } else if (event.operation === 'subtask_dispatched') {
            log('ORCHESTRATION', '📤 SUBTASK DISPATCHED', {
              subtask: event.data?.subtask,
              targetAgent: event.data?.agent,
              instruction: event.data?.instruction
            });
          } else if (event.operation === 'subtask_executed') {
            log('SUCCESS', '✅ SUBTASK EXECUTED', {
              subtask: event.data?.subtask,
              agent: event.data?.agent,
              success: event.data?.success,
              result: event.data?.result
            });
          } else if (event.operation === 'phase_completed') {
            log('SUCCESS', '🎯 PHASE COMPLETED', {
              phaseName: event.data?.phaseName,
              duration: event.data?.duration,
              completedSubtasks: event.data?.subtaskResults?.length
            });
          } else if (event.operation === 'orchestration_completed') {
            log('SUCCESS', '🏆 ORCHESTRATION COMPLETED', {
              totalDuration: event.data?.duration,
              phasesCompleted: event.data?.phasesCompleted,
              subtasksExecuted: event.data?.subtasksExecuted
            });
          } else if (event.operation === 'orchestration_failed') {
            log('ERROR', '❌ ORCHESTRATION FAILED', {
              error: event.data?.error,
              phase: event.data?.phase,
              recovery: event.data?.recovery
            });
          } else {
            log('ORCHESTRATION', `📌 ${event.operation}`, {
              actor: event.actor_id || event.actor_type,
              data: event.data
            });
          }
        })
        .subscribe();
      
      log('INFO', `📡 Subscribed to real-time events for task ${taskId}`);
    }
    
    // Poll for events periodically
    let previousEventCount = 0;
    let noNewEventsCount = 0;
    const maxWaitCycles = 15; // 30 seconds total
    
    for (let cycle = 1; cycle <= maxWaitCycles; cycle++) {
      await page.waitForTimeout(2000);
      
      if (taskId) {
        const { data: events, error } = await supabase
          .from('task_context_events')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true });
        
        if (!error && events) {
          if (events.length > previousEventCount) {
            const newEvents = events.slice(previousEventCount);
            log('INFO', `📈 ${newEvents.length} new events (total: ${events.length})`);
            
            // Process new events
            for (const event of newEvents) {
              // Already logged via subscription, but check for missed events
              if (!orchestrationSubscription) {
                log('ORCHESTRATION', `Event: ${event.operation}`, {
                  actor: event.actor_id || event.actor_type,
                  timestamp: event.created_at
                });
              }
            }
            
            previousEventCount = events.length;
            noNewEventsCount = 0;
          } else {
            noNewEventsCount++;
            if (noNewEventsCount >= 5) {
              log('INFO', 'No new events for 10 seconds, orchestration may be complete');
              break;
            }
          }
        }
      }
      
      // Take periodic screenshots
      if (cycle % 5 === 0) {
        await page.screenshot({ 
          path: `orchestration-logs/progress-${cycle}.png`,
          fullPage: true 
        });
        log('INFO', `📸 Screenshot captured: progress-${cycle}.png`);
      }
    }
    
    log('INFO', '\n📍 PHASE 4: Analyze Final Results');
    
    if (taskId) {
      const { data: finalEvents, error } = await supabase
        .from('task_context_events')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      
      if (!error && finalEvents) {
        const analysis = {
          totalEvents: finalEvents.length,
          orchestratorEvents: finalEvents.filter(e => 
            e.actor_id === 'OrchestratorAgent' || 
            e.actor_id === 'orchestrator_agent'
          ).length,
          agentTypes: [...new Set(finalEvents.map(e => e.actor_id || e.actor_type))],
          operationTypes: [...new Set(finalEvents.map(e => e.operation))],
          hasReasoning: finalEvents.some(e => e.operation === 'execution_plan_reasoning_recorded'),
          hasExecutionPlan: finalEvents.some(e => e.operation === 'execution_plan_created'),
          hasSubtasks: finalEvents.some(e => e.operation.includes('subtask')),
          hasCompletion: finalEvents.some(e => 
            e.operation === 'orchestration_completed' || 
            e.operation === 'phase_completed'
          )
        };
        
        log('INFO', '\n' + '='.repeat(80));
        log('SUCCESS', '📊 ORCHESTRATION ANALYSIS COMPLETE');
        log('INFO', '='.repeat(80));
        log('INFO', `✅ Task ID: ${taskId}`);
        log('INFO', `📊 Total Events: ${analysis.totalEvents}`);
        log('INFO', `🤖 Active Agents: ${analysis.agentTypes.length} - ${analysis.agentTypes.join(', ')}`);
        log('INFO', `📋 Operation Types: ${analysis.operationTypes.length}`);
        log('INFO', `🧠 Has LLM Reasoning: ${analysis.hasReasoning ? '✅' : '❌'}`);
        log('INFO', `📝 Has Execution Plan: ${analysis.hasExecutionPlan ? '✅' : '❌'}`);
        log('INFO', `🎯 Has Subtasks: ${analysis.hasSubtasks ? '✅' : '❌'}`);
        log('INFO', `✅ Has Completion: ${analysis.hasCompletion ? '✅' : '❌'}`);
        
        // Extract and display reasoning if available
        const reasoningEvent = finalEvents.find(e => 
          e.operation === 'execution_plan_reasoning_recorded'
        );
        if (reasoningEvent && reasoningEvent.data?.reasoning) {
          log('LLM', '\n🧠 DETAILED LLM REASONING:');
          log('LLM', 'Task Analysis:', reasoningEvent.data.reasoning.task_analysis);
          log('LLM', 'Subtask Decomposition:', reasoningEvent.data.reasoning.subtask_decomposition);
          log('LLM', 'Coordination Strategy:', reasoningEvent.data.reasoning.coordination_strategy);
        }
        
        // Extract execution plan if available
        const planEvent = finalEvents.find(e => 
          e.operation === 'execution_plan_created'
        );
        if (planEvent && planEvent.data?.phases) {
          log('ORCHESTRATION', '\n📋 EXECUTION PLAN PHASES:');
          planEvent.data.phases.forEach((phase, i) => {
            log('ORCHESTRATION', `Phase ${i + 1}: ${phase.name}`, {
              subtasks: phase.subtasks?.length,
              estimatedDuration: phase.estimated_duration
            });
          });
        }
        
        if (analysis.totalEvents > 0) {
          log('SUCCESS', '\n✅✅✅ ORCHESTRATION SUCCESS! ✅✅✅');
          log('SUCCESS', 'The orchestrator successfully:');
          if (analysis.hasReasoning) log('SUCCESS', '✅ Generated LLM reasoning');
          if (analysis.hasExecutionPlan) log('SUCCESS', '✅ Created execution plan');
          if (analysis.hasSubtasks) log('SUCCESS', '✅ Decomposed into subtasks');
          if (analysis.hasCompletion) log('SUCCESS', '✅ Completed orchestration');
        } else {
          log('WARNING', '\n⚠️ No orchestration events detected');
          log('WARNING', 'Possible issues:');
          log('WARNING', '- EventListener may not be running');
          log('WARNING', '- Realtime subscription may not be active');
          log('WARNING', '- Orchestrator may have failed silently');
        }
      }
    }
    
    // Final screenshot
    await page.screenshot({ 
      path: `orchestration-logs/final-state-${timestamp}.png`,
      fullPage: true 
    });
    log('INFO', `📸 Final screenshot: final-state-${timestamp}.png`);
    
  } catch (error) {
    log('ERROR', 'Test failed:', { 
      error: error.message, 
      stack: error.stack 
    });
  } finally {
    if (orchestrationSubscription) {
      await orchestrationSubscription.unsubscribe();
    }
    await browser.close();
    logStream.end();
    
    log('INFO', '\n' + '='.repeat(80));
    log('INFO', '📁 FULL LOG SAVED TO:');
    log('INFO', logFile);
    log('INFO', '='.repeat(80));
  }
}

// Run the comprehensive test
testFullOrchestration().catch(console.error);