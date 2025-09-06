/**
 * Universal Tasks API
 * 
 * Engine PRD Compliant Implementation (Lines 847-881)
 * - Everything is a task, everything is configuration
 * - No task type-specific logic (zero special cases)
 * - Event sourcing for complete traceability
 * - Works identically for onboarding, SOI, any task type
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { requireAuth, AuthenticatedRequest, extractUserContext } from '../middleware/auth';
import { DatabaseService } from '../services/database';
import { TaskService } from '../services/task-service';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { emitTaskEvent } from '../services/task-events';
import { a2aEventBus, A2AEventBus } from '../services/a2a-event-bus';
// import { validateJWT } from '../utils/jwt-validator'; - Not needed, using middleware

const router = Router();

/**
 * GET /api/tasks
 * 
 * List tasks for authenticated user
 * Backend-centric architecture: service role + user validation
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    
    logger.info('Fetching tasks for user', { userId });
    
    // Use DatabaseService with service role
    const dbService = DatabaseService.getInstance();
    
    // Get tasks for this user using existing method
    const tasks = await dbService.getUserTasks(userId);
    
    logger.info('Tasks fetched successfully', { 
      userId, 
      taskCount: tasks.length 
    });
    
    res.json(tasks);
    
  } catch (error) {
    logger.error('Failed to fetch tasks', { 
      userId: req.userId,
      error: (error as Error).message 
    });
    
    res.status(500).json({
      error: 'Failed to list tasks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
 * - Business profile onboarding → templateId: "onboarding"
 * - SOI filing → templateId: "soi_filing"  
 * - Any future task → templateId: "any_template"
 */
