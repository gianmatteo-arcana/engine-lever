#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

const color = (str, colorName) => `${colors[colorName]}${str}${colors.reset}`;
const bold = (str) => `${colors.bold}${str}${colors.reset}`;

console.log(color(bold('\n════════════════════════════════════════════════════════════════════════════════'), 'cyan'));
console.log(color(bold('                    🔍 REAL-TIME TASK MONITORING SYSTEM'), 'cyan'));
console.log(color(bold('════════════════════════════════════════════════════════════════════════════════'), 'cyan'));
console.log(color('\n📡 Monitoring all task interactions in real-time...', 'yellow'));
console.log(color('👉 Ready! Please create your task in the UI now.\n', 'green'));
console.log(color('─'.repeat(80), 'gray'));

// Track current task
let currentTaskId = null;
let phaseCount = 0;
let agentCount = 0;
let llmCallCount = 0;

// Start tailing the log
const tail = spawn('tail', ['-f', path.join(__dirname, 'logs', 'combined.log')]);

tail.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    try {
      const log = JSON.parse(line);
      const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractional: 3 
      });
      
      // Task Creation
      if (log.message?.includes('Task created') || log.message?.includes('Creating universal task')) {
        currentTaskId = log.taskId || log.contextId || 'Detecting...';
        console.log(color(bold('\n🎯 NEW TASK CREATED!'), 'green'));
        console.log(color(`   Task ID: ${bold(currentTaskId)}`, 'yellow'));
        console.log(color(`   Type: ${log.taskType || 'unknown'}`, 'cyan'));
        console.log(color(`   Time: ${time}`, 'gray'));
        console.log(color('─'.repeat(80), 'gray'));
      }
      
      // Only process logs for current task
      if (currentTaskId && (log.taskId === currentTaskId || log.contextId === currentTaskId)) {
        
        // Orchestrator Reasoning
        if (log.message?.includes('ORCHESTRATOR REASONING') || log.message?.includes('createExecutionPlan')) {
          console.log(color(bold('\n🧠 ORCHESTRATOR REASONING:'), 'magenta'));
          console.log(color(`   [${time}] ${log.message}`, 'white'));
        }
        
        // LLM Requests
        if (log.message?.includes('LLM REQUEST') || log.message?.includes('ANTHROPIC REQUEST')) {
          llmCallCount++;
          console.log(color(bold(`\n🤖 LLM REQUEST #${llmCallCount}:`), 'blue'));
          console.log(color(`   [${time}] Initiating LLM call...`, 'white'));
          if (log.model) console.log(color(`   Model: ${log.model}`, 'gray'));
          if (log.promptLength) console.log(color(`   Prompt size: ${log.promptLength} chars`, 'gray'));
        }
        
        // LLM Responses  
        if (log.message?.includes('LLM response') || log.message?.includes('LLM EXECUTION PLAN RESPONSE')) {
          console.log(color(`   ✅ Response received (${log.duration || 'N/A'})`, 'green'));
          if (log.usage?.totalTokens) {
            console.log(color(`   Tokens used: ${log.usage.totalTokens}`, 'gray'));
          }
        }
        
        // Phase Execution
        if (log.message?.includes('Executing phase')) {
          phaseCount++;
          const match = log.message.match(/phase (\d+)\/(\d+): (.+)/);
          if (match) {
            console.log(color(bold(`\n📌 PHASE ${match[1]}/${match[2]}: ${match[3]}`), 'yellow'));
            console.log(color(`   [${time}] Starting phase execution...`, 'white'));
          }
        }
        
        // Phase Completion
        if (log.message?.includes('Phase execution completed')) {
          console.log(color(`   ✅ Phase completed (${log.duration}ms)`, 'green'));
        }
        
        // Agent Activities
        if (log.agentRole || log.agentId) {
          agentCount++;
          const agentName = log.agentRole || log.agentId;
          console.log(color(`\n🤖 AGENT: ${bold(agentName)}`, 'cyan'));
          console.log(color(`   [${time}] ${log.message}`, 'white'));
        }
        
        // Agent Reasoning
        if (log.reasoning) {
          console.log(color(bold('   💭 Reasoning:'), 'magenta'));
          console.log(color(`      "${log.reasoning}"`, 'white'));
        }
        
        // Events
        if (log.eventType || log.message?.includes('Event published')) {
          console.log(color(`\n📢 EVENT: ${log.eventType || 'context_update'}`, 'blue'));
          console.log(color(`   [${time}] ${log.message}`, 'gray'));
        }
        
        // Errors
        if (log.level === 'error') {
          console.log(color(bold(`\n❌ ERROR:`), 'red'));
          console.log(color(`   [${time}] ${log.message}`, 'red'));
          if (log.error) console.log(color(`   Details: ${log.error}`, 'red'));
        }
        
        // Task Completion
        if (log.message?.includes('All phases completed') || log.message?.includes('Task status updated to COMPLETED')) {
          console.log(color(bold('\n✅ TASK COMPLETED!'), 'green'));
          console.log(color(`   Total Phases: ${phaseCount}`, 'cyan'));
          console.log(color(`   Agents Involved: ${agentCount}`, 'cyan'));
          console.log(color(`   LLM Calls: ${llmCallCount}`, 'cyan'));
          console.log(color('═'.repeat(80), 'green'));
          
          // Reset for next task
          currentTaskId = null;
          phaseCount = 0;
          agentCount = 0;
          llmCallCount = 0;
        }
        
        // Subtasks
        if (log.message?.includes('SUBTASK')) {
          const match = log.message.match(/SUBTASK (\d+): (.+)/);
          if (match) {
            console.log(color(`   📋 Subtask ${match[1]}: ${match[2]}`, 'cyan'));
          }
        }
        
        // UI Requests
        if (log.message?.includes('UI_REQUEST')) {
          console.log(color(bold('\n🖥️ UI REQUEST:'), 'yellow'));
          console.log(color(`   [${time}] ${log.description || log.message}`, 'white'));
        }
      }
      
    } catch (e) {
      // Not JSON, ignore
    }
  });
});

tail.stderr.on('data', (data) => {
  console.error(color(`Error: ${data}`, 'red'));
});

// Handle exit
process.on('SIGINT', () => {
  console.log(color('\n\n👋 Monitoring stopped.', 'yellow'));
  tail.kill();
  process.exit();
});