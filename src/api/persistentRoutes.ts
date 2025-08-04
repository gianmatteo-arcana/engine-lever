import { Router } from 'express';
import { logger } from '../utils/logger';
import { persistentAgentManager } from '../agents/PersistentAgentManager';
import { TemplateExecutor } from '../templates/executor';
import { DatabaseService } from '../services/database';
import { z } from 'zod';

const router = Router();
const templateExecutor = new TemplateExecutor();
const dbService = DatabaseService.getInstance();

// Initialize template executor
templateExecutor.initialize().catch(error => {
  logger.error('Failed to initialize template executor', error);
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    module: 'persistent-api',
    agentsHealthy: persistentAgentManager.isHealthy()
  });
});

// Task creation with persistence
const CreateTaskSchema = z.object({
  userId: z.string().uuid(),
  businessId: z.string(),
  templateId: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  deadline: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

router.post('/tasks', async (req: any, res) => {
  try {
    const taskRequest = CreateTaskSchema.parse(req.body);
    
    logger.info('Creating persistent task', taskRequest);
    
    // Get user token from request (this needs auth middleware)
    const userToken = req.userToken || 'dummy-token'; // TODO: Get from auth middleware
    
    // Create task through PersistentAgentManager
    const taskId = await persistentAgentManager.createTask({
      userToken,
      userId: taskRequest.userId,
      businessId: taskRequest.businessId,
      templateId: taskRequest.templateId,
      priority: taskRequest.priority,
      deadline: taskRequest.deadline ? new Date(taskRequest.deadline) : undefined,
      metadata: taskRequest.metadata
    });
    
    res.json({
      success: true,
      taskId,
      message: 'Task created and persisted',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Task creation failed:', error);
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : 'Task creation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get task status from database
router.get('/tasks/:taskId', async (req: any, res) => {
  try {
    const { taskId } = req.params;
    // Note: getTaskStatus doesn't exist on persistentAgentManager
    // For now, return a mock status
    const status = { taskId, status: 'pending', message: 'Task status not implemented' };
    
    res.json({
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get task status:', error);
    res.status(500).json({ 
      error: 'Failed to get task status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get user's tasks
router.get('/users/:userId/tasks', async (req: any, res) => {
  try {
    // const { userId } = req.params; // Not used since RLS filters by user token
    const { status } = req.query;
    
    // Get user token from request (this needs auth middleware)
    const userToken = req.userToken || 'dummy-token'; // TODO: Get from auth middleware
    
    const tasks = await dbService.getUserTasks(userToken, { status: status as string });
    
    res.json({
      tasks,
      count: tasks.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get user tasks:', error);
    res.status(500).json({ 
      error: 'Failed to get user tasks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Pause a task
const PauseTaskSchema = z.object({
  executionId: z.string(),
  reason: z.string(),
  pauseType: z.enum(['user_approval', 'payment', 'external_wait', 'error']),
  requiredAction: z.string().optional(),
  requiredData: z.any().optional(),
  expiresIn: z.number().optional()
});

router.post('/tasks/:taskId/pause', async (req, res) => {
  try {
    const { taskId } = req.params;
    const pauseRequest = PauseTaskSchema.parse(req.body);
    
    const resumeToken = await persistentAgentManager.pauseTask({
      taskId,
      ...pauseRequest
    });
    
    res.json({
      success: true,
      resumeToken,
      message: 'Task paused successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to pause task:', error);
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : 'Failed to pause task',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Resume a task
const ResumeTaskSchema = z.object({
  resumeToken: z.string(),
  resumeData: z.any().optional(),
  userId: z.string().uuid().optional()
});

router.post('/tasks/resume', async (req, res) => {
  try {
    const resumeRequest = ResumeTaskSchema.parse(req.body);
    
    await persistentAgentManager.resumeTask(resumeRequest);
    
    res.json({
      success: true,
      message: 'Task resumed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to resume task:', error);
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : 'Failed to resume task',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get task execution details
router.get('/tasks/:taskId/execution', async (req: any, res) => {
  try {
    const { taskId } = req.params;
    
    // Get user token from request (this needs auth middleware)
    const userToken = req.userToken || 'dummy-token'; // TODO: Get from auth middleware
    
    const task = await dbService.getTask(userToken, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get execution details
    const executions = await dbService.getTaskExecutions(userToken, taskId);
    // Note: getActivePausePoints and getTaskAuditTrail don't exist in new API
    const pausePoints: any[] = [];
    const auditTrail: any[] = [];
    
    res.json({
      task,
      execution: executions,
      pausePoints,
      auditTrail: auditTrail.slice(0, 50), // Limit to latest 50 entries
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get execution details:', error);
    res.status(500).json({ 
      error: 'Failed to get execution details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get audit trail for a task
router.get('/tasks/:taskId/audit', async (req, res) => {
  try {
    const { taskId } = req.params;
    // Note: getTaskAuditTrail doesn't exist in new API
    const auditTrail: any[] = [];
    
    res.json({
      taskId,
      entries: auditTrail,
      count: auditTrail.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get audit trail:', error);
    res.status(500).json({ 
      error: 'Failed to get audit trail',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Agent management endpoints
router.get('/agents', (req, res) => {
  const agents = persistentAgentManager.getAllAgentsStatus();
  
  res.json({ 
    agents,
    count: agents.length,
    healthy: persistentAgentManager.isHealthy(),
    timestamp: new Date().toISOString()
  });
});

router.get('/agents/:role', (req, res) => {
  const { role } = req.params;
  const status = persistentAgentManager.getAgentStatus(role as any);
  
  if (status.status === 'not_found') {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  res.json({
    ...status,
    timestamp: new Date().toISOString()
  });
});

// SOI specific endpoint with persistence
router.post('/soi/file', async (req: any, res) => {
  try {
    const { userId, businessId, businessData } = req.body;
    
    if (!userId || !businessId) {
      return res.status(400).json({ error: 'Missing required fields: userId and businessId' });
    }
    
    // Validate userId is UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid userId format. Must be a valid UUID' });
    }
    
    // Get user token from request (this needs auth middleware)
    const userToken = req.userToken || 'dummy-token'; // TODO: Get from auth middleware
    
    // Create SOI filing task with persistence
    const taskId = await persistentAgentManager.createTask({
      userToken,
      userId,
      businessId,
      templateId: 'soi-filing',
      priority: 'high',
      metadata: {
        businessType: businessData?.businessType || 'LLC',
        incorporationDate: businessData?.incorporationDate || new Date().toISOString(),
        ...businessData
      }
    });
    
    res.json({
      success: true,
      message: 'SOI filing initiated and persisted',
      taskId,
      estimatedCompletion: '1-2 business days',
      checkStatusUrl: `/api/tasks/${taskId}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('SOI filing failed:', error);
    res.status(500).json({ 
      error: 'SOI filing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Queue and system status
router.get('/system/status', async (req, res) => {
  try {
    // Note: getPausedExecutions doesn't exist in new API
    const pausedExecutions: any[] = [];
    const agents = persistentAgentManager.getAllAgentsStatus();
    
    res.json({
      system: {
        healthy: persistentAgentManager.isHealthy(),
        agentCount: agents.length, // getAgentCount doesn't exist
        pausedTasks: pausedExecutions.length
      },
      agents: {
        active: agents.filter(a => a.status === 'working').length,
        idle: agents.filter(a => a.status === 'idle').length,
        error: agents.filter(a => a.status === 'error').length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system status:', error);
    res.status(500).json({ 
      error: 'Failed to get system status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Webhook endpoint for Supabase Edge Functions
router.post('/webhooks/task-action', async (req, res) => {
  try {
    const { action, taskId, data } = req.body;
    
    logger.info('Received task action webhook', { action, taskId });
    
    switch (action) {
      case 'resume':
        if (data?.resumeToken) {
          await persistentAgentManager.resumeTask({
            resumeToken: data.resumeToken,
            resumeData: data.resumeData
          });
          res.json({ success: true });
        } else {
          res.status(400).json({ error: 'Missing resume token' });
        }
        break;
        
      case 'pause':
        if (taskId && data?.executionId) {
          const resumeToken = await persistentAgentManager.pauseTask({
            taskId,
            executionId: data.executionId,
            reason: data.reason || 'Manual pause',
            pauseType: data.pauseType || 'user_approval'
          });
          res.json({ success: true, resumeToken });
        } else {
          res.status(400).json({ error: 'Missing required pause data' });
        }
        break;
        
      default:
        res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    logger.error('Webhook processing error:', error);
    res.status(500).json({ 
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as persistentRoutes };