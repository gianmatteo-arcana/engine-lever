#!/usr/bin/env node

const fs = require('fs');

// Parse the logs for task 5fec4b6f-a3e3-46c7-8d2f-9f531d784606
const logContent = fs.readFileSync('logs/combined.log', 'utf8');
const lines = logContent.split('\n');

console.log('🔍 ANALYZING TASK: 5fec4b6f-a3e3-46c7-8d2f-9f531d784606');
console.log('================================================================\n');

let taskFound = false;
let orchestrationPlan = null;
let agentResponses = [];
let phaseExecutions = [];

lines.forEach(line => {
  if (!line.trim()) return;
  
  try {
    const entry = JSON.parse(line);
    
    // Check if this is related to our task
    if (entry.taskId === '5fec4b6f-a3e3-46c7-8d2f-9f531d784606' || 
        entry.contextId === '5fec4b6f-a3e3-46c7-8d2f-9f531d784606') {
      
      // Task creation
      if (entry.message?.includes('Creating universal task')) {
        taskFound = true;
        console.log('🚀 TASK CREATION:');
        console.log(`   Type: ${entry.taskType}`);
        console.log(`   User: ${entry.userId}`);
        console.log(`   Time: ${entry.timestamp}\n`);
      }
      
      // Orchestration plan (from the first LLM response)
      if (entry.fullResponse && entry.fullResponse.includes('"reasoning"') && !orchestrationPlan) {
        try {
          const plan = JSON.parse(entry.fullResponse);
          if (plan.reasoning) {
            orchestrationPlan = plan;
            console.log('📋 ORCHESTRATION PLAN:');
            console.log(`   Task Analysis: ${plan.reasoning.task_analysis}`);
            console.log('\n   Subtask Decomposition:');
            plan.reasoning.subtask_decomposition?.forEach((subtask, i) => {
              console.log(`   ${i+1}. ${subtask.subtask}`);
              console.log(`      Agent: ${subtask.assigned_agent}`);
              console.log(`      Rationale: ${subtask.rationale}\n`);
            });
            
            console.log('   Phases:');
            plan.phases?.forEach((phase, i) => {
              console.log(`   Phase ${i+1}: ${phase.name}`);
              console.log(`      Parallel: ${phase.parallel_execution}`);
              console.log(`      Dependencies: [${phase.dependencies?.join(', ')}]`);
              phase.subtasks?.forEach((subtask, j) => {
                console.log(`      ${j+1}. ${subtask.description}`);
                console.log(`         Agent: ${subtask.agent}`);
                console.log(`         Instruction: ${subtask.specific_instruction}`);
                console.log(`         Expected Output: ${subtask.expected_output}`);
              });
              console.log('');
            });
            
            console.log(`   Estimated Duration: ${plan.estimated_duration}`);
            console.log(`   User Interactions: ${plan.user_interactions}\n`);
          }
        } catch (e) {
          // Not JSON or not the plan we're looking for
        }
      }
      
      // Phase executions
      if (entry.message?.includes('Executing phase')) {
        phaseExecutions.push({
          phase: entry.phaseName,
          number: entry.phaseNumber,
          total: entry.totalPhases,
          timestamp: entry.timestamp
        });
      }
      
      // Agent responses
      if (entry.agentId && entry.fullResponse) {
        try {
          const response = JSON.parse(entry.fullResponse);
          agentResponses.push({
            agent: entry.agentId,
            role: entry.agentRole,
            status: response.status,
            operation: response.contextUpdate?.operation,
            reasoning: response.contextUpdate?.reasoning,
            data: response.contextUpdate?.data,
            uiRequest: response.uiRequest,
            timestamp: entry.timestamp
          });
        } catch (e) {
          // Not JSON
        }
      }
      
      // Task completion
      if (entry.message?.includes('All phases completed') || entry.message?.includes('task_completed')) {
        console.log('✅ TASK COMPLETION:');
        console.log(`   Message: ${entry.message}`);
        console.log(`   Time: ${entry.timestamp}\n`);
      }
    }
  } catch (e) {
    // Not JSON, skip
  }
});

if (!taskFound) {
  console.log('❌ Task not found in logs');
  process.exit(1);
}

console.log('📊 PHASE EXECUTION SUMMARY:');
phaseExecutions.forEach(phase => {
  console.log(`   ${phase.number}/${phase.total}: ${phase.phase} at ${phase.timestamp}`);
});
console.log('');

console.log('🤖 AGENT RESPONSES SUMMARY:');
agentResponses.forEach((response, i) => {
  console.log(`\n${i+1}. ${response.agent} (${response.role})`);
  console.log(`   Status: ${response.status}`);
  console.log(`   Operation: ${response.operation}`);
  console.log(`   Reasoning: ${response.reasoning?.substring(0, 200)}...`);
  
  if (response.uiRequest && response.uiRequest.type !== 'none') {
    console.log(`   UI Request: ${response.uiRequest.type} - "${response.uiRequest.title}"`);
    if (response.uiRequest.fields?.length > 0) {
      console.log(`   Fields requested: ${response.uiRequest.fields.map(f => f.id || f.label).join(', ')}`);
    }
  }
  
  if (response.data) {
    console.log(`   Key Data: ${JSON.stringify(response.data, null, 2).substring(0, 300)}...`);
  }
});

console.log('\n================================================================');
console.log('🎯 ANALYSIS QUESTIONS:');
console.log('1. What was the stated goal of the user_onboarding task?');
console.log('2. How did the orchestrator subdivide the problem?');
console.log('3. What did each agent actually accomplish?');
console.log('4. Why did the task complete if agents needed input?');
console.log('5. What user interactions were planned vs. what happened?');