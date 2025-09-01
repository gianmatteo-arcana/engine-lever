/**
 * Task Status Constants
 * Central definition of all task status values used throughout the system
 */

import { TaskStatus } from '../types/task-engine.types';

/**
 * Task Status Constants
 * 
 * IMPORTANT: These are the ONLY valid task status values.
 * Always use these constants instead of string literals.
 * 
 * Status Lifecycle:
 * - pending: Initial state when task is created
 * - in_progress: Task is actively being processed
 * - waiting_for_input: Task needs user input to continue
 * - completed: Task finished successfully
 * - failed: Task failed and cannot be recovered
 * - cancelled: Task was cancelled by user or system
 */
export const TASK_STATUS = {
  PENDING: 'pending' as TaskStatus,
  IN_PROGRESS: 'in_progress' as TaskStatus,
  WAITING_FOR_INPUT: 'waiting_for_input' as TaskStatus,
  COMPLETED: 'completed' as TaskStatus,
  FAILED: 'failed' as TaskStatus,
  CANCELLED: 'cancelled' as TaskStatus
} as const;

/**
 * Type guard to check if a string is a valid TaskStatus
 */
export function isValidTaskStatus(status: string): status is TaskStatus {
  return Object.values(TASK_STATUS).includes(status as TaskStatus);
}

/**
 * Agent response status to task status mapping
 * Maps agent response statuses to task statuses
 */
export const AGENT_STATUS_TO_TASK_STATUS: Record<string, TaskStatus> = {
  'completed': TASK_STATUS.COMPLETED,
  'needs_input': TASK_STATUS.WAITING_FOR_INPUT,
  'error': TASK_STATUS.FAILED,
  'failed': TASK_STATUS.FAILED
};

/**
 * Check if task is in a terminal state (cannot transition further)
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === TASK_STATUS.COMPLETED || 
         status === TASK_STATUS.FAILED || 
         status === TASK_STATUS.CANCELLED;
}

/**
 * Check if task is in an active state (being processed)
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return status === TASK_STATUS.IN_PROGRESS || 
         status === TASK_STATUS.WAITING_FOR_INPUT;
}