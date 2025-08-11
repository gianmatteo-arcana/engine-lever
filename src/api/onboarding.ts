/**
 * Onboarding API Endpoints
 * 
 * Handles new user onboarding flow with A2A orchestration
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { DatabaseService } from '../services/database';
import { A2AOrchestrator } from '../agents/orchestrator/A2AOrchestrator';
import { z } from 'zod';
import { 
  OnboardingTaskContext,
  TenantContext,
  TaskGoal
} from '../types/task-context';

const router = Router();

// Schema for onboarding initiation
const InitiateOnboardingSchema = z.object({
  businessName: z.string().min(1),
  businessType: z.enum(['corporation', 'llc', 'partnership', 'sole_proprietorship']).optional(),
  state: z.string().length(2).optional(), // Two-letter state code
  source: z.enum(['google', 'email', 'invite']).default('google')
});

// Schema for UI augmentation response
const UIResponseSchema = z.object({
  augmentationId: z.string(),
  requestId: z.string(),
  formData: z.record(z.any()),
  actionTaken: z.object({
    type: z.enum(['submit', 'cancel', 'skip', 'help']),
    actionPillId: z.string().optional()
  })
});

/**
 * POST /initiate
 * Initiates the onboarding process for a new user
 */
router.post('/initiate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const userToken = req.userToken!;
    const userEmail = req.userEmail!;
    
    const input = InitiateOnboardingSchema.parse(req.body);
    
    logger.info('Initiating onboarding', { userId, businessName: input.businessName });
    
    // Create business record
    const businessId = `biz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Define onboarding goals
    const goals: TaskGoal[] = [
      {
        id: 'collect_business_info',
        description: 'Collect basic business information',
        required: true
      },
      {
        id: 'verify_ownership',
        description: 'Verify business ownership',
        required: true
      },
      {
        id: 'setup_profile',
        description: 'Complete business profile setup',
        required: true
      },
      {
        id: 'cbc_registration',
        description: 'Register with California Business Connect',
        required: false
      }
    ];
    
    // Create tenant context
    const tenantContext: TenantContext = {
      businessId,
      sessionUserId: userId,
      dataScope: 'business',
      allowedAgents: ['orchestrator', 'data_collection_agent', 'communication_agent'],
      tenantName: input.businessName,
      isolationLevel: 'strict',
      userToken
    };
    
    // Create task context
    const taskContext: OnboardingTaskContext = {
      taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskType: 'onboarding',
      userId,
      userToken,
      tenantContext,
      status: 'active',
      currentPhase: 'initialization',
      completedPhases: [],
      sharedContext: {
        user: {
          email: userEmail,
          googleId: userId // Assuming Google OAuth
        },
        business: {
          id: businessId,
          name: input.businessName,
          entityType: input.businessType,
          state: input.state
        },
        metadata: {
          source: input.source
        },
        onboarding: {
          currentStage: 1,
          completedStages: [],
          startedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          source: input.source
        }
      },
      agentContexts: {},
      auditTrail: [{
        timestamp: new Date().toISOString(),
        action: 'onboarding_initiated',
        data: { businessName: input.businessName }
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Save task to database
    const dbService = DatabaseService.getInstance();
    const task = await dbService.createTask(userToken, {
      id: taskContext.taskId,
      user_id: userId,
      title: `Onboarding: ${input.businessName}`,
      description: 'New business onboarding',
      task_type: 'onboarding',
      business_id: businessId,
      template_id: 'onboarding',
      status: 'in_progress',
      priority: 'high',
      metadata: {},
      task_context: taskContext,
      task_goals: goals,
      entry_mode: 'user_initiated',
      orchestrator_config: {
        model: 'claude-3',
        maxRetries: 3,
        timeoutMinutes: 30,
        atomicExecution: false
      }
    });
    
    // Start orchestration
    const orchestrationTask = {
      id: task.id,
      type: 'create_execution_plan',
      input: taskContext,
      tenantContext: {
        ...tenantContext,
        userToken
      }
    };
    
    // Execute orchestration asynchronously
    const orchestrator = new A2AOrchestrator();
    orchestrator.executeTask(orchestrationTask).then(result => {
      if (result.status === 'error') {
        logger.error('Orchestration failed', { error: result.error, taskId: task.id });
      } else {
        logger.info('Orchestration plan created', { taskId: task.id, result });
      }
    }).catch(error => {
      logger.error('Orchestration error', { error, taskId: task.id });
    });
    
    res.json({
      success: true,
      taskId: task.id,
      businessId,
      message: 'Onboarding initiated successfully',
      nextStep: 'Monitor task progress via WebSocket or polling'
    });
    
  } catch (error) {
    logger.error('Failed to initiate onboarding', { error, userId: req.userId });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Failed to initiate onboarding',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /status/:taskId
 * Get onboarding task status
 */
router.get('/status/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!;
    
    // Get task (RLS ensures user can only see their own)
    const dbService = DatabaseService.getInstance();
    const task = await dbService.getTask(userToken, taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get UI augmentations
    const augmentations = await dbService.getTaskUIAugmentations(userToken, taskId);
    const pendingAugmentations = augmentations.filter(a => a.status === 'pending');
    
    // Get agent contexts
    const agentContexts = await dbService.getTaskAgentContexts(userToken, taskId);
    
    // Calculate progress
    const taskContext = task.task_context as OnboardingTaskContext;
    const goals = task.task_goals || [];
    const completedGoals = goals.filter(g => g.completed).length;
    const progress = goals.length > 0 ? Math.round((completedGoals / goals.length) * 100) : 0;
    
    res.json({
      taskId,
      status: task.status,
      progress,
      currentPhase: taskContext?.currentPhase || 'unknown',
      completedPhases: taskContext?.completedPhases || [],
      goals: goals.map(g => ({
        id: g.id,
        description: g.description,
        required: g.required,
        completed: g.completed || false
      })),
      pendingUIRequests: pendingAugmentations.map(a => ({
        id: a.id,
        agentRole: a.agent_role,
        requestId: a.request_id,
        presentation: a.presentation
      })),
      agentStatuses: agentContexts.map(ctx => ({
        agentRole: ctx.agent_role,
        isComplete: ctx.is_complete,
        lastAction: ctx.last_action,
        errorCount: ctx.error_count
      })),
      metadata: {
        businessId: task.business_id,
        businessName: taskContext?.sharedContext?.business?.name,
        createdAt: task.created_at,
        updatedAt: task.updated_at
      }
    });
    
  } catch (error) {
    logger.error('Failed to get onboarding status', { error, taskId: req.params.taskId });
    res.status(500).json({
      error: 'Failed to get onboarding status'
    });
  }
});

/**
 * POST /ui-response
 * Submit response to UI augmentation request
 */
router.post('/ui-response', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const response = UIResponseSchema.parse(req.body);
    
    logger.info('UI response received', { 
      userId, 
      augmentationId: response.augmentationId,
      action: response.actionTaken.type 
    });
    
    // Update UI augmentation status
    const dbService = DatabaseService.getInstance();
    await dbService.updateUIAugmentationStatus(
      response.augmentationId,
      'responded',
      response.formData
    );
    
    // TODO: Notify the appropriate agent about the response
    // This would typically be done through a message queue or WebSocket
    
    res.json({
      success: true,
      message: 'Response recorded',
      augmentationId: response.augmentationId
    });
    
  } catch (error) {
    logger.error('Failed to process UI response', { error, userId: req.userId });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid response data',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Failed to process UI response'
    });
  }
});

/**
 * GET /ui-requests/:taskId
 * Get pending UI augmentation requests for a task
 */
router.get('/ui-requests/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!;
    
    const dbService = DatabaseService.getInstance();
    const augmentations = await dbService.getTaskUIAugmentations(userToken, taskId);
    const pending = augmentations
      .filter(a => a.status === 'pending')
      .sort((a, b) => a.sequence_number - b.sequence_number);
    
    res.json({
      taskId,
      pendingRequests: pending.map(a => ({
        id: a.id,
        agentRole: a.agent_role,
        requestId: a.request_id,
        sequenceNumber: a.sequence_number,
        presentation: a.presentation,
        actionPills: a.action_pills,
        formSections: a.form_sections,
        context: a.context,
        responseConfig: a.response_config,
        createdAt: a.created_at
      })),
      count: pending.length
    });
    
  } catch (error) {
    logger.error('Failed to get UI requests', { error, taskId: req.params.taskId });
    res.status(500).json({
      error: 'Failed to get UI requests'
    });
  }
});

/**
 * GET /context-history/:taskId
 * Get context history for a task (for the visualizer)
 */
router.get('/context-history/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { taskId } = req.params;
    const userToken = req.userToken!;
    const limit = parseInt(req.query.limit as string) || undefined;
    
    const dbService = DatabaseService.getInstance();
    const history = await dbService.getContextHistory(userToken, taskId, limit);
    
    res.json({
      taskId,
      entries: history,
      count: history.length
    });
    
  } catch (error) {
    logger.error('Failed to get context history', { error, taskId: req.params.taskId });
    res.status(500).json({
      error: 'Failed to get context history'
    });
  }
});

export { router as onboardingRoutes };