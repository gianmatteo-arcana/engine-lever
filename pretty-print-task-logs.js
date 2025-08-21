#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
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

const taskId = process.argv[2];
if (!taskId) {
  console.error('Usage: node pretty-print-task-logs.js <taskId>');
  process.exit(1);
}

console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}                    TASK FLOW ANALYSIS: ${taskId}${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════${colors.reset}\n`);

const logFile = path.join(__dirname, 'logs', 'combined.log');
const rl = readline.createInterface({
  input: fs.createReadStream(logFile),
  crlfDelay: Infinity
});

const events = [];
let taskCreatedTime = null;

rl.on('line', (line) => {
  try {
    const log = JSON.parse(line);
    
    // Check if this log is related to our task
    const isRelated = 
      log.taskId === taskId ||
      log.contextId === taskId ||
      (log.contextId && log.contextId.startsWith(taskId));
    
    if (isRelated) {
      events.push(log);
      if (log.message && log.message.includes('Task created')) {
        taskCreatedTime = log.timestamp;
      }
    }
  } catch (e) {
    // Skip non-JSON lines
  }
});

rl.on('close', () => {
  if (events.length === 0) {
    console.log(`${colors.red}No logs found for task ${taskId}${colors.reset}`);
    return;
  }
  
  // Sort by timestamp
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Group events by phase
  const phases = {};
  let currentPhase = 'initialization';
  
  events.forEach(event => {
    if (event.phase) currentPhase = event.phase;
    if (!phases[currentPhase]) phases[currentPhase] = [];
    phases[currentPhase].push(event);
  });
  
  // Print summary
  console.log(`${colors.bright}📊 SUMMARY${colors.reset}`);
  console.log(`${colors.dim}────────────────────────────────────────${colors.reset}`);
  console.log(`Task ID: ${colors.cyan}${taskId}${colors.reset}`);
  console.log(`Total Events: ${colors.yellow}${events.length}${colors.reset}`);
  console.log(`Time Range: ${colors.green}${events[0].timestamp} → ${events[events.length - 1].timestamp}${colors.reset}`);
  
  // Calculate duration
  const startTime = new Date(events[0].timestamp);
  const endTime = new Date(events[events.length - 1].timestamp);
  const duration = (endTime - startTime) / 1000;
  console.log(`Duration: ${colors.magenta}${duration.toFixed(2)}s${colors.reset}`);
  
  // Count by level
  const levels = {};
  events.forEach(e => {
    levels[e.level] = (levels[e.level] || 0) + 1;
  });
  console.log(`\nLog Levels:`);
  Object.entries(levels).forEach(([level, count]) => {
    let color = colors.white;
    if (level === 'error') color = colors.red;
    else if (level === 'warn') color = colors.yellow;
    else if (level === 'info') color = colors.green;
    else if (level === 'debug') color = colors.cyan;
    console.log(`  ${color}${level}: ${count}${colors.reset}`);
  });
  
  console.log(`\n${colors.bright}🔄 CHRONOLOGICAL FLOW${colors.reset}`);
  console.log(`${colors.dim}════════════════════════════════════════${colors.reset}\n`);
  
  // Print events chronologically
  events.forEach((event, index) => {
    const time = new Date(event.timestamp).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3 
    });
    
    // Determine color based on level
    let levelColor = colors.white;
    let levelBg = '';
    if (event.level === 'error') {
      levelColor = colors.red;
      levelBg = colors.bgRed + colors.white;
    } else if (event.level === 'warn') {
      levelColor = colors.yellow;
      levelBg = colors.bgYellow + colors.black;
    } else if (event.level === 'info') {
      levelColor = colors.green;
    } else if (event.level === 'debug') {
      levelColor = colors.cyan;
    }
    
    // Format the message
    let message = event.message || '';
    
    // Highlight important messages
    if (message.includes('ERROR') || message.includes('failed')) {
      message = `${colors.red}❌ ${message}${colors.reset}`;
    } else if (message.includes('SUCCESS') || message.includes('completed')) {
      message = `${colors.green}✅ ${message}${colors.reset}`;
    } else if (message.includes('STARTED') || message.includes('initiated')) {
      message = `${colors.blue}🚀 ${message}${colors.reset}`;
    } else if (message.includes('WARN')) {
      message = `${colors.yellow}⚠️ ${message}${colors.reset}`;
    }
    
    // Print main line
    console.log(`${colors.dim}[${time}]${colors.reset} ${levelBg || levelColor}[${event.level?.toUpperCase() || 'LOG'}]${colors.reset} ${message}`);
    
    // Print additional context
    const contextFields = ['error', 'agentId', 'phase', 'operation', 'missingFields', 'strategy'];
    const context = {};
    contextFields.forEach(field => {
      if (event[field]) context[field] = event[field];
    });
    
    if (Object.keys(context).length > 0) {
      Object.entries(context).forEach(([key, value]) => {
        let valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
        console.log(`${colors.dim}  └─ ${key}: ${colors.reset}${valueStr}`);
      });
    }
    
    // Add separator for errors
    if (event.level === 'error') {
      console.log(`${colors.red}${'─'.repeat(72)}${colors.reset}`);
    }
  });
  
  // Print final status
  console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════${colors.reset}`);
  
  // Look for actual task status updates
  const statusUpdates = events.filter(e => 
    e.message?.includes('Task status updated to') || 
    e.message?.includes('Updating task status to')
  );
  
  const lastStatusUpdate = statusUpdates[statusUpdates.length - 1];
  
  if (lastStatusUpdate) {
    const statusMatch = lastStatusUpdate.message.match(/to (\w+)/i);
    const finalStatus = statusMatch ? statusMatch[1].toUpperCase() : 'UNKNOWN';
    
    // Check if there's a pending UI request
    const hasUIRequest = events.some(e => 
      e.message?.includes('Phase requires user input') ||
      e.message?.includes('needs_input')
    );
    
    if (finalStatus === 'WAITING_FOR_INPUT' || hasUIRequest) {
      console.log(`${colors.bgYellow}${colors.black} ⏸️ WAITING FOR USER INPUT ${colors.reset}`);
      console.log(`${colors.yellow}Task is paused and waiting for user to provide required information${colors.reset}`);
    } else if (finalStatus === 'FAILED') {
      console.log(`${colors.bgRed}${colors.white} ❌ TASK FAILED ${colors.reset}`);
    } else if (finalStatus === 'COMPLETED') {
      console.log(`${colors.bgGreen}${colors.white} ✅ TASK COMPLETED ${colors.reset}`);
    } else {
      console.log(`${colors.bgBlue}${colors.white} 📊 TASK STATUS: ${finalStatus} ${colors.reset}`);
    }
  } else {
    // Fallback to checking orchestration completion
    const orchestrationComplete = events.find(e => e.message?.includes('Task orchestration completed'));
    if (orchestrationComplete) {
      console.log(`${colors.bgCyan}${colors.white} 🔄 ORCHESTRATION FINISHED ${colors.reset}`);
      console.log(`${colors.cyan}Check task status for current state${colors.reset}`);
    }
  }
  
  // Print error summary if any
  const errors = events.filter(e => e.level === 'error');
  if (errors.length > 0) {
    console.log(`\n${colors.bright}${colors.red}⚠️ ERRORS ENCOUNTERED (${errors.length})${colors.reset}`);
    errors.forEach((error, i) => {
      console.log(`${colors.red}${i + 1}. ${error.message}${colors.reset}`);
      if (error.error) {
        console.log(`   ${colors.dim}Details: ${error.error}${colors.reset}`);
      }
    });
  }
  
  console.log(`\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════════════${colors.reset}\n`);
});