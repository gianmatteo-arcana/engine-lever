/**
 * TaskManagementAgent - Migrated from TaskService
 * Direct database access specialist for core task functionality and persistence
 */

import { BaseAgent } from './base/UnifiedBaseAgent';
import { AgentTaskContext as TaskContext, ensureAgentContext, createMinimalContext } from '../types/unified-agent-types';
import { logger } from '../utils/logger';
import { supabase } from '../services/supabase';

// Enhanced interfaces for A2A protocol
interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  task_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  deadline?: string;
}

interface CreateTaskParams {
  title: string;
  description?: string;
  task_type: string;
  priority?: Task['priority'];
  metadata?: Record<string, unknown>;
  deadline?: string;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  metadata?: Record<string, unknown>;
  deadline?: string;
}

interface TaskListOptions {
  status?: Task['status'];
  task_type?: string;
  priority?: Task['priority'];
  limit?: number;
  offset?: number;
  include_completed?: boolean;
}

interface _TaskContextData {
  contextId: string;
  taskId: string;
  data: Record<string, unknown>;
  version: number;
  lastUpdated: string;
}

export class TaskManagementAgent extends BaseAgent {
  private static instance: TaskManagementAgent;

  constructor() {
    super('src/agents/configs/task-management-agent.yaml');
  }

  static getInstance(): TaskManagementAgent {
    if (!TaskManagementAgent.instance) {
      TaskManagementAgent.instance = new TaskManagementAgent();
    }
    return TaskManagementAgent.instance;
  }

