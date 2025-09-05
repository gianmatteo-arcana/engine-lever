/**
 * Performance Metrics API Endpoints
 * 
 * Provides access to task performance metrics for monitoring and optimization.
 * All metrics are grouped by taskId for easy correlation across the system.
 */

import { Router, Request, Response } from 'express';
import { taskPerformanceTracker } from '../services/task-performance-tracker';
import { logger } from '../utils/logger';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';

const router = Router();

/**
 * GET /api/metrics/:taskId
 * Get complete performance metrics for a specific task
 */
router.get('/:taskId', requireAuth, async (req: Request, res: Response) => {
  const { taskId } = req.params;
  
  try {
    // First try to get from in-memory tracker
    let timeline = taskPerformanceTracker.getTaskTimeline(taskId);
    let metrics = taskPerformanceTracker.getTaskMetrics(taskId);
    
    // If we have in-memory timeline, ensure events have labels
    if (timeline && timeline.events) {
      timeline.events = timeline.events.map((event: any) => {
        if (event.label) return event; // Already has label
        
        // Add label based on event type and name
        let label = event.name || event.type || 'Unknown Event';
        
        if (event.type === 'agent_start') {
          label = `Agent Started: ${event.name || 'Unknown'}`;
        } else if (event.type === 'agent_complete') {
          label = `Agent Completed: ${event.name || 'Unknown'}`;
        } else if (event.type === 'tool_call') {
          label = `Tool: ${event.name || 'Unknown'}`;
        } else if (event.type === 'llm_call') {
          label = `LLM Call: ${event.name || 'Unknown'}`;
        } else if (event.type === 'database') {
          label = `Database: ${event.name || 'Query'}`;
        } else if (event.type === 'error') {
          label = `Error: ${event.details?.message || event.name || 'Unknown'}`;
        }
        
        return {
          ...event,
          label,
          relativeTime: event.relativeTime || (event.time ? new Date(event.time).getTime() - new Date(timeline.startTime).getTime() : 0)
        };
      });
    }
    
    // If not in memory, fetch from database
    if (!timeline && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      
      // Fetch task details
      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (task) {
        // Fetch task context events for timeline
        const { data: events } = await supabase
          .from('task_context_events')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true });
        
        // Build a synthetic timeline from database data
        const taskStartTime = new Date(task.created_at);
        const taskEndTime = task.status === 'completed' || task.status === 'failed' 
          ? new Date(task.updated_at) 
          : new Date();
        
        timeline = {
          taskId,
          startTime: taskStartTime.toISOString(),
          endTime: task.status === 'completed' || task.status === 'failed' 
            ? taskEndTime.toISOString() 
            : null,
          events: events?.map(event => {
            const eventTime = new Date(event.created_at);
            const relativeTime = eventTime.getTime() - taskStartTime.getTime();
            
            // Create a descriptive label for the event
            const eventType = event.event_type || event.type || 'unknown';
            const operation = event.operation || '';
            const actor = event.actor_id || event.actor_type || '';
            
            let label = eventType;
            if (eventType === 'AGENT_EXECUTION_STARTED') {
              label = `Agent Started: ${actor || 'Unknown Agent'}`;
            } else if (eventType === 'AGENT_EXECUTION_COMPLETED') {
              label = `Agent Completed: ${actor || 'Unknown Agent'}`;
            } else if (eventType === 'AGENT_EXECUTION_PAUSED') {
              label = `Agent Paused (Needs Input): ${actor || 'Unknown Agent'}`;
            } else if (eventType === 'TASK_STATUS_CHANGE') {
              const newStatus = event.data?.status || event.metadata?.status || 'unknown';
              label = `Status → ${newStatus}`;
            } else if (eventType === 'SUBTASK_STARTED') {
              label = `Subtask: ${operation || 'Started'}`;
            } else if (eventType === 'SUBTASK_COMPLETED') {
              label = `Subtask Done: ${operation || 'Completed'}`;
            } else if (eventType === 'USER_INPUT_RECEIVED') {
              label = 'User Input Received';
            } else if (eventType === 'ERROR') {
              label = `Error: ${event.data?.message || 'Unknown error'}`;
            } else if (operation) {
              label = `${eventType}: ${operation}`;
            }
            
            return {
              timestamp: eventTime.toISOString(),
              relativeTime, // milliseconds since task start
              type: eventType,
              operation: operation,
              actor: actor,
              label, // Human-readable label for the event
              data: event.data || event.metadata || {}
            };
          }) || [],
          status: task.status,
          taskType: task.task_type || 'unknown'
        };
        
        // Build synthetic metrics
        const duration = taskEndTime.getTime() - taskStartTime.getTime();
        metrics = {
          taskId,
          startTime: taskStartTime.getTime(),
          endTime: task.status === 'completed' || task.status === 'failed' 
            ? taskEndTime.getTime() 
            : undefined,
          events: events?.map((event, index) => ({
            timestamp: new Date(event.created_at).getTime(),
            type: event.event_type || event.type || 'event',
            index
          })) || [],
          summary: {
            totalDuration: duration,
            agentCount: events?.filter(e => e.actor_type === 'agent').length || 0,
            averageDuration: duration,
            durations: {
              min: duration,
              max: duration,
              average: duration
            }
          }
        } as any;
      }
    }
    
    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: 'Task metrics not found',
        message: `No metrics available for task ${taskId}`
      });
    }
    
    // Calculate duration if not present
    let duration = 0;
    if (timeline) {
      if (timeline.duration) {
        duration = timeline.duration;
      } else if (timeline.startTime) {
        const start = new Date(timeline.startTime).getTime();
        const end = timeline.endTime ? new Date(timeline.endTime).getTime() : Date.now();
        duration = end - start;
      }
    }
    
    // Ensure consistent response format
    const responseData = {
      timeline: {
        ...timeline,
        duration, // Ensure duration is always present
        taskId,
        startTime: timeline?.startTime || null,
        endTime: timeline?.endTime || null,
        events: timeline?.events || [],
        status: timeline?.status || 'unknown',
        taskType: timeline?.taskType || 'unknown'
      },
      metrics: metrics?.summary || {
        totalDuration: duration,
        agentCount: timeline?.events?.length || 0,
        averageDuration: duration,
        durations: {
          min: duration,
          max: duration,
          average: duration
        }
      },
      taskId,
      status: timeline?.status || (metrics?.endTime ? 'completed' : 'active'),
      duration, // Add duration at top level for easy access
      // Add debug info
      source: timeline ? (metrics ? 'memory' : 'database') : 'not_found'
    };
    
    logger.debug(`Metrics for task ${taskId}`, {
      taskId,
      source: responseData.source,
      hasTimeline: !!timeline,
      hasMetrics: !!metrics,
      eventCount: timeline?.events?.length || 0
    });
    
    return res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('Error fetching task metrics', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics'
    });
  }
});

