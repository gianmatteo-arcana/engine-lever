import { Router } from 'express';
import { logger } from '../utils/logger';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
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
router.get('/agents', async (req, res) => {
  try {
    const orchestrator = OrchestratorAgent.getInstance();
    
    // In pure A2A system, get agent status through orchestrator
    const capabilities = await orchestrator.getDiscoveredCapabilities();
    const agents = capabilities.map(cap => ({
      role: cap.role,
      status: 'active', // In A2A system, discovered = active
      metrics: {
        skills: cap.skills?.length || 0,
        canReceiveFrom: cap.canReceiveFrom?.length || 0,
        canSendTo: cap.canSendTo?.length || 0
      }
    }));
    
    res.json({ 
      agents,
      count: agents.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agent status', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

/**
 * A2A Protocol Discovery Endpoints
 * 
 * ARCHITECTURAL DECISION: Why REST APIs for agent discovery?
 * 
 * These endpoints are NOT for internal agent-to-agent communication.
 * Internal agents communicate directly through OrchestratorAgent.
 * 
 * These REST endpoints serve:
 * 1. **Frontend UI** - Dashboard can display agent capabilities
 * 2. **Dev Toolkit** - Developers can inspect agent routing
 * 3. **External Services** - Future MCP tools or external systems
 * 4. **Monitoring** - Health checks and observability tools
 * 
 * Internal agent communication uses:
 * - OrchestratorAgent.getDiscoveredCapabilities() - Direct method calls
 * - BaseAgent.discoverPeerAgents() - Service class access
 * - No HTTP overhead for internal operations
 */

// A2A Protocol Discovery Endpoints
router.get('/agents/capabilities', async (req, res) => {
  try {
    const orchestrator = OrchestratorAgent.getInstance();
    const capabilities = await orchestrator.getDiscoveredCapabilities();
    
    res.json({
      capabilities,
      count: capabilities.length,
      report: await orchestrator.getCapabilityReport(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agent capabilities', error);
    res.status(500).json({ error: 'Failed to get agent capabilities' });
  }
});

// Find agents by skill
router.get('/agents/capabilities/by-skill/:skill', async (req, res) => {
  try {
    const { skill } = req.params;
    const orchestrator = OrchestratorAgent.getInstance();
    const agents = await orchestrator.findAgentsBySkill(skill);
    
    res.json({
      skill,
      agents,
      count: agents.length
    });
  } catch (error) {
    logger.error('Failed to find agents by skill', error);
    res.status(500).json({ error: 'Failed to find agents by skill' });
  }
});

// Find agents by role
router.get('/agents/capabilities/by-role/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const orchestrator = OrchestratorAgent.getInstance();
    const agents = await orchestrator.findAgentsByRole(role);
    
    res.json({
      role,
      agents,
      count: agents.length
    });
  } catch (error) {
    logger.error('Failed to find agents by role', error);
    res.status(500).json({ error: 'Failed to find agents by role' });
  }
});

// Get agent routing information
router.get('/agents/:agentId/routing', async (req, res) => {
  try {
    const { agentId } = req.params;
    const orchestrator = OrchestratorAgent.getInstance();
    const routing = await orchestrator.getAgentRouting(agentId);
    
    if (!routing) {
      // Fall back to checking capabilities for backward compatibility
      const agents = await orchestrator.findAgentsByRole(agentId);
      
      if (agents.length === 0) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      return res.json({
        role: agentId,
        status: 'active',
        capabilities: agents[0],
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      agentId,
      routing,
      canCommunicateWith: routing.canSendTo,
      canReceiveFrom: routing.canReceiveFrom
    });
  } catch (error) {
    logger.error('Failed to get agent routing', error);
    res.status(500).json({ error: 'Failed to get agent routing' });
  }
});

// Check if two agents can communicate
router.get('/agents/can-communicate', async (req, res) => {
  try {
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({
        error: 'Missing required query parameters: from, to'
      });
    }
    
    const orchestrator = OrchestratorAgent.getInstance();
    const canCommunicate = await orchestrator.canAgentsCommunicate(from as string, to as string);
    
    res.json({
      from,
      to,
      canCommunicate
    });
  } catch (error) {
    logger.error('Failed to check agent communication', error);
    res.status(500).json({ error: 'Failed to check agent communication' });
  }
});

router.get('/agents/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const orchestrator = OrchestratorAgent.getInstance();
    const agents = await orchestrator.findAgentsByRole(role);
    
    if (agents.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({
      role,
      status: 'active',
      capabilities: agents[0],
      count: agents.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get agent status', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
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
router.get('/queues/status', async (req, res) => {
  try {
    const orchestrator = OrchestratorAgent.getInstance();
    const capabilities = await orchestrator.getDiscoveredCapabilities();
    
    // In pure A2A system, all discovered agents are considered active
    const agentStatuses = capabilities.map(cap => ({
      role: cap.role,
      status: 'active' // In A2A system, discovered = active
    }));
    
    res.json({
      queues: {
        agents: { 
          active: agentStatuses.filter(a => a.status === 'active').length,
          idle: 0, // In A2A system, agents are on-demand
          error: 0 // Errors are handled at task level
        },
        executions: {
          running: templateExecutor.getAllExecutions().filter(e => e.status === 'running').length,
          completed: templateExecutor.getAllExecutions().filter(e => e.status === 'completed').length,
          failed: templateExecutor.getAllExecutions().filter(e => e.status === 'failed').length
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get queue status', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Onboarding routes removed - using universal task routes

// Generic tasks endpoints (ENGINE PRD compliant)
router.use('/tasks', tasksRoutes);


export { router as apiRoutes };