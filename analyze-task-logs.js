#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TASK_ID = process.argv[2] || '3a251bfd-a1df-4035-af12-dec70a94a350';
const LOG_FILE = path.join(__dirname, 'logs', 'combined.log');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const color = (str, colorName) => `${colors[colorName]}${str}${colors.reset}`;
const bold = (str) => `${colors.bold}${str}${colors.reset}`;

console.log(color(bold('\n════════════════════════════════════════'), 'blue'));
console.log(color(bold('    COMPLETE TASK LOG ANALYSIS'), 'blue'));
console.log(color(bold('════════════════════════════════════════'), 'blue'));
console.log(color(`\nTask ID: ${bold(TASK_ID)}`, 'yellow'));
console.log(color('─'.repeat(40), 'gray'));

// Read and parse logs
const logs = fs.readFileSync(LOG_FILE, 'utf8')
  .split('\n')
  .filter(line => line.includes(TASK_ID))
  .map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

console.log(color(`\nFound ${logs.length} log entries`, 'cyan'));

// Group logs by category
const phases = [];
const llmCalls = [];
const agentActivities = [];
const errors = [];
const events = [];

logs.forEach(log => {
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  if (log.message?.includes('Executing phase')) {
    phases.push({ time, log });
  }
  if (log.message?.includes('LLM REQUEST') || log.message?.includes('ANTHROPIC')) {
    llmCalls.push({ time, log });
  }
  if (log.message?.includes('Agent execution') || log.agentRole) {
    agentActivities.push({ time, log });
  }
  if (log.level === 'error') {
    errors.push({ time, log });
  }
  if (log.message?.includes('completed') || log.message?.includes('COMPLETED')) {
    events.push({ time, log });
  }
});

// Print Phase Execution
console.log(color(bold('\n📊 PHASE EXECUTION:'), 'blue'));
console.log(color('─'.repeat(40), 'gray'));

const phaseExecution = logs.filter(l => 
  l.message?.includes('Executing phase') || 
  l.message?.includes('Phase execution completed')
);

phaseExecution.forEach(log => {
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  if (log.message.includes('Executing phase')) {
    const match = log.message.match(/phase (\d+)\/(\d+): (.+)/);
    if (match) {
      console.log(color(`\n[${time}] Phase ${match[1]}/${match[2]}: ${bold(match[3])}`, 'yellow'));
    }
  } else if (log.message.includes('Phase execution completed')) {
    console.log(color(`  ✅ Completed - Duration: ${log.duration}ms`, 'green'));
  }
});

// Print Agent Activities  
console.log(color(bold('\n🤖 AGENT ACTIVITIES:'), 'blue'));
console.log(color('─'.repeat(40), 'gray'));

const agentLogs = logs.filter(l => l.agentRole || l.agentId);
const agentsByPhase = {};

agentLogs.forEach(log => {
  const agent = log.agentRole || log.agentId || 'Unknown';
  const phase = log.phaseName || 'Unknown Phase';
  
  if (!agentsByPhase[phase]) {
    agentsByPhase[phase] = [];
  }
  
  agentsByPhase[phase].push({
    agent,
    time: new Date(log.timestamp).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    }),
    message: log.message
  });
});

Object.entries(agentsByPhase).forEach(([phase, agents]) => {
  console.log(color(`\n${phase}:`, 'cyan'));
  agents.forEach(a => {
    console.log(color(`  [${a.time}] ${a.agent}`, 'gray'));
  });
});

// Print LLM Interactions
console.log(color(bold('\n🧠 LLM INTERACTIONS:'), 'blue'));
console.log(color('─'.repeat(40), 'gray'));

const llmLogs = logs.filter(l => 
  l.message?.includes('LLM REQUEST') || 
  l.message?.includes('ANTHROPIC') ||
  l.message?.includes('LLM response')
);

let llmCallCount = 0;
for (let i = 0; i < llmLogs.length; i++) {
  const log = llmLogs[i];
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  if (log.message.includes('REQUEST INITIATED') || log.message.includes('Starting')) {
    llmCallCount++;
    console.log(color(`\n[${time}] LLM Call #${llmCallCount}:`, 'magenta'));
    if (log.model) console.log(color(`  Model: ${log.model}`, 'gray'));
    if (log.promptLength) console.log(color(`  Prompt: ${log.promptLength} chars`, 'gray'));
  }
  
  if (log.message.includes('completed') && log.duration) {
    console.log(color(`  ✅ Response: ${log.duration}`, 'green'));
    if (log.usage) {
      console.log(color(`  Tokens: ${log.usage.totalTokens || 'N/A'}`, 'gray'));
    }
  }
}

// Print Task Completion
console.log(color(bold('\n✅ TASK COMPLETION:'), 'blue'));
console.log(color('─'.repeat(40), 'gray'));

const completionLogs = logs.filter(l => 
  l.message?.includes('All phases completed') ||
  l.message?.includes('task_completed') ||
  l.message?.includes('marking task as complete')
);

completionLogs.forEach(log => {
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  console.log(color(`[${time}] ${log.message}`, 'green'));
  if (log.phasesExecuted) {
    console.log(color(`  Phases: ${log.phasesExecuted}/${log.totalPhases}`, 'gray'));
  }
  if (log.duration) {
    console.log(color(`  Duration: ${log.duration}ms`, 'gray'));
  }
});

// Print Summary
console.log(color(bold('\n📈 SUMMARY:'), 'blue'));
console.log(color('─'.repeat(40), 'gray'));

const startTime = new Date(logs[0]?.timestamp);
const endTime = new Date(logs[logs.length - 1]?.timestamp);
const duration = (endTime - startTime) / 1000;

console.log(color(`  Total Logs: ${logs.length}`, 'cyan'));
console.log(color(`  Phases Executed: ${phaseExecution.filter(l => l.message.includes('Executing phase')).length}`, 'cyan'));
console.log(color(`  Agent Activities: ${agentLogs.length}`, 'cyan'));
console.log(color(`  LLM Calls: ${llmCallCount}`, 'cyan'));
console.log(color(`  Errors: ${errors.length}`, errors.length > 0 ? 'red' : 'cyan'));
console.log(color(`  Total Duration: ${duration.toFixed(1)}s`, 'cyan'));

if (completionLogs.length > 0) {
  console.log(color(bold('\n✅ TASK COMPLETED SUCCESSFULLY!'), 'green'));
} else {
  console.log(color(bold('\n⚠️ Task may not have completed'), 'yellow'));
}

console.log(color('\n════════════════════════════════════════\n', 'blue'));