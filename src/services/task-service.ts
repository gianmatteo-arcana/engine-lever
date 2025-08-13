/**
 * TaskService - Universal Task Creation
 * 
 * Engine PRD Compliant Implementation
 * Creates ANY task type using identical flow
 * Zero special cases, 100% universal
 */

import { DatabaseService } from './database';
import { StateComputer } from './state-computer';
import { logger } from '../utils/logger';
import {
  TaskContext,
  TaskTemplate,
  ContextEntry,
  TaskState
} from '../types/engine-types';

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

      // 1. Load task template from YAML (PRD Line 46: Configuration-Driven)
      const template = await this.loadTemplate(request.templateId);
      
      if (!template) {
        throw new Error(`Template not found: ${request.templateId}`);
      }

      // 2. Create TaskContext (PRD Lines 145-220: Core Data Structure)
      const taskContext: TaskContext = {
        contextId: this.generateId(),
        taskTemplateId: request.templateId,
        tenantId: request.tenantId,
        createdAt: new Date().toISOString(),
        
        // PRD Line 152: Current state computed from history
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: request.initialData || {}
        },
        
        // PRD Line 154: Immutable event history
        history: [],
        
        // PRD Line 156: Template snapshot frozen at creation
        templateSnapshot: template
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
      const userClient = this.dbService.getUserClient(this.userToken || '');
      
      const { data, error } = await userClient
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
      const { data: history, error: historyError } = await userClient
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
      const userClient = this.dbService.getUserClient(this.userToken || '');
      
      const { error } = await userClient
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
      const userClient = this.dbService.getUserClient(this.userToken || '');
      
      const { error } = await userClient
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

  /**
   * Load template from configuration
   * PRD Line 46: Configuration-Driven
   */
  private async loadTemplate(templateId: string): Promise<TaskTemplate | null> {
    try {
      // For now, load from database templates
      // TODO: Add ConfigurationManager for YAML loading
      const userClient = this.dbService.getUserClient(this.userToken || '');
      
      const { data, error } = await userClient
        .from('task_templates')
        .select('*')
        .eq('id', templateId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        logger.warn('Template not found', { templateId });
        return null;
      }

      return this.mapToTaskTemplate(data);

    } catch (error) {
      logger.error('Error loading template', { templateId, error });
      return null;
    }
  }

  /**
   * Persist task context to database
   * PRD Lines 266-278: Database Schema
   */
  private async persistContext(context: TaskContext): Promise<void> {
    try {
      const userClient = this.dbService.getUserClient(this.userToken || '');
      
      const { error } = await userClient
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
        throw error;
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

  /**
   * Map database record to TaskTemplate
   */
  private mapToTaskTemplate(data: any): TaskTemplate {
    return {
      id: data.id,
      version: data.version,
      metadata: data.metadata,
      goals: data.goals,
      phases: data.phases
    };
  }
}