/**
 * UnifiedEventBus - Issue #54 Implementation
 * 
 * Extends A2A ExecutionEventBus with PostgreSQL persistence
 * Provides unified event handling for all agents with automatic database recording
 * 
 * ARCHITECTURAL INTEGRATION:
 * - Uses existing dbService.addContextEvent() for persistence
 * - Integrates with SSE infrastructure via context_events table
 * - Maintains A2A protocol compliance while leveraging our established patterns
 * - Events automatically flow to existing SSE endpoints for real-time updates
 */

import { EventEmitter } from 'events';
import { 
  ExecutionEventBus,
  AgentExecutionEvent,
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent
} from '../../types/a2a-types';
import { DatabaseService } from '../database';
import { logger } from '../../utils/logger';
import { emitTaskEvent } from '../task-events';

/**
 * UnifiedEventBus Implementation
 * 
 * Combines A2A protocol event handling with PostgreSQL persistence
 * Automatically records all events to context_events table using established patterns
 * Integrates seamlessly with existing SSE infrastructure for real-time updates
 */
export class UnifiedEventBus extends EventEmitter implements ExecutionEventBus {
  private dbService: DatabaseService;
  private contextId: string;
  private taskId: string;
  private userToken?: string; // For database operations
  
  constructor(contextId: string, taskId: string, userToken?: string) {
    super();
    this.contextId = contextId;
    this.taskId = taskId;
    this.userToken = userToken;
    this.dbService = DatabaseService.getInstance();
  }
  
