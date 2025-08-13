/**
 * Tests for Data Collection Agent
 */

import { DataCollectionAgent } from '../DataCollectionAgent';
import { A2ATask } from '../../base/BaseA2AAgent';
import { DatabaseService } from '../../../services/database';
import { logger } from '../../../utils/logger';
import { TaskContext } from '../../../types/engine-types';
// import { OnboardingTaskContext } from '../../../types/onboarding-types'; // Type not found

// Mock dependencies
jest.mock('../../../services/database');
jest.mock('../../../utils/logger');

// Mock database service
const mockDbServiceInstance = {
  getUserClient: jest.fn(),
  upsertAgentContext: jest.fn().mockResolvedValue({}),
  createSystemAuditEntry: jest.fn().mockResolvedValue(undefined),
  createUIAugmentation: jest.fn().mockResolvedValue({ id: 'aug-123' })
};

(DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbServiceInstance);

describe('DataCollectionAgent', () => {
  let agent: DataCollectionAgent;
  let mockDbService: typeof mockDbServiceInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new DataCollectionAgent();
    mockDbService = mockDbServiceInstance;
  });

  const createMockTaskContext = (businessData = {}): OnboardingTaskContext => ({
    // Base TaskContext fields
    contextId: 'task-123',
    taskTemplateId: 'user_onboarding',
    tenantId: 'business-123',
    createdAt: new Date().toISOString(),
    currentState: {
      status: 'gathering_user_info',
      phase: 'data_collection',
      completeness: 25,
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
      allowedAgents: ['data_collection_agent'],
      isolationLevel: 'strict',
      userToken: 'test-token'
    },
    status: 'active',
    currentPhase: 'data_collection',
    completedPhases: [],
    sharedContext: {
      user: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      },
      business: businessData,
      metadata: {}
    }
  });

  describe('collect_business_data', () => {
    it('should request missing data through UI augmentation', async () => {
      const taskContext = createMockTaskContext();
      const task: A2ATask = {
        id: 'task-123',
        type: 'collect_business_data',
        input: {
          ...taskContext,
          phaseGoals: ['collect_business_name', 'collect_ein', 'collect_entity_type']
        },
        tenantContext: {
          ...taskContext.tenantContext,
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('pending_user_input');
      expect(result.uiAugmentation).toBeDefined();
      expect(result.uiAugmentation?.action).toBe('request');
      expect(result.result.requestedFields).toContain('businessName');
      expect(result.result.requestedFields).toContain('ein');
      expect(result.result.requestedFields).toContain('entityType');

      // Verify UI augmentation was created
      expect(mockDbService.createUIAugmentation).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'task-123',
          agent_role: 'data_collection_agent',
          status: 'pending'
        })
      );
    });

    it('should complete immediately if all data exists', async () => {
      const taskContext = createMockTaskContext({
        businessName: 'Test Corp',
        ein: '12-3456789',
        entityType: 'corporation'
      });

      const task: A2ATask = {
        id: 'task-123',
        type: 'collect_business_data',
        input: {
          ...taskContext,
          phaseGoals: ['collect_business_name', 'collect_ein', 'collect_entity_type']
        },
        tenantContext: {
          ...taskContext.tenantContext,
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('complete');
      expect(result.result.message).toBe('All required data already collected');
      expect(mockDbService.createUIAugmentation).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const task: A2ATask = {
        id: 'task-123',
        type: 'collect_business_data',
        input: null, // Invalid input
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('AGENT_EXECUTION_ERROR');
    });
  });

  describe('validate_data', () => {
    it('should validate correct data successfully', async () => {
      const task: A2ATask = {
        id: 'task-123',
        type: 'validate_data',
        input: {
          businessData: {
            businessName: 'Test Corp',
            ein: '12-3456789',
            entityType: 'corporation',
            state: 'CA'
          }
        },
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('complete');
      expect(result.result.message).toBe('Data validation successful');
      expect(result.result.validatedData).toBeDefined();
    });

    it('should request corrections for invalid data', async () => {
      const task: A2ATask = {
        id: 'task-123',
        type: 'validate_data',
        input: {
          businessData: {
            businessName: '',  // Empty name
            ein: '123456789',  // Invalid format
            entityType: 'corporation'
          }
        },
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('pending_user_input');
      expect(result.result.validationErrors).toHaveLength(2);
      expect(result.result.validationErrors).toContainEqual({
        field: 'businessName',
        message: 'Business name is required'
      });
      expect(result.result.validationErrors).toContainEqual({
        field: 'ein',
        message: 'EIN must be in format XX-XXXXXXX'
      });
    });
  });

  describe('cbc_lookup', () => {
    it('should return task context data when CBC API not configured', async () => {
      const task: A2ATask = {
        id: 'task-123',
        type: 'cbc_lookup',
        input: {
          businessName: 'Test Corp',
          entityNumber: 'C1234567'
        },
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('complete');
      expect(result.result.source).toBe('task_context');
      expect(result.result.businessInfo).toBeDefined();
    });

    it('should handle CBC lookup errors', async () => {
      // Set CBC API key to trigger real implementation attempt
      process.env.CBC_API_KEY = 'test-key';
      
      const task: A2ATask = {
        id: 'task-123',
        type: 'cbc_lookup',
        input: {
          businessName: 'Test Corp'
        },
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('CBC_LOOKUP_FAILED');

      // Clean up
      delete process.env.CBC_API_KEY;
    });
  });

  describe('update_business_data', () => {
    it('should update business data successfully', async () => {
      const task: A2ATask = {
        id: 'task-123',
        type: 'update_business_data',
        input: {
          updates: {
            businessName: 'Updated Corp',
            ein: '98-7654321'
          }
        },
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('complete');
      expect(result.result.updatedFields).toContain('businessName');
      expect(result.result.updatedFields).toContain('ein');

      // Verify agent context was updated
      expect(mockDbService.upsertAgentContext).toHaveBeenCalledWith(
        'task-123',
        'data_collection_agent',
        expect.objectContaining({
          context_data: expect.objectContaining({
            collectedData: task.input.updates
          }),
          deliverables: expect.arrayContaining([
            expect.objectContaining({
              type: 'business_data',
              data: task.input.updates
            })
          ])
        })
      );
    });
  });

  describe('unknown task type', () => {
    it('should handle unknown task types', async () => {
      const task: A2ATask = {
        id: 'task-123',
        type: 'unknown_type',
        input: {},
        tenantContext: {
          businessId: 'business-123',
          tenantId: 'tenant-123',
          userId: 'user-123',
          allowedAgents: ['data_collection_agent'],
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('AGENT_EXECUTION_ERROR');
      expect(result.error?.message).toContain('Unknown data collection task type');
    });
  });

  describe('field determination', () => {
    it('should include basic fields for onboarding goals', async () => {
      const taskContext = createMockTaskContext();
      const task: A2ATask = {
        id: 'task-123',
        type: 'collect_business_data',
        input: {
          ...taskContext,
          phaseGoals: ['onboarding_start', 'collect_officers']
        },
        tenantContext: {
          ...taskContext.tenantContext,
          userToken: 'test-token'
        }
      };

      mockDbService.getUserClient.mockReturnValue({} as any);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('pending_user_input');
      expect(result.result.requestedFields).toContain('businessName');
      expect(result.result.requestedFields).toContain('ein');
      expect(result.result.requestedFields).toContain('entityType');
      expect(result.result.requestedFields).toContain('officers');
    });
  });
});