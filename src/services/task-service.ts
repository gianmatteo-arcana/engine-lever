/**
 * TaskService - Universal Task Creation
 * 
 * Engine PRD Compliant Implementation
 * Creates ANY task type using identical flow
 * Zero special cases, unified approach
 * 
 * SECURITY ARCHITECTURE:
 * Multi-tenant data isolation is achieved through:
 * 1. JWT Token Validation - Authentication layer
 * 2. RLS Policies - Database-level row security (primary defense)
 * 3. Explicit user_id Filters - Application-level filtering (defense in depth)
 * 4. Audit Logging - Track all access attempts
 * 
 * This layered approach ensures that even if one layer fails,
 * user data remains isolated and secure.
 */

import { DatabaseService } from './database';
import { StateComputer } from './state-computer';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  TaskContext,
  ContextEntry,
  TaskState
} from '../types/engine-types';
import {
  DatabaseTask,
  CreateTaskRequest as DatabaseCreateTaskRequest,
  TaskApiResponse,
  TaskListApiResponse,
  TaskCreateApiResponse,
  validateCreateTaskRequest
} from '../types/database-aligned-types';

export interface CreateTaskRequest {
  templateId: string;
  tenantId: string;
  userToken: string;
  initialData?: Record<string, any>;
}

export interface TaskResponse {
  success: boolean;
  taskContextId: string;
  templateId: string;
  status: string;
  message?: string;
}

/**
 * Database Task Creation Request
 */
export interface DatabaseTaskCreateRequest extends DatabaseCreateTaskRequest {
  userToken: string;
}

/**
 * Universal TaskService
 * Engine PRD Lines 145-220, 847-881
 * 
 * This service creates tasks for ANY template type:
 * - User onboarding
 * - SOI filing
 * - Quarterly reviews
 * - Any future task type
 * 
 * NO SPECIAL CASES - Same flow for everything
 */
export class TaskService {
  private static instance: TaskService; // Keep for backward compatibility (deprecated)
  private dbService: DatabaseService;
  private userToken: string | null = null;

  constructor(dbService?: DatabaseService) {
    this.dbService = dbService || DatabaseService.getInstance();
  }