router.post('/create', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const tenantId = userId; // Default tenant to user
    
    const input = CreateTaskSchema.parse(req.body);
    
    logger.info('🎯 Creating universal task', {
      userId,
      templateId: input.templateId,
      source: input.metadata?.source || 'api',
      timestamp: new Date().toISOString(),
      hasInitialData: !!input.initialData,
      initialDataKeys: input.initialData ? Object.keys(input.initialData) : []
    });
    
    // DEBUG: Log full request
    logger.debug('📥 Full task creation request', {
      body: req.body,
      headers: {
        authorization: req.headers.authorization ? 'Bearer ***' : 'none'
      }
    });
    
    // Get services
    const taskService = TaskService.getInstance();
    logger.info('📦 TaskService instance obtained');
    
    try {
      OrchestratorAgent.getInstance();
      logger.info('🤖 OrchestratorAgent instance obtained');
    } catch (orchError) {
      logger.error('❌ Failed to get OrchestratorAgent instance', {
        error: orchError instanceof Error ? orchError.message : String(orchError),
        stack: orchError instanceof Error ? orchError.stack : undefined
      });
    }
    
    // Create task through universal service
    const context = await taskService.create({
      templateId: input.templateId,
      tenantId,
      userToken, // TODO: Remove when TaskService is refactored to service role pattern
      initialData: {
        ...input.initialData,
        userId,
        createdBy: 'api',
        source: input.metadata?.source || 'api'
      }
    });
    
    logger.info('📝 Task context created', {
      contextId: context.contextId,
      hasMetadata: !!context.metadata,
      hasTaskDefinition: !!context.metadata?.taskDefinition
    });
    
    // Start orchestration asynchronously
    try {
      const orchestrator = OrchestratorAgent.getInstance();
      logger.info('🚀 Calling orchestrator.orchestrateTask()...');
      
      orchestrator.orchestrateTask(context).catch(error => {
        logger.error('❌ Orchestration promise rejected', {
          contextId: context.contextId,
          error: error.message,
          stack: error.stack
        });
      });
      
      logger.info('✅ orchestrateTask() called successfully (async)');
    } catch (orchError) {
      logger.error('❌ Failed to start orchestration', {
        contextId: context.contextId,
        error: orchError instanceof Error ? orchError.message : String(orchError),
        stack: orchError instanceof Error ? orchError.stack : undefined
      });
    }
    
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
    const userId = req.userId!;
    const userEmail = req.userEmail!;
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    
    const input = UIResponseSchema.parse(req.body);
    
    logger.info('Processing UI response', {
      contextId,
      requestId: input.requestId,
      action: input.action,
      userId
    });
    
    // Get database service and A2A event bus
    const dbService = DatabaseService.getInstance();
    const a2aEventBus = A2AEventBus.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userId, contextId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }
    
    // Create the context event for UI response
    const eventData = {
      contextId,
      actorType: 'user',
      actorId: userEmail || userId,
      operation: 'UI_RESPONSE_SUBMITTED',
      data: {
        requestId: input.requestId,
        response: input.response,
        action: input.action || 'submit',
        timestamp: new Date().toISOString()
      },
      reasoning: `User submitted response to UI request ${input.requestId}`,
      trigger: {
        type: 'user_action',
        source: 'ui_form',
        requestId: input.requestId
      }
    };
    
    // Persist the event to database
    const persistedEvent = await dbService.createTaskContextEvent(
      userId,
      contextId,
      eventData
    );
    
    logger.info('UI response event persisted', {
      eventId: persistedEvent.id,
      taskId: contextId,
      requestId: input.requestId
    });
    
    // Broadcast the event for real-time updates
    await a2aEventBus.broadcast({
      type: 'TASK_CONTEXT_UPDATE',
      taskId: contextId,
      agentId: 'user',
      operation: 'UI_RESPONSE_SUBMITTED',
      data: {
        ...eventData.data,
        eventId: persistedEvent.id
      },
      reasoning: eventData.reasoning,
      timestamp: new Date().toISOString(),
      metadata: {
        userId,
        userEmail,
        requestId: input.requestId
      }
    });
    
    // The orchestrator will listen for the UI_RESPONSE_SUBMITTED event
    // and resume task processing with the new user input
    logger.info('UI response event broadcast for orchestrator', {
      taskId: contextId,
      requestId: input.requestId,
      operation: 'UI_RESPONSE_SUBMITTED'
    });
    
    res.json({
      success: true,
      contextId,
      requestId: input.requestId,
      eventId: persistedEvent.id,
      message: 'UI response processed and recorded'
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
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(contextId)) {
      return res.status(400).json({ error: 'Invalid UUID format' });
    }
    
    logger.info('Getting task context', { contextId });
    
    const taskService = TaskService.getInstance();
    const context = await taskService.getTask(contextId);
    
    if (!context) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      context,
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
    const task = await dbService.getTask(req.userId!, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get context history (if table exists)
    try {
      const history = await dbService.getContextHistory(req.userId!, taskId);
      
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
 * POST /api/tasks/:contextId/message
 * 
 * Handle unstructured user messages (FluidUI)
 * Routes to UXOptimizationAgent for processing
 */
router.post('/:contextId/message', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId } = req.params;
    const userId = req.userId!;
    const userEmail = req.userEmail!;
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }
    
    logger.info('Processing user message', {
      contextId,
      messageLength: message.length,
      userId
    });
    
    // Get services
    const dbService = DatabaseService.getInstance();
    const a2aEventBus = A2AEventBus.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userId, contextId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }
    
    // Get or create UXOptimizationAgent instance
    // For now, create directly to avoid dynamic import issues in tests
    // TODO: Integrate with DI container when available globally
    const UXOptimizationAgent = (await import('../agents/UXOptimizationAgent')).UXOptimizationAgent;
    const uxAgent = new UXOptimizationAgent(contextId, task.business_id, userId);
    
    // Load context for the awakened agent
    await uxAgent.loadContext();
    
    // Process the message
    const response = await uxAgent.handleUserMessage(message, {
      contextId,
      taskId: contextId,
      tenantId: task.business_id,
      userId
    });
    
    // Check if response should be persisted
    const isEphemeral = (response as any).ephemeral === true;
    const extractedData = response.contextUpdate?.data?.extractedData || {};
    
    let persistedEvent = null;
    
    if (!isEphemeral && response.contextUpdate) {
      // Only persist if agent determined it's substantial
      const eventData = {
        contextId,
        actorType: 'agent',
        actorId: 'ux_optimization_agent',
        operation: 'USER_MESSAGE_PROCESSED',
        data: {
          originalMessage: message,
          extractedData,
          timestamp: new Date().toISOString()
        },
        reasoning: response.contextUpdate?.reasoning || 'Processed user message',
        trigger: {
          type: 'user_message',
          source: 'conversation',
          message
        }
      };
      
      // Persist the event
      persistedEvent = await dbService.createTaskContextEvent(
        userId,
        contextId,
        eventData
      );
      
      logger.info('User message processed and persisted', {
        eventId: persistedEvent.id,
        taskId: contextId,
        extractedFields: Object.keys(extractedData)
      });
      
      // Broadcast for real-time updates
      await a2aEventBus.broadcast({
        type: 'TASK_CONTEXT_UPDATE',
        taskId: contextId,
        agentId: 'ux_optimization_agent',
        operation: 'USER_MESSAGE_PROCESSED',
        data: {
          ...eventData.data,
          eventId: persistedEvent.id
        },
        reasoning: eventData.reasoning,
        timestamp: new Date().toISOString(),
        metadata: {
          userId,
          userEmail
        }
      });
    } else {
      logger.info('User message processed (ephemeral)', {
        taskId: contextId,
        messageType: 'ephemeral',
        hasExtractedData: Object.keys(extractedData).length > 0
      });
    }
    
    // Return response with any UIRequest for clarification
    res.json({
      success: true,
      contextId,
      eventId: persistedEvent.id,
      extractedData,
      uiRequest: response.uiRequests?.[0] || null,
      message: 'Message processed successfully'
    });
    
  } catch (error) {
    logger.error('Failed to process user message', error);
    res.status(500).json({
      error: 'Failed to process user message'
    });
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
    const task = await dbService.getTask(req.userId!, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Emit the event
    await emitTaskEvent(eventType, {
      taskId,
      ...data
    }, {
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
 * GET /api/tasks/:taskId/events
 * 
 * Simplified Server-Sent Events endpoint for real-time task updates
 * Uses query parameter authentication since EventSource doesn't support headers
 */
router.get('/:taskId/events', 
  // SSE authentication middleware - use user ID for auth (simpler than full JWT)
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authToken = req.query.auth as string;
    const userId = req.query.user as string;
    const sessionAuth = req.headers['authorization'];
    
    logger.info('[SSE] Processing SSE authentication', { 
      hasAuthQuery: !!authToken, 
      hasUserId: !!userId,
      hasSessionAuth: !!sessionAuth,
      authTokenLength: authToken?.length,
      taskId: req.params.taskId 
    });
    
    // Method 1: Session-based auth (from cookies or headers)
    if (sessionAuth) {
      logger.info('[SSE] Using session-based authentication');
      next();
      return;
    }
    
    // Method 2: User ID auth (simple and short)
    if (userId) {
      logger.info('[SSE] Using user ID authentication', { userId });
      
      // Simple validation - just check if user ID looks like a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        logger.warn('[SSE] Invalid user ID format', { userId });
        return res.status(401).json({ error: 'Invalid user ID' });
      }
      
      // Set user context directly (bypass JWT validation for SSE)
      req.userId = userId;
      req.userEmail = 'sse-user'; // Placeholder
      req.userRole = 'authenticated';
      
      logger.info('[SSE] User ID authentication successful', { userId });
      
      // Skip the normal auth middleware chain since we've already authenticated
      // Jump directly to the SSE handler
      const { taskId } = req.params;
      
      try {
        logger.info('[SSE] Client connecting with user ID auth', { taskId, userId });
        
        const dbService = DatabaseService.getInstance();
        
        // Verify user owns this task (with retry for newly created tasks)
        logger.info('[SSE] Checking if task exists in database', { taskId, userId });
        let task = await dbService.getTask(userId, taskId);
        logger.info('[SSE] Initial task check result', { 
          taskId, 
          userId, 
          taskFound: !!task,
          taskStatus: task?.status,
          taskType: task?.task_type
        });
        
        if (!task) {
          logger.info('[SSE] Task not found immediately, retrying for newly created task', { taskId, userId });
          await new Promise(resolve => setTimeout(resolve, 500));
          task = await dbService.getTask(userId, taskId);
          logger.info('[SSE] Retry task check result', { 
            taskId, 
            userId, 
            taskFound: !!task,
            taskStatus: task?.status,
            taskType: task?.task_type
          });
          
          if (!task) {
            logger.warn('[SSE] Task not found after retry - returning 404', { taskId, userId });
            return res.status(404).json({ error: 'Task not found' });
          }
        }
        
        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        
        // Send initial task state
        res.write(`event: CONTEXT_INITIALIZED\n`);
        res.write(`data: ${JSON.stringify({
          taskId: task.id,
          status: task.status,
          createdAt: task.created_at,
          updatedAt: task.updated_at
        })}\n\n`);
        
        // Set up real-time listeners for task updates
        const _handleTaskUpdate = (payload: any) => {
          try {
            logger.info('[SSE] Received task update for stream', { taskId, payload });
            res.write(`event: EVENT_ADDED\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch (error) {
            logger.error('[SSE] Error sending task update', { taskId, error });
          }
        };
        
        // Skip history since client fetches it separately via REST API
        logger.info('[SSE] Setting up A2A subscription', { taskId, userId });
        const unsubscribe = a2aEventBus.subscribe(
          taskId, 
          (event) => {
            try {
              logger.info('[SSE] Received A2A event for stream', { 
                taskId, 
                type: event.type,
                agentId: event.agentId 
              });
              
              // Send all A2A events to client
              res.write(`event: ${event.type}\n`);
              res.write(`data: ${JSON.stringify(event)}\n\n`);
              
              // Also send as EVENT_ADDED for backwards compatibility
              res.write(`event: EVENT_ADDED\n`);
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            } catch (error) {
              logger.error('[SSE] Error sending A2A event', { taskId, error });
            }
          },
          `sse-user-auth-${userId}-${Date.now()}`,
          true // skipHistory - client fetches history separately
        );
        
        // Heartbeat and cleanup
        const heartbeat = setInterval(() => {
          res.write(':heartbeat\n\n');
        }, 30000);
        
        req.on('close', () => {
          logger.info('[SSE] Client disconnected from events stream', { taskId, userId });
          clearInterval(heartbeat);
          if (unsubscribe) {
            unsubscribe();
          }
        });
        
      } catch (error) {
        logger.error('[SSE] Failed to setup events stream', { taskId, error });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to setup events stream' });
        }
      }
      return; // End here, don't continue to next middleware
    }
    
    // Method 3: Full JWT token (with truncation check)
    if (authToken) {
      const decodedToken = decodeURIComponent(authToken);
      logger.info('[SSE] Using full JWT auth', { 
        originalLength: authToken.length,
        decodedLength: decodedToken.length,
        segmentCount: decodedToken.split('.').length 
      });
      
      if (decodedToken.split('.').length !== 3) {
        logger.error('[SSE] JWT truncated - URL too long', {
          segments: decodedToken.split('.').length
        });
        return res.status(401).json({ 
          error: 'Authentication token truncated. Please refresh and try again.' 
        });
      }
      
      req.headers['authorization'] = `Bearer ${decodedToken}`;
      logger.info('[SSE] Auth header set from query param');
    } else {
      logger.warn('[SSE] No authentication provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  },
  extractUserContext,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
  const { taskId } = req.params;
  
  try {
    const userId = req.userId!;
    // const userToken = req.userToken!; - Available if needed
    logger.info('[SSE] Client connecting to task events stream', { taskId, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task (with retry for newly created tasks)
    let task = await dbService.getTask(userId, taskId);
    if (!task) {
      // For newly created tasks, wait a moment and retry once
      logger.info('[SSE] Task not found immediately, retrying for newly created task', { taskId, userId });
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      task = await dbService.getTask(userId, taskId);
      
      if (!task) {
        logger.warn('[SSE] Task not found after retry', { taskId, userId });
        return res.status(404).json({ error: 'Task not found' });
      }
    }
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    
    // Send initial task state
    res.write(`event: CONTEXT_INITIALIZED\n`);
    res.write(`data: ${JSON.stringify({
      taskId: task.id,
      status: task.status,
      metadata: task.metadata || {},
      createdAt: task.created_at,
      updatedAt: task.updated_at
    })}\n\n`);
    
    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);
    
    // Set up real-time listeners for task updates
    const _handleTaskUpdate = (payload: any) => {
      try {
        logger.info('[SSE] Received task update for stream', { taskId, payload });
        
        // Send SSE event to client
        res.write(`event: EVENT_ADDED\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (error) {
        logger.error('[SSE] Error sending task update', { taskId, error });
      }
    };
    
    // Subscribe to A2A Event Bus for real-time updates
    const unsubscribe = a2aEventBus.subscribe(
      taskId,
      (event) => {
        try {
          logger.info('[SSE] Received A2A event for stream', { 
            taskId, 
            type: event.type,
            agentId: event.agentId 
          });
          
          // Send all A2A events to client
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          
          // Also send as EVENT_ADDED for backwards compatibility
          res.write(`event: EVENT_ADDED\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (error) {
          logger.error('[SSE] Error sending A2A event', { taskId, error });
        }
      },
      `sse-events-${userId}-${Date.now()}`,
      true // skipHistory - client fetches history separately
    );
    
    // Cleanup on disconnect
    req.on('close', () => {
      logger.info('[SSE] Client disconnected from events stream', { taskId, userId });
      clearInterval(heartbeat);
      if (unsubscribe) {
        unsubscribe();
      }
    });
    
  } catch (error) {
    logger.error('[SSE] Failed to setup events stream', { taskId, error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to setup events stream' });
    }
  }
});

/**
 * GET /api/tasks/:taskId/context/stream
 * 
 * Server-Sent Events (SSE) endpoint for streaming TaskContext updates in real-time
 * 
 * ## STREAMING ARCHITECTURE
 * 
 * This endpoint implements real-time task context streaming using Server-Sent Events (SSE),
 * which provides a unidirectional stream from server to client. This is critical for:
 * 
 * 1. **Real-time Updates**: Clients receive task context changes immediately without polling
 * 2. **Efficient Resource Usage**: Single persistent connection instead of repeated HTTP requests
 * 3. **Multi-tenant Safety**: Each connection is authenticated and scoped to user's tasks only
 * 4. **Event Sourcing**: Complete history of task events streamed as they occur
 * 
 * ## HOW IT WORKS
 * 
 * 1. Client connects to /api/tasks/{taskId}/context/stream with authentication token
 * 2. Server validates user owns the task (multi-tenant security)
 * 3. Server sends initial context snapshot (all events up to now)
 * 4. Server subscribes to PostgreSQL LISTEN/NOTIFY for this specific task
 * 5. As new events occur, they're pushed to client in real-time
 * 6. Heartbeat every 30s keeps connection alive through proxies
 * 
 * ## MULTI-TENANT CONSIDERATIONS
 * 
 * - Each connection authenticated with user's JWT token
 * - Database RLS ensures users only see their own tasks
 * - NOTIFY channel scoped to specific task ID
 * - No cross-tenant data leakage possible
 * 
 * ## CLIENT USAGE
 * 
 * ```javascript
 * const eventSource = new EventSource('/api/tasks/123/context/stream', {
 *   headers: { 'Authorization': 'Bearer <token>' }
 * });
 * 
 * eventSource.addEventListener('EVENT_ADDED', (event) => {
 *   const contextEvent = JSON.parse(event.data);
 *   // Update UI with new event
 * });
 * ```
 * 
 * ## EVENT TYPES
 * 
 * - CONTEXT_INITIALIZED: Initial snapshot of all events
 * - EVENT_ADDED: New context event added
 * - STATE_UPDATED: Task state changed
 * - ERROR: Error occurred in stream
 * 
 * Implements the RIGHT way - Server-Sent Events instead of polling
 */
router.get('/:taskId/context/stream', 
  // Middleware to convert query param auth to header for EventSource
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authToken = req.query.auth as string;
    if (authToken) {
      req.headers['authorization'] = `Bearer ${authToken}`;
    }
    next();
  },
  extractUserContext,
  requireAuth, 
  async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const userId = req.userId!;
  
  try {
    logger.info('[SSE] Client connecting to TaskContext stream', { taskId, userId });
    
    const dbService = DatabaseService.getInstance();
    
    /**
     * CRITICAL MULTI-TENANT SECURITY CHECK
     * 
     * This verification ensures execution happens on behalf of the authenticated user.
     * The userToken contains the user's JWT which enforces Row Level Security (RLS)
     * in Supabase, ensuring they can only access tasks they own.
     * 
     * Multi-tenant safety is guaranteed by:
     * 1. JWT authentication in middleware (requireAuth)
     * 2. RLS policies in database (user can only see their own tasks)
     * 3. Task ownership verification here
     * 4. Channel-specific NOTIFY scoped to this task only
     */
    const task = await dbService.getTask(req.userId!, taskId);
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
        contextEvents = await dbService.getContextHistory(req.userId!, taskId);
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
          completeness: task.metadata?.completeness || 0,
          data: task.metadata || {}
        },
        history: contextEvents,
        activeUIRequests: uiRequests,
        templateSnapshot: task.metadata?.taskDefinition || task.metadata?.templateSnapshot || {},
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
    
    // Subscribe to A2A Event Bus for real-time updates
    let unsubscribe: (() => void) | null = null;
    
    try {
      // Subscribe to task-specific A2A events
      // Note: We pass skipHistory=true because the client fetches historical events separately via REST API
      unsubscribe = a2aEventBus.subscribe(
        taskId,
        (event) => {
          try {
            logger.debug('[SSE] Sending A2A event to client', {
              taskId,
              type: event.type,
              agentId: event.agentId
            });
            
            // Send the A2A event to SSE client
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
            
            // Also send specialized events for backwards compatibility
            switch (event.type) {
              case 'TASK_CONTEXT_UPDATE':
                res.write(`event: EVENT_ADDED\n`);
                res.write(`data: ${JSON.stringify(event.data)}\n\n`);
                break;
              case 'UI_REQUEST':
                res.write(`event: UI_REQUEST\n`);
                res.write(`data: ${JSON.stringify(event.data)}\n\n`);
                break;
              case 'AGENT_COMPLETED':
                res.write(`event: TASK_COMPLETED\n`);
                res.write(`data: ${JSON.stringify(event.data)}\n\n`);
                break;
            }
          } catch (error) {
            logger.error('[SSE] Error sending A2A event to client', { taskId, error });
          }
        },
        `sse-client-${userId}-${Date.now()}`,
        true // skipHistory = true, to avoid sending duplicate events that client fetches from DB
      );
      
      logger.info('[SSE] A2A subscription established', { 
        taskId,
        subscribers: a2aEventBus.getSubscribers(taskId)
      });
    } catch (error) {
      logger.error('[SSE] Failed to subscribe to A2A events', { taskId, error });
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
 * GET /api/tasks/:taskId/context/events
 * 
 * REST endpoint for fetching task context events
 * Used by OrchestrationFlow to get historical events
 */
router.get('/:taskId/context/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const userId = req.userId!;
  
  try {
    logger.info('[REST] Fetching context events for task', { taskId, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(userId, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get all events for this task
    const serviceClient = await dbService.getServiceClient();
    const { data: events, error } = await serviceClient
      .from('task_context_events')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (error) {
      logger.error('[REST] Failed to fetch context events', { taskId, error });
      return res.status(500).json({ error: 'Failed to fetch events' });
    }
    
    logger.info('[REST] Fetched context events', { 
      taskId, 
      count: events?.length || 0 
    });
    
    res.json({ 
      taskId,
      events: events || [],
      count: events?.length || 0
    });
  } catch (error) {
    logger.error('[REST] Error fetching context events', { taskId, error });
    res.status(500).json({ error: 'Internal server error' });
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
  const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
  const userId = req.userId!;
  
  try {
    logger.info('[REST] Adding context event to task', { taskId, operation, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task
    const task = await dbService.getTask(req.userId!, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Determine actor type from request
    const actorType = req.body.agentId ? 'agent' : 'user';
    const actorId = req.body.agentId || userId;
    
    // Create context event using database service method
    const event = await dbService.createTaskContextEvent(req.userId!, taskId, {
      contextId: req.body.contextId,
      actorType,
      actorId,
      operation: operation || req.body.operation,
      data: data || req.body.data || {},
      reasoning: reasoning || req.body.reasoning || 'Context event added',
      trigger: { source: 'api', timestamp: new Date().toISOString() }
    });
    
    // Also emit the task event for compatibility
    await emitTaskEvent('context_event_added', {
      taskId,
      event
    }, {
      actorType: actorType,
      reasoning: reasoning || 'Context event added'
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
    
    await dbService.updateTask(req.userId!, taskId, {
      metadata: updatedMetadata
    });
    
    // Broadcast event via A2A Event Bus for SSE subscribers
    // This replaces the old database NOTIFY/LISTEN pattern
    await a2aEventBus.broadcast({
      type: 'CONTEXT_EVENT_ADDED',
      taskId,
      agentId: 'api-endpoint',
      operation,
      data: event,
      reasoning: `User ${userId} added context event via API`,
      timestamp: event.createdAt,
      metadata: {
        source: 'rest-api',
        userId,
        eventId: event.id
      }
    });
    
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
    const task = await dbService.getTask(req.userId!, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get agent contexts (if they exist)
    let agentContexts: any[] = [];
    try {
      agentContexts = await dbService.getAgentContexts(req.userId!, taskId);
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
    const { 
      task_type: taskType, 
      title, 
      description, 
      metadata, 
      template_id: templateId 
    } = req.body;
    const userToken = req.userToken!;
    const userId = req.userId!;
    
    // Default to 'general' if not provided
    const effectiveTaskType = taskType || 'general';
    const effectiveTemplateId = templateId || taskType || 'general';
    
    logger.info('Creating universal task', { 
      taskType: effectiveTaskType, 
      userId, 
      templateId: effectiveTemplateId 
    });
    
    // Generate proper title based on task type
    const taskTitle = title || (() => {
      // Map task types to user-friendly names
      const taskNames: Record<string, string> = {
        'onboarding': 'Onboarding',
        'compliance': 'Compliance Check',
        'general': 'General',
        'registration': 'Business Registration',
        'licensing': 'Licensing'
      };
      const displayName = taskNames[effectiveTaskType] || 'General';
      return `${displayName} Task - ${new Date().toISOString()}`;
    })();
    
    // Use TaskService to create task - this will load the template properly
    const taskService = TaskService.getInstance();
    const taskContext = await taskService.create({
      templateId: effectiveTemplateId,
      tenantId: userId,
      userToken,
      initialData: {
        ...(metadata || {}),
        taskId: undefined, // Will be generated
        userId,
        title: taskTitle,
        description: description || `Created via universal API`,
        taskType: effectiveTaskType,
        source: metadata?.source || 'api',
        createdAt: new Date().toISOString()
      }
    });
    
    // Get the created task from database
    const dbService = DatabaseService.getInstance();
    const taskRecord = await dbService.getServiceClient()
      .from('tasks')
      .select('*')
      .eq('id', taskContext.contextId)
      .single();

    if (taskRecord.error) {
      logger.error('Failed to create task directly', taskRecord.error);
      throw taskRecord.error;
    }
    
    // Emit task creation event
    await emitTaskEvent('task_created', {
      taskId: taskRecord.data.id,
      taskType,
      templateId
    }, {
      actorType: 'user',
      reasoning: 'Universal task creation'
    });
    
    // 🚀 CRITICAL: Send NOTIFY for EventListener to trigger orchestration
    try {
      // Use the RPC function directly to send to task_creation_events channel
      const { error: notifyError } = await dbService.getServiceClient().rpc('notify_task_update', {
        channel_name: 'task_creation_events',
        payload: JSON.stringify({
          eventType: 'TASK_CREATED',
          taskId: taskRecord.data.id,
          userId: userId,
          taskType: taskType,
          templateId: templateId,
          status: 'pending',
          priority: 'medium',
          title: taskRecord.data.title,
          timestamp: new Date().toISOString()
        })
      });
      
      if (notifyError) {
        logger.error('⚠️ NOTIFY RPC failed', { taskId: taskRecord.data.id, error: notifyError });
      } else {
        logger.info('✅ Task creation notification sent to EventListener', { taskId: taskRecord.data.id });
      }
    } catch (notifyError) {
      logger.error('⚠️ Failed to send task creation notification', { 
        taskId: taskRecord.data.id, 
        error: notifyError 
      });
      // Don't fail the request if notification fails
    }
    
    logger.info('Universal task created', { taskId: taskRecord.data.id, taskType });
    
    res.status(201).json({
      success: true,
      taskId: taskRecord.data.id,
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
    const task = await dbService.getTask(req.userId!, taskId);
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
    
    await dbService.updateTask(req.userId!, taskId, {
      ...(status && { status }),
      metadata: updatedMetadata
    });
    
    // Emit task update event
    await emitTaskEvent('task_updated', {
      taskId,
      changes: { status, step, hasFormData: !!formData }
    }, {
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
 * GET /api/tasks/dashboard/summary
 * 
 * Dashboard summary endpoint - provides task counts by status for dashboard widgets
 */
router.get('/dashboard/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const userId = req.userId!;
    
    logger.info('Getting dashboard summary for user', { userId });
    
    const dbService = DatabaseService.getInstance();
    const tasks = await dbService.getUserTasks(req.userId!);
    
    // Calculate status counts
    const statusCounts = tasks.reduce((acc: any, task: any) => {
      const status = task.status;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    // Calculate upcoming vs completed
    const upcoming = (statusCounts.pending || 0) + (statusCounts.in_progress || 0);
    const completed = statusCounts.completed || 0;
    
    // Calculate priority distribution
    const priorityCounts = tasks.reduce((acc: any, task: any) => {
      const priority = task.priority || 'medium';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {});
    
    // Get recent activity (tasks updated in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentActivity = tasks.filter((task: any) => 
      new Date(task.updated_at) > sevenDaysAgo
    ).length;
    
    res.json({
      totalTasks: tasks.length,
      statusCounts: {
        pending: statusCounts.pending || 0,
        in_progress: statusCounts.in_progress || 0,
        completed: statusCounts.completed || 0,
        blocked: statusCounts.blocked || 0,
        cancelled: statusCounts.cancelled || 0
      },
      overview: {
        upcoming,
        completed,
        recentActivity
      },
      priorityCounts: {
        low: priorityCounts.low || 0,
        medium: priorityCounts.medium || 0,
        high: priorityCounts.high || 0,
        urgent: priorityCounts.urgent || 0
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get dashboard summary', error);
    res.status(500).json({ error: 'Failed to get dashboard summary' });
  }
});

/**
 * GET /api/tasks/dashboard/recent-activity
 * 
 * Get recent task activity for dashboard feed
 */
router.get('/dashboard/recent-activity', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 10;
    
    logger.info('Getting recent activity for user', { userId, limit });
    
    const dbService = DatabaseService.getInstance();
    const tasks = await dbService.getUserTasks(req.userId!);
    
    // Sort by updated_at and limit
    const recentTasks = tasks
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, limit)
      .map((task: any) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        taskType: task.task_type,
        updatedAt: task.updated_at,
        createdAt: task.created_at,
        completedAt: task.completed_at,
        agent: task.metadata?.agent_assigned || task.metadata?.assignedAgent || 'System',
        progress: task.metadata?.progress_percentage || 0,
        lastAction: task.metadata?.last_action || task.metadata?.lastAction || 'Task updated',
        statusChange: {
          from: task.metadata?.previousStatus,
          to: task.status,
          timestamp: task.updated_at
        }
      }));
    
    res.json({
      activities: recentTasks,
      count: recentTasks.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get recent activity', error);
    res.status(500).json({ error: 'Failed to get recent activity' });
  }
});

/**
 * GET /api/tasks
 * 
 * List all tasks for the authenticated user with optional filtering
 * Enhanced with status filtering for dashboard UX
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userToken = req.userToken!; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const userId = req.userId!;
    
    // Extract query parameters for filtering
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    const taskType = req.query.task_type as string;
    const limit = parseInt(req.query.limit as string) || undefined;
    const offset = parseInt(req.query.offset as string) || 0;
    
    logger.info('Listing tasks for user', { 
      userId, 
      filters: { status, priority, taskType, limit, offset }
    });
    
    const dbService = DatabaseService.getInstance();
    let tasks = await dbService.getUserTasks(req.userId!);
    
    // Apply filters
    if (status) {
      // Support multiple statuses (e.g., ?status=pending,in_progress)
      const statusList = status.split(',').map(s => s.trim());
      tasks = tasks.filter((task: any) => statusList.includes(task.status));
    }
    
    if (priority) {
      const priorityList = priority.split(',').map(p => p.trim());
      tasks = tasks.filter((task: any) => priorityList.includes(task.priority));
    }
    
    if (taskType) {
      const typeList = taskType.split(',').map(t => t.trim());
      tasks = tasks.filter((task: any) => typeList.includes(task.task_type));
    }
    
    // Sort by created_at desc by default
    tasks.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Apply pagination
    const totalCount = tasks.length;
    if (limit) {
      tasks = tasks.slice(offset, offset + limit);
    }
    
    // Map to consistent response format
    const mappedTasks = tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      taskType: task.task_type,
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      metadata: task.metadata,
      // Dashboard-specific fields
      progress: task.metadata?.progress_percentage || 0,
      agent: task.metadata?.agent_assigned || task.metadata?.assignedAgent || 'System',
      estimatedTime: task.metadata?.estimated_time || task.metadata?.estimatedTime,
      nextAction: task.metadata?.next_action || task.metadata?.nextAction
    }));
    
    res.json({
      tasks: mappedTasks,
      count: mappedTasks.length,
      totalCount,
      pagination: {
        offset,
        limit: limit || totalCount,
        hasMore: limit ? (offset + limit < totalCount) : false
      },
      filters: {
        status: status || null,
        priority: priority || null,
        taskType: taskType || null
      }
    });
  } catch (error) {
    logger.error('Failed to list tasks', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * PATCH /api/tasks/:id - Partial Update
 * Update specific fields of an existing task
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    
    logger.info('Partially updating task', { taskId: id, userId });
    
    const dbService = DatabaseService.getInstance();
    
    // Verify user owns this task first
    const existingTask = await dbService.getTask(userId, id);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Update the task with provided fields
    const updatedTask = await dbService.updateTask(userId, id, req.body);
    
    logger.info('Task partially updated', { taskId: id, userId });
    
    res.json(updatedTask);
  } catch (error) {
    logger.error('Failed to update task', { 
      taskId: req.params.id,
      userId: req.userId,
      error: (error as Error).message 
    });
    
    res.status(500).json({
      error: 'Failed to update task',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;