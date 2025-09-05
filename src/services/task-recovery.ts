/**
 * Simple Task Recovery Service
 * 
 * Finds and resumes tasks that were interrupted by server restart/crash
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { TaskService } from './task-service';
import { TASK_STATUS } from '../constants/task-status';

export class TaskRecoveryService {
  private supabase;
  private orchestrator;
  private taskService;
  
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    this.orchestrator = OrchestratorAgent.getInstance();
    this.taskService = TaskService.getInstance();
  }
  
  /**
   * Find and recover tasks that were in progress when server stopped
   */
  async recoverOrphanedTasks(): Promise<void> {
    try {
      logger.info('🔍 Checking for orphaned tasks to recover...');
      
      // First, let's see ALL tasks and their statuses for debugging
      const { data: allTasks } = await this.supabase
        .from('tasks')
        .select('id, status, task_type, updated_at')
        .order('updated_at', { ascending: false })
        .limit(10);
      
      if (allTasks && allTasks.length > 0) {
        logger.info(`📊 Current task statuses (last 10):`);
        allTasks.forEach(task => {
          const timeSinceUpdate = Date.now() - new Date(task.updated_at).getTime();
          const minutes = Math.floor(timeSinceUpdate / 60000);
          logger.info(`   - ${task.id.substring(0, 8)}... | ${task.status} | ${task.task_type} | ${minutes}m ago`);
        });
      } else {
        logger.info('📊 No recent tasks found in last 10 records (database may have older tasks)');
      }
      
      // Find tasks that are in progress (not paused, not completed, not failed)
      // Hot reload interrupts immediately, so we recover ALL in-progress tasks
      const { data: orphanedTasks, error } = await this.supabase
        .from('tasks')
        .select('*')
        .eq('status', TASK_STATUS.IN_PROGRESS);
      
      if (error) {
        logger.error('❌ CRITICAL: Failed to query orphaned tasks - this is a bug!', error);
        throw error; // Fail hard - this needs to be fixed
      }
      
      if (!orphanedTasks || orphanedTasks.length === 0) {
        logger.info(`✅ No orphaned tasks found with status '${TASK_STATUS.IN_PROGRESS}'`);
        
        // Check for tasks waiting for input that might need attention
        const { data: pausedTasks } = await this.supabase
          .from('tasks')
          .select('id, task_type, status')
          .eq('status', TASK_STATUS.WAITING_FOR_INPUT);
        
        if (pausedTasks && pausedTasks.length > 0) {
          logger.info(`ℹ️  Found ${pausedTasks.length} task(s) in '${TASK_STATUS.WAITING_FOR_INPUT}' state (waiting for user input)`);
          pausedTasks.forEach(task => {
            logger.info(`   - ${task.id.substring(0, 8)}... | ${task.status} | ${task.task_type}`);
          });
        }
        return;
      }
      
      logger.info(`📍 Found ${orphanedTasks.length} orphaned task(s) to recover`);
      
      // Recover each task
      for (const task of orphanedTasks) {
        await this.recoverTask(task);
      }
      
    } catch (error) {
      logger.error('❌ CRITICAL: Task recovery failed - this is a bug!', error);
      throw error; // Fail hard - recovery is critical for reliability
    }
  }
  
  private async recoverTask(task: any): Promise<void> {
    try {
      logger.info(`🔄 Recovering task ${task.id} (${task.task_type})`);
      
      // Add a recovery note to the task
      await this.supabase
        .from('context_entries')
        .insert({
          context_id: task.id,
          entry_type: 'system',
          entry_data: {
            operation: 'system.task_recovered',
            data: {
              reason: 'Server restart detected',
              recovered_at: new Date().toISOString()
            },
            reasoning: 'Task was in progress when server restarted, automatically resuming',
            confidence: 1.0
          },
          created_at: new Date().toISOString()
        });
      
      // Get full task context and trigger orchestration to resume
      const taskContext = await this.taskService.getTaskContextById(task.id);
      if (taskContext) {
        await this.orchestrator.orchestrateTask(taskContext);
        logger.info(`✅ Task ${task.id} recovery triggered`);
      } else {
        logger.error(`Failed to get task context for ${task.id}`);
        // Mark task as failed if we can't get its context
        await this.supabase
          .from('tasks')
          .update({ 
            status: TASK_STATUS.FAILED,
            updated_at: new Date().toISOString()
          })
          .eq('id', task.id);
      }
      
    } catch (error) {
      logger.error(`Failed to recover task ${task.id}:`, error);
      
      // Mark task as failed if recovery fails
      await this.supabase
        .from('tasks')
        .update({ 
          status: TASK_STATUS.FAILED,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);
    }
  }
}