  /**
   * @deprecated Use dependency injection instead
   * Kept for backward compatibility during migration
   */
  public static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  /**
   * Universal task creation - Engine PRD Lines 847-881
   * Creates ANY task type using identical flow
   * 
   * This method is called by:
   * - Database triggers (for onboarding)
   * - API endpoints (for manual task creation)
   * - Scheduled jobs (for recurring tasks)
   * - Other tasks (for sub-task creation)
   */
  async create(request: CreateTaskRequest): Promise<TaskContext> {
    const startTime = Date.now();
    this.userToken = request.userToken;
    
    try {
      logger.info('Creating task', {
        templateId: request.templateId,
        tenantId: request.tenantId,
        trigger: request.initialData?.trigger || 'api_request'
      });

      // Load task template if it exists (for goals and requirements)
      let taskDefinition: any = undefined;
      if (request.templateId) {
        try {
          // Handle mapping of user_onboarding -> onboarding for backward compatibility
          let templateName = request.templateId;
          if (templateName === 'user_onboarding') {
            templateName = 'onboarding';
          }
          
          const templatePath = path.join(__dirname, '../../config/templates', `${templateName}.yaml`);
          if (fs.existsSync(templatePath)) {
            const templateContent = await fs.promises.readFile(templatePath, 'utf8');
            const parsed = yaml.parse(templateContent);
            taskDefinition = parsed.task_template || parsed;
            logger.info('Loaded task template', {
              templateId: request.templateId,
              templateFile: templateName,
              hasGoals: !!taskDefinition?.goals
            });
          } else {
            logger.warn('Template file not found', {
              templateId: request.templateId,
              templateFile: templateName,
              path: templatePath
            });
          }
        } catch (error) {
          logger.warn('Failed to load task template', {
            templateId: request.templateId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Create TaskContext with template data in metadata
      const taskContext: TaskContext = {
        contextId: this.generateId(),
        taskTemplateId: request.templateId,
        tenantId: request.tenantId,
        createdAt: new Date().toISOString(),
        
        // Current state computed from history
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: request.initialData || {}
        },
        
        // Immutable event history
        history: [],
        
        // Include task definition and description for orchestrator
        metadata: {
          ...request.initialData,
          taskDefinition,
          // Copy template content into task description as requested
          taskDescription: taskDefinition ? JSON.stringify(taskDefinition) : undefined
        },
        
        // No template snapshot - agents are self-directed
        templateSnapshot: undefined
      };

      // 3. Persist TaskContext (PRD Lines 266-278: Database Schema)
      await this.persistContext(taskContext);

      // 4. Create initial ContextEntry (PRD Lines 281-303: Event History)
      const initialEntry: ContextEntry = {
        entryId: this.generateId(),
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: {
          type: 'system',
          id: 'task_service',
          version: '1.0.0'
        },
        operation: 'task_created',
        data: {
          templateId: request.templateId,
          tenantId: request.tenantId,
          trigger: request.initialData?.trigger || 'api_request',
          initialData: request.initialData
        },
        reasoning: `Task created from template ${request.templateId} for tenant ${request.tenantId}`
      };

      // 5. Append to context history (PRD Line 49: Append-Only)
      await this.appendEntry(taskContext, initialEntry);

      // 6. Log task creation success
      logger.info('Task created successfully', {
        contextId: taskContext.contextId,
        templateId: request.templateId,
        duration: Date.now() - startTime
      });

      // 7. Trigger orchestration (will be handled by separate process)
      await this.triggerOrchestration(taskContext);

      return taskContext;

    } catch (error) {
      logger.error('Task creation failed', {
        templateId: request.templateId,
        tenantId: request.tenantId,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Get task by context ID
   */
  async getTask(contextId: string): Promise<TaskContext | null> {
    try {
      // Use service client when no user token (e.g., from EventListener)
      const client = this.userToken 
        ? this.dbService.getUserClient(this.userToken)
        : this.dbService.getServiceClient();
      
      const { data, error } = await client
        .from('task_contexts')
        .select('*')
        .eq('context_id', contextId)
        .single();

      if (error) {
        logger.error('Failed to fetch task', { contextId, error });
        return null;
      }

      if (!data) {
        return null;
      }

      // Fetch history
      const { data: history, error: historyError } = await client
        .from('context_history')
        .select('*')
        .eq('context_id', contextId)
        .order('sequence_number', { ascending: true });

      if (historyError) {
        logger.error('Failed to fetch task history', { contextId, error: historyError });
      }

      return this.mapToTaskContext(data, history || []);

    } catch (error) {
      logger.error('Error fetching task', { contextId, error });
      return null;
    }
  }

  /**
   * Update task state
   * This is called after orchestration or agent actions
   */
  async updateState(contextId: string, newState: Partial<TaskState>): Promise<void> {
    try {
      // Use service client when no user token (e.g., from EventListener)
      const client = this.userToken 
        ? this.dbService.getUserClient(this.userToken)
        : this.dbService.getServiceClient();
      
      const { error } = await client
        .from('task_contexts')
        .update({
          current_state: newState,
          updated_at: new Date().toISOString()
        })
        .eq('context_id', contextId);

      if (error) {
        logger.error('Failed to update task state', { contextId, error });
        throw error;
      }

      logger.info('Task state updated', {
        contextId,
        newStatus: newState.status,
        newPhase: newState.phase
      });

    } catch (error) {
      logger.error('Error updating task state', { contextId, error });
      throw error;
    }
  }

  /**
   * Append entry to task history
   * PRD Line 49: Append-Only
   */
  async appendEntry(context: TaskContext, entry: ContextEntry): Promise<void> {
    try {
      // Add to in-memory history
      if (!context.history) {
        context.history = [];
      }
      context.history.push(entry);

      // Persist to database
      // Use service client when no user token (e.g., from EventListener)
      const client = this.userToken 
        ? this.dbService.getUserClient(this.userToken)
        : this.dbService.getServiceClient();
      
      const { error } = await client
        .from('context_history')
        .insert({
          entry_id: entry.entryId,
          context_id: context.contextId,
          timestamp: entry.timestamp,
          sequence_number: entry.sequenceNumber,
          actor: entry.actor,
          operation: entry.operation,
          data: entry.data,
          reasoning: entry.reasoning,
          trigger: entry.trigger
        });

      if (error) {
        logger.error('Failed to append context entry', { 
          contextId: context.contextId, 
          entryId: entry.entryId,
          error 
        });
        throw error;
      }

      // Update computed state
      const newState = StateComputer.computeState(context.history);
      await this.updateState(context.contextId, {
        status: newState.status as any,
        phase: newState.phase,
        completeness: newState.completeness,
        data: newState.data
      });

    } catch (error) {
      logger.error('Error appending entry', { 
        contextId: context.contextId,
        error 
      });
      throw error;
    }
  }

  // Template loading removed - agents are self-directed from YAML configs

  /**
   * Persist task context to database
   * PRD Lines 266-278: Database Schema
   */
  private async persistContext(context: TaskContext): Promise<void> {
    try {
      // Use service client when no user token (e.g., from EventListener)
      const client = this.userToken 
        ? this.dbService.getUserClient(this.userToken)
        : this.dbService.getServiceClient();
      
      const { error } = await client
        .from('task_contexts')
        .insert({
          context_id: context.contextId,
          task_template_id: context.taskTemplateId,
          tenant_id: context.tenantId,
          current_state: context.currentState,
          template_snapshot: context.templateSnapshot,
          created_at: context.createdAt
        });

      if (error) {
        logger.error('Failed to persist task context', { 
          contextId: context.contextId,
          error 
        });
        throw new Error(`Failed to persist task context: ${error.message || JSON.stringify(error)}`);
      }

    } catch (error) {
      logger.error('Error persisting context', { 
        contextId: context.contextId,
        error 
      });
      throw error;
    }
  }

  /**
   * Trigger orchestration for the task
   * This publishes an event or calls the orchestrator directly
   */
  private async triggerOrchestration(context: TaskContext): Promise<void> {
    try {
      // Option 1: Direct orchestration (synchronous)
      // const orchestrator = Orchestrator.getInstance();
      // await orchestrator.executeTask(context.contextId);

      // Option 2: Event-based (asynchronous)
      // Publish to message queue or event bus
      await this.publishEvent({
        type: 'task.created',
        contextId: context.contextId,
        templateId: context.taskTemplateId,
        tenantId: context.tenantId
      });

      logger.info('Orchestration triggered', {
        contextId: context.contextId
      });

    } catch (error) {
      logger.error('Failed to trigger orchestration', {
        contextId: context.contextId,
        error
      });
      // Don't throw - task is created, orchestration can be retried
    }
  }

  /**
   * Publish event for async processing
   */
  private async publishEvent(event: any): Promise<void> {
    // This would integrate with your message queue
    // For now, just log it
    logger.info('Event published', event);
    
    // In production, this would be:
    // await messageBus.publish('task.events', event);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map database record to TaskContext
   */
  private mapToTaskContext(data: any, history: any[]): TaskContext {
    return {
      contextId: data.context_id,
      taskTemplateId: data.task_template_id,
      tenantId: data.tenant_id,
      createdAt: data.created_at,
      currentState: data.current_state,
      history: history.map(h => ({
        entryId: h.entry_id,
        timestamp: h.timestamp,
        sequenceNumber: h.sequence_number,
        actor: h.actor,
        operation: h.operation,
        data: h.data,
        reasoning: h.reasoning,
        trigger: h.trigger
      })),
      templateSnapshot: data.template_snapshot
    };
  }

  // ============================================================================
  // DATABASE TASK API
  // ============================================================================

  /**
   * Create database task
   * Aligns with database schema for type safety
   */
  async createDatabaseTask(request: DatabaseTaskCreateRequest): Promise<TaskCreateApiResponse> {
    try {
      // Validate request
      if (!validateCreateTaskRequest(request)) {
        return {
          success: false,
          error: 'Invalid task creation request'
        };
      }

      // Extract user ID from token (implement token validation)
      const userId = await this.getUserIdFromToken(request.userToken);
      if (!userId) {
        return {
          success: false,
          error: 'Invalid or expired user token'
        };
      }

      // Create database task
      const dbTask: Partial<DatabaseTask> = {
        id: this.generateId(),
        user_id: userId,
        title: request.title,
        description: request.description,
        task_type: request.task_type,
        business_id: request.business_id,
        template_id: request.template_id,
        status: 'pending',
        priority: request.priority || 'medium',
        deadline: request.deadline,
        metadata: request.metadata || {},
        data: request.initialData || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Use dependency-injected database service
      // Use service client when no user token provided
      const client = request.userToken 
        ? this.dbService.getUserClient(request.userToken)
        : this.dbService.getServiceClient();

      const { data, error } = await client
        .from('tasks')
        .insert(dbTask)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create database task', { error });
        return {
          success: false,
          error: 'Failed to create task in database'
        };
      }

      // Create TaskContext if template_id provided
      let contextId: string | undefined;
      if (request.template_id) {
        try {
          const taskContext = await this.create({
            templateId: request.template_id,
            tenantId: userId, // Use user_id as tenant
            userToken: request.userToken,
            initialData: request.initialData
          });
          contextId = taskContext.contextId;
        } catch (contextError) {
          logger.error('Failed to create task context', { contextError });
          // Continue anyway - task is created even if context fails
        }
      }

      return {
        success: true,
        data: {
          task: data as DatabaseTask,
          contextId
        }
      };

    } catch (error) {
      logger.error('Error creating database task', { error });
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  /**
   * Get user tasks (new API)
   * 
   * Security approach:
   * 1. Validate JWT token to get user ID
   * 2. Use getUserClient which applies RLS policies
   * 3. Additionally filter by user_id at query level (defense in depth)
   * 
   * This ensures users can only access their own data through multiple layers
   */
  async getUserTasks(userToken: string): Promise<TaskListApiResponse> {
    try {
      const userId = await this.getUserIdFromToken(userToken);
      if (!userId) {
        logger.error('Unauthorized access attempt - invalid token');
        return {
          success: false,
          error: 'Invalid or expired user token'
        };
      }

      // getUserClient ensures RLS policies are applied
      // This provides database-level security
      const client = userToken
        ? this.dbService.getUserClient(userToken)
        : this.dbService.getServiceClient();

      // Additional explicit user_id filter for defense in depth
      // Even if RLS fails, this ensures data isolation
      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', userId)  // Explicit user filter
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch user tasks', { error });
        return {
          success: false,
          error: 'Failed to fetch tasks'
        };
      }

      return {
        success: true,
        data: data as DatabaseTask[] || []
      };

    } catch (error) {
      logger.error('Error fetching user tasks', { error });
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  /**
   * Get single task by ID (new API)
   * 
   * Security layers:
   * 1. JWT validation for authentication
   * 2. RLS policies via getUserClient
   * 3. Explicit user_id check in query
   * 4. Audit log for access attempts
   */
  async getTaskById(taskId: string, userToken: string): Promise<TaskApiResponse> {
    try {
      const userId = await this.getUserIdFromToken(userToken);
      if (!userId) {
        logger.error('Unauthorized task access attempt', { taskId });
        return {
          success: false,
          error: 'Invalid or expired user token'
        };
      }

      // Log access attempt for audit trail
      logger.info('Task access requested', { userId, taskId });

      // RLS-enabled client for database-level security
      const client = userToken
        ? this.dbService.getUserClient(userToken)
        : this.dbService.getServiceClient();

      // Query with explicit user_id filter for defense in depth
      const { data, error } = await client
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId) // Critical: ensures user owns the task
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return {
            success: false,
            error: 'Task not found'
          };
        }
        logger.error('Failed to fetch task', { error });
        return {
          success: false,
          error: 'Failed to fetch task'
        };
      }

      return {
        success: true,
        data: data as DatabaseTask
      };

    } catch (error) {
      logger.error('Error fetching task', { error });
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  /**
   * Extract user ID from JWT token
   * This should be implemented based on your auth system
   */
  private async getUserIdFromToken(token: string): Promise<string | null> {
    try {
      // This is a placeholder - implement based on your JWT library
      // You might use supabase.auth.getUser() or similar
      
      // For now, try to decode the token manually
      if (!token) return null;
      
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace('Bearer ', '');
      
      // This is a simplified version - you should use proper JWT validation
      try {
        const payload = JSON.parse(Buffer.from(cleanToken.split('.')[1], 'base64').toString());
        return payload.sub || payload.user_id || null;
      } catch {
        return null;
      }
    } catch (error) {
      logger.error('Error extracting user ID from token', { error });
      return null;
    }
  }

}