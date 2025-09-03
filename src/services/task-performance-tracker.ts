/**
 * Task Performance Tracker
 * 
 * Tracks timing and performance metrics for tasks throughout their lifecycle.
 * Uses taskId as the natural correlation ID to group all related events.
 */

import { logger } from '../utils/logger';

export interface TaskMetric {
  taskId: string;
  startTime: number;
  endTime?: number;
  events: TaskEvent[];
  summary?: TaskSummary;
}

export interface TaskEvent {
  timestamp: number;
  type: 'agent_start' | 'agent_complete' | 'tool_call' | 'llm_call' | 'db_operation' | 'sse_broadcast' | 'error' | 'custom';
  name: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface TaskSummary {
  totalDuration: number;
  agentCount: number;
  toolCallCount: number;
  llmCallCount: number;
  dbOperationCount: number;
  errorCount: number;
  breakdown: {
    agents: Record<string, number>;
    tools: Record<string, number>;
    llm: number;
    database: number;
    networking: number;
    other: number;
  };
}

export class TaskPerformanceTracker {
  private static instance: TaskPerformanceTracker;
  private taskMetrics: Map<string, TaskMetric> = new Map();
  private readonly MAX_METRICS_SIZE = 1000; // Keep last 1000 tasks in memory
  
  private constructor() {
    logger.info('📊 Task Performance Tracker initialized');
  }

  public static getInstance(): TaskPerformanceTracker {
    if (!TaskPerformanceTracker.instance) {
      TaskPerformanceTracker.instance = new TaskPerformanceTracker();
    }
    return TaskPerformanceTracker.instance;
  }

  /**
   * Start tracking a new task
   */
  public startTask(taskId: string): void {
    // Clean up old metrics if we're at capacity
    if (this.taskMetrics.size >= this.MAX_METRICS_SIZE) {
      const oldestTaskId = this.taskMetrics.keys().next().value;
      if (oldestTaskId) {
        this.taskMetrics.delete(oldestTaskId);
      }
    }

    this.taskMetrics.set(taskId, {
      taskId,
      startTime: Date.now(),
      events: []
    });

    logger.info('📊 Task performance tracking started', { taskId });
  }

  /**
   * Record an event for a task
   */
  public recordEvent(
    taskId: string,
    type: TaskEvent['type'],
    name: string,
    metadata?: Record<string, any>
  ): void {
    const metric = this.taskMetrics.get(taskId);
    if (!metric) {
      // Task not being tracked, start tracking it now
      this.startTask(taskId);
      return this.recordEvent(taskId, type, name, metadata);
    }

    const event: TaskEvent = {
      timestamp: Date.now(),
      type,
      name,
      metadata
    };

    metric.events.push(event);

    // Log with structured format for searchability
    logger.debug('📊 Task event recorded', {
      taskId,
      eventType: type,
      eventName: name,
      ...metadata
    });
  }

  /**
   * Record a timed operation
   */
  public async measureOperation<T>(
    taskId: string,
    type: TaskEvent['type'],
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.recordEvent(taskId, type, name, {
        ...metadata,
        duration,
        status: 'success'
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.recordEvent(taskId, 'error', name, {
        ...metadata,
        duration,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  /**
   * Complete task tracking and generate summary
   */
  public completeTask(taskId: string): TaskSummary | null {
    const metric = this.taskMetrics.get(taskId);
    if (!metric) {
      logger.warn('📊 Cannot complete tracking for unknown task', { taskId });
      return null;
    }

    metric.endTime = Date.now();
    const summary = this.generateSummary(metric);
    metric.summary = summary;

    logger.info('📊 Task performance tracking completed', {
      taskId,
      totalDuration: summary.totalDuration,
      eventCount: metric.events.length
    });

    return summary;
  }

  /**
   * Get metrics for a specific task
   */
  public getTaskMetrics(taskId: string): TaskMetric | null {
    return this.taskMetrics.get(taskId) || null;
  }

  /**
   * Get all task metrics (for debugging/analysis)
   */
  public getAllMetrics(): TaskMetric[] {
    return Array.from(this.taskMetrics.values());
  }

  /**
   * Generate a task timeline for visualization
   */
  public getTaskTimeline(taskId: string): any {
    const metric = this.taskMetrics.get(taskId);
    if (!metric) {
      return null;
    }

    const timeline = {
      taskId,
      startTime: new Date(metric.startTime).toISOString(),
      endTime: metric.endTime ? new Date(metric.endTime).toISOString() : null,
      duration: metric.endTime ? metric.endTime - metric.startTime : Date.now() - metric.startTime,
      events: metric.events.map(event => ({
        time: new Date(event.timestamp).toISOString(),
        relativeTime: event.timestamp - metric.startTime,
        type: event.type,
        name: event.name,
        duration: event.metadata?.duration,
        details: event.metadata
      })),
      summary: metric.summary
    };

    return timeline;
  }

  /**
   * Generate performance summary for a task
   */
  private generateSummary(metric: TaskMetric): TaskSummary {
    const totalDuration = (metric.endTime || Date.now()) - metric.startTime;
    
    const breakdown = {
      agents: {} as Record<string, number>,
      tools: {} as Record<string, number>,
      llm: 0,
      database: 0,
      networking: 0,
      other: 0
    };

    let agentCount = 0;
    let toolCallCount = 0;
    let llmCallCount = 0;
    let dbOperationCount = 0;
    let errorCount = 0;

    for (const event of metric.events) {
      const duration = event.metadata?.duration || 0;

      switch (event.type) {
        case 'agent_start':
        case 'agent_complete':
          agentCount++;
          breakdown.agents[event.name] = (breakdown.agents[event.name] || 0) + duration;
          break;
        
        case 'tool_call':
          toolCallCount++;
          breakdown.tools[event.name] = (breakdown.tools[event.name] || 0) + duration;
          break;
        
        case 'llm_call':
          llmCallCount++;
          breakdown.llm += duration;
          break;
        
        case 'db_operation':
          dbOperationCount++;
          breakdown.database += duration;
          break;
        
        case 'sse_broadcast':
          breakdown.networking += duration;
          break;
        
        case 'error':
          errorCount++;
          break;
        
        default:
          breakdown.other += duration;
      }
    }

    return {
      totalDuration,
      agentCount,
      toolCallCount,
      llmCallCount,
      dbOperationCount,
      errorCount,
      breakdown
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  public clear(): void {
    this.taskMetrics.clear();
    logger.info('📊 Task metrics cleared');
  }

  /**
   * Get performance statistics across all tasks
   */
  public getStatistics(): any {
    const allMetrics = Array.from(this.taskMetrics.values());
    
    if (allMetrics.length === 0) {
      return { message: 'No metrics available' };
    }

    const completedTasks = allMetrics.filter(m => m.endTime);
    const durations = completedTasks.map(m => m.endTime! - m.startTime);
    
    // Calculate percentiles
    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] || 0;

    // Count events by type
    const eventTypeCounts: Record<string, number> = {};
    for (const metric of allMetrics) {
      for (const event of metric.events) {
        eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
      }
    }

    return {
      totalTasks: allMetrics.length,
      completedTasks: completedTasks.length,
      activeTasks: allMetrics.length - completedTasks.length,
      durations: {
        p50,
        p95,
        p99,
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length
      },
      eventCounts: eventTypeCounts
    };
  }
}

// Export singleton instance
export const taskPerformanceTracker = TaskPerformanceTracker.getInstance();