#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Color helper functions
const color = (str, colorName) => `${colors[colorName]}${str}${colors.reset}`;
const bold = (str) => `${colors.bold}${str}${colors.reset}`;

// Task ID to analyze (most recent successful one)
const TASK_ID = process.argv[2] || 'df028af2-3c2a-4c56-924d-839f40296547';

// Find the most recent task flow file for this task
const files = fs.readdirSync('.').filter(f => f.startsWith(`task-flow-${TASK_ID}`) && f.endsWith('.json'));
if (files.length === 0) {
  console.error(color(`No task flow file found for task ${TASK_ID}`, 'red'));
  process.exit(1);
}

const taskFlowFile = files.sort().pop();
console.log(color(`\n📋 Analyzing Task: ${TASK_ID}`, 'cyan'));
console.log(color(`Reading from: ${taskFlowFile}\n`, 'gray'));

const data = JSON.parse(fs.readFileSync(taskFlowFile, 'utf8'));

// Helper to format timestamps
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

// Helper to calculate duration
function calculateDuration(start, end) {
  const duration = new Date(end) - new Date(start);
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${Math.floor(duration / 60000)}m ${((duration % 60000) / 1000).toFixed(1)}s`;
}

// Print Task Overview
console.log(color(bold('═══════════════════════════════════════'), 'blue'));
console.log(color(bold('           TASK OVERVIEW'), 'blue'));
console.log(color(bold('═══════════════════════════════════════'), 'blue'));

console.log(color('Task ID:', 'yellow'), data.taskId);
console.log(color('Total Duration:', 'yellow'), bold(`${data.duration.toFixed(2)}s`));

// Find task creation event
const taskCreated = data.events.find(e => e.type === 'TASK_CREATED');
const taskCompleted = data.events.find(e => e.type === 'TASK_COMPLETE' || e.type === 'TASK_COMPLETED');

if (taskCreated) {
  console.log(color('Created:', 'yellow'), formatTime(taskCreated.timestamp));
}
if (taskCompleted) {
  console.log(color('Completed:', 'yellow'), formatTime(taskCompleted.timestamp));
  console.log(color('Status:', 'yellow'), color('completed', 'green'));
} else {
  console.log(color('Status:', 'yellow'), color('pending/processing', 'yellow'));
}

// Print Orchestration Phases
console.log(color(bold('\n═══════════════════════════════════════'), 'blue'));
console.log(color(bold('        ORCHESTRATION PHASES'), 'blue'));
console.log(color(bold('═══════════════════════════════════════'), 'blue'));

const phaseEvents = data.events.filter(e => e.type === 'PHASE_EXECUTION');
const phases = [];

phaseEvents.forEach(event => {
  if (event.data && event.data.phase) {
    phases.push({
      number: event.data.phaseNumber || phases.length + 1,
      total: event.data.totalPhases || 4,
      name: event.data.phase,
      timestamp: event.timestamp,
      contextId: event.data.contextId
    });
  }
});

if (phases.length > 0) {
  let lastTime = data.task.created_at;
  phases.forEach((phase, index) => {
    const duration = calculateDuration(lastTime, phase.timestamp);
    console.log(color(`\n✅ Phase ${phase.number}/${phase.total}: ${bold(phase.name)}`, 'green'));
    console.log(color(`   Started: ${formatTime(phase.timestamp)}`, 'gray'));
    console.log(color(`   Duration: ${duration}`, 'gray'));
    if (phase.contextId) {
      console.log(color(`   Context: ${phase.contextId}`, 'gray'));
    }
    lastTime = phase.timestamp;
  });
} else {
  console.log(color('No phase execution events found', 'yellow'));
}

// Print Agent Activities
console.log(color(bold('\n═══════════════════════════════════════'), 'blue'));
console.log(color(bold('          AGENT ACTIVITIES'), 'blue'));
console.log(color(bold('═══════════════════════════════════════'), 'blue'));

const agentsByPhase = {};
data.events.forEach(event => {
  if (event.type === 'AGENT_EXECUTION' && event.data) {
    const phaseName = event.data.phase || 'Unknown Phase';
    if (!agentsByPhase[phaseName]) {
      agentsByPhase[phaseName] = [];
    }
    agentsByPhase[phaseName].push({
      agent: event.data.agentRole || event.data.agentId || 'Unknown',
      timestamp: event.timestamp,
      message: event.message
    });
  }
});

if (Object.keys(agentsByPhase).length > 0) {
  Object.entries(agentsByPhase).forEach(([phase, agents]) => {
    console.log(color(`\n📌 ${phase}:`, 'cyan'));
    agents.forEach(agent => {
      console.log(color(`   • ${agent.agent} - ${formatTime(agent.timestamp)}`, 'gray'));
    });
  });
} else {
  console.log(color('No agent activities recorded', 'yellow'));
}

// Print LLM Interactions
console.log(color(bold('\n═══════════════════════════════════════'), 'blue'));
console.log(color(bold('          LLM INTERACTIONS'), 'blue'));
console.log(color(bold('═══════════════════════════════════════'), 'blue'));

const llmCalls = data.events.filter(e => e.type === 'LLM_CALL');
if (llmCalls.length > 0) {
  llmCalls.forEach((call, index) => {
    const duration = call.data?.duration || 'N/A';
    const model = call.data?.model || 'claude-3-5-sonnet-20241022';
    
    console.log(color(`\n🤖 LLM Call ${index + 1}:`, 'magenta'));
    console.log(color(`   Time: ${formatTime(call.timestamp)}`, 'gray'));
    console.log(color(`   Model: ${model}`, 'gray'));
    console.log(color(`   Duration: ${duration}`, 'gray'));
    
    if (call.message && call.message.includes('completed')) {
      console.log(color(`   Status: ✅ Success`, 'green'));
    } else if (call.message && call.message.includes('Starting')) {
      console.log(color(`   Status: 🔄 Started`, 'yellow'));
    } else {
      console.log(color(`   Status: ${call.message}`, 'gray'));
    }
  });
} else {
  console.log(color('No LLM interactions recorded', 'yellow'));
}

// Print Key Events Timeline
console.log(color(bold('\n═══════════════════════════════════════'), 'blue'));
console.log(color(bold('         KEY EVENTS TIMELINE'), 'blue'));
console.log(color(bold('═══════════════════════════════════════'), 'blue'));

const keyEvents = [];

// Task created
if (taskCreated) {
  keyEvents.push({
    time: taskCreated.timestamp,
    type: 'TASK_CREATED',
    message: `Task created`,
    color: 'green'
  });
}

// Phase executions
phases.forEach(phase => {
  keyEvents.push({
    time: phase.timestamp,
    type: 'PHASE',
    message: `Phase ${phase.number}: ${phase.name}`,
    color: 'cyan'
  });
});

// Completion
if (taskCompleted) {
  keyEvents.push({
    time: taskCompleted.timestamp,
    type: 'TASK_COMPLETED',
    message: 'Task completed successfully',
    color: 'green'
  });
}

// Sort by time
keyEvents.sort((a, b) => new Date(a.time) - new Date(b.time));

let previousTime = null;
keyEvents.forEach(event => {
  const elapsed = previousTime ? ` (+${calculateDuration(previousTime, event.time)})` : '';
  const timeStr = color(formatTime(event.time), 'gray');
  const elapsedStr = elapsed ? color(elapsed, 'dim') : '';
  const msgStr = color(event.message, event.color);
  console.log(`${timeStr}${elapsedStr} - ${msgStr}`);
  previousTime = event.time;
});

// Print Summary
console.log(color(bold('\n═══════════════════════════════════════'), 'blue'));
console.log(color(bold('            SUMMARY'), 'blue'));
console.log(color(bold('═══════════════════════════════════════'), 'blue'));

const stats = {
  totalPhases: phases.length,
  totalAgents: Object.values(agentsByPhase).flat().length,
  totalLLMCalls: llmCalls.length,
  totalDuration: `${data.duration.toFixed(2)}s`
};

console.log(color('\n📊 Statistics:', 'yellow'));
console.log(`   • Phases Executed: ${bold(stats.totalPhases)}`);
console.log(`   • Agents Involved: ${bold(stats.totalAgents)}`);
console.log(`   • LLM API Calls: ${bold(stats.totalLLMCalls)}`);
console.log(`   • Total Duration: ${bold(stats.totalDuration)}`);

if (taskCompleted) {
  console.log(color(bold('\n✅ Task completed successfully with all phases executed!'), 'green'));
} else {
  console.log(color(bold(`\n⏳ Task in progress or pending`), 'yellow'));
}

console.log(color('\n═══════════════════════════════════════\n', 'blue'));