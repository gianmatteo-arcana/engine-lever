#!/usr/bin/env node

/**
 * Process a pending task by ID
 * This triggers the orchestration for tasks created directly in the database
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const taskId = process.argv[2] || '36d7480c-288c-497c-bb1f-817a7b8aeb36';

async function processPendingTask(taskId) {
  console.log(`\n📋 Processing task: ${taskId}\n`);
  
  try {
    // Get the task
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
      
    if (error) {
      console.error('❌ Failed to fetch task:', error);
      return;
    }
    
    if (!task) {
      console.error('❌ Task not found');
      return;
    }
    
    console.log('✅ Task found:', {
      id: task.id,
      type: task.type,
      status: task.status,
      metadata: task.metadata
    });
    
    if (task.status !== 'pending') {
      console.log(`⚠️  Task is already ${task.status}`);
      return;
    }
    
    // Import services
    const { TaskService } = require('./dist/services/task-service');
    const { OrchestratorAgent } = require('./dist/agents/OrchestratorAgent');
    const { StateComputer } = require('./dist/services/state-computer');
    
    console.log('🔧 Initializing services...');
    
    // Create TaskContext from the task
    const context = {
      contextId: task.id,
      taskTemplateId: task.type || 'user_onboarding',
      tenantId: task.user_id,
      currentState: {
        status: 'created',
        data: {
          taskType: task.type,
          title: task.metadata?.taskDefinition?.title || 'Task',
          description: task.metadata?.taskDefinition?.description || 'Process this task',
          ...task.metadata
        }
      },
      metadata: task.metadata || {},
      contextData: []
    };
    
    console.log('📦 TaskContext created:', {
      contextId: context.contextId,
      templateId: context.taskTemplateId
    });
    
    // Update task to processing
    await supabase
      .from('tasks')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);
      
    console.log('🔄 Task status updated to processing');
    
    // Get orchestrator and process
    const orchestrator = OrchestratorAgent.getInstance();
    console.log('🤖 OrchestratorAgent instance obtained');
    
    console.log('🚀 Starting orchestration...\n');
    
    // Start orchestration
    await orchestrator.orchestrateTask(context);
    
    console.log('✅ Orchestration completed!');
    
  } catch (error) {
    console.error('❌ Error processing task:', error);
    
    // Update task to failed
    await supabase
      .from('tasks')
      .update({ 
        status: 'failed',
        error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);
  }
}

processPendingTask(taskId);