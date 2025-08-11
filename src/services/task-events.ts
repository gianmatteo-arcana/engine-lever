/**
 * Task Event Service
 * 
 * Centralized event emitter for task-related events to avoid circular dependencies
 * Implements Event Sourcing pattern from ENGINE PRD
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { DatabaseService, ContextHistoryRecord } from './database';

// Global event emitter for task updates
export const taskEventEmitter = new EventEmitter();

// Database service instance
let dbService: DatabaseService | null = null;

/**
 * Initialize the event service with database connection
 */
export function initializeTaskEvents() {
  if (!dbService) {
    dbService = DatabaseService.getInstance();
  }
}

/**
 * Emit a task-related event and persist to context_history
 * Implements Event Sourcing from ENGINE PRD
 */
export async function emitTaskEvent(
  eventType: string, 
  data: any,
  options?: {
    userToken?: string;
    actorType?: 'user' | 'agent' | 'system';
    actorId?: string;
    actorRole?: string;
    reasoning?: string;
    phase?: string;
  }
) {
  const fullEventType = `task:${eventType}`;
  logger.debug('Emitting task event', { eventType: fullEventType, data });
  
  // Emit to local event bus for real-time updates
  taskEventEmitter.emit(fullEventType, data);
  taskEventEmitter.emit('task:*', { ...data, eventType });
  
  // Persist to database if we have the necessary info
  if (data.taskId && options?.userToken && dbService) {
    try {
      const contextEntry: Partial<ContextHistoryRecord> = {
        task_id: data.taskId,
        entry_type: eventType,
        actor_type: options.actorType || 'system',
        actor_id: options.actorId,
        actor_role: options.actorRole,
        operation: eventType,
        data: data,
        reasoning: options.reasoning,
        phase: options.phase || data.phase,
        metadata: {
          timestamp: new Date().toISOString(),
          eventType: fullEventType
        }
      };
      
      await dbService.createContextHistoryEntry(options.userToken, contextEntry);
      logger.debug('Persisted event to context_history', { taskId: data.taskId, eventType });
    } catch (error) {
      logger.error('Failed to persist event to context_history', { error, taskId: data.taskId, eventType });
      // Don't throw - event emission should continue even if persistence fails
    }
  }
}

/**
 * Task event types
 */
export const TaskEventTypes = {
  // Orchestration events
  PLAN_CREATED: 'plan-created',
  PHASE_STARTED: 'phase-started',
  PHASE_COMPLETED: 'phase-completed',
  
  // Progress events
  PROGRESS: 'progress',
  STATUS_CHANGED: 'status',
  
  // UI events
  UI_REQUEST: 'ui-request',
  UI_RESPONSE: 'ui-response',
  
  // Completion events
  COMPLETED: 'completed',
  FAILED: 'failed',
  
  // Error events
  ERROR: 'error',
  WARNING: 'warning'
} as const;