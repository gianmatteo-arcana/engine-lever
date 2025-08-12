/**
 * Tests for A2A Orchestrator Agent
 */

import { A2AOrchestrator } from '../A2AOrchestrator';
import { A2ATask } from '../../base/BaseA2AAgent';
import { DatabaseService } from '../../../services/database';
import { LLMProvider } from '../../../services/llm-provider';
import { RealLLMProvider } from '../../../services/real-llm-provider';
import { logger } from '../../../utils/logger';
import { TaskContext } from '../../../types/engine-types';
import { OnboardingTaskContext } from '../../../types/onboarding-types';

// Mock dependencies
jest.mock('../../../services/database');
jest.mock('../../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn()
  }
}));
jest.mock('../../../services/real-llm-provider', () => ({
  RealLLMProvider: {
    getInstance: jest.fn()
  }
}));
jest.mock('../../../utils/logger');

// Mock database service
const mockDbServiceInstance = {
  getUserClient: jest.fn(),
  upsertAgentContext: jest.fn().mockResolvedValue({}),
  createSystemAuditEntry: jest.fn().mockResolvedValue(undefined),
  getActiveOrchestrationPlan: jest.fn(),
  createOrchestrationPlan: jest.fn().mockResolvedValue({}),
  getTaskAgentContexts: jest.fn()
};

(DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbServiceInstance);

// Mock LLM provider
const mockLLMInstance = {
  complete: jest.fn(),
  isConfigured: jest.fn().mockReturnValue(true),
  getConfig: jest.fn().mockReturnValue({
    provider: 'anthropic',
    defaultModel: 'claude-3-mock',
    hasApiKey: true
  })
};

(LLMProvider.getInstance as jest.Mock).mockReturnValue(mockLLMInstance);
(RealLLMProvider.getInstance as jest.Mock).mockReturnValue(mockLLMInstance);

