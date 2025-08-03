import { Router } from 'express';
import { logger } from '../utils/logger';
import { AgentManager, convertPriority, TaskPriority } from '../agents';
import { TemplateExecutor } from '../templates/executor';
import { z } from 'zod';

const router = Router();
const templateExecutor = new TemplateExecutor();

// Initialize template executor
templateExecutor.initialize().catch(error => {
  logger.error('Failed to initialize template executor', error);
});

// Health check for API
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    module: 'api'
  });
});

// Task creation endpoint
const CreateTaskSchema = z.object({
  userId: z.string(),
  businessId: z.string(),
  templateId: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  deadline: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

router.post('/tasks', async (req, res) => {
  try {
    const taskRequest = CreateTaskSchema.parse(req.body);
    
    logger.info('Creating new task', taskRequest);
    
    // Create task through AgentManager
    const taskId = await AgentManager.createTask(taskRequest);
    
    // Start template execution if templateId provided
    let executionId: string | undefined;
    if (taskRequest.templateId) {
      const taskContext = {
        taskId,
        userId: taskRequest.userId,
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

// Get task status
router.get('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const status = AgentManager.getTaskStatus(taskId);
  
  res.json({
    taskId,
    ...status,
    timestamp: new Date().toISOString()
  });
});

// Get execution status
router.get('/executions/:executionId', (req, res) => {
  const { executionId } = req.params;
  const execution = templateExecutor.getExecution(executionId);
  
  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
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

// Agent management endpoints
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

// MCP tool endpoints
router.get('/tools', (req, res) => {
  // TODO: Return available MCP tools
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

router.post('/tools/:toolName/invoke', async (req, res) => {
  const { toolName } = req.params;
  logger.info(`Tool invocation request: ${toolName}`, req.body);
  
  // TODO: Implement actual MCP tool invocation
  res.json({
    status: 'tool_invoked',
    toolName,
    result: 'Tool execution pending implementation',
    timestamp: new Date().toISOString()
  });
});

// SOI specific endpoint for testing
router.post('/soi/file', async (req, res) => {
  try {
    const { userId, businessId, businessData } = req.body;
    
    if (!userId || !businessId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create SOI filing task
    const taskRequest = {
      userId,
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
      estimatedCompletion: '1-2 business days',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('SOI filing failed:', error);
    res.status(500).json({ error: 'SOI filing failed' });
  }
});

// Queue status endpoints
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

export { router as apiRoutes };