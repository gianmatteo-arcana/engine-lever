/**
 * Unit tests for BaseA2AAgent
 */

import { BaseA2AAgent, A2ATask, A2ATaskResult, TenantAccessError, UIAugmentationRequest, UIAugmentationResponse } from '../BaseA2AAgent';
import { DatabaseService } from '../../../services/database';
import { logger } from '../../../utils/logger';

// Mock dependencies
jest.mock('../../../services/database');
jest.mock('../../../utils/logger');

// Create mock implementations
const mockDbServiceInstance = {
  getUserClient: jest.fn(),
  upsertAgentContext: jest.fn().mockResolvedValue({}),
  createSystemAuditEntry: jest.fn().mockResolvedValue(undefined),
  createUIAugmentation: jest.fn(),
  updateUIAugmentationStatus: jest.fn().mockResolvedValue(undefined),
  getSystemAgentMetrics: jest.fn()
};

// Override getInstance to return our mock
(DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbServiceInstance);

// Test implementation of BaseA2AAgent
class TestAgent extends BaseA2AAgent {
  constructor() {
    super('test-agent-001', 'test_agent', {
      name: 'Test Agent',
      skills: ['testing', 'mocking'],
      version: '1.0.0'
    });
  }

  protected async executeWithTenantContext(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    // Simple test implementation
    if (task.type === 'test_success') {
      return {
        status: 'complete',
        result: { message: 'Test successful' }
      };
    }

    if (task.type === 'test_ui_request') {
      return {
        status: 'pending_user_input',
        uiAugmentation: {
          action: 'request',
          data: task.metadata?.uiAugmentation!
        }
      };
    }

    throw new Error('Test error');
  }
}