describe('A2AOrchestrator', () => {
  let orchestrator: A2AOrchestrator;
  let mockDbService: typeof mockDbServiceInstance;
  let mockLLM: typeof mockLLMInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new A2AOrchestrator();
    mockDbService = mockDbServiceInstance;
    mockLLM = mockLLMInstance;
  });

  describe('create_execution_plan', () => {
    const mockTaskContext: OnboardingTaskContext = {
      // Base TaskContext fields
      contextId: 'task-123',
      taskTemplateId: 'user_onboarding',
      tenantId: 'business-123',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'gathering_user_info',
        phase: 'initial',
        completeness: 0,
        data: {}
      },
      history: [],
      templateSnapshot: {
        id: 'user_onboarding',
        version: '1.0',
        metadata: {
          name: 'User Onboarding',
          description: 'Onboard new business',
          category: 'onboarding'
        },
        goals: {
          primary: []
        }
      },
      // OnboardingTaskContext specific fields
      taskId: 'task-123',
      taskType: 'onboarding',
      tenantContext: {
        businessId: 'business-123',
        sessionUserId: 'user-123',
        dataScope: 'business',
        allowedAgents: ['orchestrator'],
        isolationLevel: 'strict',
        userToken: 'test-token'
      },
      status: 'active',
      currentPhase: 'initial',
      completedPhases: [],
      sharedContext: {
        user: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        },
        business: {
          name: 'Test Business'
        },
        metadata: {}
      }
    };

    const mockTask: A2ATask = {
      id: 'task-123',
      type: 'create_execution_plan',
      input: mockTaskContext,
      tenantContext: {
        ...mockTaskContext.tenantContext,
        userToken: 'test-token'
      }
    };

    it('should create execution plan successfully', async () => {
      // Mock LLM response
      mockLLM.complete.mockResolvedValue({
        content: JSON.stringify({
          phases: [
            {
              id: 'phase_1',
              name: 'Data Collection',
              description: 'Collect business information',
              requiredAgents: ['data_collection_agent'],
              estimatedDuration: '5 minutes',
              goals: ['collect_business_data']
            }
          ],
          totalDuration: '5 minutes',
          criticalPath: ['phase_1']
        }),
        model: 'claude-3-mock',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      });

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('complete');
      expect(result.result).toBeDefined();
      expect(result.result.plan).toBeDefined();
      expect(result.result.plan.phases).toHaveLength(1);
      expect(result.result.firstPhase.id).toBe('phase_1');

      // Verify LLM was called
      expect(mockLLM.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' })
          ]),
          metadata: expect.objectContaining({
            taskId: 'task-123',
            purpose: 'execution_planning'
          })
        })
      );

      // Verify plan was saved
      expect(mockDbService.createOrchestrationPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-123',
          is_active: true,
          plan_version: 1
        })
      );
    });

    it('should handle LLM errors gracefully', async () => {
      mockLLM.complete.mockRejectedValue(new Error('LLM service unavailable'));
      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('PLANNING_FAILED');
      expect(result.error?.message).toBe('Failed to create execution plan');
    });

    it('should use fallback plan when LLM returns invalid JSON', async () => {
      mockLLM.complete.mockResolvedValue({
        content: 'This is not valid JSON',
        model: 'claude-3-mock',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      });

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('complete');
      expect(result.result.plan.phases).toHaveLength(3); // Default plan has 3 phases
      expect(result.result.plan.phases[0].name).toBe('Data Collection');
    });
  });

  describe('delegate_phase', () => {
    const mockTask: A2ATask = {
      id: 'task-123',
      type: 'delegate_phase',
      input: {
        phaseId: 'phase_1',
        planId: 'plan-123'
      },
      tenantContext: {
        businessId: 'business-123',
        sessionUserId: 'user-123',
        dataScope: 'business',
        allowedAgents: ['orchestrator'],
        isolationLevel: 'strict',
        userToken: 'test-token'
      }
    };

    it('should delegate phase to available agents', async () => {
      mockDbService.getActiveOrchestrationPlan.mockResolvedValue({
        execution_plan: {
          phases: [
            {
              id: 'phase_1',
              name: 'Data Collection',
              requiredAgents: ['data_collection_agent'],
              goals: ['collect_data']
            }
          ]
        }
      });

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('complete');
      expect(result.result.delegations).toHaveLength(1);
      expect(result.result.delegations[0].agentRole).toBe('data_collection_agent');
      expect(result.result.phaseId).toBe('phase_1');
    });

    it('should handle missing plan', async () => {
      mockDbService.getActiveOrchestrationPlan.mockResolvedValue(null);
      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('DELEGATION_FAILED');
    });

    it('should handle no available agents', async () => {
      mockDbService.getActiveOrchestrationPlan.mockResolvedValue({
        execution_plan: {
          phases: [
            {
              id: 'phase_1',
              name: 'Unknown Phase',
              requiredAgents: ['non_existent_agent'],
              goals: []
            }
          ]
        }
      });

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('NO_AGENTS_AVAILABLE');
    });
  });

  describe('monitor_progress', () => {
    const mockTask: A2ATask = {
      id: 'task-123',
      type: 'monitor_progress',
      input: {},
      tenantContext: {
        businessId: 'business-123',
        sessionUserId: 'user-123',
        dataScope: 'business',
        allowedAgents: ['orchestrator'],
        isolationLevel: 'strict',
        userToken: 'test-token'
      }
    };

    it('should calculate progress correctly', async () => {
      mockDbService.getTaskAgentContexts.mockResolvedValue([
        {
          agent_role: 'data_collection_agent',
          is_complete: true,
          last_action: 'collect_data',
          error_count: 0
        },
        {
          agent_role: 'payment_agent',
          is_complete: false,
          last_action: 'process_payment',
          error_count: 0
        }
      ]);

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('complete');
      expect(result.result.progress.completedAgents).toBe(1);
      expect(result.result.progress.totalAgents).toBe(2);
      expect(result.result.progress.percentComplete).toBe(50);
      expect(result.result.shouldAdvance).toBe(false);
    });

    it('should indicate advancement when all complete', async () => {
      mockDbService.getTaskAgentContexts.mockResolvedValue([
        {
          agent_role: 'data_collection_agent',
          is_complete: true,
          last_action: 'collect_data',
          error_count: 0
        }
      ]);

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('complete');
      expect(result.result.progress.percentComplete).toBe(100);
      expect(result.result.shouldAdvance).toBe(true);
      expect(result.result.nextAction).toBe('advance_to_next_phase');
    });
  });

  describe('handle_failure', () => {
    const mockTask: A2ATask = {
      id: 'task-123',
      type: 'handle_failure',
      input: {
        failureDetails: { error: 'API timeout' },
        agentRole: 'data_collection_agent',
        phaseId: 'phase_1'
      },
      tenantContext: {
        businessId: 'business-123',
        sessionUserId: 'user-123',
        dataScope: 'business',
        allowedAgents: ['orchestrator'],
        isolationLevel: 'strict',
        userToken: 'test-token'
      }
    };

    it('should determine recovery strategy', async () => {
      mockLLM.complete.mockResolvedValue({
        content: JSON.stringify({
          recommendation: 'retry',
          alternativeAgents: [],
          notifyUser: false,
          retryDelay: '30s'
        }),
        model: 'claude-3-mock'
      });

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('complete');
      expect(result.result.recoveryStrategy.recommendation).toBe('retry');
      expect(result.result.userNotificationRequired).toBe(false);
    });

    it('should handle recovery planning errors', async () => {
      mockLLM.complete.mockRejectedValue(new Error('LLM error'));
      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('RECOVERY_FAILED');
    });
  });

  describe('unknown task type', () => {
    it('should handle unknown task types', async () => {
      const mockTask: A2ATask = {
        id: 'task-123',
        type: 'unknown_type',
        input: {},
        tenantContext: {
          businessId: 'business-123',
          sessionUserId: 'user-123',
          dataScope: 'business',
          allowedAgents: ['orchestrator'],
          isolationLevel: 'strict',
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await orchestrator.executeTask(mockTask);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('AGENT_EXECUTION_ERROR');
      expect(result.error?.message).toContain('Unknown orchestrator task type');
    });
  });
});