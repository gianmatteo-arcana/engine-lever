/**
 * API Routes v2 - Using Dependency Injection
 * Replaces singleton patterns with request-scoped services
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { AgentManager, convertPriority, TaskPriority } from '../agents';
import { TemplateExecutor } from '../templates/executor';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getDatabaseService, getTaskService } from '../services/dependency-injection';
import { RequestContextService } from '../services/request-context';
import tasksRoutes from './tasks';

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
    module: 'api',
    requestId: RequestContextService.getContext()?.requestId
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
    
    // Use request-scoped services
    const dbService = getDatabaseService();
    const taskService = getTaskService();
    
    // Use the authenticated user's ID and token from the middleware
    const userId = req.userId!;
    const userToken = req.userToken!;
    
    RequestContextService.log('info', 'Creating new task', { 
      userId, 
      businessId: taskRequest.businessId,
      templateId: taskRequest.templateId
    });
    
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
    
    RequestContextService.log('info', 'Task created successfully', { taskId, executionId });
    
    res.json({
      success: true,
      taskId,
      executionId,
      timestamp: new Date().toISOString(),
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Task creation failed', { error: error.message });
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Task creation failed',
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

// Get task status (requires auth)
router.get('/tasks/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!;
    
    // Use request-scoped database service
    const dbService = getDatabaseService();
    
    RequestContextService.log('info', 'Fetching task status', { taskId });
    
    const task = await dbService.getTask(userToken, taskId);
    
    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    res.json({
      success: true,
      task,
      timestamp: new Date().toISOString(),
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to get task status', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to get task status',
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

// Get user's tasks (requires auth)
router.get('/tasks', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userToken = req.userToken!;
    const { status, businessId, limit } = req.query;
    
    // Use request-scoped database service
    const dbService = getDatabaseService();
    
    RequestContextService.log('info', 'Fetching user tasks', { 
      status, 
      businessId, 
      limit 
    });
    
    const tasks = await dbService.getUserTasks(userToken, {
      status: status as string,
      businessId: businessId as string,
      limit: limit ? parseInt(limit as string) : undefined
    });
    
    res.json({
      success: true,
      tasks,
      count: tasks.length,
      timestamp: new Date().toISOString(),
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to get user tasks', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to get user tasks',
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

// Include other task routes
router.use('/', tasksRoutes);

// Agent status endpoints (public)
router.get('/agents/status', (req, res) => {
  const agents = AgentManager.getAllAgentsStatus();
  res.json({
    success: true,
    agents,
    timestamp: new Date().toISOString(),
    requestId: RequestContextService.getContext()?.requestId
  });
});

router.get('/agents/status/:agentId', (req, res) => {
  const { agentId } = req.params;
  const status = AgentManager.getAgentStatus(agentId);
  
  if (!status) {
    return res.status(404).json({ 
      error: 'Agent not found',
      requestId: RequestContextService.getContext()?.requestId
    });
  }
  
  res.json({
    success: true,
    status,
    timestamp: new Date().toISOString(),
    requestId: RequestContextService.getContext()?.requestId
  });
});

// Tool endpoints (requires auth for invocation)
router.get('/tools', (req, res) => {
  res.json({
    success: true,
    tools: AgentManager.getAvailableTools(),
    timestamp: new Date().toISOString(),
    requestId: RequestContextService.getContext()?.requestId
  });
});

router.post('/tools/:toolName/invoke', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { toolName } = req.params;
    const userId = req.userId!;
    const userToken = req.userToken!;
    
    RequestContextService.log('info', 'Invoking tool', { 
      toolName, 
      userId 
    });
    
    const result = await AgentManager.invokeTool(toolName, {
      ...req.body,
      userId,
      userToken
    });
    
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Tool invocation failed', { error: error.message });
    res.status(500).json({ 
      error: 'Tool invocation failed', 
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

// Queue status endpoint (public)
router.get('/queues/status', (req, res) => {
  res.json({
    success: true,
    message: 'Queue status endpoint',
    timestamp: new Date().toISOString(),
    requestId: RequestContextService.getContext()?.requestId
  });
});

export { router as apiRoutesV2 };