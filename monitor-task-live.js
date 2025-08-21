#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Tail } = require('tail');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

// Track the current task being monitored
let currentTaskId = null;
let taskStartTime = null;
let phaseTimings = {};
let currentPhase = null;
let phaseStartTime = null;

// Pretty print functions
function printHeader(text, color = colors.cyan) {
  console.log(`\n${color}${'='.repeat(80)}${colors.reset}`);
  console.log(`${color}${colors.bright}${text}${colors.reset}`);
  console.log(`${color}${'='.repeat(80)}${colors.reset}\n`);
}

function printSection(title, color = colors.yellow) {
  console.log(`\n${color}${colors.bright}>>> ${title}${colors.reset}`);
}

function printSubSection(title, color = colors.magenta) {
  console.log(`${color}  • ${title}${colors.reset}`);
}

function printDetail(key, value, indent = '    ') {
  console.log(`${indent}${colors.dim}${key}:${colors.reset} ${value}`);
}

function printJSON(obj, indent = '    ') {
  const lines = JSON.stringify(obj, null, 2).split('\n');
  lines.forEach(line => console.log(`${indent}${colors.dim}${line}${colors.reset}`));
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
}

// Process log entries
function processLogEntry(line) {
  try {
    const entry = JSON.parse(line);
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    
    // Task Creation
    if (entry.message?.includes('Creating universal task') || entry.message?.includes('Task created')) {
      currentTaskId = entry.taskId || entry.contextId;
      taskStartTime = new Date(entry.timestamp);
      phaseTimings = {};
      
      printHeader(`🚀 NEW TASK CREATED`, colors.bgGreen + colors.white);
      printDetail('Task ID', currentTaskId);
      printDetail('Type', entry.taskType || 'Unknown');
      printDetail('User ID', entry.userId || 'Unknown');
      printDetail('Time', timestamp);
      if (entry.metadata) {
        printSection('Metadata');
        printJSON(entry.metadata);
      }
      return;
    }
    
    // Skip if not related to current task
    if (currentTaskId && entry.taskId !== currentTaskId && entry.contextId !== currentTaskId) {
      return;
    }
    
    // Agent Execution Started
    if (entry.message?.includes('Agent execution started')) {
      printSection(`🤖 AGENT STARTING: ${entry.agentId || 'Unknown'}`, colors.green);
      printDetail('Context ID', entry.contextId);
      printDetail('Time', timestamp);
    }
    
    // Phase Execution
    if (entry.message?.includes('Executing phase') || entry.phase) {
      const phaseName = entry.phase || entry.message.match(/phase:\s*([^,]+)/)?.[1] || 'Unknown';
      
      // End previous phase timing
      if (currentPhase && phaseStartTime) {
        const duration = new Date() - phaseStartTime;
        phaseTimings[currentPhase] = duration;
        printDetail('Phase Duration', formatDuration(duration), '      ');
      }
      
      currentPhase = phaseName;
      phaseStartTime = new Date(entry.timestamp);
      
      printSection(`📌 PHASE: ${phaseName}`, colors.cyan);
      printDetail('Time', timestamp);
      if (entry.phaseConfig) {
        printSubSection('Configuration');
        printJSON(entry.phaseConfig);
      }
    }
    
    // LLM Requests
    if (entry.message?.includes('LLM REQUEST') || entry.message?.includes('Making LLM call')) {
      printSection(`🧠 LLM REQUEST`, colors.blue);
      printDetail('Provider', entry.provider || 'Anthropic');
      printDetail('Model', entry.model || 'Unknown');
      printDetail('Time', timestamp);
      
      if (entry.systemPrompt) {
        printSubSection('System Prompt');
        console.log(colors.dim + '    ' + entry.systemPrompt.substring(0, 200) + '...' + colors.reset);
      }
      
      if (entry.userPrompt || entry.prompt) {
        printSubSection('User Prompt');
        const prompt = entry.userPrompt || entry.prompt;
        console.log(colors.dim + '    ' + prompt.substring(0, 300) + '...' + colors.reset);
      }
    }
    
    // LLM Responses
    if (entry.message?.includes('LLM RESPONSE') || entry.message?.includes('LLM call completed')) {
      printSection(`💡 LLM RESPONSE`, colors.green);
      printDetail('Time', timestamp);
      
      if (entry.response) {
        printSubSection('Response Preview');
        const response = typeof entry.response === 'string' ? entry.response : JSON.stringify(entry.response);
        console.log(colors.dim + '    ' + response.substring(0, 500) + '...' + colors.reset);
      }
      
      if (entry.usage) {
        printSubSection('Token Usage');
        printDetail('Input', entry.usage.input_tokens);
        printDetail('Output', entry.usage.output_tokens);
        printDetail('Total', entry.usage.total_tokens);
      }
    }
    
    // Agent Reasoning
    if (entry.reasoning || entry.message?.includes('reasoning')) {
      printSection(`🤔 AGENT REASONING`, colors.magenta);
      printDetail('Time', timestamp);
      if (entry.reasoning) {
        console.log(colors.dim + '    ' + entry.reasoning + colors.reset);
      }
    }
    
    // Decisions
    if (entry.decision || entry.message?.includes('Decision made')) {
      printSection(`✅ DECISION MADE`, colors.green);
      printDetail('Time', timestamp);
      if (entry.decision) {
        printJSON(entry.decision);
      }
    }
    
    // Context Updates
    if (entry.eventType === 'TaskContextUpdate' || entry.message?.includes('Context update')) {
      printSubSection(`📝 Context Update`, colors.yellow);
      printDetail('Operation', entry.operation || 'Unknown');
      if (entry.data) {
        printJSON(entry.data);
      }
    }
    
    // Errors
    if (entry.level === 'error' || entry.message?.includes('ERROR')) {
      printSection(`❌ ERROR`, colors.red);
      printDetail('Message', entry.message);
      printDetail('Time', timestamp);
      if (entry.error) {
        printJSON(entry.error);
      }
    }
    
    // Task Completion
    if (entry.message?.includes('task_completed') || entry.message?.includes('Task completed') || 
        entry.message?.includes('All phases executed successfully')) {
      
      // End last phase timing
      if (currentPhase && phaseStartTime) {
        const duration = new Date() - phaseStartTime;
        phaseTimings[currentPhase] = duration;
      }
      
      const totalDuration = new Date() - taskStartTime;
      
      printHeader(`✅ TASK COMPLETED`, colors.bgGreen + colors.white);
      printDetail('Task ID', currentTaskId);
      printDetail('Total Duration', formatDuration(totalDuration));
      
      if (Object.keys(phaseTimings).length > 0) {
        printSection('Phase Timings');
        Object.entries(phaseTimings).forEach(([phase, duration]) => {
          printDetail(phase, formatDuration(duration));
        });
      }
      
      // Reset for next task
      currentTaskId = null;
      taskStartTime = null;
      phaseTimings = {};
      currentPhase = null;
      phaseStartTime = null;
    }
    
    // Status Updates
    if (entry.message?.includes('Task status updated')) {
      printSubSection(`📊 Status Update: ${entry.status || 'Unknown'}`, colors.cyan);
      printDetail('Time', timestamp);
    }
    
  } catch (e) {
    // Not JSON, might be plain text log
    if (line.includes('Task created') || line.includes('ANTHROPIC') || line.includes('Agent')) {
      console.log(`${colors.dim}${line}${colors.reset}`);
    }
  }
}

// Start monitoring
console.log(`${colors.bright}${colors.cyan}🔍 TASK MONITORING SYSTEM ACTIVE${colors.reset}`);
console.log(`${colors.dim}Waiting for task creation...${colors.reset}\n`);
console.log(`${colors.yellow}Ready! You can now create a task in the UI.${colors.reset}`);
console.log(`${colors.dim}I'll capture and display all interactions in real-time.${colors.reset}\n`);

// Monitor the log file
const logFile = path.join(__dirname, 'logs', 'combined.log');
const tail = new Tail(logFile, {
  follow: true,
  fromBeginning: false,
  useWatchFile: true
});

tail.on('line', processLogEntry);

tail.on('error', (error) => {
  console.error(`${colors.red}Error reading log file:${colors.reset}`, error);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Stopping monitoring...${colors.reset}`);
  tail.unwatch();
  process.exit(0);
});