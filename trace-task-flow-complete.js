#!/usr/bin/env node

/**
 * Complete Task Flow Tracer
 * Traces ALL interactions for a specific task ID with full details
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

async function traceTask(taskId) {
  console.log('\n' + colors.cyan + colors.bright + '═'.repeat(80));
  console.log('                    COMPLETE TASK FLOW TRACE');
  console.log('═'.repeat(80) + colors.reset);
  console.log(colors.yellow + '\nTask ID: ' + colors.bright + taskId + colors.reset);
  console.log(colors.gray + '─'.repeat(80) + colors.reset + '\n');

  // 1. Get task details
  console.log(colors.cyan + colors.bright + '📋 TASK DETAILS:' + colors.reset);
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.log(colors.red + 'Error fetching task:', taskError.message + colors.reset);
    return;
  }

  console.log(colors.green + '  Type: ' + colors.reset + (task.type || 'undefined'));
  console.log(colors.green + '  Status: ' + colors.reset + task.status);
  console.log(colors.green + '  Created: ' + colors.reset + task.created_at);
  console.log(colors.green + '  Updated: ' + colors.reset + task.updated_at);
  console.log(colors.green + '  User ID: ' + colors.reset + task.user_id);
  
  if (task.metadata) {
    console.log(colors.green + '  Metadata:' + colors.reset);
    console.log(colors.gray + JSON.stringify(task.metadata, null, 4).split('\n').map(l => '    ' + l).join('\n') + colors.reset);
  }

  // 2. Get all logs related to this task
  console.log('\n' + colors.cyan + colors.bright + '📜 LOGS (chronological):' + colors.reset);
  console.log(colors.gray + '─'.repeat(80) + colors.reset);
  
  const { data: logs, error: logsError } = await supabase
    .from('logs')
    .select('*')
    .or(`context->task_id.eq.${taskId},context->contextId.eq.${taskId},message.ilike.%${taskId}%`)
    .order('created_at', { ascending: true });

  if (logs && logs.length > 0) {
    logs.forEach((log, index) => {
      const time = new Date(log.created_at);
      const timeStr = time.toISOString().split('T')[1].split('.')[0];
      
      // Color code by level
      let levelColor = colors.gray;
      if (log.level === 'error') levelColor = colors.red;
      else if (log.level === 'warn') levelColor = colors.yellow;
      else if (log.level === 'info') levelColor = colors.green;
      else if (log.level === 'debug') levelColor = colors.blue;
      
      console.log(`\n${colors.dim}[${timeStr}]${colors.reset} ${levelColor}[${log.level.toUpperCase()}]${colors.reset}`);
      console.log(`  ${colors.bright}${log.message}${colors.reset}`);
      
      // Show context if present
      if (log.context && Object.keys(log.context).length > 0) {
        // Special formatting for important context
        if (log.context.reasoning) {
          console.log(colors.magenta + '  🧠 Reasoning: ' + colors.reset + log.context.reasoning);
        }
        if (log.context.decision) {
          console.log(colors.yellow + '  ✅ Decision: ' + colors.reset + log.context.decision);
        }
        if (log.context.model) {
          console.log(colors.blue + '  🤖 Model: ' + colors.reset + log.context.model);
        }
        if (log.context.prompt) {
          console.log(colors.cyan + '  💬 Prompt Preview: ' + colors.reset + 
            (log.context.prompt.substring(0, 200) + (log.context.prompt.length > 200 ? '...' : '')));
        }
        if (log.context.response) {
          console.log(colors.green + '  📝 Response Preview: ' + colors.reset + 
            (typeof log.context.response === 'string' 
              ? log.context.response.substring(0, 200) + (log.context.response.length > 200 ? '...' : '')
              : JSON.stringify(log.context.response).substring(0, 200)));
        }
        
        // Show remaining context
        const shownKeys = ['reasoning', 'decision', 'model', 'prompt', 'response', 'task_id', 'contextId'];
        const remainingContext = Object.keys(log.context)
          .filter(k => !shownKeys.includes(k))
          .reduce((obj, key) => {
            obj[key] = log.context[key];
            return obj;
          }, {});
          
        if (Object.keys(remainingContext).length > 0) {
          console.log(colors.gray + '  Context: ' + JSON.stringify(remainingContext, null, 2).split('\n').map((l, i) => i === 0 ? l : '          ' + l).join('\n') + colors.reset);
        }
      }
      
      // Show metadata if present
      if (log.metadata && Object.keys(log.metadata).length > 0) {
        console.log(colors.gray + '  Metadata: ' + JSON.stringify(log.metadata, null, 2).split('\n').map((l, i) => i === 0 ? l : '           ' + l).join('\n') + colors.reset);
      }
    });
  } else {
    console.log(colors.yellow + '  No logs found for this task' + colors.reset);
  }

  // 3. Get agent activities
  console.log('\n' + colors.cyan + colors.bright + '🤖 AGENT ACTIVITIES:' + colors.reset);
  console.log(colors.gray + '─'.repeat(80) + colors.reset);
  
  const { data: activities, error: activitiesError } = await supabase
    .from('agent_activities')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (activities && activities.length > 0) {
    activities.forEach(activity => {
      const time = new Date(activity.created_at);
      const timeStr = time.toISOString().split('T')[1].split('.')[0];
      
      console.log(`\n${colors.dim}[${timeStr}]${colors.reset} ${colors.cyan}${activity.agent_type}${colors.reset}`);
      console.log(`  ${colors.yellow}Action: ${colors.reset}${activity.action}`);
      if (activity.details) {
        console.log(`  ${colors.gray}Details: ${activity.details}${colors.reset}`);
      }
      if (activity.metadata) {
        console.log(colors.gray + '  Metadata: ' + JSON.stringify(activity.metadata, null, 2).split('\n').map((l, i) => i === 0 ? l : '           ' + l).join('\n') + colors.reset);
      }
    });
  } else {
    console.log(colors.yellow + '  No agent activities recorded' + colors.reset);
  }

  // 4. Get task context events
  console.log('\n' + colors.cyan + colors.bright + '📡 TASK CONTEXT EVENTS:' + colors.reset);
  console.log(colors.gray + '─'.repeat(80) + colors.reset);
  
  const { data: events, error: eventsError } = await supabase
    .from('task_context_events')
    .select('*')
    .or(`task_id.eq.${taskId},context_id.eq.${taskId}`)
    .order('created_at', { ascending: true });

  if (events && events.length > 0) {
    events.forEach(event => {
      const time = new Date(event.created_at);
      const timeStr = time.toISOString().split('T')[1].split('.')[0];
      
      console.log(`\n${colors.dim}[${timeStr}]${colors.reset} ${colors.magenta}${event.operation}${colors.reset}`);
      console.log(`  ${colors.green}Actor: ${colors.reset}${event.actor_id}`);
      if (event.reasoning) {
        console.log(`  ${colors.yellow}Reasoning: ${colors.reset}${event.reasoning}`);
      }
      if (event.updates) {
        console.log(colors.gray + '  Updates: ' + JSON.stringify(event.updates, null, 2).split('\n').map((l, i) => i === 0 ? l : '          ' + l).join('\n') + colors.reset);
      }
    });
  } else {
    console.log(colors.yellow + '  No context events recorded' + colors.reset);
  }

  // 5. Analysis
  console.log('\n' + colors.cyan + colors.bright + '📊 ANALYSIS:' + colors.reset);
  console.log(colors.gray + '─'.repeat(80) + colors.reset);
  
  // Check for orchestration
  const orchestrationLogs = logs?.filter(l => 
    l.message?.includes('orchestrat') || 
    l.message?.includes('Orchestrat') ||
    l.message?.includes('ORCHESTRAT')
  ) || [];
  
  // Check for LLM calls
  const llmLogs = logs?.filter(l => 
    l.message?.includes('LLM') || 
    l.context?.model ||
    l.context?.prompt
  ) || [];
  
  // Check for errors
  const errorLogs = logs?.filter(l => l.level === 'error') || [];
  
  // Check for agent reasoning
  const reasoningLogs = logs?.filter(l => l.context?.reasoning) || [];
  
  console.log(colors.green + '\n  ✅ Key Metrics:' + colors.reset);
  console.log(`    • Total logs: ${logs?.length || 0}`);
  console.log(`    • Orchestration events: ${orchestrationLogs.length}`);
  console.log(`    • LLM calls: ${llmLogs.length}`);
  console.log(`    • Agent activities: ${activities?.length || 0}`);
  console.log(`    • Context events: ${events?.length || 0}`);
  console.log(`    • Errors: ${errorLogs.length}`);
  console.log(`    • Reasoning entries: ${reasoningLogs.length}`);
  
  // Critical issues
  console.log(colors.yellow + '\n  ⚠️  Critical Issues:' + colors.reset);
  
  const issues = [];
  
  if (task.status === 'pending') {
    issues.push('Task is still pending - was it processed?');
  }
  
  if (orchestrationLogs.length === 0) {
    issues.push('No orchestration logs found - orchestrator may not have triggered');
  }
  
  if (llmLogs.length === 0 && task.type !== 'test') {
    issues.push('No LLM calls detected - agents may not be reasoning');
  }
  
  if (activities?.length === 0) {
    issues.push('No agent activities recorded - agents may not be executing');
  }
  
  if (errorLogs.length > 0) {
    issues.push(`${errorLogs.length} errors detected - check error logs above`);
  }
  
  if (issues.length === 0) {
    console.log(colors.green + '    None detected!' + colors.reset);
  } else {
    issues.forEach(issue => {
      console.log(colors.red + '    • ' + issue + colors.reset);
    });
  }
  
  // Save detailed report
  const report = {
    taskId,
    task,
    logs: logs || [],
    activities: activities || [],
    events: events || [],
    analysis: {
      orchestrationEvents: orchestrationLogs.length,
      llmCalls: llmLogs.length,
      errors: errorLogs.length,
      reasoning: reasoningLogs.length,
      issues
    }
  };
  
  const filename = `task-trace-${taskId}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  
  console.log(colors.green + '\n💾 Detailed report saved to: ' + colors.yellow + filename + colors.reset);
  console.log('\n' + colors.cyan + colors.bright + '═'.repeat(80) + colors.reset + '\n');
}

// Main execution
const taskId = process.argv[2];

if (!taskId) {
  // Get most recent task
  (async () => {
    const { data: task } = await supabase
      .from('tasks')
      .select('id, type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (task) {
      console.log(colors.yellow + '\nNo task ID provided. Using most recent task:' + colors.reset);
      console.log(colors.gray + `  ID: ${task.id}`);
      console.log(`  Type: ${task.type || 'undefined'}`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Created: ${task.created_at}` + colors.reset);
      
      await traceTask(task.id);
    } else {
      console.log(colors.red + '\nNo tasks found in database!' + colors.reset);
      process.exit(1);
    }
  })();
} else {
  traceTask(taskId);
}