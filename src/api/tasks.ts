/**
 * Universal Tasks API
 * 
 * Engine PRD Compliant Implementation (Lines 847-881)
 * - Everything is a task, everything is configuration
 * - No task type-specific logic (zero special cases)
 * - Event sourcing for complete traceability
 * - Works identically for onboarding, SOI, any task type
 */

import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { DatabaseService } from '../services/database';
import { TaskService } from '../services/task-service';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { emitTaskEvent } from '../services/task-events';

const router = Router();

// Schema for universal task creation
const CreateTaskSchema = z.object({
  templateId: z.string().min(1),
  initialData: z.record(z.any()).optional(),
  metadata: z.object({
    source: z.enum(['api', 'ui', 'trigger', 'schedule']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    notes: z.string().optional()
  }).optional()
});

// Schema for UI response
const UIResponseSchema = z.object({
  requestId: z.string(),
  response: z.record(z.any()),
  action: z.enum(['submit', 'cancel', 'skip', 'defer']).optional()
});

/**
 * POST /api/tasks/create
 * 
 * Universal task creation endpoint
 * Engine PRD Lines 847-881
 * 
 * Creates ANY task type using identical flow:
 * - User onboarding → templateId: "user_onboarding"
 * - SOI filing → templateId: "soi_filing"  
 * - Any future task → templateId: "any_template"
 */
router.post('/create', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const tenantId = userId; // Default tenant to user
    
    const input = CreateTaskSchema.parse(req.body);
    
    logger.info('Creating universal task', {
      userId,
      templateId: input.templateId,
      source: input.metadata?.source || 'api'
    });
    
    // Get services
    const taskService = TaskService.getInstance();
    const orchestrator = OrchestratorAgent.getInstance();
    
    // Create task through universal service
    const context = await taskService.create({
      templateId: input.templateId,
      tenantId,
      userToken,
      initialData: {
        ...input.initialData,
        userId,
        createdBy: 'api',
        source: input.metadata?.source || 'api'
      }
    });
    
    // Start orchestration asynchronously
    orchestrator.orchestrateTask(context).catch(error => {
      logger.error('Orchestration failed', {
        contextId: context.contextId,
        error: error.message
      });
    });
    
    res.json({
      success: true,
      contextId: context.contextId,
      taskTemplateId: context.taskTemplateId,
      status: context.currentState.status,
      message: 'Task created and orchestration started'
    });
    
  } catch (error) {
    logger.error('Failed to create task', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Failed to create task'
    });
  }
});

/**
 * POST /api/tasks/:contextId/ui-response
 * 
 * Handle UI responses for progressive disclosure
 * Engine PRD Lines 50, 83-85
 */
router.post('/:contextId/ui-response', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId } = req.params;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
    const input = UIResponseSchema.parse(req.body);
    
    logger.info('Processing UI response', {
      contextId,
      requestId: input.requestId,
      action: input.action
    });
    
    // TODO: Process UI response through orchestrator
    // This would update the TaskContext and potentially trigger next phase
    
    res.json({
      success: true,
      contextId,
      requestId: input.requestId,
      message: 'UI response processed'
    });
    
  } catch (error) {
    logger.error('Failed to process UI response', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid response',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Failed to process UI response'
    });
  }
});

/**
 * GET /api/tasks/:contextId
 * 
 * Get current task context and state
 * Universal endpoint for any task type
 */
router.get('/:contextId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId } = req.params;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
    logger.info('Getting task context', { contextId });
    
    const taskService = TaskService.getInstance();
    const context = await taskService.getTask(contextId);
    
    if (!context) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      context,
      currentPhase: context.currentState.phase,
      completeness: context.currentState.completeness,
      historyCount: context.history.length
    });
    
  } catch (error) {
    logger.error('Failed to get task context', error);
    res.status(500).json({ error: 'Failed to get task context' });
  }
});

/**
 * GET /api/tasks/:taskId/context-history
 * 
 * Generic endpoint to get context history for ANY task
 * This replaces onboarding-specific context-history endpoint
 */
router.get('/:taskId/context-history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
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
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
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
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
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
 * POST /api/tasks
 * 
 * Universal task creation endpoint - works for ANY task type
 * This replaces all task-specific creation edge functions
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskType, title, description, metadata, templateId } = req.body;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const userId = req.userId!;
    
    logger.info('Creating universal task', { taskType, userId, templateId });
    
    const dbService = DatabaseService.getInstance();
    
    // Create task using universal pattern
    const taskId = await dbService.createTask(userToken, {
      task_type: taskType,
      title: title || `${taskType} Task`,
      description: description || `Created via universal API`,
      status: 'pending',
      priority: 'medium',
      metadata: metadata || {},
      template_id: templateId
    });
    
    // Emit task creation event
    await emitTaskEvent('task_created', {
      taskId,
      taskType,
      templateId
    }, {
      userToken,
      actorType: 'user',
      reasoning: 'Universal task creation'
    });
    
    logger.info('Universal task created', { taskId, taskType });
    
    res.status(201).json({
      success: true,
      taskId,
      taskType,
      message: 'Task created successfully'
    });
  } catch (error) {
    logger.error('Failed to create task', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PUT /api/tasks/:taskId
 * 
 * Universal task update endpoint - works for ANY task type  
 * This replaces all task-specific update edge functions
 */
router.put('/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const { status, metadata, step, formData, hasUnsavedChanges } = req.body;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
    logger.info('Updating universal task', { taskId, status, step });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Update task metadata (handles onboarding state and any other task type)
    const updatedMetadata = {
      ...task.metadata,
      ...metadata,
      ...(step && { currentStep: step }),
      ...(formData && { formData }),
      ...(hasUnsavedChanges !== undefined && { hasUnsavedChanges }),
      lastUpdated: new Date().toISOString()
    };
    
    await dbService.updateTask(userToken, taskId, {
      ...(status && { status }),
      metadata: updatedMetadata
    });
    
    // Emit task update event
    await emitTaskEvent('task_updated', {
      taskId,
      changes: { status, step, hasFormData: !!formData }
    }, {
      userToken,
      actorType: 'user',
      reasoning: 'Universal task update'
    });
    
    res.json({
      success: true,
      taskId,
      message: 'Task updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update task', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * GET /api/tasks
 * 
 * List all tasks for the authenticated user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const userId = req.userId!;
    
    logger.info('Listing tasks for user', { userId });
    
    const dbService = DatabaseService.getInstance();
    const tasks = await dbService.getUserTasks(userToken);
    
    res.json({
      tasks: tasks.map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        taskType: task.task_type,
        status: task.status,
        priority: task.priority,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        metadata: task.metadata
      })),
      count: tasks.length
    });
  } catch (error) {
    logger.error('Failed to list tasks', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

export default router;