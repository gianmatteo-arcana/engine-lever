/**
 * Universal Task API Routes
 * 
 * These routes provide the new database-aligned API that fixes the type mismatch issues.
 * They work with the actual database schema and provide proper type safety.
 * 
 * This replaces task-specific endpoints with universal ones.
 */

import { Router, Request, Response } from 'express';
import { TaskService, UniversalCreateTaskRequest } from '../services/task-service';
import { validateCreateTaskRequest } from '../types/database-aligned-types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Create any type of task using universal endpoint
 * POST /api/tasks
 * 
 * Replaces all task-specific endpoints:
 * - POST /api/onboarding-tasks (DEPRECATED)
 * - POST /api/soi-tasks (DEPRECATED)
 * - POST /api/compliance-tasks (DEPRECATED)
 */
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    // Extract user token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }

    // Create request object
    const request: UniversalCreateTaskRequest = {
      ...req.body,
      userToken: authHeader
    };

    // Validate request
    if (!validateCreateTaskRequest(request)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task creation request. Required fields: title, task_type'
      });
    }

    // Create task using universal service
    const taskService = new TaskService(); // Use factory pattern instead of singleton
    const result = await taskService.createDatabaseTask(request);

    // Return result
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    logger.error('Error in universal task creation endpoint', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get user's tasks
 * GET /api/tasks
 */
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    // Extract user token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }

    // Get tasks using universal service
    const taskService = new TaskService();
    const result = await taskService.getUserTasks(authHeader);

    // Return result
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    logger.error('Error in get user tasks endpoint', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get single task by ID
 * GET /api/tasks/:id
 */
router.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    // Extract user token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Task ID required'
      });
    }

    // Get task using universal service
    const taskService = new TaskService();
    const result = await taskService.getTaskById(id, authHeader);

    // Return result
    if (result.success) {
      res.json(result);
    } else {
      if (result.error === 'Task not found') {
        res.status(404).json(result);
      } else {
        res.status(400).json(result);
      }
    }

  } catch (error) {
    logger.error('Error in get task by ID endpoint', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Health check endpoint for API testing
 * GET /api/tasks/health
 */
router.get('/tasks/health', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Universal Tasks API is healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    logger.error('Error in health check endpoint', { error });
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

/**
 * Convert tasks to UI format for frontend compatibility
 * GET /api/tasks/ui-format
 */
router.get('/tasks/ui-format', async (req: Request, res: Response) => {
  try {
    // Extract user token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
    }

    // Get tasks in database format
    const taskService = new TaskService();
    const dbResult = await taskService.getUserTasks(authHeader);

    if (!dbResult.success) {
      return res.status(400).json(dbResult);
    }

    // Convert to UI format
    const uiTasks = taskService.convertTasksToUI(dbResult.data || []);

    res.json({
      success: true,
      data: uiTasks
    });

  } catch (error) {
    logger.error('Error in UI format conversion endpoint', { error });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;