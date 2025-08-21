#!/usr/bin/env node

/**
 * Complete skeptical trace of task processing
 * Shows EVERY database record, log entry, and system interaction
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TASK_ID = '36d7480c-288c-497c-bb1f-817a7b8aeb36';

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

function formatJSON(obj) {
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map(line => '    ' + line)
    .join('\n');
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  return `${date.toLocaleTimeString()}.${date.getMilliseconds()}`;
}

async function traceTask() {
  console.log('\n' + colors.red + colors.bright + '════════════════════════════════════════════════════════════════════');
  console.log('                 SKEPTICAL COMPLETE TASK TRACE');
  console.log('                    Task ID: ' + TASK_ID);
  console.log('════════════════════════════════════════════════════════════════════' + colors.reset);

  // 1. TASK RECORD
  console.log('\n' + colors.yellow + colors.bright + '═══ 1. TASK TABLE RECORD ═══' + colors.reset);
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', TASK_ID)
    .single();
    
  if (taskError) {
    console.log(colors.red + 'ERROR: ' + taskError.message + colors.reset);
  } else if (task) {
    console.log(colors.cyan + 'Found in database:' + colors.reset);
    console.log('  ID: ' + colors.green + task.id + colors.reset);
    console.log('  Status: ' + colors.yellow + task.status + colors.reset);
    console.log('  Type: ' + (task.type || 'NULL'));
    console.log('  Template ID: ' + (task.template_id || 'NULL'));
    console.log('  User ID: ' + task.user_id);
    console.log('  Created: ' + formatTimestamp(task.created_at));
    console.log('  Updated: ' + formatTimestamp(task.updated_at));
    console.log('  Title: ' + (task.title || 'NULL'));
    console.log('  Description: ' + (task.description || 'NULL'));
    console.log('  Priority: ' + (task.priority || 'NULL'));
    console.log('  Error: ' + (task.error || 'NULL'));
    console.log(colors.cyan + '  Metadata:' + colors.reset);
    console.log(colors.dim + formatJSON(task.metadata) + colors.reset);
  } else {
    console.log(colors.red + 'TASK NOT FOUND IN DATABASE!' + colors.reset);
  }

  // 2. TASK CONTEXT EVENTS
  console.log('\n' + colors.yellow + colors.bright + '═══ 2. TASK CONTEXT EVENTS (task_context_events table) ═══' + colors.reset);
  const { data: contextEvents, error: contextError } = await supabase
    .from('task_context_events')
    .select('*')
    .or(`task_id.eq.${TASK_ID},context_id.eq.${TASK_ID}`)
    .order('created_at', { ascending: true });

  if (contextError) {
    console.log(colors.red + 'ERROR: ' + contextError.message + colors.reset);
  } else if (contextEvents && contextEvents.length > 0) {
    console.log(colors.green + `Found ${contextEvents.length} events:` + colors.reset);
    contextEvents.forEach((event, i) => {
      console.log(colors.cyan + `\n  Event ${i + 1}: ${event.operation}` + colors.reset);
      console.log('    Time: ' + formatTimestamp(event.created_at));
      console.log('    Actor: ' + event.actor_id + ' (' + event.actor_type + ')');
      console.log('    Reasoning: ' + colors.dim + (event.reasoning || 'NULL') + colors.reset);
      if (event.data) {
        console.log('    Data: ' + colors.dim + JSON.stringify(event.data).substring(0, 200) + '...' + colors.reset);
      }
    });
  } else {
    console.log(colors.red + 'NO CONTEXT EVENTS FOUND!' + colors.reset);
  }

  // 3. AGENT ACTIVITIES
  console.log('\n' + colors.yellow + colors.bright + '═══ 3. AGENT ACTIVITIES (agent_activities table) ═══' + colors.reset);
  const { data: activities, error: activityError } = await supabase
    .from('agent_activities')
    .select('*')
    .eq('task_id', TASK_ID)
    .order('created_at', { ascending: true });

  if (activityError) {
    console.log(colors.red + 'ERROR: ' + activityError.message + colors.reset);
  } else if (activities && activities.length > 0) {
    console.log(colors.green + `Found ${activities.length} activities:` + colors.reset);
    activities.forEach((activity, i) => {
      console.log(colors.cyan + `\n  Activity ${i + 1}: ${activity.action}` + colors.reset);
      console.log('    Agent: ' + colors.magenta + activity.agent_type + colors.reset);
      console.log('    Time: ' + formatTimestamp(activity.created_at));
      console.log('    Details: ' + colors.dim + (activity.details ? activity.details.substring(0, 100) + '...' : 'NULL') + colors.reset);
      if (activity.metadata) {
        console.log('    Metadata keys: ' + Object.keys(activity.metadata).join(', '));
      }
    });
  } else {
    console.log(colors.red + 'NO AGENT ACTIVITIES FOUND!' + colors.reset);
  }

  // 4. TASK EVENTS
  console.log('\n' + colors.yellow + colors.bright + '═══ 4. TASK EVENTS (task_events table) ═══' + colors.reset);
  const { data: taskEvents, error: eventError } = await supabase
    .from('task_events')
    .select('*')
    .eq('task_id', TASK_ID)
    .order('created_at', { ascending: true });

  if (eventError) {
    console.log(colors.red + 'ERROR: ' + eventError.message + colors.reset);
  } else if (taskEvents && taskEvents.length > 0) {
    console.log(colors.green + `Found ${taskEvents.length} events:` + colors.reset);
    taskEvents.forEach((event, i) => {
      console.log(colors.cyan + `\n  Event ${i + 1}: ${event.event_type}` + colors.reset);
      console.log('    Time: ' + formatTimestamp(event.created_at));
      console.log('    Details: ' + colors.dim + JSON.stringify(event.details) + colors.reset);
    });
  } else {
    console.log(colors.red + 'NO TASK EVENTS FOUND!' + colors.reset);
  }

  // 5. TASK STATE TRANSITIONS
  console.log('\n' + colors.yellow + colors.bright + '═══ 5. STATE TRANSITIONS (task_state_transitions table) ═══' + colors.reset);
  const { data: transitions, error: transError } = await supabase
    .from('task_state_transitions')
    .select('*')
    .eq('task_id', TASK_ID)
    .order('created_at', { ascending: true });

  if (transError) {
    console.log(colors.red + 'ERROR: ' + transError.message + colors.reset);
  } else if (transitions && transitions.length > 0) {
    console.log(colors.green + `Found ${transitions.length} transitions:` + colors.reset);
    transitions.forEach((trans, i) => {
      console.log(colors.cyan + `\n  Transition ${i + 1}:` + colors.reset);
      console.log('    From: ' + trans.from_state + ' → To: ' + trans.to_state);
      console.log('    Time: ' + formatTimestamp(trans.created_at));
      console.log('    Reason: ' + (trans.reason || 'NULL'));
    });
  } else {
    console.log(colors.red + 'NO STATE TRANSITIONS FOUND!' + colors.reset);
  }

  // 6. LOGS
  console.log('\n' + colors.yellow + colors.bright + '═══ 6. SYSTEM LOGS (logs table) ═══' + colors.reset);
  const { data: logs, error: logError } = await supabase
    .from('logs')
    .select('*')
    .or(`context->task_id.eq.${TASK_ID},context->contextId.eq.${TASK_ID},message.like.%${TASK_ID}%`)
    .order('created_at', { ascending: true })
    .limit(50);

  if (logError) {
    console.log(colors.red + 'ERROR: ' + logError.message + colors.reset);
  } else if (logs && logs.length > 0) {
    console.log(colors.green + `Found ${logs.length} log entries:` + colors.reset);
    
    // Group logs by type
    const orchestratorLogs = logs.filter(l => l.message?.includes('orchestrat') || l.message?.includes('ORCHESTRAT'));
    const llmLogs = logs.filter(l => l.message?.includes('LLM'));
    const agentLogs = logs.filter(l => l.message?.includes('AGENT'));
    const errorLogs = logs.filter(l => l.level === 'error');
    
    if (orchestratorLogs.length > 0) {
      console.log(colors.magenta + '\n  Orchestrator Logs:' + colors.reset);
      orchestratorLogs.forEach(log => {
        console.log(`    [${formatTimestamp(log.created_at)}] ${log.message}`);
      });
    }
    
    if (llmLogs.length > 0) {
      console.log(colors.cyan + '\n  LLM Interaction Logs:' + colors.reset);
      llmLogs.forEach(log => {
        console.log(`    [${formatTimestamp(log.created_at)}] ${log.message}`);
        if (log.context?.duration) {
          console.log(`      Duration: ${log.context.duration}`);
        }
        if (log.context?.usage) {
          console.log(`      Tokens: ${JSON.stringify(log.context.usage)}`);
        }
      });
    }
    
    if (agentLogs.length > 0) {
      console.log(colors.blue + '\n  Agent Logs:' + colors.reset);
      agentLogs.forEach(log => {
        console.log(`    [${formatTimestamp(log.created_at)}] ${log.message}`);
      });
    }
    
    if (errorLogs.length > 0) {
      console.log(colors.red + '\n  Error Logs:' + colors.reset);
      errorLogs.forEach(log => {
        console.log(`    [${formatTimestamp(log.created_at)}] ${log.message}`);
      });
    }
  } else {
    console.log(colors.yellow + 'NO LOGS FOUND FOR THIS TASK!' + colors.reset);
  }

  // 7. VERIFICATION
  console.log('\n' + colors.yellow + colors.bright + '═══ 7. VERIFICATION & ANALYSIS ═══' + colors.reset);
  
  // Check if task was actually processed
  const wasProcessed = task && task.status !== 'pending';
  const hasContextEvents = contextEvents && contextEvents.length > 0;
  const hasAgentActivities = activities && activities.length > 0;
  const hasLogs = logs && logs.length > 0;
  
  console.log('\n' + colors.bright + 'Processing Evidence:' + colors.reset);
  console.log('  Task status changed from pending: ' + (wasProcessed ? colors.green + '✓ YES' : colors.red + '✗ NO') + colors.reset);
  console.log('  Context events recorded: ' + (hasContextEvents ? colors.green + `✓ YES (${contextEvents.length})` : colors.red + '✗ NO') + colors.reset);
  console.log('  Agent activities recorded: ' + (hasAgentActivities ? colors.green + `✓ YES (${activities.length})` : colors.red + '✗ NO') + colors.reset);
  console.log('  System logs found: ' + (hasLogs ? colors.green + `✓ YES (${logs.length})` : colors.red + '✗ NO') + colors.reset);
  
  // Timeline
  if (task) {
    console.log('\n' + colors.bright + 'Timeline:' + colors.reset);
    console.log('  Task created: ' + formatTimestamp(task.created_at));
    console.log('  Task updated: ' + formatTimestamp(task.updated_at));
    
    const duration = new Date(task.updated_at) - new Date(task.created_at);
    console.log('  Processing duration: ' + (duration / 1000).toFixed(2) + ' seconds');
  }
  
  // Data Consistency Check
  console.log('\n' + colors.bright + 'Data Consistency:' + colors.reset);
  
  // Check if orchestrator was mentioned
  const orchestratorMentioned = logs?.some(l => l.message?.includes('orchestrat')) || 
                                contextEvents?.some(e => e.actor_id === 'orchestrator_agent');
  console.log('  Orchestrator involvement: ' + (orchestratorMentioned ? colors.green + '✓ YES' : colors.yellow + '⚠ UNCLEAR') + colors.reset);
  
  // Check for LLM calls
  const llmCalls = logs?.filter(l => l.message?.includes('LLM REQUEST')).length || 0;
  console.log('  LLM calls detected: ' + (llmCalls > 0 ? colors.green + `✓ YES (${llmCalls})` : colors.red + '✗ NO') + colors.reset);
  
  // Check for agent reasoning
  const agentReasoning = contextEvents?.some(e => e.reasoning) || 
                        activities?.some(a => a.metadata?.reasoning);
  console.log('  Agent reasoning captured: ' + (agentReasoning ? colors.green + '✓ YES' : colors.red + '✗ NO') + colors.reset);

  console.log('\n' + colors.red + colors.bright + '════════════════════════════════════════════════════════════════════' + colors.reset);
  console.log(colors.yellow + colors.bright + 'CONCLUSION:' + colors.reset);
  
  if (wasProcessed && hasContextEvents && hasAgentActivities) {
    console.log(colors.green + '✅ Task WAS processed through the orchestration system' + colors.reset);
    console.log('   Evidence: Status changed, events recorded, agents executed');
  } else if (wasProcessed || hasContextEvents) {
    console.log(colors.yellow + '⚠️  Task shows PARTIAL processing' + colors.reset);
    console.log('   Some evidence exists but not complete');
  } else {
    console.log(colors.red + '❌ Task shows NO evidence of orchestration' + colors.reset);
    console.log('   Task may have been created but not processed');
  }
  
  console.log(colors.red + '════════════════════════════════════════════════════════════════════\n' + colors.reset);
}

// Run the trace
traceTask().catch(console.error);