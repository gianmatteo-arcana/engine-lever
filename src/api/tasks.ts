/**
 * Generic Tasks API
 * 
 * Implements ENGINE PRD principles:
 * - All functionality is generic and universal
 * - No task type-specific logic
 * - Event sourcing for all task operations
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { DatabaseService } from '../services/database';
import { emitTaskEvent } from '../services/task-events';

const router = Router();

/**
 * GET /api/tasks/:taskId/context-history
 * 
 * Generic endpoint to get context history for ANY task
 * This replaces onboarding-specific context-history endpoint
 */
router.get('/:taskId/context-history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!;
    
    logger.info('Fetching context history', { taskId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get context history (if table exists)
    try {
      const history = await dbService.getContextHistory(userToken, taskId);
      
      res.json({
        taskId,
        taskType: task.task_type,
        entries: history,
        count: history.length
      });
    } catch (error: any) {
      // If context_history table doesn't exist, return empty
      if (error.code === '42P01') {
        logger.warn('Context history table does not exist yet');
        res.json({
          taskId,
          taskType: task.task_type,
          entries: [],
          count: 0,
          message: 'Context history not available - pending migration'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error('Failed to get context history', error);
    res.status(500).json({ error: 'Failed to get context history' });
  }
});

/**
 * POST /api/tasks/:taskId/events
 * 
 * Generic endpoint to emit events for ANY task
 */
router.post('/:taskId/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const { eventType, data, reasoning } = req.body;
    const userToken = req.userToken!;
    
    logger.info('Emitting task event', { taskId, eventType });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Emit the event
    await emitTaskEvent(eventType, {
      taskId,
      ...data
    }, {
      userToken,
      actorType: 'user',
      reasoning
    });
    
    res.json({
      success: true,
      taskId,
      eventType
    });
  } catch (error) {
    logger.error('Failed to emit task event', error);
    res.status(500).json({ error: 'Failed to emit task event' });
  }
});

/**
 * GET /api/tasks/:taskId/status
 * 
 * Generic endpoint to get status for ANY task
 */
router.get('/:taskId/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!;
    
    logger.info('Getting task status', { taskId });
    
    const dbService = DatabaseService.getInstance();
    
    // Get task
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get agent contexts (if they exist)
    let agentContexts: any[] = [];
    try {
      agentContexts = await dbService.getAgentContexts(userToken, taskId);
    } catch (error: any) {
      if (error.code !== '42P01') {
        logger.warn('Could not get agent contexts', error);
      }
    }
    
    // Calculate progress based on agent contexts
    const totalAgents = agentContexts.length || 1;
    const completedAgents = agentContexts.filter((ctx: any) => ctx.is_complete).length;
    const progress = Math.round((completedAgents / totalAgents) * 100);
    
    res.json({
      taskId,
      taskType: task.task_type,
      status: task.status,
      progress,
      title: task.title,
      description: task.description,
      priority: task.priority,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      agentStatuses: agentContexts.map(ctx => ({
        agentRole: ctx.agent_role,
        isComplete: ctx.is_complete || false,
        lastAction: ctx.last_action,
        errorCount: ctx.error_count || 0
      })),
      metadata: task.metadata
    });
  } catch (error) {
    logger.error('Failed to get task status', error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

/**
 * GET /api/tasks
 * 
 * List all tasks for the authenticated user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userToken = req.userToken!;
    const userId = req.userId!;
    
    logger.info('Listing tasks for user', { userId });
    
    const dbService = DatabaseService.getInstance();
    const tasks = await dbService.getTasks(userToken);
    
    res.json({
      tasks: tasks.map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        taskType: task.task_type,
        status: task.status,
        priority: task.priority,
        createdAt: task.created_at,
        updatedAt: task.updated_at
      })),
      count: tasks.length
    });
  } catch (error) {
    logger.error('Failed to list tasks', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

export default router;