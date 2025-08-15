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
 * GET /api/tasks/:taskId/context/stream
 * 
 * SSE endpoint for streaming TaskContext updates in real-time
 * Implements the RIGHT way - Server-Sent Events instead of polling
 */
router.get('/:taskId/context/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const userToken = req.userToken!;
  const userId = req.userId!;
  
  try {
    logger.info('[SSE] Client connecting to TaskContext stream', { taskId, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Set SSE headers - CRITICAL for SSE to work!
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial context with full task data
    try {
      // Get context events (if they exist)
      let contextEvents: any[] = [];
      try {
        contextEvents = await dbService.getContextHistory(userToken, taskId);
      } catch (error: any) {
        if (error.code !== '42P01') {
          logger.warn('Could not get context events', error);
        }
      }
      
      // Get UI requests (if they exist)
      let uiRequests: any[] = [];
      try {
        // This would query ui_requests table when it exists
        // uiRequests = await dbService.getUIRequests(userToken, taskId);
      } catch (error: any) {
        // UI requests table might not exist yet
      }
      
      // Build complete TaskContext object matching PR requirements
      const fullContext = {
        taskId: task.id,
        businessId: task.user_id, // Map to business_id when migration is done
        templateId: task.template_id || task.task_type,
        initiatedByUserId: task.user_id,
        currentState: {
          status: task.status,
          phase: task.metadata?.currentStep || 'initialization',
          completeness: task.metadata?.completeness || 0,
          data: task.metadata || {}
        },
        history: contextEvents,
        activeUIRequests: uiRequests,
        templateSnapshot: task.metadata?.templateSnapshot || {},
        metadata: task.metadata || {},
        createdAt: task.created_at,
        updatedAt: task.updated_at
      };
      
      res.write(`event: CONTEXT_INITIALIZED\n`);
      res.write(`data: ${JSON.stringify(fullContext)}\n\n`);
      
      logger.info('[SSE] Sent initial context', { taskId, eventsCount: contextEvents.length });
    } catch (error) {
      logger.error('[SSE] Failed to send initial context', { taskId, error });
      res.write(`event: ERROR\n`);
      res.write(`data: ${JSON.stringify({ error: 'Failed to load initial context' })}\n\n`);
    }
    
    // Set up PostgreSQL LISTEN/NOTIFY for real-time updates
    let unsubscribe: (() => void) | null = null;
    
    try {
      unsubscribe = await dbService.listenForTaskUpdates(taskId, (payload) => {
        try {
          // Send the update to the SSE client
          switch (payload.type) {
            case 'event_added':
              res.write(`event: EVENT_ADDED\n`);
              res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
              break;
            case 'ui_request':
              res.write(`event: UI_REQUEST\n`);
              res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
              break;
            case 'task_completed':
              res.write(`event: TASK_COMPLETED\n`);
              res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
              break;
            default:
              res.write(`event: ${payload.type}\n`);
              res.write(`data: ${JSON.stringify(payload.data)}\n\n`);
          }
        } catch (error) {
          logger.error('[SSE] Error sending update to client', { taskId, error });
        }
      });
      
      logger.info('[SSE] Real-time listener set up', { taskId });
    } catch (error) {
      logger.error('[SSE] Failed to set up real-time listener', { taskId, error });
    }
    
    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);
    
    // Cleanup on disconnect
    req.on('close', () => {
      logger.info('[SSE] Client disconnected from TaskContext stream', { taskId, userId });
      clearInterval(heartbeat);
      if (unsubscribe) {
        unsubscribe();
      }
    });
    
    req.on('error', (error) => {
      logger.error('[SSE] Stream error', { taskId, userId, error });
      clearInterval(heartbeat);
      if (unsubscribe) {
        unsubscribe();
      }
    });
    
  } catch (error) {
    logger.error('[SSE] Failed to setup context stream', { taskId, error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to setup context stream' });
    }
  }
});

/**
 * POST /api/tasks/:taskId/context/events
 * 
 * REST endpoint for adding context events (Client → Server)
 * This updates the task's context by adding an event
 */
router.post('/:taskId/context/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const { operation, data, reasoning } = req.body;
  const userToken = req.userToken!;
  const userId = req.userId!;
  
  try {
    logger.info('[REST] Adding context event to task', { taskId, operation, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Create context event
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      sequenceNumber: Date.now(), // TODO: Use proper sequence from database
      actorType: 'user' as const,
      actorId: userId,
      operation,
      data,
      reasoning,
      trigger: { source: 'user_input', timestamp: new Date().toISOString() },
      createdAt: new Date().toISOString()
    };
    
    // TODO: Insert into context_events table when it exists
    // For now, we'll emit a task event and update task metadata
    await emitTaskEvent('context_event_added', {
      taskId,
      event
    }, {
      userToken,
      actorType: 'user',
      reasoning: reasoning || 'User added context event'
    });
    
    // Update task metadata with the event data
    const updatedMetadata = {
      ...task.metadata,
      ...data,
      lastContextEvent: {
        operation,
        timestamp: event.createdAt,
        actorId: userId
      }
    };
    
    await dbService.updateTask(userToken, taskId, {
      metadata: updatedMetadata
    });
    
    // Send notification to SSE subscribers via PostgreSQL NOTIFY
    await dbService.notifyTaskContextUpdate(taskId, 'event_added', event);
    
    logger.info('[REST] Context event added successfully', { taskId, eventId: event.id });
    
    res.json({
      success: true,
      event,
      message: 'Context event added successfully'
    });
    
  } catch (error) {
    logger.error('[REST] Failed to add context event', { taskId, error });
    res.status(500).json({ error: 'Failed to add context event' });
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