#!/usr/bin/env node

/**
 * Task Processing Tracer
 * 
 * This script traces a task through the entire processing pipeline,
 * showing agent reasoning, LLM interactions, and state changes.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function traceTask(taskId) {
  console.log('\n=== TASK PROCESSING TRACE ===');
  console.log(`Task ID: ${taskId}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // 1. Get task details
  console.log('📋 TASK DETAILS:');
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.error('Failed to fetch task:', taskError);
    return;
  }

  console.log(`  Type: ${task.task_type}`);
  console.log(`  Template: ${task.template_id}`);
  console.log(`  Status: ${task.status}`);
  console.log(`  Created: ${task.created_at}`);
  console.log(`  Metadata:`, JSON.stringify(task.metadata, null, 2));

  // 2. Get task context
  console.log('\n📦 TASK CONTEXT:');
  const { data: contexts, error: contextError } = await supabase
    .from('task_contexts')
    .select('*')
    .eq('tenant_id', task.user_id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (contextError) {
    console.error('Failed to fetch contexts:', contextError);
  } else {
    contexts.forEach(ctx => {
      if (ctx.task_template_id === task.template_id) {
        console.log(`  Context ID: ${ctx.context_id}`);
        console.log(`  State:`, JSON.stringify(ctx.current_state, null, 2));
        console.log(`  Template Snapshot:`, ctx.template_snapshot ? 'Present' : 'None');
      }
    });
  }

  // 3. Get context history (agent actions)
  console.log('\n🤖 AGENT ACTIONS & REASONING:');
  const { data: history, error: historyError } = await supabase
    .from('context_history')
    .select('*')
    .order('timestamp', { ascending: true })
    .limit(50);

  if (historyError) {
    console.error('Failed to fetch history:', historyError);
  } else {
    const relevantHistory = history.filter(h => {
      // Filter for recent entries (last 5 minutes)
      const entryTime = new Date(h.timestamp);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return entryTime > fiveMinutesAgo;
    });

    if (relevantHistory.length === 0) {
      console.log('  No recent agent actions found');
    } else {
      relevantHistory.forEach(entry => {
        console.log(`\n  [${entry.timestamp}] ${entry.operation}`);
        console.log(`    Actor: ${entry.actor?.type} (${entry.actor?.id})`);
        if (entry.reasoning) {
          console.log(`    Reasoning: ${entry.reasoning}`);
        }
        if (entry.data) {
          console.log(`    Data:`, JSON.stringify(entry.data, null, 4));
        }
      });
    }
  }

  // 4. Get agent messages
  console.log('\n💬 AGENT COMMUNICATIONS:');
  const { data: messages, error: msgError } = await supabase
    .from('agent_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (msgError) {
    console.error('Failed to fetch messages:', msgError);
  } else {
    const recentMessages = messages.filter(m => {
      const msgTime = new Date(m.created_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return msgTime > fiveMinutesAgo;
    });

    if (recentMessages.length === 0) {
      console.log('  No recent agent messages found');
    } else {
      recentMessages.forEach(msg => {
        console.log(`\n  [${msg.created_at}]`);
        console.log(`    From: ${msg.from_agent_id} → To: ${msg.to_agent_id}`);
        console.log(`    Type: ${msg.message_type}`);
        if (msg.payload) {
          console.log(`    Payload:`, JSON.stringify(msg.payload, null, 4));
        }
      });
    }
  }

  // 5. Check for LLM interactions
  console.log('\n🧠 LLM INTERACTIONS:');
  console.log('  (Would need to check logs for actual LLM calls)');
  
  // 6. Summary
  console.log('\n📊 SUMMARY:');
  if (task.status === 'pending' && !relevantHistory.length) {
    console.log('  ⚠️  Task created but no orchestration activity detected');
    console.log('  Possible issues:');
    console.log('    - OrchestratorAgent not initialized properly');
    console.log('    - orchestrateTask() not being called');
    console.log('    - Error in task context creation');
    console.log('    - Missing environment variables for LLM');
  } else if (task.status === 'completed') {
    console.log('  ✅ Task completed successfully');
  } else {
    console.log(`  🔄 Task in progress (${task.status})`);
  }
}

// Get task ID from command line or use the one provided
const taskId = process.argv[2] || 'a3c5ad2b-97de-4761-9a74-a4d24501fff3';
traceTask(taskId).catch(console.error);