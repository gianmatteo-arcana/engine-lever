#!/usr/bin/env node

/**
 * Pretty print the complete task processing flow
 * Shows the journey from UI button click through orchestration
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms/1000).toFixed(2)}s`;
}

function printTaskFlow() {
  console.log('\n' + colors.cyan + colors.bright + '═══════════════════════════════════════════════════════════════════════════');
  console.log('                    TASK PROCESSING FLOW - COMPLETE TRACE');
  console.log('                         Task ID: 36d7480c-288c-497c-bb1f-817a7b8aeb36');
  console.log('═══════════════════════════════════════════════════════════════════════════' + colors.reset);

  // Step 1: UI Button Click
  console.log('\n' + colors.yellow + colors.bright + '1️⃣  USER ACTION - UI Button Click [18:44:42]' + colors.reset);
  console.log(colors.gray + '└──' + colors.reset + ' User clicks "Create Task" in developer toolkit');
  console.log(colors.gray + '    └──' + colors.reset + ' Task type: user_onboarding');

  // Step 2: API Request
  console.log('\n' + colors.green + colors.bright + '2️⃣  API REQUEST - POST /api/tasks/create [18:44:42]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' 🎯 Creating universal task');
  console.log(colors.gray + '│   ├──' + colors.reset + ' Template ID: user_onboarding');
  console.log(colors.gray + '│   ├──' + colors.reset + ' Source: dev-toolkit');
  console.log(colors.gray + '│   └──' + colors.reset + ' User ID: 8e8ea7bd-b7fb-4e77-8e34-aa551fe26934');
  console.log(colors.gray + '├──' + colors.reset + ' 📦 TaskService instance obtained');
  console.log(colors.gray + '├──' + colors.reset + ' 🤖 OrchestratorAgent instance obtained');
  console.log(colors.gray + '└──' + colors.reset + ' 📝 Task context created');

  // Step 3: Database
  console.log('\n' + colors.blue + colors.bright + '3️⃣  DATABASE - Task Created [18:44:42]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' Table: public.tasks');
  console.log(colors.gray + '├──' + colors.reset + ' Status: pending');
  console.log(colors.gray + '└──' + colors.reset + ' Metadata includes:');
  console.log(colors.gray + '    ├──' + colors.reset + ' taskDefinition.title: "user_onboarding Task"');
  console.log(colors.gray + '    ├──' + colors.reset + ' taskDefinition.description: "Standard user_onboarding workflow"');
  console.log(colors.gray + '    └──' + colors.reset + ' taskDefinition.goals: ["Complete the task successfully"]');

  // Step 4: Orchestration Starts
  console.log('\n' + colors.magenta + colors.bright + '4️⃣  ORCHESTRATION BEGINS [18:44:42]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' 🎯 orchestrateTask() called (async)');
  console.log(colors.gray + '├──' + colors.reset + ' 📊 Full TaskContext received');
  console.log(colors.gray + '└──' + colors.reset + ' 📝 Creating execution plan...');

  // Step 5: Agent Discovery
  console.log('\n' + colors.cyan + colors.bright + '5️⃣  AGENT DISCOVERY [18:44:42]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' 📋 Initializing agent registry from YAML');
  console.log(colors.gray + '├──' + colors.reset + ' 📁 Found 12 agent configuration files');
  console.log(colors.gray + '└──' + colors.reset + ' ✅ Registered 11 agents:');
  console.log(colors.gray + '    ├──' + colors.reset + ' profile_collection_agent');
  console.log(colors.gray + '    ├──' + colors.reset + ' data_collection_agent');
  console.log(colors.gray + '    ├──' + colors.reset + ' ux_optimization_agent');
  console.log(colors.gray + '    └──' + colors.reset + ' ... and 8 more');

  // Step 6: LLM Planning
  console.log('\n' + colors.magenta + colors.bright + '6️⃣  ORCHESTRATOR LLM PLANNING [18:44:42 → 18:44:48]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' 🚀 LLM REQUEST INITIATED');
  console.log(colors.gray + '│   ├──' + colors.reset + ' Model: claude-3-5-sonnet-20241022');
  console.log(colors.gray + '│   ├──' + colors.reset + ' Prompt: 7,308 characters');
  console.log(colors.gray + '│   └──' + colors.reset + ' Temperature: 0.3');
  console.log(colors.gray + '├──' + colors.reset + ' ⏱️  Duration: ' + colors.yellow + '17.9 seconds' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' ✅ LLM RESPONSE COMPLETED');
  console.log(colors.gray + '│   ├──' + colors.reset + ' Tokens: 2,780 (1,746 prompt + 1,034 completion)');
  console.log(colors.gray + '│   └──' + colors.reset + ' Response: Valid JSON execution plan');
  console.log(colors.gray + '└──' + colors.reset + ' 🧠 ORCHESTRATOR REASONING:');
  console.log(colors.dim + '    "User onboarding requires collecting essential business information,');
  console.log('     validating data, ensuring compliance requirements are met,');
  console.log('     and maintaining clear communication throughout the process."' + colors.reset);

  // Step 7: Execution Plan
  console.log('\n' + colors.blue + colors.bright + '7️⃣  EXECUTION PLAN CREATED [18:44:48]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' 📋 SUBTASK 1: Initial user profile collection');
  console.log(colors.gray + '│   └──' + colors.reset + ' Assigned to: ' + colors.cyan + 'profile_collection_agent' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' 📋 SUBTASK 2: Business entity validation');
  console.log(colors.gray + '│   └──' + colors.reset + ' Assigned to: ' + colors.cyan + 'data_collection_agent' + colors.reset);
  console.log(colors.gray + '└──' + colors.reset + ' Strategy: Sequential flow with continuous UX optimization');

  // Step 8: Phase Execution
  console.log('\n' + colors.cyan + colors.bright + '8️⃣  PHASE: Initial Profile Setup [18:44:48 → 18:44:59]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' Parallel execution: true');
  console.log(colors.gray + '├──' + colors.reset + ' Subtasks: 2');
  console.log(colors.gray + '│');
  
  console.log(colors.gray + '├──' + colors.cyan + ' AGENT 1: profile_collection_agent' + colors.reset);
  console.log(colors.gray + '│   ├──' + colors.reset + ' 🤖 LLM REQUEST [18:44:48]');
  console.log(colors.gray + '│   │   └──' + colors.reset + ' Instruction: "Collect essential business details with progressive disclosure"');
  console.log(colors.gray + '│   ├──' + colors.reset + ' ⏱️  Duration: ' + colors.yellow + '9.4 seconds' + colors.reset);
  console.log(colors.gray + '│   ├──' + colors.reset + ' 🧠 LLM RESPONSE [18:44:58]');
  console.log(colors.gray + '│   │   ├──' + colors.reset + ' Tokens: 2,335 (1,764 prompt + 571 completion)');
  console.log(colors.gray + '│   │   └──' + colors.reset + ' Status: needs_input');
  console.log(colors.gray + '│   └──' + colors.reset + ' 🎯 REASONING: "Initiating profile collection with progressive disclosure"');
  console.log(colors.gray + '│');
  
  console.log(colors.gray + '└──' + colors.cyan + ' AGENT 2: ux_optimization_agent' + colors.reset);
  console.log(colors.gray + '    ├──' + colors.reset + ' 🤖 LLM REQUEST [18:44:48]');
  console.log(colors.gray + '    │   └──' + colors.reset + ' Instruction: "Monitor form completion patterns and optimize"');
  console.log(colors.gray + '    ├──' + colors.reset + ' ⏱️  Duration: ' + colors.yellow + '10.4 seconds' + colors.reset);
  console.log(colors.gray + '    ├──' + colors.reset + ' 🧠 LLM RESPONSE [18:44:59]');
  console.log(colors.gray + '    │   ├──' + colors.reset + ' Tokens: 2,258 (1,766 prompt + 492 completion)');
  console.log(colors.gray + '    │   └──' + colors.reset + ' Status: needs_input');
  console.log(colors.gray + '    └──' + colors.reset + ' 🎯 REASONING: "Implementing optimized flow with 89% predicted completion rate"');

  // Step 9: Phase Complete
  console.log('\n' + colors.green + colors.bright + '9️⃣  PHASE COMPLETED [18:44:59]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' ✅ Phase: Initial Profile Setup');
  console.log(colors.gray + '├──' + colors.reset + ' Duration: 10.5 seconds');
  console.log(colors.gray + '├──' + colors.reset + ' Results: 2 subtasks executed');
  console.log(colors.gray + '└──' + colors.reset + ' UI Requests: 0 (agents waiting for user input)');

  // Step 10: Task Complete
  console.log('\n' + colors.green + colors.bright + '🎉 TASK ORCHESTRATION COMPLETED [18:44:59]' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' Total duration: ' + colors.yellow + '29.2 seconds' + colors.reset);
  console.log(colors.gray + '├──' + colors.reset + ' Database updates: task_context_events recorded');
  console.log(colors.gray + '└──' + colors.reset + ' Status: Completed (awaiting user input to continue)');

  // Summary Stats
  console.log('\n' + colors.white + colors.bright + '📊 SUMMARY STATISTICS' + colors.reset);
  console.log(colors.gray + '═══════════════════════════════════════════════' + colors.reset);
  console.log('• Total Time: ' + colors.yellow + '17 seconds' + colors.reset + ' (from button click to completion)');
  console.log('• LLM Calls: ' + colors.cyan + '3' + colors.reset + ' (1 orchestrator + 2 agents)');
  console.log('• Total Tokens: ' + colors.green + '7,373' + colors.reset);
  console.log('• Agents Involved: ' + colors.magenta + '3' + colors.reset + ' (orchestrator + 2 specialists)');
  console.log('• Database Operations: Multiple (task creation, context updates, events)');
  
  console.log('\n' + colors.cyan + colors.bright + '🔄 COMPLETE FLOW:' + colors.reset);
  console.log('UI Button → API Endpoint → TaskService → OrchestratorAgent → LLM Planning');
  console.log('→ Agent Discovery → Execution Plan → Parallel Agent Execution → Completion');
  
  console.log('\n' + colors.gray + '═══════════════════════════════════════════════════════════════════════════' + colors.reset + '\n');
}

// Run the pretty printer
printTaskFlow();