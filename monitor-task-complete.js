#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Track latest task
let latestTaskId = null;
let startTime = null;
const events = [];

console.log(color(bold('\n════════════════════════════════════════'), 'blue'));
console.log(color(bold('     TASK MONITORING SYSTEM READY'), 'blue'));
console.log(color(bold('════════════════════════════════════════'), 'blue'));
console.log(color('\n🔍 Monitoring for new tasks...', 'cyan'));
console.log(color('Please create a task in the UI now.\n', 'yellow'));

// Monitor logs in real-time
const logFile = path.join(__dirname, 'logs', 'combined.log');
if (fs.existsSync(logFile)) {
  const tail = require('child_process').spawn('tail', ['-f', logFile]);
  
  tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (!line.trim()) return;
      
      try {
        const log = JSON.parse(line);
        
        // Filter for relevant logs
        if (latestTaskId && (
          line.includes(latestTaskId) ||
          log.contextId?.includes(latestTaskId) ||
          log.taskId === latestTaskId
        )) {
          handleLogEntry(log);
        }
        
        // Detect new task creation
        if (log.message?.includes('New task created') || 
            log.message?.includes('Creating task')) {
          const match = log.message.match(/([a-f0-9-]{36})/);
          if (match) {
            latestTaskId = match[1];
            startTime = new Date();
            console.log(color(bold(`\n🎯 NEW TASK DETECTED: ${latestTaskId}`), 'green'));
            console.log(color(`Started at: ${startTime.toISOString()}`, 'gray'));
            console.log(color('─'.repeat(50), 'gray'));
          }
        }
      } catch (e) {
        // Not JSON, check for patterns
        if (latestTaskId && line.includes(latestTaskId)) {
          console.log(color(`📝 ${line}`, 'gray'));
        }
      }
    });
  });
}

// Monitor database changes
async function monitorDatabase() {
  // Monitor tasks table
  supabase
    .channel('tasks')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'tasks' },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          latestTaskId = payload.new.id;
          startTime = new Date();
          console.log(color(bold(`\n🎯 NEW TASK IN DATABASE: ${latestTaskId}`), 'green'));
          console.log(color(`Type: ${payload.new.task_type}`, 'cyan'));
          console.log(color(`Status: ${payload.new.status}`, 'cyan'));
          console.log(color('─'.repeat(50), 'gray'));
          
          events.push({
            timestamp: new Date().toISOString(),
            type: 'TASK_CREATED',
            data: payload.new
          });
        } else if (payload.new?.id === latestTaskId) {
          console.log(color(`\n📊 Task Update: ${payload.new.status}`, 'yellow'));
          events.push({
            timestamp: new Date().toISOString(),
            type: 'TASK_UPDATED',
            data: payload.new
          });
        }
      }
    )
    .subscribe();

  // Monitor agent activities
  supabase
    .channel('agent_activities')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'agent_activities' },
      (payload) => {
        if (payload.new?.task_id === latestTaskId) {
          console.log(color(`\n🤖 Agent Activity:`, 'magenta'));
          console.log(color(`   Agent: ${payload.new.agent_id}`, 'gray'));
          console.log(color(`   Type: ${payload.new.activity_type}`, 'gray'));
          if (payload.new.input_data) {
            console.log(color(`   Input: ${JSON.stringify(payload.new.input_data).substring(0, 100)}...`, 'gray'));
          }
          
          events.push({
            timestamp: new Date().toISOString(),
            type: 'AGENT_ACTIVITY',
            data: payload.new
          });
        }
      }
    )
    .subscribe();

  // Monitor logs table
  supabase
    .channel('logs')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'logs' },
      (payload) => {
        if (payload.new?.context?.taskId === latestTaskId ||
            payload.new?.message?.includes(latestTaskId)) {
          handleDatabaseLog(payload.new);
        }
      }
    )
    .subscribe();

  // Monitor task context events
  supabase
    .channel('task_context_events')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'task_context_events' },
      (payload) => {
        if (payload.new?.task_id === latestTaskId) {
          console.log(color(`\n📌 Context Event: ${payload.new.event_type}`, 'cyan'));
          if (payload.new.event_data) {
            console.log(color(`   Data: ${JSON.stringify(payload.new.event_data).substring(0, 100)}...`, 'gray'));
          }
          
          events.push({
            timestamp: new Date().toISOString(),
            type: 'CONTEXT_EVENT',
            data: payload.new
          });
        }
      }
    )
    .subscribe();
}

