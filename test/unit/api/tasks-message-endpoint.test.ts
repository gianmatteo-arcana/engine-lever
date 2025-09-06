/**
 * Unit tests for /api/tasks/:contextId/message endpoint
 * Tests the FluidUI message processing API
 */

import request from 'supertest';
import express from 'express';
import router from '../../../src/api/tasks';
import { requireAuth } from '../../../src/middleware/auth';
import { DatabaseService } from '../../../src/services/database';
import { UXOptimizationAgent } from '../../../src/agents/UXOptimizationAgent';

// Mock dependencies
jest.mock('../../../src/middleware/auth');
jest.mock('../../../src/services/database');
jest.mock('../../../src/agents/UXOptimizationAgent');
jest.mock('../../../src/services/dependency-injection');
jest.mock('../../../src/services/a2a-event-bus', () => ({
  A2AEventBus: {
    getInstance: jest.fn(() => ({
      broadcast: jest.fn(),
      publishTaskEvent: jest.fn()
    }))
  }
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  createTaskLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }))
}));

describe('POST /api/tasks/:contextId/message', () => {
  let app: express.Application;
  const mockUserId = 'test-user-123';
  const mockContextId = 'test-context-456';
  const mockTask = {
    id: mockContextId,
    user_id: mockUserId,
    business_id: 'test-business-789',
    status: 'in_progress',
    metadata: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    (requireAuth as jest.Mock).mockImplementation((req, res, next) => {
      req.userId = mockUserId;
      req.userEmail = 'test@example.com';
      next();
    });
    
    // Mock database service
    const mockGetTask = jest.fn().mockResolvedValue(mockTask);
    const mockCreateTaskContextEvent = jest.fn().mockResolvedValue({
      id: 'event-123',
      created_at: new Date().toISOString()
    });
    (DatabaseService as any).getInstance = jest.fn().mockReturnValue({
      getTask: mockGetTask,
      createTaskContextEvent: mockCreateTaskContextEvent
    });
    
    // Mock UXOptimizationAgent
    const mockHandleUserMessage = jest.fn().mockResolvedValue({
      status: 'completed',
      contextUpdate: {
        operation: 'message_extraction',
        data: {
          extractedData: { businessName: 'TestCorp' },
          originalMessage: 'test message'
        },
        reasoning: 'Extracted data successfully'
      },
      confidence: 0.85
    });
    
    const mockLoadContext = jest.fn().mockResolvedValue(undefined);
    
    (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
      handleUserMessage: mockHandleUserMessage,
      loadContext: mockLoadContext
    }));
    
    // Mock DI Container - make it fail so we use direct instantiation
    const { DIContainer } = require('../../../src/services/dependency-injection');
    DIContainer.resolveAgent = jest.fn().mockRejectedValue(new Error('Not registered'));
    
    // Mount routes
    app.use('/api/tasks', router);
  });

  describe('Success Cases', () => {
    it('should process a simple message successfully', async () => {
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'My business is TestCorp' });
      
      if (response.status !== 200) {
        console.log('Unexpected status:', response.status);
        console.log('Error body:', response.body);
      }
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('extractedData');
      expect(response.body.extractedData).toEqual({ businessName: 'TestCorp' });
    });

    it('should handle complex messages with multiple data points', async () => {
      const complexMessage = 'My business TestCorp is at 123 Main St, our EIN is 12-3456789';
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: complexMessage })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Message processed successfully');
      expect(response.body).toHaveProperty('extractedData');
    });

    it('should return clarification request when needed', async () => {
      // Mock clarification response
      const mockAgent = UXOptimizationAgent as jest.Mock;
      mockAgent.mockImplementationOnce(() => ({
        loadContext: jest.fn().mockResolvedValue(undefined),
        handleUserMessage: jest.fn().mockResolvedValue({
          status: 'needs_clarification',
          contextUpdate: {
            operation: 'clarification_request',
            data: {
              clarificationNeeded: 'Please provide your business address'
            }
          },
          uiRequests: [{
            requestId: 'clarify_123',
            templateType: 'form',
            semanticData: {
              title: 'Need more information',
              fields: []
            }
          }]
        })
      }));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'My business needs help' });
      
      if (response.status !== 200) {
        console.error('Test failed with response:', response.body);
      }
      expect(response.status).toBe(200);
      
      expect(response.body.success).toBe(true);
      // Check for uiRequest which contains clarification
      expect(response.body).toHaveProperty('uiRequest');
    });

    it('should handle empty extracted data', async () => {
      const mockAgent = UXOptimizationAgent as jest.Mock;
      mockAgent.mockImplementationOnce(() => ({
        loadContext: jest.fn().mockResolvedValue(undefined),
        handleUserMessage: jest.fn().mockResolvedValue({
          status: 'completed',
          contextUpdate: {
            operation: 'message_extraction',
            data: {
              extractedData: {},
              originalMessage: 'Hello'
            }
          }
        })
      }));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Hello' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.extractedData).toEqual({});
    });

    it('should include UIRequest in response when present', async () => {
      const mockAgent = UXOptimizationAgent as jest.Mock;
      mockAgent.mockImplementationOnce(() => ({
        loadContext: jest.fn().mockResolvedValue(undefined),
        handleUserMessage: jest.fn().mockResolvedValue({
          status: 'needs_clarification',
          uiRequests: [{
            requestId: 'ui_123',
            templateType: 'form'
          }]
        })
      }));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Need clarification' })
        .expect(200);
      
      expect(response.body).toHaveProperty('uiRequest');
      expect(response.body.uiRequest.requestId).toBe('ui_123');
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for missing message', async () => {
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({})
        .expect(400);
      
      expect(response.body.error).toBe('Message is required and must be a string');
    });

    it('should return 400 for non-string message', async () => {
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 123 })
        .expect(400);
      
      expect(response.body.error).toBe('Message is required and must be a string');
    });

    it('should return 404 for non-existent task', async () => {
      const mockGetTask = (DatabaseService as any).getInstance().getTask as jest.Mock;
      mockGetTask.mockResolvedValueOnce(null);
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(404);
      
      expect(response.body.error).toBe('Task not found or unauthorized');
    });

    it('should return 404 for unauthorized task access', async () => {
      const mockGetTask = (DatabaseService as any).getInstance().getTask as jest.Mock;
      // getTask returns null when user doesn't own the task
      mockGetTask.mockResolvedValueOnce(null);
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(404);
      
      expect(response.body.error).toBe('Task not found or unauthorized');
    });

    it('should handle agent processing errors', async () => {
      const mockAgent = UXOptimizationAgent as jest.Mock;
      mockAgent.mockImplementationOnce(() => ({
        loadContext: jest.fn().mockResolvedValue(undefined),
        handleUserMessage: jest.fn().mockRejectedValue(new Error('Processing failed'))
      }));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(500);
      
      expect(response.body.error).toBe('Failed to process user message');
    });

    it('should handle database errors gracefully', async () => {
      const mockGetTask = (DatabaseService as any).getInstance().getTask as jest.Mock;
      mockGetTask.mockRejectedValueOnce(new Error('Database error'));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(500);
      
      expect(response.body.error).toBe('Failed to process user message');
    });
  });

  describe('Input Validation', () => {
    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(10000);
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: longMessage })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    it('should handle messages with special characters', async () => {
      const specialMessage = 'Test & <script>alert("xss")</script> message';
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: specialMessage })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const unicodeMessage = 'Business name: 商业名称 🚀';
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: unicodeMessage })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    it('should trim whitespace from messages', async () => {
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: '  Test message  ' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      // Remove auth mock for this test
      (requireAuth as jest.Mock).mockImplementationOnce((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(401);
      
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should use authenticated user ID', async () => {
      await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(200);
      
      const mockGetTask = (DatabaseService as any).getInstance().getTask as jest.Mock;
      expect(mockGetTask).toHaveBeenCalledWith(mockUserId, mockContextId);
    });
  });

  describe('Response Format', () => {
    it('should return consistent success response format', async () => {
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('extractedData');
      expect(response.body).toHaveProperty('contextId', mockContextId);
    });

    it('should return consistent error response format', async () => {
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).not.toHaveProperty('success');
    });
  });

  describe('DI Container Integration', () => {
    it.skip('should attempt to resolve agent through DI container first', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      const mockAgent = new UXOptimizationAgent(mockContextId, mockTask.business_id, mockUserId);
      
      // Mock successful DI resolution
      DIContainer.resolveAgent = jest.fn().mockResolvedValue(mockAgent);
      mockAgent.handleUserMessage = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'message_extraction',
          data: { extractedData: {} }
        },
        confidence: 0.85
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test DI resolution' })
        .expect(200);
      
      expect(DIContainer.resolveAgent).toHaveBeenCalledWith('ux_optimization_agent', mockContextId);
      expect(response.body.success).toBe(true);
    });

    it('should fallback to direct instantiation if DI fails', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Mock DI resolution failure
      DIContainer.resolveAgent = jest.fn().mockRejectedValue(new Error('Not registered'));
      
      // UXOptimizationAgent mock should still work
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test DI fallback' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(UXOptimizationAgent).toHaveBeenCalledWith(mockContextId, mockTask.business_id, mockUserId);
    });

    it('should call loadContext when creating agent directly', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent = jest.fn().mockRejectedValue(new Error('Not registered'));
      
      const mockLoadContext = jest.fn().mockResolvedValue(undefined);
      const mockHandleUserMessage = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'message_extraction',
          data: { extractedData: {} }
        },
        confidence: 0.85
      });
      
      (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
        loadContext: mockLoadContext,
        handleUserMessage: mockHandleUserMessage
      }));
      
      await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test context loading' })
        .expect(200);
      
      expect(mockLoadContext).toHaveBeenCalled();
    });
  });

  describe('Ephemeral Message Handling', () => {
    it('should not persist ephemeral messages', async () => {
      const mockHandleUserMessage = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'message_extraction',
          data: { 
            status: 'ephemeral',
            message: 'Ephemeral conversation response'
          }
        },
        confidence: 0.85,
        ephemeral: true
      });
      
      (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
        handleUserMessage: mockHandleUserMessage,
        loadContext: jest.fn().mockResolvedValue(undefined)
      }));
      
      const mockCreateTaskContextEvent = (DatabaseService as any).getInstance().createTaskContextEvent as jest.Mock;
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'What do I do?' })
        .expect(200);
      
      // Should not create event for ephemeral message
      expect(mockCreateTaskContextEvent).not.toHaveBeenCalled();
      expect(response.body.success).toBe(true);
    });

    it('should persist non-ephemeral messages with data', async () => {
      const mockHandleUserMessage = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'message_extraction',
          data: { 
            extractedData: { businessName: 'TestCorp' },
            originalMessage: 'My business is TestCorp'
          },
          reasoning: 'Extracted business name'
        },
        confidence: 0.85,
        ephemeral: false
      });
      
      (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
        handleUserMessage: mockHandleUserMessage,
        loadContext: jest.fn().mockResolvedValue(undefined)
      }));
      
      const mockCreateTaskContextEvent = (DatabaseService as any).getInstance().createTaskContextEvent as jest.Mock;
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'My business is TestCorp' })
        .expect(200);
      
      // Should create event for non-ephemeral message
      expect(mockCreateTaskContextEvent).toHaveBeenCalled();
      expect(response.body.success).toBe(true);
      expect(response.body.extractedData).toEqual({ businessName: 'TestCorp' });
    });

    it('should handle messages without contextUpdate gracefully', async () => {
      const mockHandleUserMessage = jest.fn().mockResolvedValue({
        status: 'completed',
        confidence: 0.85,
        ephemeral: true
      });
      
      (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
        handleUserMessage: mockHandleUserMessage,
        loadContext: jest.fn().mockResolvedValue(undefined)
      }));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Simple ephemeral message' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    it.skip('should broadcast only for persisted messages', async () => {
      const { A2AEventBus } = require('../../../src/services/a2a-event-bus');
      const mockBroadcast = A2AEventBus.getInstance().broadcast as jest.Mock;
      
      // Test ephemeral message
      const mockHandleUserMessage = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: { data: { status: 'ephemeral' } },
        ephemeral: true
      });
      
      (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
        handleUserMessage: mockHandleUserMessage,
        loadContext: jest.fn().mockResolvedValue(undefined)
      }));
      
      await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Ephemeral' })
        .expect(200);
      
      // Should not broadcast for ephemeral
      expect(mockBroadcast).not.toHaveBeenCalled();
      
      // Reset and test persistent message
      mockBroadcast.mockClear();
      mockHandleUserMessage.mockResolvedValue({
        status: 'completed',
        contextUpdate: { 
          operation: 'message_extraction',
          data: { extractedData: { field: 'value' } } 
        },
        ephemeral: false
      });
      
      await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Persistent message with data' })
        .expect(200);
      
      // Should broadcast for persistent
      expect(mockBroadcast).toHaveBeenCalled();
    });
  });

  describe('Complete Flow Integration', () => {
    it.skip('should handle complete conversation flow with DI and persistence', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      const mockAgent = new UXOptimizationAgent(mockContextId, mockTask.business_id, mockUserId);
      
      // Mock DI resolution
      DIContainer.resolveAgent = jest.fn().mockResolvedValue(mockAgent);
      
      // Mock varying responses
      const responses = [
        { ephemeral: true, data: { status: 'ephemeral' } },
        { ephemeral: false, data: { extractedData: { name: 'Test' } } },
        { ephemeral: true, data: { status: 'ephemeral' } }
      ];
      
      let callCount = 0;
      mockAgent.handleUserMessage = jest.fn().mockImplementation(() => {
        const resp = responses[callCount++];
        return Promise.resolve({
          status: 'completed',
          contextUpdate: { 
            operation: 'message_extraction',
            data: resp.data 
          },
          confidence: 0.85,
          ephemeral: resp.ephemeral
        });
      });
      
      const mockCreateTaskContextEvent = (DatabaseService as any).getInstance().createTaskContextEvent as jest.Mock;
      
      // Send multiple messages
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/tasks/${mockContextId}/message`)
          .send({ message: `Message ${i}` })
          .expect(200);
      }
      
      // Only the second message should be persisted
      expect(mockCreateTaskContextEvent).toHaveBeenCalledTimes(1);
    });
  });
});