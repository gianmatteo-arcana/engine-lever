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
    // Get the complete timeline for this task
    const timeline = taskPerformanceTracker.getTaskTimeline(taskId);
    
    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: 'Task metrics not found',
        message: `No metrics available for task ${taskId}`
      });
    }
    
    // Get the raw metrics for additional detail
    const metrics = taskPerformanceTracker.getTaskMetrics(taskId);
    
    return res.json({
      success: true,
      data: {
        timeline,
        metrics: metrics?.summary,
        taskId,
        status: metrics?.endTime ? 'completed' : 'active'
      }
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