#!/usr/bin/env node

/**
 * Task Processing Debug Tracer
 * Focuses on finding and capturing bugs in existing implementation
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🐛 TASK PROCESSING DEBUG TRACER');
console.log('================================');
console.log('Monitoring for bugs and issues...\n');

let taskId = null;
let startTime = null;

// Track issues found
const issues = [];

function log(type, message, data = null) {
  const elapsed = startTime ? `${Date.now() - startTime}ms` : '0ms';
  const time = new Date().toISOString().split('T')[1].split('.')[0];
  
  const colors = {
    'TASK': '\x1b[33m',     // yellow
    'AGENT': '\x1b[36m',    // cyan
    'ERROR': '\x1b[31m',    // red
    'BUG': '\x1b[35m',      // magenta
    'API': '\x1b[32m',      // green
    'DB': '\x1b[90m',       // gray
    'STATE': '\x1b[34m',    // blue
  };
  
  const color = colors[type] || '\x1b[37m';
  const reset = '\x1b[0m';
  
  console.log(`[${time}] [${elapsed.padEnd(8)}] ${color}${type.padEnd(7)}${reset} ${message}`);
  
  if (data) {
    console.log('  ', JSON.stringify(data, null, 2));
  }
  
  // Track bugs
  if (type === 'ERROR' || type === 'BUG') {
    issues.push({ time, elapsed, type, message, data });
  }
}

// Monitor backend logs via API
async function monitorBackendLogs() {
  try {
    // Check if server is running
    const health = await axios.get('http://localhost:3000/health').catch(() => null);
    if (!health) {
      log('ERROR', 'Backend server not running on port 3000');
      console.log('  Start it with: npm run dev');
      return;
    }
    log('API', 'Backend server is running');
  } catch (error) {
    log('ERROR', 'Cannot connect to backend', { error: error.message });
  }
}

// Monitor task creation
async function waitForTaskCreation() {
  log('TASK', 'Waiting for task creation...');
  console.log('\n👉 Click "Create" in the UI now!\n');
  
  const subscription = supabase
    .channel('task-creation-debug')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'tasks'
    }, async (payload) => {
      taskId = payload.new.id;
      startTime = Date.now();
      
      log('TASK', `Created: ${taskId}`, {
        type: payload.new.type,
        status: payload.new.status,
        user_id: payload.new.user_id,
        metadata: payload.new.metadata
      });
      
      // Start detailed monitoring
      await monitorTaskProcessing(taskId);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log('DB', 'Subscribed to task creation events');
      } else if (status === 'CHANNEL_ERROR') {
        log('ERROR', 'Failed to subscribe to task events');
      }
    });
}

// Monitor task processing with bug detection
async function monitorTaskProcessing(taskId) {
  console.log('\n' + '='.repeat(50));
  log('TASK', `Monitoring processing for: ${taskId}`);
  console.log('='.repeat(50) + '\n');
  
  // Check initial task state
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
    
  if (taskError) {
    log('ERROR', 'Cannot fetch task', taskError);
    return;
  }
  
  log('STATE', `Initial status: ${task.status}`);
  
  // Monitor task updates
  const taskChannel = supabase
    .channel(`task-${taskId}-updates`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'tasks',
      filter: `id=eq.${taskId}`
    }, (payload) => {
      const oldStatus = payload.old.status;
      const newStatus = payload.new.status;
      
      log('STATE', `Status change: ${oldStatus} → ${newStatus}`);
      
      // Check for issues
      if (newStatus === 'failed') {
        log('BUG', 'Task failed!', {
          error: payload.new.error,
          metadata: payload.new.metadata
        });
      }
      
      if (newStatus === oldStatus) {
        log('BUG', 'Duplicate status update (no change)');
      }
      
      // Check if processing
      if (newStatus === 'processing') {
        checkProcessingActivity(taskId);
      }
      
      // Check completion
      if (newStatus === 'completed' || newStatus === 'failed') {
        setTimeout(() => generateReport(), 1000);
      }
    })
    .subscribe();
  
  // Monitor agent activities
  const agentChannel = supabase
    .channel(`agents-${taskId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'agent_activities',
      filter: `task_id=eq.${taskId}`
    }, (payload) => {
      log('AGENT', `${payload.new.agent_type}: ${payload.new.action}`, {
        details: payload.new.details?.substring(0, 100)
      });
      
      // Check for LLM interactions
      if (payload.new.metadata?.llm_model) {
        log('AGENT', `LLM Model: ${payload.new.metadata.llm_model}`);
      }
      
      // Check for errors in metadata
      if (payload.new.metadata?.error) {
        log('BUG', 'Agent error detected', payload.new.metadata.error);
      }
    })
    .subscribe();
  
  // Monitor logs table for errors
  const logsChannel = supabase
    .channel(`logs-${taskId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'logs'
    }, (payload) => {
      // Filter for our task or general errors
      const logData = payload.new;
      const isRelevant = 
        logData.context?.task_id === taskId ||
        logData.context?.taskId === taskId ||
        logData.message?.includes(taskId) ||
        logData.level === 'error' ||
        logData.level === 'warn';
        
      if (isRelevant) {
        const logType = logData.level === 'error' ? 'ERROR' : 
                       logData.level === 'warn' ? 'BUG' : 'DB';
        log(logType, logData.message, logData.context);
      }
    })
    .subscribe();
  
  // Check for processing timeout
  setTimeout(() => {
    checkForStuckTask(taskId);
  }, 30000); // Check after 30 seconds
}

// Check if task is stuck
async function checkForStuckTask(taskId) {
  const { data: task } = await supabase
    .from('tasks')
    .select('status, updated_at')
    .eq('id', taskId)
    .single();
    
  if (task && task.status === 'processing') {
    const lastUpdate = new Date(task.updated_at);
    const now = new Date();
    const stuckTime = (now - lastUpdate) / 1000;
    
    if (stuckTime > 30) {
      log('BUG', `Task stuck in processing for ${stuckTime}s`);
      
      // Check for agent activities
      const { data: activities } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (!activities || activities.length === 0) {
        log('BUG', 'No agent activities found - orchestrator may have failed');
      } else {
        log('BUG', 'Last activity was ' + ((now - new Date(activities[0].created_at)) / 1000) + 's ago');
      }
    }
  }
}

// Check for processing activity
async function checkProcessingActivity(taskId) {
  setTimeout(async () => {
    const { data: activities } = await supabase
      .from('agent_activities')
      .select('count')
      .eq('task_id', taskId);
      
    if (!activities || activities[0].count === 0) {
      log('BUG', 'Task marked as processing but no agent activities');
    }
  }, 2000);
}

// Generate debug report
function generateReport() {
  console.log('\n' + '='.repeat(50));
  console.log('DEBUG REPORT');
  console.log('='.repeat(50));
  
  if (issues.length === 0) {
    console.log('✅ No issues detected!');
  } else {
    console.log(`\n⚠️  Found ${issues.length} issues:\n`);
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.elapsed}] ${issue.type}: ${issue.message}`);
      if (issue.data) {
        console.log('   Data:', JSON.stringify(issue.data, null, 2));
      }
    });
  }
  
  console.log('\n💾 Task ID:', taskId);
  console.log('⏱️  Total time:', startTime ? `${Date.now() - startTime}ms` : 'unknown');
  
  // Save report
  if (issues.length > 0) {
    const reportFile = `debug-report-${taskId}-${Date.now()}.json`;
    require('fs').writeFileSync(reportFile, JSON.stringify({
      taskId,
      duration: Date.now() - startTime,
      issues
    }, null, 2));
    console.log(`\n📄 Debug report saved to: ${reportFile}`);
  }
  
  process.exit(0);
}

// Start monitoring
async function start() {
  await monitorBackendLogs();
  await waitForTaskCreation();
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nStopping tracer...');
  if (issues.length > 0) {
    generateReport();
  }
  process.exit(0);
});

start();