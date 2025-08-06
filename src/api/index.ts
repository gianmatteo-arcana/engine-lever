import { Router } from 'express';
import { logger } from '../utils/logger';
import { AgentManager, convertPriority, TaskPriority } from '../agents';
import { TemplateExecutor } from '../templates/executor';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { onboardingRoutes } from './onboarding';

const router = Router();
const templateExecutor = new TemplateExecutor();

// Initialize template executor
templateExecutor.initialize().catch(error => {
  logger.error('Failed to initialize template executor', error);
});

// Health check for API (no auth required)
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    module: 'api'
  });
});

// Task creation endpoint (requires auth)
const CreateTaskSchema = z.object({
  businessId: z.string(),
  templateId: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  deadline: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

router.post('/tasks', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const taskRequest = CreateTaskSchema.parse(req.body);
    
    // Use the authenticated user's ID and token from the middleware
    const userId = req.userId!;
    const userToken = req.userToken!;
    
    logger.info(`Creating new task for user ${userId}`, taskRequest);
    
    // Create task through AgentManager with the authenticated user's ID and token
    const taskData = {
      ...taskRequest,
      userId, // Always use the authenticated user's ID
      userToken // Pass the JWT token for RLS
    };
    
    const taskId = await AgentManager.createTask(taskData);
    
    // Start template execution if templateId provided
    let executionId: string | undefined;
    if (taskRequest.templateId) {
      const taskContext = {
        taskId,
        userId, // Use authenticated user ID
        userToken, // Pass token for database operations
        businessId: taskRequest.businessId,
        templateId: taskRequest.templateId,
        priority: convertPriority(taskRequest.priority || 'medium'),
        deadline: taskRequest.deadline ? new Date(taskRequest.deadline) : undefined,
        metadata: taskRequest.metadata || {},
        auditTrail: []
      };
      
      executionId = await templateExecutor.executeTemplate(taskRequest.templateId, taskContext);
    }
    
    res.json({
      success: true,
      taskId,
      executionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Task creation failed:', error);
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : 'Task creation failed' 
    });
  }
});

// Get task status (requires auth, RLS ensures user can only access their own tasks)
router.get('/tasks/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { taskId } = req.params;
  const userToken = req.userToken!;
  
  try {
    // Get task status using JWT token (RLS will handle authorization)
    const status = await AgentManager.getTaskStatus(taskId, userToken);
    
    if (!status) {
      // Task not found or user doesn't have access (RLS filtered it out)
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get task status for ${taskId}:`, error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

// Get user's tasks (requires auth, RLS automatically filters to user's tasks)
router.get('/tasks', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const userToken = req.userToken!;
  
  try {
    // Get user tasks using JWT token (RLS automatically filters)
    const tasks = await AgentManager.getUserTasks(userToken);
    
    res.json({
      tasks,
      count: tasks.length,
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to fetch tasks for user ${userId}:`, error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get execution status (requires auth, verifies ownership)
router.get('/executions/:executionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { executionId } = req.params;
  const userId = req.userId!;
  
  const execution = templateExecutor.getExecution(executionId);
  
  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }
  
  // Verify the execution belongs to the user
  if (execution.taskContext?.userId !== userId) {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'You do not have access to this execution'
    });
  }
  
  res.json({
    executionId,
    status: execution.status,
    currentStep: execution.currentStep,
    completedSteps: execution.completedSteps,
    errors: execution.errors,
    startTime: execution.startTime,
    endTime: execution.endTime
  });
});

// Agent management endpoints (read-only, no user filtering needed)
router.get('/agents', (req, res) => {
  const agents = AgentManager.getAllAgentsStatus();
  
  res.json({ 
    agents,
    count: agents.length,
    timestamp: new Date().toISOString()
  });
});

router.get('/agents/:role', (req, res) => {
  const { role } = req.params;
  const status = AgentManager.getAgentStatus(role as any);
  
  if (status.status === 'not_found') {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  res.json({
    role,
    ...status,
    timestamp: new Date().toISOString()
  });
});

// MCP tool endpoints (public info endpoints)
router.get('/tools', (req, res) => {
  res.json({
    tools: [
      { name: 'ca-sos-portal', description: 'California Secretary of State Portal' },
      { name: 'quickbooks', description: 'QuickBooks Integration' },
      { name: 'plaid', description: 'Banking Data via Plaid' },
      { name: 'document-generator', description: 'Document Generation Service' }
    ],
    count: 4,
    timestamp: new Date().toISOString()
  });
});

// Tool invocation (requires auth)
router.post('/tools/:toolName/invoke', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { toolName } = req.params;
  const userId = req.userId!;
  
  logger.info(`Tool invocation request from user ${userId}: ${toolName}`, req.body);
  
  // Add user context to tool invocation
  const _toolContext = {
    ...req.body,
    userId,
    userEmail: req.userEmail
  };
  
  // TODO: Implement actual MCP tool invocation with user context
  res.json({
    status: 'tool_invoked',
    toolName,
    userId,
    result: 'Tool execution pending implementation',
    timestamp: new Date().toISOString()
  });
});

// SOI specific endpoint (requires auth)
router.post('/soi/file', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!; // Use authenticated user ID
    const userToken = req.userToken!; // Use JWT token for RLS
    const { businessId, businessData } = req.body;
    
    if (!businessId) {
      return res.status(400).json({ error: 'Missing required field: businessId' });
    }
    
    logger.info(`SOI filing request from user ${userId} for business ${businessId}`);
    
    // Create SOI filing task with authenticated user ID and token
    const taskRequest = {
      userId,
      userToken,
      businessId,
      templateId: 'soi-filing',
      priority: 'high' as const,
      metadata: {
        businessType: businessData?.businessType || 'LLC',
        incorporationDate: businessData?.incorporationDate || new Date().toISOString(),
        ...businessData
      }
    };
    
    const taskId = await AgentManager.createTask(taskRequest);
    
    // Execute SOI template
    const taskContext = {
      taskId,
      userId,
      userToken,
      businessId,
      templateId: 'soi-filing',
      priority: TaskPriority.HIGH,
      metadata: taskRequest.metadata,
      auditTrail: []
    };
    
    const executionId = await templateExecutor.executeTemplate('soi-filing', taskContext);
    
    res.json({
      success: true,
      message: 'SOI filing initiated',
      taskId,
      executionId,
      userId,
      estimatedCompletion: '1-2 business days',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('SOI filing failed:', error);
    res.status(500).json({ error: 'SOI filing failed' });
  }
});

// Queue status endpoints (public info)
router.get('/queues/status', (req, res) => {
  res.json({
    queues: {
      agents: { 
        active: AgentManager.getAllAgentsStatus().filter(a => a.status === 'working').length,
        idle: AgentManager.getAllAgentsStatus().filter(a => a.status === 'idle').length,
        error: AgentManager.getAllAgentsStatus().filter(a => a.status === 'error').length
      },
      executions: {
        running: templateExecutor.getAllExecutions().filter(e => e.status === 'running').length,
        completed: templateExecutor.getAllExecutions().filter(e => e.status === 'completed').length,
        failed: templateExecutor.getAllExecutions().filter(e => e.status === 'failed').length
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Mount onboarding routes
router.use('/onboarding', onboardingRoutes);


export { router as apiRoutes };