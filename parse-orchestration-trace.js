#!/usr/bin/env node

/**
 * Parse orchestration trace into human-readable format
 * Shows the complete flow of task processing with agent reasoning
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
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

function parseLogFile(logContent) {
  const lines = logContent.split('\n');
  const events = [];
  
  lines.forEach(line => {
    // Parse JSON log entries
    if (line.includes('{"')) {
      try {
        const jsonStart = line.indexOf('{');
        const json = JSON.parse(line.substring(jsonStart));
        
        // Extract key information
        if (json.message) {
          events.push({
            timestamp: json.timestamp,
            level: json.level || 'info',
            message: json.message,
            data: json
          });
        }
      } catch (e) {
        // Not JSON or parsing error
      }
    }
    
    // Parse console.log style entries
    if (line.includes('info:') || line.includes('debug:') || line.includes('error:')) {
      const match = line.match(/\[(\d+m)?([^\]]+)\]: (.+?) \{/);
      if (match) {
        events.push({
          timestamp: new Date().toISOString(),
          level: line.includes('error') ? 'error' : line.includes('debug') ? 'debug' : 'info',
          message: match[3],
          raw: line
        });
      }
    }
  });
  
  return events;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${(ms/60000).toFixed(1)}m`;
}

function printOrchestrationSummary(events) {
  console.log('\n' + colors.cyan + colors.bright + '═══════════════════════════════════════════════════════════════════');
  console.log('                    TASK ORCHESTRATION TRACE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════' + colors.reset);
  
  // Find key events
  const taskCreated = events.find(e => e.message?.includes('Task Created') || e.message?.includes('New task creation'));
  const orchestrationStarted = events.find(e => e.message?.includes('orchestrateTask() CALLED'));
  const llmPlanRequest = events.find(e => e.message?.includes('LLM EXECUTION PLAN PROMPT'));
  const llmPlanResponse = events.find(e => e.message?.includes('LLM EXECUTION PLAN RESPONSE'));
  const reasoning = events.find(e => e.message?.includes('ORCHESTRATOR REASONING'));
  const phaseExecutions = events.filter(e => e.message?.includes('Phase execution'));
  const agentRequests = events.filter(e => e.message?.includes('AGENT LLM REQUEST'));
  const agentResponses = events.filter(e => e.message?.includes('AGENT LLM RESPONSE'));
  const agentReasoning = events.filter(e => e.message?.includes('AGENT REASONING'));
  const completed = events.find(e => e.message?.includes('Task orchestration completed'));
  
  // Task Creation
  console.log('\n' + colors.yellow + colors.bright + '📋 TASK CREATION' + colors.reset);
  console.log(colors.gray + '────────────────────────────────────────' + colors.reset);
  if (taskCreated) {
    console.log('Task ID: ' + colors.cyan + (taskCreated.data?.taskId || 'Unknown') + colors.reset);
    console.log('Type: ' + (taskCreated.data?.templateId || taskCreated.data?.taskType || 'Unknown'));
    console.log('Time: ' + new Date(taskCreated.timestamp).toLocaleTimeString());
  }
  
  // Orchestrator Planning
  console.log('\n' + colors.magenta + colors.bright + '🧠 ORCHESTRATOR PLANNING' + colors.reset);
  console.log(colors.gray + '────────────────────────────────────────' + colors.reset);
  if (llmPlanRequest && llmPlanResponse) {
    const duration = llmPlanResponse.data?.duration;
    console.log('Model: ' + colors.green + (llmPlanRequest.data?.model || 'claude-3-5-sonnet') + colors.reset);
    console.log('Response Time: ' + colors.yellow + (duration || 'Unknown') + colors.reset);
    console.log('Tokens Used: ' + (llmPlanResponse.data?.usage?.totalTokens || 'Unknown'));
  }
  
  if (reasoning && reasoning.data) {
    console.log('\n' + colors.bright + 'Task Analysis:' + colors.reset);
    console.log(colors.dim + '  ' + (reasoning.data.taskAnalysis || 'Not available') + colors.reset);
    
    console.log('\n' + colors.bright + 'Coordination Strategy:' + colors.reset);
    console.log(colors.dim + '  ' + (reasoning.data.coordinationStrategy || 'Not available') + colors.reset);
    
    if (reasoning.data.subtaskCount) {
      console.log('\n' + colors.bright + 'Subtasks Identified: ' + colors.reset + reasoning.data.subtaskCount);
    }
  }
  
  // Agent Executions
  console.log('\n' + colors.cyan + colors.bright + '🤖 AGENT EXECUTIONS' + colors.reset);
  console.log(colors.gray + '────────────────────────────────────────' + colors.reset);
  
  const agentMap = new Map();
  agentRequests.forEach(req => {
    const agentId = req.data?.agentId || 'unknown';
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, { requests: [], responses: [], reasoning: [] });
    }
    agentMap.get(agentId).requests.push(req);
  });
  
  agentResponses.forEach(resp => {
    const agentId = resp.data?.agentId || 'unknown';
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, { requests: [], responses: [], reasoning: [] });
    }
    agentMap.get(agentId).responses.push(resp);
  });
  
  agentReasoning.forEach(reason => {
    const agentId = reason.data?.agentId || 'unknown';
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, { requests: [], responses: [], reasoning: [] });
    }
    agentMap.get(agentId).reasoning.push(reason);
  });
  
  let agentNum = 1;
  agentMap.forEach((data, agentId) => {
    console.log('\n' + colors.bright + `${agentNum}. Agent: ${agentId}` + colors.reset);
    
    if (data.requests.length > 0) {
      const req = data.requests[0];
      console.log('   Type: ' + (req.data?.agentType || 'Unknown'));
      console.log('   Model: ' + colors.green + (req.data?.model || 'claude-3-5-sonnet') + colors.reset);
    }
    
    if (data.responses.length > 0) {
      const resp = data.responses[0];
      console.log('   Response Time: ' + colors.yellow + (resp.data?.duration || 'Unknown') + colors.reset);
      console.log('   Tokens: ' + (resp.data?.usage?.totalTokens || 'Unknown'));
    }
    
    if (data.reasoning.length > 0) {
      const reason = data.reasoning[0];
      if (reason.data?.reasoning) {
        console.log('   ' + colors.bright + 'Reasoning:' + colors.reset);
        const reasonText = typeof reason.data.reasoning === 'string' 
          ? reason.data.reasoning 
          : JSON.stringify(reason.data.reasoning);
        console.log(colors.dim + '   ' + reasonText.substring(0, 200) + '...' + colors.reset);
      }
    }
    
    agentNum++;
  });
  
  // Phases
  if (phaseExecutions.length > 0) {
    console.log('\n' + colors.blue + colors.bright + '📊 PHASE EXECUTIONS' + colors.reset);
    console.log(colors.gray + '────────────────────────────────────────' + colors.reset);
    phaseExecutions.forEach((phase, i) => {
      console.log(`\n${i + 1}. ${phase.data?.phaseName || 'Unknown Phase'}`);
      console.log('   Duration: ' + colors.yellow + formatDuration(phase.data?.duration || 0) + colors.reset);
      console.log('   Subtasks: ' + (phase.data?.subtaskCount || 0));
      console.log('   Success Rate: ' + (phase.data?.successRate !== undefined ? 
        (phase.data.successRate * 100).toFixed(0) + '%' : 'N/A'));
    });
  }
  
  // Final Status
  console.log('\n' + colors.green + colors.bright + '✅ FINAL STATUS' + colors.reset);
  console.log(colors.gray + '────────────────────────────────────────' + colors.reset);
  if (completed) {
    console.log('Status: ' + colors.green + 'COMPLETED' + colors.reset);
    console.log('Total Duration: ' + colors.yellow + formatDuration(completed.data?.duration || 0) + colors.reset);
  } else {
    console.log('Status: ' + colors.red + 'INCOMPLETE OR IN PROGRESS' + colors.reset);
  }
  
  // Statistics
  console.log('\n' + colors.white + colors.bright + '📈 STATISTICS' + colors.reset);
  console.log(colors.gray + '────────────────────────────────────────' + colors.reset);
  console.log('Total Events Captured: ' + events.length);
  console.log('LLM Requests: ' + (agentRequests.length + (llmPlanRequest ? 1 : 0)));
  console.log('Agents Involved: ' + agentMap.size);
  console.log('Phases Executed: ' + phaseExecutions.length);
  
  console.log('\n' + colors.cyan + '═══════════════════════════════════════════════════════════════════' + colors.reset + '\n');
}

// Main execution
const logFile = process.argv[2] || 'orchestration-trace.log';

if (!fs.existsSync(logFile)) {
  // Try to capture from console
  console.log('Reading from stdin (paste logs and press Ctrl+D when done):');
  
  let logContent = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    logContent += chunk;
  });
  
  process.stdin.on('end', () => {
    const events = parseLogFile(logContent);
    printOrchestrationSummary(events);
  });
} else {
  const logContent = fs.readFileSync(logFile, 'utf8');
  const events = parseLogFile(logContent);
  printOrchestrationSummary(events);
}