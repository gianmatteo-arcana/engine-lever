/**
 * SSE (Server-Sent Events) Streaming API
 * 
 * Provides real-time updates for onboarding and task progress
 */

import { Router, Response } from 'express';
import { logger } from '../utils/logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { DatabaseService } from '../services/database';
import { taskEventEmitter } from '../services/task-events';

const router = Router();

// Active SSE connections
const activeConnections = new Map<string, Set<Response>>();

/**
 * Helper to send SSE message
 */
function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /api/streaming/task/:taskId
 * Stream real-time updates for a specific task
 */
router.get('/task/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const userId = req.userId!;
  const userToken = req.userToken!;
  
  logger.info('SSE connection requested', { userId, taskId });
  
  // Verify user has access to this task
  const dbService = DatabaseService.getInstance();
  const task = await dbService.getTask(userToken, taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add connection to active connections
  if (!activeConnections.has(taskId)) {
    activeConnections.set(taskId, new Set());
  }
  activeConnections.get(taskId)!.add(res);
  
  // Send initial connection success
  sendSSE(res, 'connected', { taskId, timestamp: new Date().toISOString() });
  
  // Send current task status
  sendSSE(res, 'status', {
    taskId,
    status: task.status,
    progress: calculateProgress(task),
    metadata: task.metadata
  });
  
  // Setup event listeners for this task
  const statusListener = (data: any) => {
    if (data.taskId === taskId) {
      sendSSE(res, 'status', data);
    }
  };
  
  const progressListener = (data: any) => {
    if (data.taskId === taskId) {
      sendSSE(res, 'progress', data);
    }
  };
  
  const uiRequestListener = (data: any) => {
    if (data.taskId === taskId) {
      sendSSE(res, 'ui-request', data);
    }
  };
  
  const completionListener = (data: any) => {
    if (data.taskId === taskId) {
      sendSSE(res, 'completed', data);
    }
  };
  
  const errorListener = (data: any) => {
    if (data.taskId === taskId) {
      sendSSE(res, 'error', data);
    }
  };
  
  // Register listeners
  taskEventEmitter.on('task:status', statusListener);
  taskEventEmitter.on('task:progress', progressListener);
  taskEventEmitter.on('task:ui-request', uiRequestListener);
  taskEventEmitter.on('task:completed', completionListener);
  taskEventEmitter.on('task:error', errorListener);
  
  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    sendSSE(res, 'heartbeat', { timestamp: new Date().toISOString() });
  }, 30000); // Every 30 seconds
  
  // Handle client disconnect
  res.on('close', () => {
    logger.info('SSE connection closed', { userId, taskId });
    
    // Remove from active connections
    const connections = activeConnections.get(taskId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        activeConnections.delete(taskId);
      }
    }
    
    // Remove listeners
    taskEventEmitter.off('task:status', statusListener);
    taskEventEmitter.off('task:progress', progressListener);
    taskEventEmitter.off('task:ui-request', uiRequestListener);
    taskEventEmitter.off('task:completed', completionListener);
    taskEventEmitter.off('task:error', errorListener);
    
    // Clear heartbeat
    clearInterval(heartbeat);
  });
});

/**
 * GET /api/streaming/user
 * Stream all task updates for the authenticated user
 */
router.get('/user', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const userToken = req.userToken!;
  
  logger.info('SSE user connection requested', { userId });
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add connection to user connections
  if (!activeConnections.has(`user:${userId}`)) {
    activeConnections.set(`user:${userId}`, new Set());
  }
  activeConnections.get(`user:${userId}`)!.add(res);
  
  // Send initial connection success
  sendSSE(res, 'connected', { userId, timestamp: new Date().toISOString() });
  
  // Get and send current user tasks
  const dbService = DatabaseService.getInstance();
  const tasks = await dbService.getUserTasks(userToken);
  sendSSE(res, 'tasks', {
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      businessId: t.business_id,
      progress: calculateProgress(t)
    })),
    count: tasks.length
  });
  
  // Setup event listeners for user tasks
  const userTaskListener = async (data: any) => {
    // Verify this task belongs to the user
    const task = await DatabaseService.getInstance().getTask(userToken, data.taskId);
    if (task) {
      sendSSE(res, data.eventType || 'task-update', data);
    }
  };
  
  // Register listener for all task events
  taskEventEmitter.on('task:*', userTaskListener);
  
  // Heartbeat
  const heartbeat = setInterval(() => {
    sendSSE(res, 'heartbeat', { timestamp: new Date().toISOString() });
  }, 30000);
  
  // Handle disconnect
  res.on('close', () => {
    logger.info('SSE user connection closed', { userId });
    
    // Remove from active connections
    const connections = activeConnections.get(`user:${userId}`);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        activeConnections.delete(`user:${userId}`);
      }
    }
    
    // Remove listeners
    taskEventEmitter.off('task:*', userTaskListener);
    
    // Clear heartbeat
    clearInterval(heartbeat);
  });
});

/**
 * Helper function to calculate task progress
 */
function calculateProgress(task: any): number {
  const goals = task.task_goals || [];
  if (goals.length === 0) return 0;
  
  const completedGoals = goals.filter((g: any) => g.completed).length;
  return Math.round((completedGoals / goals.length) * 100);
}

export { router as streamingRoutes };