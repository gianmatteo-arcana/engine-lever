/**
 * Task Event Service
 * 
 * Centralized event emitter for task-related events to avoid circular dependencies
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// Global event emitter for task updates
export const taskEventEmitter = new EventEmitter();

/**
 * Emit a task-related event
 */
export function emitTaskEvent(eventType: string, data: any) {
  const fullEventType = `task:${eventType}`;
  logger.debug('Emitting task event', { eventType: fullEventType, data });
  taskEventEmitter.emit(fullEventType, data);
  
  // Also emit wildcard event for user streams
  taskEventEmitter.emit('task:*', { ...data, eventType });
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