/**
 * GET /api/metrics
 * Get performance statistics across all tasks
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const statistics = taskPerformanceTracker.getStatistics();
    const allMetrics = taskPerformanceTracker.getAllMetrics();
    
    // Get recent tasks from database
    let recentTasks: any[] = [];
    let taskStatuses = null;
    
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, status, task_type, created_at, updated_at, metadata')
        .order('updated_at', { ascending: false })
        .limit(20);
      
      if (tasks && tasks.length > 0) {
        // Get recent task summaries (first 10)
        recentTasks = tasks.slice(0, 10).map(task => ({
          taskId: task.id,
          taskType: task.task_type || 'unknown',
          status: task.status,
          startTime: new Date(task.created_at).toISOString(),
          lastUpdate: new Date(task.updated_at).toISOString(),
          duration: new Date(task.updated_at).getTime() - new Date(task.created_at).getTime(),
          ageMinutes: Math.floor((Date.now() - new Date(task.updated_at).getTime()) / 60000),
          metadata: task.metadata || {}
        }));
        
        // Group tasks by status
        taskStatuses = {
          total: tasks.length,
          byStatus: tasks.reduce((acc: any, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
          }, {}),
          recent: tasks.slice(0, 5).map(task => ({
            id: task.id.substring(0, 8) + '...',
            status: task.status,
            type: task.task_type,
            lastUpdate: new Date(task.updated_at).toISOString(),
            ageMinutes: Math.floor((Date.now() - new Date(task.updated_at).getTime()) / 60000)
          }))
        };
      }
    }
    
    // If no tasks from database, use in-memory metrics as fallback
    if (recentTasks.length === 0 && allMetrics.length > 0) {
      recentTasks = allMetrics
        .slice(-10)
        .reverse()
        .map(m => ({
          taskId: m.taskId,
          startTime: new Date(m.startTime).toISOString(),
          duration: m.endTime ? m.endTime - m.startTime : null,
          status: m.endTime ? 'completed' : 'active',
          eventCount: m.events.length,
          summary: m.summary
        }));
    }
    
    return res.json({
      success: true,
      data: {
        statistics,
        recentTasks,
        taskStatuses
      }
    });
  } catch (error) {
    logger.error('Error fetching metrics statistics', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics statistics'
    });
  }
});

/**
 * DELETE /api/metrics/clear
 * Clear all metrics (useful for testing)
 */
router.delete('/clear', requireAuth, async (req: Request, res: Response) => {
  try {
    // Only allow in development/test environments
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Cannot clear metrics in production'
      });
    }
    
    taskPerformanceTracker.clear();
    
    return res.json({
      success: true,
      message: 'All metrics cleared'
    });
  } catch (error) {
    logger.error('Error clearing metrics', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return res.status(500).json({
      success: false,
      error: 'Failed to clear metrics'
    });
  }
});

export default router;