  protected async executeTaskLogic(
    taskId: string, 
    context: TaskContext, 
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    // Ensure context has all required fields
    const safeContext = ensureAgentContext(context);
    const operation = parameters.operation as string;
    
    try {
      // Validate user access for all operations
      await this.validateUserAccess(safeContext.userId, safeContext.userToken);
      
      switch (operation) {
        case 'createTask':
          return await this.handleTaskCreation(taskId, safeContext, parameters);
        case 'updateTask':
          return await this.handleTaskUpdate(taskId, safeContext, parameters);
        case 'deleteTask':
          return await this.handleTaskDeletion(taskId, safeContext, parameters);
        case 'getTask':
          return await this.handleTaskRetrieval(taskId, safeContext, parameters);
        case 'listTasks':
          return await this.handleTaskListing(taskId, safeContext, parameters);
        case 'saveContext':
          return await this.handleContextSaving(taskId, safeContext, parameters);
        case 'loadContext':
          return await this.handleContextLoading(taskId, safeContext, parameters);
        case 'updateTaskStatus':
          return await this.handleStatusUpdate(taskId, safeContext, parameters);
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      logger.error('TaskManagementAgent: Task execution failed', {
        taskId,
        operation,
        userId: context.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Update context with error information
      safeContext.agentContexts[this.agentId] = {
        ...safeContext.agentContexts[this.agentId],
        state: {
          ...context.agentContexts![this.agentId]?.state,
          error: error instanceof Error ? error.message : String(error),
          lastOperation: operation,
          failedAt: new Date().toISOString()
        }
      };
      
      return safeContext;
    }
  }

  private async validateUserAccess(userId: string, userToken: string): Promise<void> {
    if (!userId || !userToken) {
      throw new Error('User ID and token are required for database operations');
    }

    // Use data_validation tool for user authentication
    const validationResult = await this.toolChain.executeTool('user_authentication', {
      userId,
      token: userToken
    });

    if (!validationResult.success) {
      throw new Error('User authentication failed');
    }
  }

  private async handleTaskCreation(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const taskParams = parameters.taskParams as CreateTaskParams;
    
    if (!taskParams || !taskParams.title || !taskParams.task_type) {
      throw new Error('Task title and type are required for creation');
    }

    const newTask = {
      user_id: context.userId,
      title: taskParams.title,
      description: taskParams.description,
      task_type: taskParams.task_type,
      status: 'pending' as const,
      priority: taskParams.priority || 'medium' as const,
      metadata: taskParams.metadata || {},
      deadline: taskParams.deadline
    };

    const { data: createdTask, error } = await supabase
      .from('tasks')
      .insert(newTask)
      .select()
      .single();

    if (error) {
      throw new Error(`Task creation failed: ${error.message}`);
    }

    // Update context with created task
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        createdTask,
        lastCreatedTaskId: createdTask.id
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_creation',
          data: {
            taskId: createdTask.id,
            title: createdTask.title,
            task_type: createdTask.task_type
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Task created successfully', {
      taskId: createdTask.id,
      title: createdTask.title,
      userId: context.userId
    });

    return context;
  }

  private async handleTaskUpdate(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const targetTaskId = parameters.targetTaskId as string;
    const updateParams = parameters.updateParams as UpdateTaskParams;
    
    if (!targetTaskId) {
      throw new Error('Target task ID is required for update');
    }

    if (!updateParams || Object.keys(updateParams).length === 0) {
      throw new Error('Update parameters are required');
    }

    // Verify task ownership
    await this.verifyTaskOwnership(targetTaskId, context.userId);

    const { data: updatedTask, error } = await supabase
      .from('tasks')
      .update({
        ...updateParams,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetTaskId)
      .eq('user_id', context.userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Task update failed: ${error.message}`);
    }

    // Update context with updated task
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        updatedTask,
        lastUpdatedTaskId: updatedTask.id
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_update',
          data: {
            taskId: updatedTask.id,
            updatedFields: Object.keys(updateParams),
            newStatus: updatedTask.status
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Task updated successfully', {
      taskId: updatedTask.id,
      updatedFields: Object.keys(updateParams),
      userId: context.userId
    });

    return context;
  }

  private async handleTaskDeletion(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const targetTaskId = parameters.targetTaskId as string;
    
    if (!targetTaskId) {
      throw new Error('Target task ID is required for deletion');
    }

    // Verify task ownership
    await this.verifyTaskOwnership(targetTaskId, context.userId);

    // Delete associated task contexts first
    await supabase
      .from('task_contexts')
      .delete()
      .eq('task_id', targetTaskId);

    // Delete the task
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', targetTaskId)
      .eq('user_id', context.userId);

    if (error) {
      throw new Error(`Task deletion failed: ${error.message}`);
    }

    // Update context with deletion info
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        deletedTaskId: targetTaskId,
        deletedAt: new Date().toISOString()
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_deletion',
          data: { taskId: targetTaskId },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Task deleted successfully', {
      taskId: targetTaskId,
      userId: context.userId
    });

    return context;
  }

  private async handleTaskRetrieval(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const targetTaskId = parameters.targetTaskId as string;
    
    if (!targetTaskId) {
      throw new Error('Target task ID is required for retrieval');
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', targetTaskId)
      .eq('user_id', context.userId)
      .single();

    if (error) {
      throw new Error(`Task retrieval failed: ${error.message}`);
    }

    if (!task) {
      throw new Error('Task not found or access denied');
    }

    // Update context with retrieved task
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        retrievedTask: task
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_retrieval',
          data: {
            taskId: task.id,
            title: task.title,
            status: task.status
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Task retrieved successfully', {
      taskId: task.id,
      userId: context.userId
    });

    return context;
  }

  private async handleTaskListing(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const options = parameters.options as TaskListOptions || {};
    
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', context.userId);

    // Apply filters
    if (options.status) {
      query = query.eq('status', options.status);
    }
    
    if (options.task_type) {
      query = query.eq('task_type', options.task_type);
    }
    
    if (options.priority) {
      query = query.eq('priority', options.priority);
    }

    if (!options.include_completed) {
      query = query.neq('status', 'completed');
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 50)) - 1);
    }

    // Order by created_at desc
    query = query.order('created_at', { ascending: false });

    const { data: tasks, error, count } = await query;

    if (error) {
      throw new Error(`Task listing failed: ${error.message}`);
    }

    // Update context with task list
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        taskList: tasks || [],
        taskCount: count || tasks?.length || 0,
        listingOptions: options
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_listing',
          data: {
            taskCount: tasks?.length || 0,
            filters: options
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Tasks listed successfully', {
      taskCount: tasks?.length || 0,
      userId: context.userId,
      filters: options
    });

    return context;
  }

  private async handleContextSaving(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const targetTaskId = parameters.targetTaskId as string || taskId;
    const contextData = parameters.contextData as Record<string, unknown>;
    
    if (!contextData) {
      throw new Error('Context data is required for saving');
    }

    // Verify task ownership
    await this.verifyTaskOwnership(targetTaskId, context.userId);

    // Serialize context data
    const serializedData = JSON.stringify(contextData);
    
    // Check size limits (e.g., 1MB limit)
    if (serializedData.length > 1024 * 1024) {
      throw new Error('Context data too large (exceeds 1MB limit)');
    }

    const { data: savedContext, error } = await supabase
      .from('task_contexts')
      .upsert({
        task_id: targetTaskId,
        context_data: contextData,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Context saving failed: ${error.message}`);
    }

    // Update agent context
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        savedContext,
        lastContextSave: new Date().toISOString(),
        contextSize: serializedData.length
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'context_saving',
          data: {
            taskId: targetTaskId,
            contextSize: serializedData.length
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Context saved successfully', {
      taskId: targetTaskId,
      contextSize: serializedData.length,
      userId: context.userId
    });

    return context;
  }

  private async handleContextLoading(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const targetTaskId = parameters.targetTaskId as string || taskId;
    
    // Verify task ownership
    await this.verifyTaskOwnership(targetTaskId, context.userId);

    const { data: savedContext, error } = await supabase
      .from('task_contexts')
      .select('*')
      .eq('task_id', targetTaskId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Context loading failed: ${error.message}`);
    }

    const loadedContext = savedContext?.context_data || {};

    // Update agent context
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        loadedContext,
        lastContextLoad: new Date().toISOString(),
        contextExists: !!savedContext
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'context_loading',
          data: {
            taskId: targetTaskId,
            contextFound: !!savedContext
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Context loaded successfully', {
      taskId: targetTaskId,
      contextFound: !!savedContext,
      userId: context.userId
    });

    return context;
  }

  private async handleStatusUpdate(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const targetTaskId = parameters.targetTaskId as string;
    const newStatus = parameters.status as Task['status'];
    
    if (!targetTaskId || !newStatus) {
      throw new Error('Target task ID and status are required for status update');
    }

    // Verify task ownership
    await this.verifyTaskOwnership(targetTaskId, context.userId);

    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    // Set completed_at if status is completed
    if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: _updatedTask, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', targetTaskId)
      .eq('user_id', context.userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Status update failed: ${error.message}`);
    }

    // Update context
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        statusUpdate: {
          taskId: targetTaskId,
          oldStatus: context.status,
          newStatus,
          updatedAt: updateData.updated_at
        }
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'status_update',
          data: {
            taskId: targetTaskId,
            newStatus,
            completedAt: updateData.completed_at
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('TaskManagementAgent: Task status updated successfully', {
      taskId: targetTaskId,
      newStatus,
      userId: context.userId
    });

    return context;
  }

  private async verifyTaskOwnership(taskId: string, userId: string): Promise<void> {
    const { data: task, error } = await supabase
      .from('tasks')
      .select('user_id')
      .eq('id', taskId)
      .single();

    if (error) {
      throw new Error(`Task verification failed: ${error.message}`);
    }

    if (!task || task.user_id !== userId) {
      throw new Error('Task not found or access denied');
    }
  }

  // Public convenience methods for backward compatibility
  async createTask(params: CreateTaskParams, userId: string): Promise<Task> {
    const dummyContext = createMinimalContext({
      taskId: 'temp',
      taskType: 'creation',
      userId,
      userToken: 'validated',
      status: 'active',
      currentPhase: 'creation'
    });

    const result = await this.executeTask('create-task', dummyContext, {
      operation: 'createTask',
      taskParams: params
    });

    const createdTask = result.agentContexts[this.agentId]?.state?.createdTask;
    if (!createdTask) {
      throw new Error('Task creation failed - no task returned');
    }

    return createdTask;
  }

  async getTask(taskId: string, userId: string): Promise<Task | null> {
    const dummyContext = createMinimalContext({
      taskId: 'temp',
      taskType: 'retrieval',
      userId,
      userToken: 'validated',
      status: 'active',
      currentPhase: 'retrieval'
    });

    try {
      const result = await this.executeTask('get-task', dummyContext, {
        operation: 'getTask',
        targetTaskId: taskId
      });

      return result.agentContexts[this.agentId]?.state?.retrievedTask || null;
    } catch (error) {
      return null;
    }
  }

  async getUserTasks(userId: string, options?: TaskListOptions): Promise<{ tasks: Task[]; count: number }> {
    const dummyContext = createMinimalContext({
      taskId: 'temp',
      taskType: 'listing',
      userId,
      userToken: 'validated',
      status: 'active',
      currentPhase: 'listing'
    });

    const result = await this.executeTask('list-tasks', dummyContext, {
      operation: 'listTasks',
      options
    });

    const taskList = result.agentContexts[this.agentId]?.state?.taskList || [];
    const taskCount = result.agentContexts[this.agentId]?.state?.taskCount || 0;

    return { tasks: taskList, count: taskCount };
  }
}

// Export singleton instance for backward compatibility
export const taskService = TaskManagementAgent.getInstance();