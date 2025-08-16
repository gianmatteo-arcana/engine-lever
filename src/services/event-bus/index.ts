/**
 * Event Bus Service Exports
 * 
 * Central export point for event bus implementation
 */

export { UnifiedEventBus, createUnifiedEventBus } from './UnifiedEventBus';

// Re-export A2A types for convenience
export type {
  ExecutionEventBus,
  AgentExecutionEvent,
  AgentExecutor,
  RequestContext,
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent
} from '../../types/a2a-types';