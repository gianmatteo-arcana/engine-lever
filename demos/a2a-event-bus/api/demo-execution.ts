/**
 * Demo Task Execution API
 * 
 * Enhanced API endpoints specifically for the A2A Event Bus production demo.
 * Supports multi-agent coordination, real-time event streaming, and demo visualization.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UnifiedEventBus } from '../services/event-bus';
import { BusinessDiscoveryAgent } from '../agents/demo/BusinessDiscoveryAgent';
import { ComplianceAnalyzer } from '../agents/demo/ComplianceAnalyzer';
import { DatabaseService } from '../services/database';
import { logger } from '../utils/logger';
import { RequestContext, Task, TaskStatusUpdateEvent } from '../types/a2a-types';

const router = Router();

// Validation schemas
const TaskExecutionSchema = z.object({
  userMessage: z.object({
    content: z.array(z.string()),
    role: z.enum(['user', 'assistant'])
  }),
  taskId: z.string(),
  contextId: z.string(),
  agentName: z.string().optional(),
  phase: z.string().optional()
});

const _ContextQuerySchema = z.object({
  contextId: z.string(),
  fromSequence: z.number().optional()
});

/**
 * Execute a task with A2A agent coordination
 * Demonstrates multi-agent workflows through the event bus
 */
router.post('/tasks/:taskId/execute', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId;
    const executionRequest = TaskExecutionSchema.parse(req.body);
    const userContext = (req as any).userContext;

    logger.info('Demo task execution requested', {
      taskId,
      agentName: executionRequest.agentName,
      phase: executionRequest.phase,
      userId: userContext?.userId
    });

    // Create event bus for this context
    const eventBus = new UnifiedEventBus(executionRequest.contextId, taskId);

    // Determine which agent to execute based on request
    const agent = await createDemoAgent(executionRequest.agentName, userContext.businessId, userContext.userId);
    
    if (!agent) {
      return res.status(400).json({
        error: 'Unknown agent requested',
        supportedAgents: ['BusinessDiscoveryAgent', 'ComplianceAnalyzer', 'DataCollectionAgent', 'CommunicationAgent']
      });
    }

    // Create A2A request context
    const requestContext: RequestContext = {
      userMessage: executionRequest.userMessage,
      taskId,
      contextId: executionRequest.contextId,
      task: await getTaskContext(taskId, userContext.userId)
    };

    // Execute agent asynchronously and return immediately
    // The real coordination happens through the event bus
    executeAgentAsync(agent, requestContext, eventBus, executionRequest.phase);

    res.json({
      status: 'executing',
      message: `${executionRequest.agentName || 'Agent'} execution started`,
      taskId,
      contextId: executionRequest.contextId,
      phase: executionRequest.phase,
      eventBusActive: true
    });

  } catch (error) {
    logger.error('Demo task execution failed', {
      taskId: req.params.taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request format',
        details: error.errors
      });
    }

    res.status(500).json({
      error: 'Task execution failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get task context and event history
 * Demonstrates event persistence and reconstruction
 */
router.get('/tasks/:taskId/context', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId;
    const userContext = (req as any).userContext;
    const query = req.query as any;

    logger.info('Getting task context', {
      taskId,
      contextId: query.contextId,
      userId: userContext?.userId
    });

    // Get task from database
    const dbService = DatabaseService.getInstance();
    const task = await dbService.getTask(userContext.userToken, taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get context history (events)
    const history = await dbService.getContextHistory(userContext.userToken, query.contextId || taskId);

    // Reconstruct current state from events
    const currentState = reconstructStateFromEvents(history);

    res.json({
      taskId,
      contextId: query.contextId || taskId,
      currentState,
      history: history.map(event => ({
        entryId: event.id,
        timestamp: event.created_at,
        sequenceNumber: event.sequence_number,
        actor: {
          type: event.actor_type,
          id: event.actor_id,
          version: '1.0.0'
        },
        operation: event.operation,
        data: event.data,
        reasoning: event.reasoning
      })),
      metadata: {
        totalEvents: history.length,
        lastUpdated: history[history.length - 1]?.created_at
      }
    });

  } catch (error) {
    logger.error('Error fetching task context', {
      taskId: req.params.taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to fetch task context',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get real-time event stream for a context
 * Demonstrates SSE streaming capabilities
 */
router.get('/tasks/stream', (req: Request, res: Response) => {
  const contextId = req.query.contextId as string;
  
  if (!contextId) {
    return res.status(400).json({ error: 'contextId parameter required' });
  }

  logger.info('SSE stream requested', { contextId });

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connection_established',
    contextId,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Create event bus for this context to listen for events
  const eventBus = new UnifiedEventBus(contextId, 'demo-stream');
  
  // Set up event listeners
  const eventHandler = (event: any) => {
    const sseData = {
      type: 'agent_event',
      contextId,
      timestamp: new Date().toISOString(),
      data: event
    };

    res.write(`data: ${JSON.stringify(sseData)}\n\n`);
  };

  eventBus.on('event', eventHandler);

  // Send periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({
      type: 'heartbeat',
      timestamp: new Date().toISOString()
    })}\n\n`);
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    logger.info('SSE client disconnected', { contextId });
    eventBus.off('event', eventHandler);
    clearInterval(heartbeat);
  });
});

/**
 * Get demo statistics and metrics
 * Shows comprehensive demo insights
 */
router.get('/demo/stats', async (req: Request, res: Response) => {
  try {
    const _dbService = DatabaseService.getInstance();
    const _userContext = (req as any).userContext;

    // Get demo-related statistics
    const stats = {
      totalDemoTasks: 0, // Would query database for demo tasks
      totalEvents: 0,    // Would query events table
      activeContexts: 0, // Would check active SSE connections
      agentsExecuted: ['BusinessDiscoveryAgent', 'ComplianceAnalyzer'],
      demoFeatures: {
        multiAgentCoordination: true,
        realTimeStreaming: true,
        eventPersistence: true,
        a2aProtocol: true,
        eventReconstruction: true
      },
      lastDemoRun: new Date().toISOString()
    };

    res.json(stats);

  } catch (error) {
    logger.error('Error fetching demo stats', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to fetch demo statistics'
    });
  }
});

/**
 * Helper: Create appropriate demo agent based on name
 */
async function createDemoAgent(agentName: string | undefined, businessId: string, userId?: string): Promise<any> {
  switch (agentName) {
    case 'BusinessDiscoveryAgent':
      return new BusinessDiscoveryAgent(businessId, userId);
    case 'ComplianceAnalyzer':
      return new ComplianceAnalyzer(businessId, userId);
    case 'DataCollectionAgent':
      // Would create actual DataCollectionAgent
      return new BusinessDiscoveryAgent(businessId, userId); // Fallback for demo
    case 'CommunicationAgent':
      // Would create actual CommunicationAgent
      return new ComplianceAnalyzer(businessId, userId); // Fallback for demo
    default:
      return null;
  }
}

/**
 * Helper: Execute agent asynchronously and publish events
 */
async function executeAgentAsync(
  agent: any,
  requestContext: RequestContext,
  eventBus: UnifiedEventBus,
  phase?: string
): Promise<void> {
  try {
    logger.info('Starting async agent execution', {
      agentType: agent.constructor.name,
      taskId: requestContext.taskId,
      phase
    });

    // Publish phase start event
    if (phase) {
      const phaseStartEvent: TaskStatusUpdateEvent = {
        taskId: requestContext.taskId,
        status: 'running',
        final: false
      };
      await eventBus.publish(phaseStartEvent);
    }

    // Execute the agent
    await agent.execute(requestContext, eventBus);

    logger.info('Agent execution completed', {
      agentType: agent.constructor.name,
      taskId: requestContext.taskId,
      phase
    });

  } catch (error) {
    logger.error('Async agent execution failed', {
      agentType: agent.constructor.name,
      taskId: requestContext.taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Publish error event
    const errorEvent: TaskStatusUpdateEvent = {
      taskId: requestContext.taskId,
      status: 'failed',
      final: true
    };
    await eventBus.publish(errorEvent);
  }
}

/**
 * Helper: Get task context for A2A execution
 */
async function getTaskContext(taskId: string, _userId: string): Promise<Task | undefined> {
  try {
    const _dbService = DatabaseService.getInstance();
    // This would get the actual task - for demo we return a mock
    return {
      id: taskId,
      status: 'running',
      result: {
        demo: true,
        created: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Failed to get task context', { taskId, error });
    return undefined;
  }
}

/**
 * Helper: Reconstruct current state from event history
 */
function reconstructStateFromEvents(events: any[]): any {
  // Simple state reconstruction - would be more sophisticated in production
  const lastEvent = events[events.length - 1];
  
  return {
    status: 'running',
    phase: 'processing',
    completeness: Math.min(100, (events.length / 10) * 100),
    data: lastEvent?.data || {},
    lastUpdate: lastEvent?.created_at || new Date().toISOString()
  };
}

export default router;