function handleLogEntry(log) {
  const timestamp = new Date(log.timestamp).toLocaleTimeString();
  
  // Agent reasoning
  if (log.message?.includes('reasoning') || 
      log.message?.includes('deciding') ||
      log.message?.includes('Agent execution')) {
    console.log(color(`\n🧠 [${timestamp}] Agent Reasoning:`, 'magenta'));
    console.log(color(`   ${log.message}`, 'white'));
    if (log.agentRole) {
      console.log(color(`   Role: ${log.agentRole}`, 'gray'));
    }
  }
  
  // LLM requests
  if (log.message?.includes('LLM REQUEST') || 
      log.message?.includes('ANTHROPIC')) {
    console.log(color(`\n🤖 [${timestamp}] LLM Request:`, 'cyan'));
    console.log(color(`   ${log.message}`, 'white'));
    if (log.model) {
      console.log(color(`   Model: ${log.model}`, 'gray'));
    }
    if (log.promptPreview) {
      console.log(color(`   Prompt: ${log.promptPreview.substring(0, 100)}...`, 'gray'));
    }
  }
  
  // LLM responses
  if (log.message?.includes('LLM response') || 
      log.message?.includes('completed successfully')) {
    console.log(color(`\n✅ [${timestamp}] LLM Response:`, 'green'));
    if (log.duration) {
      console.log(color(`   Duration: ${log.duration}`, 'gray'));
    }
    if (log.responsePreview) {
      console.log(color(`   Response: ${log.responsePreview.substring(0, 200)}...`, 'gray'));
    }
  }
  
  // Phase execution
  if (log.message?.includes('Executing phase')) {
    console.log(color(`\n📊 [${timestamp}] ${log.message}`, 'yellow'));
    if (log.phaseName) {
      console.log(color(`   Phase: ${log.phaseName}`, 'gray'));
    }
  }
  
  // Errors
  if (log.level === 'error') {
    console.log(color(`\n❌ [${timestamp}] ERROR: ${log.message}`, 'red'));
    if (log.error) {
      console.log(color(`   ${JSON.stringify(log.error)}`, 'red'));
    }
  }
  
  // Store event
  events.push({
    timestamp: log.timestamp,
    type: 'LOG',
    level: log.level,
    message: log.message,
    data: log
  });
}

function handleDatabaseLog(log) {
  const timestamp = new Date(log.created_at).toLocaleTimeString();
  console.log(color(`\n📄 [${timestamp}] DB Log:`, 'blue'));
  console.log(color(`   Level: ${log.level}`, 'gray'));
  console.log(color(`   ${log.message}`, 'white'));
  
  if (log.context) {
    const context = typeof log.context === 'string' ? 
      JSON.parse(log.context) : log.context;
    if (context.agentRole) {
      console.log(color(`   Agent: ${context.agentRole}`, 'gray'));
    }
    if (context.phase) {
      console.log(color(`   Phase: ${context.phase}`, 'gray'));
    }
  }
}

// Start monitoring
monitorDatabase();

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log(color('\n\nStopping monitoring...', 'yellow'));
  
  if (latestTaskId && events.length > 0) {
    // Save events to file
    const filename = `task-trace-${latestTaskId}-${Date.now()}.json`;
    const traceData = {
      taskId: latestTaskId,
      startTime: startTime,
      endTime: new Date(),
      duration: (new Date() - startTime) / 1000,
      eventCount: events.length,
      events: events
    };
    
    fs.writeFileSync(filename, JSON.stringify(traceData, null, 2));
    console.log(color(`\n📁 Trace saved to: ${filename}`, 'green'));
    
    // Print summary
    console.log(color('\n═══════════════════════════════════════', 'blue'));
    console.log(color('            TASK SUMMARY', 'blue'));
    console.log(color('═══════════════════════════════════════', 'blue'));
    console.log(`Task ID: ${latestTaskId}`);
    console.log(`Duration: ${traceData.duration}s`);
    console.log(`Events captured: ${events.length}`);
    
    // Count event types
    const eventCounts = {};
    events.forEach(e => {
      eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
    });
    
    console.log('\nEvent breakdown:');
    Object.entries(eventCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
  
  process.exit(0);
});

console.log(color('\nPress Ctrl+C to stop monitoring and save trace', 'gray'));