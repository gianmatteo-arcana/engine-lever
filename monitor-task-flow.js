#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Colors for pretty printing
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
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgMagenta: '\x1b[45m'
};

console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║                     TASK FLOW MONITORING SYSTEM                      ║
║                  Real-time Agent Reasoning Tracker                   ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

console.log(`${colors.yellow}🎯 Monitoring for:${colors.reset}
  • Task creation events
  • Agent reasoning and decisions
  • LLM requests and responses
  • Phase executions
  • State transitions
  • Error conditions\n`);

console.log(`${colors.green}✅ Ready! Please create a task in the UI...${colors.reset}\n`);
console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}\n`);

let currentTaskId = null;
let phaseCount = 0;
let llmRequestCount = 0;

// Function to format timestamp
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    fractionalSecondDigits: 3 
  });
}

// Function to parse and pretty print log entries
function processLogLine(line) {
  try {
    const log = JSON.parse(line);
    const time = formatTime(log.timestamp);
    
    // Task Creation
    if (log.message?.includes('Task created') || log.message?.includes('Creating task')) {
      currentTaskId = log.taskId || log.id;
      console.log(`\n${colors.bgGreen}${colors.white} 🚀 NEW TASK CREATED ${colors.reset}`);
      console.log(`${colors.bright}Task ID:${colors.reset} ${colors.cyan}${currentTaskId}${colors.reset}`);
      console.log(`${colors.bright}Type:${colors.reset} ${log.taskType || log.type || 'N/A'}`);
      console.log(`${colors.bright}Time:${colors.reset} ${time}`);
      if (log.metadata) {
        console.log(`${colors.bright}Metadata:${colors.reset}`, JSON.stringify(log.metadata, null, 2));
      }
      console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
    }
    
    // Agent Reasoning
    if (log.agentRole || log.agent || log.message?.includes('Agent')) {
      if (log.reasoning || log.decision || log.message?.includes('reasoning')) {
        console.log(`\n${colors.bgBlue}${colors.white} 🧠 AGENT REASONING ${colors.reset}`);
        console.log(`${colors.bright}Agent:${colors.reset} ${colors.magenta}${log.agentRole || log.agent || 'Unknown'}${colors.reset}`);
        console.log(`${colors.bright}Phase:${colors.reset} ${log.phase || 'N/A'}`);
        if (log.reasoning) {
          console.log(`${colors.bright}Reasoning:${colors.reset}\n${colors.cyan}${log.reasoning}${colors.reset}`);
        }
        if (log.decision) {
          console.log(`${colors.bright}Decision:${colors.reset} ${colors.green}${log.decision}${colors.reset}`);
        }
        console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
      }
    }
    
    // LLM Requests
    if (log.message?.includes('LLM REQUEST') || log.llmRequest || log.prompt) {
      llmRequestCount++;
      console.log(`\n${colors.bgMagenta}${colors.white} 🤖 LLM REQUEST #${llmRequestCount} ${colors.reset}`);
      console.log(`${colors.bright}Model:${colors.reset} ${log.model || 'default'}`);
      console.log(`${colors.bright}Provider:${colors.reset} ${log.provider || 'unknown'}`);
      if (log.prompt) {
        const promptPreview = log.prompt.substring(0, 200) + (log.prompt.length > 200 ? '...' : '');
        console.log(`${colors.bright}Prompt:${colors.reset}\n${colors.dim}${promptPreview}${colors.reset}`);
      }
      console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
    }
    
    // LLM Responses
    if (log.message?.includes('LLM RESPONSE') || log.llmResponse || log.completion) {
      console.log(`\n${colors.bgMagenta}${colors.white} 🤖 LLM RESPONSE ${colors.reset}`);
      if (log.completion || log.response) {
        const response = log.completion || log.response;
        const responsePreview = typeof response === 'string' 
          ? response.substring(0, 300) + (response.length > 300 ? '...' : '')
          : JSON.stringify(response, null, 2).substring(0, 300) + '...';
        console.log(`${colors.bright}Response:${colors.reset}\n${colors.green}${responsePreview}${colors.reset}`);
      }
      if (log.usage) {
        console.log(`${colors.bright}Tokens:${colors.reset} ${JSON.stringify(log.usage)}`);
      }
      console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
    }
    
    // Phase Execution
    if (log.phase || log.message?.includes('phase')) {
      phaseCount++;
      console.log(`\n${colors.bgYellow}${colors.white} 📌 PHASE EXECUTION #${phaseCount} ${colors.reset}`);
      console.log(`${colors.bright}Phase:${colors.reset} ${colors.yellow}${log.phase || log.phaseName || 'Unknown'}${colors.reset}`);
      console.log(`${colors.bright}Status:${colors.reset} ${log.status || 'in progress'}`);
      if (log.context) {
        console.log(`${colors.bright}Context:${colors.reset}`, JSON.stringify(log.context, null, 2));
      }
      console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
    }
    
    // State Updates
    if (log.message?.includes('state') || log.stateUpdate) {
      console.log(`\n${colors.cyan}📊 STATE UPDATE${colors.reset}`);
      console.log(`${colors.bright}From:${colors.reset} ${log.fromState || 'N/A'}`);
      console.log(`${colors.bright}To:${colors.reset} ${log.toState || log.newState || 'N/A'}`);
      if (log.data) {
        console.log(`${colors.bright}Data:${colors.reset}`, JSON.stringify(log.data, null, 2));
      }
      console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
    }
    
    // Errors
    if (log.level === 'error' || log.error) {
      console.log(`\n${colors.bgRed}${colors.white} ❌ ERROR ${colors.reset}`);
      console.log(`${colors.red}${log.message || log.error}${colors.reset}`);
      if (log.stack) {
        console.log(`${colors.dim}${log.stack}${colors.reset}`);
      }
      console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
    }
    
    // Task Completion
    if (log.message?.includes('completed') || log.message?.includes('COMPLETED')) {
      console.log(`\n${colors.bgGreen}${colors.white} ✅ TASK COMPLETED ${colors.reset}`);
      console.log(`${colors.bright}Task ID:${colors.reset} ${colors.cyan}${log.taskId || currentTaskId}${colors.reset}`);
      console.log(`${colors.bright}Final Status:${colors.reset} ${colors.green}${log.status || 'completed'}${colors.reset}`);
      if (log.result) {
        console.log(`${colors.bright}Result:${colors.reset}`, JSON.stringify(log.result, null, 2));
      }
      console.log(`${colors.bright}Total Phases:${colors.reset} ${phaseCount}`);
      console.log(`${colors.bright}Total LLM Calls:${colors.reset} ${llmRequestCount}`);
      console.log(`\n${colors.green}${'═'.repeat(72)}${colors.reset}\n`);
      
      // Reset counters for next task
      phaseCount = 0;
      llmRequestCount = 0;
    }
    
  } catch (err) {
    // Not JSON or parsing error - might be plain text log
    if (line.includes('Task') || line.includes('Agent') || line.includes('LLM') || 
        line.includes('phase') || line.includes('reasoning') || line.includes('ERROR')) {
      console.log(`${colors.dim}[LOG] ${line}${colors.reset}`);
    }
  }
}

// Start tailing the log file
const logPath = path.join(__dirname, 'logs', 'combined.log');
const tail = spawn('tail', ['-f', logPath]);

tail.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      processLogLine(line);
    }
  });
});

tail.stderr.on('data', (data) => {
  console.error(`${colors.red}Error tailing log: ${data}${colors.reset}`);
});

// Handle exit
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Stopping monitoring...${colors.reset}`);
  tail.kill();
  process.exit(0);
});