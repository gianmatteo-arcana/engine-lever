/**
 * Tests for Onboarding API Endpoints
 */

import request from 'supertest';
import express from 'express';
import { onboardingRoutes } from '../onboarding';
import { DatabaseService } from '../../services/database';
import { OrchestratorAgent } from '../../agents/OrchestratorAgent';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../services/database');
jest.mock('../../agents/OrchestratorAgent');
jest.mock('../../utils/logger');

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  requireAuth: jest.fn((req: any, res: any, next: any) => {
    // Mock successful authentication
    req.userId = 'test-user-123';
    req.userToken = 'test-jwt-token';
    req.userEmail = 'test@example.com';
    next();
  }),
  AuthenticatedRequest: {}
}));

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use('/api/onboarding', onboardingRoutes);

// Mock database service
const mockDbServiceInstance = {
  createTask: jest.fn(),
  getTask: jest.fn(),
  getTaskUIAugmentations: jest.fn(),
  getTaskAgentContexts: jest.fn(),
  updateUIAugmentationStatus: jest.fn()
};

(DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbServiceInstance);

// Mock orchestrator
const mockOrchestrator = {
  executeTask: jest.fn()
};

(OrchestratorAgent.getInstance as jest.Mock) = jest.fn(() => mockOrchestrator);

describe.skip('Onboarding API - Routes not implemented', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/onboarding/initiate', () => {
    it('should initiate onboarding successfully', async () => {
      const mockTask = {
        id: 'task-123',
        user_id: 'test-user-123',
        business_id: 'biz-123',
        status: 'in_progress'
      };

      mockDbServiceInstance.createTask.mockResolvedValue(mockTask);
      mockOrchestrator.executeTask.mockResolvedValue({
        status: 'complete',
        result: { plan: {} }
      });

      const response = await request(app)
        .post('/api/onboarding/initiate')
        .send({
          businessName: 'Test Corp',
          businessType: 'llc',
          state: 'CA',
          source: 'google'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        taskId: 'task-123',
        businessId: expect.stringMatching(/^biz_\d+_[a-z0-9]+$/),
        message: 'Onboarding initiated successfully',
        nextStep: 'Monitor task progress via WebSocket or polling'
      });

      // Verify task was created
      expect(mockDbServiceInstance.createTask).toHaveBeenCalledWith(
        'test-jwt-token',
        expect.objectContaining({
          user_id: 'test-user-123',
          title: 'Onboarding: Test Corp',
          task_type: 'onboarding',
          status: 'in_progress',
          priority: 'high'
        })
      );

      // Verify orchestration was started
      expect(mockOrchestrator.executeTask).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/onboarding/initiate')
        .send({
          // Missing businessName
          businessType: 'llc'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid request data');
      expect(response.body).toHaveProperty('details');
    });

    it('should handle database errors', async () => {
      mockDbServiceInstance.createTask.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .post('/api/onboarding/initiate')
        .send({
          businessName: 'Test Corp'
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to initiate onboarding');
    });
  });

  describe('GET /api/onboarding/status/:taskId', () => {
    it('should return onboarding status', async () => {
      const mockTask = {
        id: 'task-123',
        status: 'in_progress',
        business_id: 'biz-123',
        task_context: {
          currentPhase: 'data_collection',
          completedPhases: ['initialization'],
          sharedContext: {
            business: { name: 'Test Corp' }
          }
        },
        task_goals: [
          { id: 'goal1', description: 'Collect info', required: true, completed: true },
          { id: 'goal2', description: 'Verify data', required: true, completed: false }
        ],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockAugmentations = [
        { id: 'aug-1', status: 'pending', agent_role: 'data_collection', request_id: 'req-1', presentation: {} }
      ];

      const mockAgentContexts = [
        { agent_role: 'data_collection', is_complete: false, last_action: 'collect', error_count: 0 }
      ];

      mockDbServiceInstance.getTask.mockResolvedValue(mockTask);
      mockDbServiceInstance.getTaskUIAugmentations.mockResolvedValue(mockAugmentations);
      mockDbServiceInstance.getTaskAgentContexts.mockResolvedValue(mockAgentContexts);

      const response = await request(app)
        .get('/api/onboarding/status/task-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        taskId: 'task-123',
        status: 'in_progress',
        progress: 50,
        currentPhase: 'data_collection',
        completedPhases: ['initialization'],
        goals: [
          { id: 'goal1', description: 'Collect info', required: true, completed: true },
          { id: 'goal2', description: 'Verify data', required: true, completed: false }
        ],
        pendingUIRequests: [{
          id: 'aug-1',
          agentRole: 'data_collection',
          requestId: 'req-1',
          presentation: {}
        }],
        agentStatuses: [{
          agentRole: 'data_collection',
          isComplete: false,
          lastAction: 'collect',
          errorCount: 0
        }],
        metadata: {
          businessId: 'biz-123',
          businessName: 'Test Corp',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        }
      });
    });

    it('should return 404 for non-existent task', async () => {
      mockDbServiceInstance.getTask.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/onboarding/status/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Task not found' });
    });
  });

  describe('POST /api/onboarding/ui-response', () => {
    it('should process UI response successfully', async () => {
      mockDbServiceInstance.updateUIAugmentationStatus.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/onboarding/ui-response')
        .send({
          augmentationId: 'aug-123',
          requestId: 'req-123',
          formData: {
            businessName: 'Updated Corp',
            ein: '12-3456789'
          },
          actionTaken: {
            type: 'submit'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Response recorded',
        augmentationId: 'aug-123'
      });

      // Verify status was updated
      expect(mockDbServiceInstance.updateUIAugmentationStatus).toHaveBeenCalledWith(
        'aug-123',
        'responded',
        {
          businessName: 'Updated Corp',
          ein: '12-3456789'
        }
      );
    });

    it('should validate response format', async () => {
      const response = await request(app)
        .post('/api/onboarding/ui-response')
        .send({
          augmentationId: 'aug-123',
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid response data');
    });
  });

  describe('GET /api/onboarding/ui-requests/:taskId', () => {
    it('should return pending UI requests', async () => {
      const mockAugmentations = [
        {
          id: 'aug-1',
          agent_role: 'data_collection',
          request_id: 'req-1',
          sequence_number: 1,
          status: 'pending',
          presentation: { title: 'Business Info' },
          action_pills: [],
          form_sections: [],
          context: {},
          response_config: {},
          created_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 'aug-2',
          status: 'responded' // Should be filtered out
        }
      ];

      mockDbServiceInstance.getTaskUIAugmentations.mockResolvedValue(mockAugmentations);

      const response = await request(app)
        .get('/api/onboarding/ui-requests/task-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        taskId: 'task-123',
        pendingRequests: [{
          id: 'aug-1',
          agentRole: 'data_collection',
          requestId: 'req-1',
          sequenceNumber: 1,
          presentation: { title: 'Business Info' },
          actionPills: [],
          formSections: [],
          context: {},
          responseConfig: {},
          createdAt: '2025-01-01T00:00:00Z'
        }],
        count: 1
      });
    });

    it('should handle errors gracefully', async () => {
      mockDbServiceInstance.getTaskUIAugmentations.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/api/onboarding/ui-requests/task-123');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get UI requests' });
    });
  });
});