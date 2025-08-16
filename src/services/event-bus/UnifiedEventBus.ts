/**
 * UnifiedEventBus - Issue #54 Implementation
 * 
 * Extends A2A ExecutionEventBus with PostgreSQL persistence
 * Provides unified event handling for all agents with automatic database recording
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
import { ContextEntry } from '../../types/engine-types';

/**
 * UnifiedEventBus Implementation
 * 
 * Combines A2A protocol event handling with PostgreSQL persistence
 * Automatically records all events to task_context_events table
 */
export class UnifiedEventBus extends EventEmitter implements ExecutionEventBus {
  private dbService: DatabaseService;
  private contextId: string;
  private taskId: string;
  private sequenceCounter: number = 0;
  
  constructor(contextId: string, taskId: string) {
    super();
    this.contextId = contextId;
    this.taskId = taskId;
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
   * Persist event to PostgreSQL task_context_events table
   */
  private async persistEvent(event: AgentExecutionEvent): Promise<void> {
    const contextEntry = this.convertToContextEntry(event);
    
    // Use service role to insert into database
    const { error } = await this.dbService.getUserClient('service-role')
      .from('task_context_events')
      .insert({
        context_id: this.contextId,
        task_id: this.taskId,
        sequence_number: ++this.sequenceCounter,
        actor_type: contextEntry.actor.type,
        actor_id: contextEntry.actor.id,
        operation: contextEntry.operation,
        data: contextEntry.data,
        reasoning: contextEntry.reasoning,
        trigger: contextEntry.trigger
      });
    
    if (error) {
      throw new Error(`Failed to persist event: ${error.message}`);
    }
  }
  
  /**
   * Convert A2A event to ContextEntry format
   */
  private convertToContextEntry(event: AgentExecutionEvent): ContextEntry {
    const baseEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceCounter + 1,
      actor: {
        type: 'agent' as const,
        id: 'unified_event_bus',
        version: '1.0.0'
      }
    };
    
    if (this.isMessage(event)) {
      return {
        ...baseEntry,
        operation: 'message_received',
        data: {
          content: event.content.join('\n'),
          role: event.role
        },
        reasoning: 'User message received'
      };
    }
    
    if (this.isTask(event)) {
      return {
        ...baseEntry,
        operation: 'task_created',
        data: {
          id: event.id,
          status: event.status,
          result: event.result
        },
        reasoning: 'Task created or updated'
      };
    }
    
    if (this.isTaskStatusUpdate(event)) {
      return {
        ...baseEntry,
        operation: 'task_status_updated',
        data: {
          taskId: event.taskId,
          status: event.status,
          final: event.final
        },
        reasoning: `Task status changed to ${event.status}`
      };
    }
    
    if (this.isTaskArtifactUpdate(event)) {
      return {
        ...baseEntry,
        operation: 'task_artifact_updated',
        data: {
          taskId: event.taskId,
          artifacts: event.artifacts
        },
        reasoning: 'Task artifacts updated'
      };
    }
    
    // Default case
    return {
      ...baseEntry,
      operation: 'unknown_event',
      data: event as any,
      reasoning: 'Unknown event type received'
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
   * Returns events from sequence number if provided
   */
  async subscribeFromSequence(fromSequence?: number): Promise<AgentExecutionEvent[]> {
    if (!fromSequence) return [];
    
    // Query historical events from database
    const { data, error } = await this.dbService.getUserClient('service-role')
      .from('task_context_events')
      .select('*')
      .eq('task_id', this.taskId)
      .gte('sequence_number', fromSequence)
      .order('sequence_number', { ascending: true });
    
    if (error) {
      logger.error('Failed to fetch historical events', { error });
      return [];
    }
    
    // Convert database records back to A2A events
    return data.map(record => this.reconstructEvent(record));
  }
  
  /**
   * Reconstruct A2A event from database record
   */
  private reconstructEvent(record: { operation: string; data: any }): AgentExecutionEvent {
    // Reconstruct based on operation type
    switch (record.operation) {
      case 'message_received':
        return {
          content: record.data.content,
          role: record.data.role
        } as Message;
      
      case 'task_created':
      case 'task_updated':
        return {
          id: record.data.id,
          status: record.data.status,
          result: record.data.result
        } as Task;
      
      case 'task_status_updated':
        return {
          taskId: record.data.taskId,
          status: record.data.status,
          final: record.data.final
        } as TaskStatusUpdateEvent;
      
      case 'task_artifact_updated':
        return {
          taskId: record.data.taskId,
          artifacts: record.data.artifacts
        } as TaskArtifactUpdateEvent;
      
      default:
        // Return raw data as fallback
        return record.data as AgentExecutionEvent;
    }
  }
}

/**
 * Factory function to create UnifiedEventBus instances
 */
export function createUnifiedEventBus(contextId: string, taskId: string): UnifiedEventBus {
  return new UnifiedEventBus(contextId, taskId);
}