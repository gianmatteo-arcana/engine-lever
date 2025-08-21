#!/usr/bin/env node

/**
 * Complete Real-Time Task Flow Monitor
 * Captures EVERYTHING that happens when a task is created
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

console.log('\n' + colors.cyan + colors.bright + '═'.repeat(70));
console.log('         COMPLETE TASK FLOW MONITOR - REAL TIME');
console.log('═'.repeat(70) + colors.reset);
console.log(colors.green + '\nMonitoring for:' + colors.reset);
console.log('  • Task creation in database');
console.log('  • API calls');
console.log('  • Orchestration triggers');
console.log('  • Agent activities');
console.log('  • LLM requests/responses');
console.log('  • State changes');
console.log('  • All events\n');

let taskId = null;
let startTime = null;
const allEvents = [];

function logEvent(type, message, data = {}) {
  const timestamp = new Date();
  const elapsed = startTime ? ((timestamp - startTime) / 1000).toFixed(3) : '0.000';
  
  allEvents.push({
    timestamp: timestamp.toISOString(),
    elapsed: parseFloat(elapsed),
    type,
    message,
    data
  });
  
  const timeStr = `[${elapsed.padStart(8)}s]`;
  
  switch(type) {
    case 'TASK_CREATED':
      console.log(colors.yellow + colors.bright + timeStr + ' 📋 ' + message + colors.reset);
      break;
    case 'API':
      console.log(colors.green + timeStr + ' 🌐 ' + message + colors.reset);
      break;
    case 'ORCHESTRATOR':
      console.log(colors.magenta + timeStr + ' 🎯 ' + message + colors.reset);
      break;
    case 'AGENT':
      console.log(colors.cyan + timeStr + ' 🤖 ' + message + colors.reset);
      break;
    case 'LLM':
      console.log(colors.blue + timeStr + ' 🧠 ' + message + colors.reset);
      break;
    case 'DB':
      console.log(colors.gray + timeStr + ' 💾 ' + message + colors.reset);
      break;
    case 'EVENT':
      console.log(timeStr + ' 📡 ' + message);
      break;
    case 'STATE':
      console.log(colors.yellow + timeStr + ' 📊 ' + message + colors.reset);
      break;
    case 'ERROR':
      console.log(colors.red + timeStr + ' ❌ ' + message + colors.reset);
      break;
    default:
      console.log(timeStr + ' ℹ️  ' + message);
  }
  
  if (data && Object.keys(data).length > 0 && process.argv.includes('-v')) {
    console.log(colors.gray + '     └─ ' + JSON.stringify(data, null, 2) + colors.reset);
  }
}

// Monitor all tables
async function setupMonitoring() {
  console.log(colors.gray + 'Setting up comprehensive monitoring...' + colors.reset);
  
  // 1. Monitor task creation
  const tasksChannel = supabase
    .channel('monitor-tasks')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tasks'
    }, (payload) => {
      if (payload.eventType === 'INSERT') {
        taskId = payload.new.id;
        startTime = new Date();
        logEvent('TASK_CREATED', `New task created: ${taskId}`, {
          type: payload.new.type,
          status: payload.new.status,
          metadata: payload.new.metadata
        });
      } else if (payload.eventType === 'UPDATE' && payload.new.id === taskId) {
        logEvent('STATE', `Task status: ${payload.old.status} → ${payload.new.status}`, {
          taskId: payload.new.id
        });
      }
    })
    .subscribe();
  
  // 2. Monitor task context events
  const contextChannel = supabase
    .channel('monitor-context')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'task_context_events'
    }, (payload) => {
      if (payload.new.task_id === taskId || payload.new.context_id === taskId) {
        logEvent('EVENT', `Context: ${payload.new.operation}`, {
          actor: payload.new.actor_id,
          reasoning: payload.new.reasoning?.substring(0, 100)
        });
      }
    })
    .subscribe();
  
  // 3. Monitor agent activities
  const agentChannel = supabase
    .channel('monitor-agents')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'agent_activities'
    }, (payload) => {
      if (payload.new.task_id === taskId) {
        logEvent('AGENT', `${payload.new.agent_type}: ${payload.new.action}`, {
          details: payload.new.details?.substring(0, 100)
        });
      }
    })
    .subscribe();
  
  // 4. Monitor logs
  const logsChannel = supabase
    .channel('monitor-logs')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'logs'
    }, (payload) => {
      const log = payload.new;
      
      // Filter for relevant logs
      if (!taskId || 
          log.context?.task_id === taskId || 
          log.context?.contextId === taskId ||
          log.message?.includes(taskId) ||
          log.message?.includes('orchestrat') ||
          log.message?.includes('LLM') ||
          log.message?.includes('AGENT')) {
        
        // Categorize log
        if (log.message?.includes('orchestrat')) {
          logEvent('ORCHESTRATOR', log.message, log.context);
        } else if (log.message?.includes('LLM REQUEST')) {
          logEvent('LLM', `Request: ${log.message}`, {
            model: log.context?.model,
            promptLength: log.context?.promptLength
          });
        } else if (log.message?.includes('LLM RESPONSE')) {
          logEvent('LLM', `Response: ${log.message}`, {
            duration: log.context?.duration,
            tokens: log.context?.usage
          });
        } else if (log.message?.includes('AGENT')) {
          logEvent('AGENT', log.message, log.context);
        } else if (log.level === 'error') {
          logEvent('ERROR', log.message, log.context);
        } else {
          logEvent('LOG', log.message.substring(0, 100));
        }
      }
    })
    .subscribe();
  
  console.log(colors.green + '✅ Monitoring active on all channels\n' + colors.reset);
  console.log(colors.yellow + colors.bright + '👉 ' + colors.reset + colors.green + colors.bright + 'Please click "Create Task" in the UI now!' + colors.reset);
  console.log(colors.gray + '   (I\'ll wait patiently and capture everything...)\n' + colors.reset);
}

// Check for completion periodically
let checkCount = 0;
const checkInterval = setInterval(async () => {
  if (!taskId) return;
  
  checkCount++;
  
  // Check task status
  const { data: task } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single();
  
  if (task && (task.status === 'completed' || task.status === 'failed')) {
    clearInterval(checkInterval);
    setTimeout(() => printSummary(), 2000); // Wait 2s for any final events
  }
  
  // Timeout after 2 minutes
  if (checkCount > 120) {
    clearInterval(checkInterval);
    console.log(colors.yellow + '\n⏱️  Timeout reached (2 minutes)' + colors.reset);
    printSummary();
  }
}, 1000);

// Print comprehensive summary
function printSummary() {
  console.log('\n' + colors.green + colors.bright + '═'.repeat(70));
  console.log('                    COMPLETE FLOW SUMMARY');
  console.log('═'.repeat(70) + colors.reset);
  
  if (!taskId) {
    console.log(colors.red + '\n❌ No task was created during monitoring period' + colors.reset);
    process.exit(0);
    return;
  }
  
  console.log(colors.cyan + '\nTask ID: ' + colors.yellow + taskId + colors.reset);
  console.log(colors.cyan + 'Total Duration: ' + colors.reset + ((Date.now() - startTime) / 1000).toFixed(2) + ' seconds');
  console.log(colors.cyan + 'Total Events Captured: ' + colors.reset + allEvents.length);
  
  // Event timeline
  console.log(colors.cyan + colors.bright + '\n📅 COMPLETE TIMELINE:' + colors.reset);
  console.log(colors.gray + '─'.repeat(50) + colors.reset);
  
  allEvents.forEach(event => {
    const time = `+${event.elapsed.toFixed(3)}s`.padEnd(10);
    console.log(colors.gray + time + colors.reset + ' ' + event.message);
  });
  
  // Analysis
  console.log(colors.cyan + colors.bright + '\n📊 ANALYSIS:' + colors.reset);
  console.log(colors.gray + '─'.repeat(50) + colors.reset);
  
  const orchestratorEvents = allEvents.filter(e => e.type === 'ORCHESTRATOR');
  const agentEvents = allEvents.filter(e => e.type === 'AGENT');
  const llmEvents = allEvents.filter(e => e.type === 'LLM');
  const errorEvents = allEvents.filter(e => e.type === 'ERROR');
  
  console.log('Orchestrator events: ' + orchestratorEvents.length);
  console.log('Agent events: ' + agentEvents.length);
  console.log('LLM calls: ' + llmEvents.filter(e => e.message.includes('Request')).length);
  console.log('Errors: ' + errorEvents.length);
  
  // Critical questions
  console.log(colors.yellow + colors.bright + '\n🔍 CRITICAL QUESTIONS:' + colors.reset);
  console.log(colors.gray + '─'.repeat(50) + colors.reset);
  
  const wasOrchestrated = orchestratorEvents.length > 0;
  const hadLLMCalls = llmEvents.length > 0;
  const eventListenerTriggered = allEvents.some(e => 
    e.message.includes('EventListener') || 
    e.message.includes('ORCHESTRATION_INITIATED'));
  
  console.log('1. Was orchestration triggered? ' + 
    (wasOrchestrated ? colors.green + '✅ YES' + colors.reset : colors.red + '❌ NO' + colors.reset));
  console.log('2. Were LLM calls made? ' + 
    (hadLLMCalls ? colors.green + '✅ YES' + colors.reset : colors.red + '❌ NO' + colors.reset));
  console.log('3. Did EventListener trigger it? ' + 
    (eventListenerTriggered ? colors.green + '✅ YES' + colors.reset : colors.yellow + '❌ NO (manual or API)' + colors.reset));
  
  // Save detailed log
  const filename = `task-flow-${taskId}-${Date.now()}.json`;
  require('fs').writeFileSync(filename, JSON.stringify({
    taskId,
    duration: (Date.now() - startTime) / 1000,
    events: allEvents
  }, null, 2));
  
  console.log(colors.green + '\n💾 Detailed log saved to: ' + colors.yellow + filename + colors.reset);
  console.log('\n' + colors.green + colors.bright + '═'.repeat(70) + colors.reset + '\n');
  
  process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(colors.yellow + '\n\nStopping monitor...' + colors.reset);
  if (allEvents.length > 0) {
    printSummary();
  } else {
    process.exit(0);
  }
});

// Start monitoring
setupMonitoring();