  /**
   * Publish an event to the bus and persist to database
   */
  async publish(event: AgentExecutionEvent): Promise<void> {
    try {
      // Emit event to listeners (A2A protocol)
      this.emit('event', event);
      
      // Persist to database (PostgreSQL)
      await this.persistEvent(event);
      
      logger.info('Event published and persisted', {
        contextId: this.contextId,
        taskId: this.taskId,
        eventType: this.getEventType(event)
      });
    } catch (error) {
      logger.error('Failed to publish event', {
        contextId: this.contextId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Signal that event stream is finished
   */
  finished(): void {
    this.emit('finished');
    this.removeAllListeners();
  }
  
  /**
   * Persist event to PostgreSQL using established patterns
   * 
   * ARCHITECTURAL INTEGRATION:
   * - Uses existing dbService.addContextEvent() method
   * - Events go to context_events table (established pattern)
   * - Automatically integrates with existing SSE infrastructure
   * - Maintains A2A event structure while following our database schema
   */
  private async persistEvent(event: AgentExecutionEvent): Promise<void> {
    try {
      // Convert A2A event to context_events format
      const { operation, actorType, actorId, data, reasoning } = this.convertA2AEventToContextEvent(event);
      
      // Use established addContextEvent method for persistence
      await this.dbService.addContextEvent({
        context_id: this.contextId,
        actor_type: actorType,
        actor_id: actorId,
        operation,
        data,
        reasoning
      });
      
      // Also emit via established task event system for SSE integration
      if (this.userToken) {
        await emitTaskEvent(operation, {
          taskId: this.taskId,
          contextId: this.contextId,
          ...data
        }, {
          userToken: this.userToken,
          actorType,
          actorId,
          reasoning
        });
      }
      
    } catch (error) {
      logger.error('Failed to persist A2A event', {
        contextId: this.contextId,
        taskId: this.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Convert A2A event to context_events format
   * 
   * Maps A2A AgentExecutionEvent types to our established database schema
   */
  private convertA2AEventToContextEvent(event: AgentExecutionEvent): {
    operation: string;
    actorType: 'agent' | 'user' | 'system';
    actorId: string;
    data: any;
    reasoning: string;
  } {
    if (this.isMessage(event)) {
      return {
        operation: 'agent_message',
        actorType: event.role === 'user' ? 'user' : 'agent',
        actorId: event.role === 'user' ? 'user' : 'agent',
        data: {
          content: event.content,
          role: event.role
        },
        reasoning: `${event.role} message processed`
      };
    }
    
    if (this.isTask(event)) {
      return {
        operation: 'task_execution',
        actorType: 'agent',
        actorId: 'agent-executor',
        data: {
          taskId: event.id,
          status: event.status,
          result: event.result
        },
        reasoning: `Task ${event.status}`
      };
    }
    
    if (this.isTaskStatusUpdate(event)) {
      return {
        operation: 'status_update',
        actorType: 'agent',
        actorId: 'agent-executor',
        data: {
          taskId: event.taskId,
          status: event.status,
          final: event.final
        },
        reasoning: `Task status updated to ${event.status}`
      };
    }
    
    if (this.isTaskArtifactUpdate(event)) {
      return {
        operation: 'artifact_update',
        actorType: 'agent',
        actorId: 'agent-executor',
        data: {
          taskId: event.taskId,
          artifacts: event.artifacts,
          artifact: event.artifact
        },
        reasoning: 'Task artifacts updated'
      };
    }
    
    // Default case for unknown A2A events
    return {
      operation: 'a2a_event',
      actorType: 'agent',
      actorId: 'agent-executor',
      data: event as any,
      reasoning: 'A2A event processed'
    };
  }
  
  /**
   * Type guards for A2A events
   */
  private isMessage(event: AgentExecutionEvent): event is Message {
    return 'content' in event && 'role' in event;
  }
  
  private isTask(event: AgentExecutionEvent): event is Task {
    return 'id' in event && 'status' in event && !('taskId' in event);
  }
  
  private isTaskStatusUpdate(event: AgentExecutionEvent): event is TaskStatusUpdateEvent {
    return 'taskId' in event && 'status' in event;
  }
  
  private isTaskArtifactUpdate(event: AgentExecutionEvent): event is TaskArtifactUpdateEvent {
    return 'taskId' in event && 'artifacts' in event;
  }
  
  /**
   * Get event type for logging
   */
  private getEventType(event: AgentExecutionEvent): string {
    if (this.isMessage(event)) return 'Message';
    if (this.isTask(event)) return 'Task';
    if (this.isTaskStatusUpdate(event)) return 'TaskStatusUpdate';
    if (this.isTaskArtifactUpdate(event)) return 'TaskArtifactUpdate';
    return 'Unknown';
  }
  
  /**
   * Subscribe to events with automatic database query
   * Returns events from sequence number if provided using established patterns
   */
  async subscribeFromSequence(fromSequence?: number): Promise<AgentExecutionEvent[]> {
    if (!fromSequence) return [];
    
    try {
      // Use existing getContextHistory method to query context_events table
      // This method already uses established patterns and handles errors properly
      const contextHistory = await this.dbService.getContextHistory(
        this.userToken || 'system-token', 
        this.contextId
      );
      
      // Filter by sequence number and convert to A2A events
      const filteredHistory = contextHistory.filter(record => 
        record.sequence_number >= fromSequence
      );
      
      // Convert context_events back to A2A events
      return filteredHistory.map(record => this.reconstructA2AEvent(record));
    } catch (error) {
      logger.error('Error querying historical events', {
        contextId: this.contextId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }
  
  /**
   * Reconstruct A2A event from context_events database record
   */
  private reconstructA2AEvent(record: { operation: string; data: any; actor_type: string }): AgentExecutionEvent {
    // Reconstruct A2A events from context_events format
    switch (record.operation) {
      case 'agent_message':
        return {
          content: Array.isArray(record.data.content) ? record.data.content : [record.data.content],
          role: record.data.role || (record.actor_type === 'user' ? 'user' : 'assistant')
        } as Message;
      
      case 'task_execution':
        return {
          id: record.data.taskId,
          status: record.data.status,
          result: record.data.result
        } as Task;
      
      case 'status_update':
        return {
          taskId: record.data.taskId,
          status: record.data.status,
          final: record.data.final
        } as TaskStatusUpdateEvent;
      
      case 'artifact_update':
        return {
          taskId: record.data.taskId,
          artifacts: record.data.artifacts,
          artifact: record.data.artifact
        } as TaskArtifactUpdateEvent;
      
      default:
        // For legacy or unknown operations, try to reconstruct based on data structure
        if (record.data.content && record.data.role) {
          return {
            content: Array.isArray(record.data.content) ? record.data.content : [record.data.content],
            role: record.data.role
          } as Message;
        }
        
        if (record.data.taskId && record.data.status) {
          return {
            taskId: record.data.taskId,
            status: record.data.status,
            final: record.data.final
          } as TaskStatusUpdateEvent;
        }
        
        // Fallback: return as generic task
        return {
          id: this.taskId,
          status: 'running',
          result: record.data
        } as Task;
    }
  }
}

/**
 * Factory function to create UnifiedEventBus instances
 * 
 * @param contextId - The context ID for the event bus
 * @param taskId - The task ID for the event bus
 * @param userToken - Optional user token for database operations and SSE integration
 */
export function createUnifiedEventBus(contextId: string, taskId: string, userToken?: string): UnifiedEventBus {
  return new UnifiedEventBus(contextId, taskId, userToken);
}