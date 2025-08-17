import { Router } from 'express';
import { DatabaseService } from '../services/database';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/task-events/:taskId
 * Get all events for a specific task from task_context_events table
 */
router.get('/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId!;
    const userToken = req.userToken!;
    
    logger.info('Fetching task events', { taskId, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Get task events through the database service method
    // This validates user ownership and returns events
    let task;
    let events;
    
    try {
      // First get the task to have its metadata
      task = await dbService.getTask(userToken, taskId);
      if (!task) {
        logger.warn('Task not found or unauthorized', { taskId, userId });
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Now get the events
      events = await dbService.getTaskEvents(userToken, taskId);
    } catch (error: any) {
      logger.error('Failed to fetch task events', error);
      // Let the error propagate naturally - could be auth error
      return res.status(500).json({ error: 'Failed to fetch events' });
    }
    
    logger.info('Task events fetched', { 
      taskId, 
      eventCount: events?.length || 0 
    });
    
    res.json({
      taskId,
      taskTitle: task.title,
      taskStatus: task.status,
      events: events || [],
      count: events?.length || 0
    });
    
  } catch (error) {
    logger.error('Failed to get task events', error);
    res.status(500).json({ error: 'Failed to get task events' });
  }
});

export { router as taskEventsRoutes };