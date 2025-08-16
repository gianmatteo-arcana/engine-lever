import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { DatabaseService } from '../services/database';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Create service role client for direct database access
// Only create if environment variables are available
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )
  : null;

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
    
    // Verify user owns this task using service method
    const task = await dbService.getTask(userToken, taskId);
    
    if (!task) {
      logger.warn('Task not found or unauthorized', { taskId, userId });
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check if Supabase client is available
    if (!supabase) {
      logger.error('Supabase client not initialized - missing environment variables');
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    // Get events from task_context_events table
    const { data: events, error: eventsError } = await supabase
      .from('task_context_events')
      .select('*')
      .eq('task_id', taskId)
      .order('sequence_number', { ascending: true });
      
    if (eventsError) {
      logger.error('Failed to fetch task events', eventsError);
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