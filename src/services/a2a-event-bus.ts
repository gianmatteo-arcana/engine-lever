/**
 * A2A (Agent-to-Agent) Event Bus
 * 
 * Pure messaging infrastructure for agent communication and SSE streaming.
 * This replaces the hybrid database/broadcast approach with a dedicated
 * in-memory event bus that SSE endpoints can subscribe to.
 * 
 * ARCHITECTURE:
 * - Agents broadcast events via A2A protocol
 * - SSE endpoints subscribe to task-specific channels
 * - Events are also persisted to database (but DB doesn't trigger broadcasts)
 * - Only new user/task creation triggers database broadcasts
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { DatabaseService } from './database';

export interface A2AEvent {
  type: string;
  taskId: string;
  agentId?: string;
  operation?: string;
  data?: any;
  reasoning?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface A2ASubscription {
  taskId: string;
  callback: (event: A2AEvent) => void;
  subscriberId: string;
}

/**
 * A2A Event Bus - Central messaging infrastructure for agents
 * 
 * This is the single source of truth for all agent-to-agent communication
 * and real-time event streaming to clients via SSE.
 */
export class A2AEventBus extends EventEmitter {
  private static instance: A2AEventBus;
  private subscriptions: Map<string, Set<A2ASubscription>> = new Map();
  private eventHistory: Map<string, A2AEvent[]> = new Map();
  private readonly MAX_HISTORY_SIZE = 100;

  private constructor() {
    super();
    // Increase max listeners for high concurrency
    this.setMaxListeners(100);
    logger.info('🚌 A2A Event Bus initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): A2AEventBus {
    if (!A2AEventBus.instance) {
      A2AEventBus.instance = new A2AEventBus();
    }
    return A2AEventBus.instance;
  }

  /**
   * Broadcast an event to all subscribers of a task
   * This is the main method agents use to communicate
   */
  public async broadcast(event: A2AEvent): Promise<void> {
    const { taskId, type, agentId } = event;
    
    logger.debug('📡 A2A Broadcasting event', {
      taskId,
      type,
      agentId,
      operation: event.operation
    });

    // Add to history for late subscribers
    this.addToHistory(taskId, event);

    // Emit to task-specific channel
    const channelName = this.getChannelName(taskId);
    this.emit(channelName, event);

    // Also emit to global channel for monitoring
    this.emit('global:event', event);

    // Persist to database (but don't use DB for broadcasting)
    await this.persistEvent(event);

    // Track metrics
    this.emit('metrics:event', {
      taskId,
      type,
      timestamp: event.timestamp
    });
  }

  /**
   * Subscribe to events for a specific task
   * Used by SSE endpoints to receive real-time updates
   * @param skipHistory - If true, won't send historical events (useful when client fetches history separately)
   */
  public subscribe(
    taskId: string, 
    callback: (event: A2AEvent) => void,
    subscriberId: string = `subscriber-${Date.now()}`,
    skipHistory: boolean = false
  ): () => void {
    const channelName = this.getChannelName(taskId);
    
    logger.info('👂 A2A Subscription created', {
      taskId,
      subscriberId,
      channel: channelName,
      skipHistory
    });

    // Create subscription
    const subscription: A2ASubscription = {
      taskId,
      callback,
      subscriberId
    };

    // Add to subscriptions map
    if (!this.subscriptions.has(taskId)) {
      this.subscriptions.set(taskId, new Set());
    }
    this.subscriptions.get(taskId)!.add(subscription);

    // Add listener
    this.on(channelName, callback);

    // Send history to new subscriber (catch-up) - unless skipHistory is true
    if (!skipHistory) {
      const history = this.eventHistory.get(taskId) || [];
      if (history.length > 0) {
        logger.debug('📚 Sending event history to new subscriber', {
          taskId,
          subscriberId,
          eventCount: history.length
        });
        
        // Send history events with slight delay to avoid overwhelming
        setTimeout(() => {
          history.forEach(event => callback(event));
        }, 100);
      }
    } else {
      logger.debug('⏭️ Skipping event history for subscriber', {
        taskId,
        subscriberId
      });
    }

    // Return unsubscribe function
    return () => {
      logger.info('👋 A2A Unsubscribing', {
        taskId,
        subscriberId
      });
      
      this.removeListener(channelName, callback);
      
      const subs = this.subscriptions.get(taskId);
      if (subs) {
        subs.delete(subscription);
        if (subs.size === 0) {
          this.subscriptions.delete(taskId);
          // Clean up history if no subscribers
          this.eventHistory.delete(taskId);
        }
      }
    };
  }

  /**
   * Get all active subscriptions for a task
   */
  public getSubscribers(taskId: string): number {
    return this.subscriptions.get(taskId)?.size || 0;
  }

  /**
   * Persist event to database (without triggering broadcasts)
   */
  private async persistEvent(event: A2AEvent): Promise<void> {
    try {
      const dbService = DatabaseService.getInstance();
      
      // Map A2A event to database format
      const dbEvent = {
        context_id: event.taskId, // Use taskId as context_id for now
        task_id: event.taskId,
        actor_type: event.agentId ? 'agent' : 'system',
        actor_id: event.agentId || 'a2a-bus',
        operation: event.operation || event.type,
        data: event.data || {},
        reasoning: event.reasoning || `A2A Event: ${event.type}`,
        trigger: {
          source: 'a2a',
          type: event.type,
          timestamp: event.timestamp
        }
      };

      // Use service client to bypass RLS
      const serviceClient = await dbService.getServiceClient();
      
      const { error } = await serviceClient
        .from('task_context_events')
        .insert(dbEvent);

      if (error) {
        // Log but don't throw - persistence failure shouldn't break broadcasting
        logger.error('Failed to persist A2A event to database', {
          taskId: event.taskId,
          type: event.type,
          error
        });
      } else {
        logger.debug('✅ A2A event persisted to database', {
          taskId: event.taskId,
          type: event.type
        });
      }
    } catch (error) {
      // Log but don't throw - persistence is secondary to broadcasting
      logger.error('Error persisting A2A event', {
        taskId: event.taskId,
        type: event.type,
        error
      });
    }
  }

  /**
   * Add event to history for late subscribers
   */
  private addToHistory(taskId: string, event: A2AEvent): void {
    if (!this.eventHistory.has(taskId)) {
      this.eventHistory.set(taskId, []);
    }
    
    const history = this.eventHistory.get(taskId)!;
    history.push(event);
    
    // Limit history size
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.shift();
    }
  }

  /**
   * Get channel name for a task
   */
  private getChannelName(taskId: string): string {
    return `task:${taskId}`;
  }

  /**
   * Clear all subscriptions and history (for testing)
   */
  public clear(): void {
    this.removeAllListeners();
    this.subscriptions.clear();
    this.eventHistory.clear();
    logger.info('🧹 A2A Event Bus cleared');
  }

  /**
   * Get statistics about the event bus
   */
  public getStats(): {
    totalSubscriptions: number;
    tasksWithSubscribers: number;
    totalHistoryEvents: number;
  } {
    let totalSubscriptions = 0;
    this.subscriptions.forEach(subs => {
      totalSubscriptions += subs.size;
    });

    let totalHistoryEvents = 0;
    this.eventHistory.forEach(history => {
      totalHistoryEvents += history.length;
    });

    return {
      totalSubscriptions,
      tasksWithSubscribers: this.subscriptions.size,
      totalHistoryEvents
    };
  }
}

// Export singleton instance
export const a2aEventBus = A2AEventBus.getInstance();