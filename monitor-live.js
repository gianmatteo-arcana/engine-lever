#!/usr/bin/env node

const { spawn } = require('child_process');

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
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

// Track task state
let currentTaskId = null;
let taskStartTime = null;
let phaseTimings = {};
let currentPhase = null;
let phaseStartTime = null;

function printHeader(text, color = colors.cyan) {
  console.log(`\n${color}${'='.repeat(80)}${colors.reset}`);
  console.log(`${color}${colors.bright}${text}${colors.reset}`);
  console.log(`${color}${'='.repeat(80)}${colors.reset}\n`);
}

function printSection(title, color = colors.yellow) {
  console.log(`\n${color}${colors.bright}>>> ${title}${colors.reset}`);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
}

function processLine(line) {
  try {
    const entry = JSON.parse(line);
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    
    // Task Creation
    if (entry.message?.includes('Creating universal task') || entry.message?.includes('Task created')) {
      currentTaskId = entry.taskId || entry.contextId;
      taskStartTime = new Date(entry.timestamp);
      phaseTimings = {};
      
      printHeader(`🚀 NEW TASK CREATED: ${currentTaskId}`, colors.bgGreen + colors.white);
      console.log(`  Type: ${entry.taskType || 'Unknown'}`);
      console.log(`  User: ${entry.userId || 'Unknown'}`);
      console.log(`  Time: ${timestamp}`);
      return;
    }
    
    // Skip if not current task
    if (currentTaskId && entry.taskId !== currentTaskId && entry.contextId !== currentTaskId) {
      return;
    }
    
    // Agent Starting
    if (entry.message?.includes('Agent execution started')) {
      printSection(`🤖 AGENT: ${entry.agentId || 'OrchestratorAgent'}`, colors.green);
      console.log(`  Context: ${entry.contextId}`);
    }
    
    // Phase Execution
    if (entry.message?.includes('Executing phase')) {
      const match = entry.message.match(/Executing phase:\s*(.+?)(?:\s|$)/);
      const phaseName = match?.[1] || entry.phase || 'Unknown';
      
      if (currentPhase && phaseStartTime) {
        const duration = new Date() - phaseStartTime;
        phaseTimings[currentPhase] = duration;
        console.log(`  ${colors.dim}Phase "${currentPhase}" took ${formatDuration(duration)}${colors.reset}`);
      }
      
      currentPhase = phaseName;
      phaseStartTime = new Date(entry.timestamp);
      
      printSection(`📌 PHASE: ${phaseName}`, colors.cyan);
      console.log(`  Started: ${timestamp}`);
    }
    
    // LLM Requests
    if (entry.message?.includes('ANTHROPIC REQUEST') || entry.message?.includes('LLM REQUEST')) {
      printSection(`🧠 LLM REQUEST`, colors.blue);
      console.log(`  Model: ${entry.model || 'claude-3-5-sonnet'}`);
      
      if (entry.systemPrompt) {
        console.log(`  ${colors.dim}System: ${entry.systemPrompt.substring(0, 150)}...${colors.reset}`);
      }
      
      if (entry.userPrompt || entry.prompt) {
        const prompt = entry.userPrompt || entry.prompt || '';
        console.log(`  ${colors.dim}Prompt: ${prompt.substring(0, 200)}...${colors.reset}`);
      }
    }
    
    // LLM Responses
    if (entry.message?.includes('ANTHROPIC RESPONSE') || entry.message?.includes('LLM RESPONSE')) {
      printSection(`💡 LLM RESPONSE`, colors.green);
      
      if (entry.response) {
        const resp = typeof entry.response === 'string' ? entry.response : JSON.stringify(entry.response);
        console.log(`  ${colors.dim}${resp.substring(0, 300)}...${colors.reset}`);
      }
      
      if (entry.usage) {
        console.log(`  Tokens: In=${entry.usage.input_tokens}, Out=${entry.usage.output_tokens}`);
      }
    }
    
    // Reasoning
    if (entry.reasoning) {
      printSection(`🤔 REASONING`, colors.magenta);
      console.log(`  ${colors.dim}${entry.reasoning}${colors.reset}`);
    }
    
    // Errors
    if (entry.level === 'error') {
      printSection(`❌ ERROR`, colors.red);
      console.log(`  ${entry.message}`);
      if (entry.error) {
        console.log(`  ${colors.dim}${JSON.stringify(entry.error)}${colors.reset}`);
      }
    }
    
    // Task Completion
    if (entry.message?.includes('Task completed') || entry.message?.includes('task_completed') ||
        entry.message?.includes('All phases executed successfully')) {
      
      if (currentPhase && phaseStartTime) {
        const duration = new Date() - phaseStartTime;
        phaseTimings[currentPhase] = duration;
      }
      
      const totalDuration = taskStartTime ? new Date() - taskStartTime : 0;
      
      printHeader(`✅ TASK COMPLETED: ${currentTaskId}`, colors.bgGreen + colors.white);
      
      if (totalDuration > 0) {
        console.log(`  Total Duration: ${formatDuration(totalDuration)}`);
      }
      
      if (Object.keys(phaseTimings).length > 0) {
        console.log(`\n  Phase Timings:`);
        Object.entries(phaseTimings).forEach(([phase, duration]) => {
          console.log(`    ${phase}: ${formatDuration(duration)}`);
        });
      }
      
      // Reset
      currentTaskId = null;
      taskStartTime = null;
      phaseTimings = {};
      currentPhase = null;
      phaseStartTime = null;
    }
    
    // Status Updates
    if (entry.message?.includes('Task status updated')) {
      console.log(`  ${colors.cyan}📊 Status → ${entry.status || 'Unknown'}${colors.reset}`);
    }
    
  } catch (e) {
    // Not JSON - check if it's relevant plain text
    if (line.includes('Task') || line.includes('Agent') || line.includes('Phase') || 
        line.includes('ANTHROPIC') || line.includes('LLM')) {
      console.log(`${colors.dim}${line}${colors.reset}`);
    }
  }
}

// Start monitoring
console.log(`${colors.bright}${colors.cyan}🔍 LIVE TASK MONITORING SYSTEM${colors.reset}`);
console.log(`${colors.yellow}Ready! Please create a task in the UI.${colors.reset}`);
console.log(`${colors.dim}I'll capture all interactions in real-time...${colors.reset}\n`);

// Use tail command to follow the log
const tail = spawn('tail', ['-f', 'logs/combined.log']);

tail.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      processLine(line);
    }
  });
});

tail.stderr.on('data', (data) => {
  console.error(`${colors.red}Error: ${data}${colors.reset}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Stopping monitor...${colors.reset}`);
  tail.kill();
  process.exit(0);
});