describe('BaseA2AAgent', () => {
  let testAgent: TestAgent;
  let mockDbService: typeof mockDbServiceInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    testAgent = new TestAgent();
    mockDbService = mockDbServiceInstance;
  });

  describe('executeTask', () => {
    const validTask: A2ATask = {
      id: 'task-123',
      type: 'test_success',
      input: { test: true },
      tenantContext: {
        tenantId: 'tenant-123',
        businessId: 'business-123',
        userId: 'user-123',
        allowedAgents: ['test_agent'],
        userToken: 'test-jwt-token'
      }
    };

    it('should execute task successfully with valid tenant context', async () => {
      // Mock DB methods
      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await testAgent.executeTask(validTask);

      expect(result).toEqual({
        status: 'complete',
        result: { message: 'Test successful' }
      });

      // Verify tenant validation
      expect(mockDbService.getUserClient).toHaveBeenCalledWith(validTask.tenantContext.userToken);

      // Verify agent context update
      expect(mockDbService.upsertAgentContext).toHaveBeenCalledWith(
        'task-123',
        'test_agent',
        expect.objectContaining({
          last_action: 'test_success',
          is_complete: true
        })
      );

      // Verify audit logging
      expect(mockDbService.createSystemAuditEntry).toHaveBeenCalledTimes(2); // start and complete
      expect(mockDbService.createSystemAuditEntry).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({
          action: 'task_execution_started'
        })
      );
      expect(mockDbService.createSystemAuditEntry).toHaveBeenNthCalledWith(2, 
        expect.objectContaining({
          action: 'task_execution_completed'
        })
      );
    });

    it('should reject task when agent not in allowedAgents', async () => {
      const unauthorizedTask = {
        ...validTask,
        tenantContext: {
          ...validTask.tenantContext,
          allowedAgents: ['other_agent'] // test_agent not allowed
        }
      };

      const result = await testAgent.executeTask(unauthorizedTask);

      expect(result).toEqual({
        status: 'error',
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Access denied for this tenant'
        }
      });

      // Verify security logging
      expect(logger.error).toHaveBeenCalledWith(
        'Tenant access violation',
        expect.objectContaining({
          agent: 'test-agent-001',
          tenant: 'business-123',
          security: true
        })
      );
    });

    it('should handle UI augmentation requests', async () => {
      const uiTask: A2ATask = {
        ...validTask,
        type: 'test_ui_request',
        metadata: {
          uiAugmentation: {
            type: 'form',
            agentRole: 'test_agent',
            requestId: 'req-123',
            timestamp: new Date().toISOString(),
            metadata: {
              purpose: 'Test UI request',
              urgency: 'medium',
              category: 'test',
              allowSkip: false
            },
            presentation: {
              title: 'Test Request'
            },
            context: {},
            responseConfig: {}
          }
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await testAgent.executeTask(uiTask);

      expect(result.status).toBe('pending_user_input');
      expect(result.uiAugmentation).toBeDefined();
      expect(result.uiAugmentation?.action).toBe('request');
    });

    it('should handle execution errors gracefully', async () => {
      const errorTask = {
        ...validTask,
        type: 'test_error'
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await testAgent.executeTask(errorTask);

      expect(result).toEqual({
        status: 'error',
        error: {
          code: 'AGENT_EXECUTION_ERROR',
          message: 'Test error',
          details: expect.any(Error)
        }
      });

      // Verify error audit logging
      expect(mockDbService.createSystemAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_execution_failed',
          details: expect.objectContaining({
            error: 'Test error'
          })
        })
      );
    });
  });

  describe('createUIAugmentationRequest', () => {
    it('should create UI augmentation in database', async () => {
      const mockAugmentation = { id: 'aug-123' } as any;
      mockDbService.createUIAugmentation.mockResolvedValue(mockAugmentation);

      const request: UIAugmentationRequest = {
        type: 'form',
        agentRole: 'test_agent',
        requestId: 'req-123',
        timestamp: new Date().toISOString(),
        metadata: {
          purpose: 'Test',
          urgency: 'low' as const,
          category: 'test',
          allowSkip: true
        },
        presentation: { title: 'Test' },
        context: {},
        responseConfig: {}
      };

      const augmentationId = await testAgent['createUIAugmentationRequest']('task-123', request);

      expect(augmentationId).toBe('aug-123');
      expect(mockDbService.createUIAugmentation).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-123',
          agent_role: 'test_agent',
          request_id: 'req-123',
          status: 'pending'
        })
      );
    });
  });

  describe('handleUIResponse', () => {
    it('should update UI augmentation status', async () => {
      mockDbService.updateUIAugmentationStatus.mockResolvedValue(undefined);

      const response: UIAugmentationResponse = {
        status: 'completed',
        formData: { field1: 'value1' },
        data: {
          requestId: 'req-123',
          taskId: 'task-123',
          agentRole: 'test_agent',
          timestamp: new Date().toISOString(),
          actionTaken: { type: 'submit' as const },
          validationStatus: { isValid: true }
        }
      };

      await testAgent.handleUIResponse('aug-123', response);

      expect(mockDbService.updateUIAugmentationStatus).toHaveBeenCalledWith(
        'aug-123',
        'responded',
        { field1: 'value1' }
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      mockDbService.getSystemAgentMetrics.mockResolvedValue([]);

      const health = await testAgent.healthCheck();

      expect(health).toEqual({
        healthy: true,
        agent: 'test-agent-001',
        version: '1.0.0'
      });
    });

    it('should return unhealthy status when database is not accessible', async () => {
      mockDbService.getSystemAgentMetrics.mockRejectedValue(new Error('DB error'));

      const health = await testAgent.healthCheck();

      expect(health).toEqual({
        healthy: false,
        agent: 'test-agent-001',
        version: '1.0.0',
        details: { error: 'DB error' }
      });
    });
  });

  describe('getCapabilities', () => {
    it('should return agent capabilities', () => {
      const capabilities = testAgent.getCapabilities();

      expect(capabilities).toEqual({
        id: 'test-agent-001',
        name: 'Test Agent',
        role: 'test_agent',
        skills: ['testing', 'mocking'],
        version: '1.0.0',
        endpoints: undefined
      });
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = testAgent['generateId']();
      const id2 = testAgent['generateId']();

      expect(id1).toMatch(/^test_agent_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^test_agent_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});