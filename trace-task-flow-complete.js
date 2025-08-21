#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Task ID to trace
const TASK_ID = process.argv[2] || '5fec4b6f-a3e3-46c7-8d2f-9f531d784606';

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
║                    COMPLETE TASK FLOW TRACE                          ║
║                         Task ID: ${TASK_ID.substring(0, 8)}...                          ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

// Read all logs and filter for this task
const logPath = path.join(__dirname, 'logs', 'combined.log');
const logs = fs.readFileSync(logPath, 'utf-8').split('\n');

let taskLogs = [];
let llmCount = 0;
let phaseCount = 0;
let agentCalls = new Map();

// Process all logs for this task
logs.forEach(line => {
  if (line.includes(TASK_ID)) {
    try {
      const log = JSON.parse(line);
      taskLogs.push(log);
    } catch (e) {
      // Not JSON, skip
    }
  }
});

// Sort by timestamp
taskLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

// Process and display each log entry
taskLogs.forEach(log => {
  const time = new Date(log.timestamp).toLocaleTimeString();
  
  // Task Creation
  if (log.message?.includes('Task created') || log.message?.includes('Creating task')) {
    console.log(`\n${colors.bgGreen}${colors.white} 🚀 TASK CREATED ${colors.reset}`);
    console.log(`${colors.bright}Type:${colors.reset} ${log.taskType || 'user_onboarding'}`);
    console.log(`${colors.bright}Time:${colors.reset} ${time}`);
    console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
  }
  
  // Phase Execution
  if (log.message?.includes('Executing phase')) {
    phaseCount++;
    console.log(`\n${colors.bgYellow}${colors.white} 📌 PHASE ${phaseCount}: ${log.phaseName || log.phase} ${colors.reset}`);
    console.log(`${colors.bright}Number:${colors.reset} ${log.phaseNumber}/${log.totalPhases || '?'}`);
    console.log(`${colors.bright}Time:${colors.reset} ${time}`);
  }
  
  // Agent Reasoning
  if (log.agentRole || log.agentId) {
    const agentName = log.agentRole || log.agentId;
    
    if (!agentCalls.has(agentName)) {
      agentCalls.set(agentName, 0);
    }
    agentCalls.set(agentName, agentCalls.get(agentName) + 1);
    
    if (log.message?.includes('AGENT LLM REQUEST')) {
      console.log(`\n${colors.bgBlue}${colors.white} 🤖 AGENT REQUEST: ${agentName} ${colors.reset}`);
      console.log(`${colors.bright}Model:${colors.reset} ${log.model || 'claude-3-5-sonnet'}`);
      if (log.promptPreview) {
        const preview = log.promptPreview.substring(0, 150).replace(/\n/g, ' ');
        console.log(`${colors.bright}Prompt:${colors.reset} ${colors.dim}${preview}...${colors.reset}`);
      }
    }
    
    if (log.message?.includes('AGENT LLM RESPONSE')) {
      console.log(`${colors.green}✓ Response received${colors.reset} (${log.duration || '?ms'})`);
      if (log.responsePreview) {
        try {
          const response = JSON.parse(log.responsePreview.substring(0, 500) + '}');
          if (response.status) {
            console.log(`${colors.bright}Status:${colors.reset} ${colors.yellow}${response.status}${colors.reset}`);
          }
          if (response.contextUpdate?.reasoning) {
            console.log(`${colors.bright}Reasoning:${colors.reset} ${colors.cyan}${response.contextUpdate.reasoning.substring(0, 100)}...${colors.reset}`);
          }
        } catch (e) {
          // Can't parse, show raw preview
          const preview = log.responsePreview.substring(0, 150).replace(/\n/g, ' ');
          console.log(`${colors.bright}Response:${colors.reset} ${colors.dim}${preview}...${colors.reset}`);
        }
      }
    }
  }
  
  // LLM Calls
  if (log.message?.includes('ANTHROPIC: API call')) {
    llmCount++;
    if (log.message.includes('completed')) {
      console.log(`${colors.magenta}📊 LLM Call #${llmCount}:${colors.reset} ${log.duration} | Tokens: ${log.usage?.input_tokens}→${log.usage?.output_tokens}`);
    }
  }
  
  // Context Updates
  if (log.operation && (log.message?.includes('Context entry') || log.message?.includes('context update'))) {
    console.log(`\n${colors.cyan}📝 CONTEXT UPDATE${colors.reset}`);
    console.log(`${colors.bright}Operation:${colors.reset} ${log.operation}`);
    if (log.data) {
      console.log(`${colors.bright}Data:${colors.reset} ${JSON.stringify(log.data).substring(0, 100)}...`);
    }
  }
  
  // UI Requests
  if (log.uiRequest || log.message?.includes('UI request')) {
    console.log(`\n${colors.bgMagenta}${colors.white} 🖼️ UI REQUEST ${colors.reset}`);
    if (log.uiRequest) {
      console.log(`${colors.bright}Type:${colors.reset} ${log.uiRequest.type || 'form'}`);
      console.log(`${colors.bright}Title:${colors.reset} ${log.uiRequest.title || 'N/A'}`);
      if (log.uiRequest.fields) {
        console.log(`${colors.bright}Fields:${colors.reset} ${log.uiRequest.fields.map(f => f.id || f.label).join(', ')}`);
      }
    }
  }
  
  // Phase Completion
  if (log.message?.includes('Phase execution completed')) {
    console.log(`${colors.green}✅ Phase completed${colors.reset} (${log.duration}ms, Success: ${log.successRate || '?'})`);
    console.log(`${colors.dim}${'─'.repeat(72)}${colors.reset}`);
  }
  
  // Task Completion
  if (log.message?.includes('Task completed') || log.message?.includes('COMPLETED')) {
    console.log(`\n${colors.bgGreen}${colors.white} ✅ TASK COMPLETED ${colors.reset}`);
    console.log(`${colors.bright}Final Status:${colors.reset} ${colors.green}${log.status || 'completed'}${colors.reset}`);
  }
  
  // Errors
  if (log.level === 'error' || log.error) {
    console.log(`\n${colors.bgRed}${colors.white} ❌ ERROR ${colors.reset}`);
    console.log(`${colors.red}${log.message || log.error}${colors.reset}`);
  }
});

// Summary
console.log(`\n${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║                            SUMMARY                                   ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

console.log(`${colors.bright}Task ID:${colors.reset} ${TASK_ID}`);
console.log(`${colors.bright}Total Log Entries:${colors.reset} ${taskLogs.length}`);
console.log(`${colors.bright}Phases Executed:${colors.reset} ${phaseCount}`);
console.log(`${colors.bright}LLM Calls:${colors.reset} ${llmCount}`);
console.log(`${colors.bright}Agents Involved:${colors.reset}`);
agentCalls.forEach((count, agent) => {
  console.log(`  • ${colors.magenta}${agent}${colors.reset}: ${count} calls`);
});

// Timeline
if (taskLogs.length > 0) {
  const start = new Date(taskLogs[0].timestamp);
  const end = new Date(taskLogs[taskLogs.length - 1].timestamp);
  const duration = (end - start) / 1000;
  console.log(`${colors.bright}Total Duration:${colors.reset} ${duration.toFixed(2)} seconds`);
  console.log(`${colors.bright}Start:${colors.reset} ${start.toLocaleTimeString()}`);
  console.log(`${colors.bright}End:${colors.reset} ${end.toLocaleTimeString()}`);
}

console.log(`\n${colors.green}${'═'.repeat(72)}${colors.reset}\n`);