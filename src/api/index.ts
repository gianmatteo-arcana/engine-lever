import { Router } from 'express';
import { logger } from '../utils/logger';
import { AgentManager } from '../agents';
import { TemplateExecutor } from '../templates/executor';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
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
    module: 'api'
  });
});

// REMOVED: Duplicate task creation endpoint
// Use the universal endpoints at /api/tasks/* instead
// This follows Engine PRD compliance for universal task handling

// REMOVED: Duplicate task endpoints - handled by /api/tasks router
// The tasks router at /api/tasks provides all task-related endpoints


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

// REMOVED: Task-specific endpoints violate universal pattern
// Use POST /api/tasks with templateId: 'soi-filing' instead
// This follows the architectural principle: "Everything is a task"

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

// Onboarding routes removed - using universal task routes

// Generic tasks endpoints (ENGINE PRD compliant)
router.use('/tasks', tasksRoutes);


export { router as apiRoutes };