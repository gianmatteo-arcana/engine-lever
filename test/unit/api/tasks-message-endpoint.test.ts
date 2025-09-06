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
    
    // Mock the processMessageForAPI method that returns API-ready response
    const mockProcessMessageForAPI = jest.fn().mockResolvedValue({
      success: true,
      contextId: mockContextId,
      eventId: 'event_123',
      extractedData: { businessName: 'TestCorp' },
      uiRequest: null,
      message: 'Successfully extracted data from user message',
      ephemeral: false
    });
    
    const mockAgent = {
      processMessageForAPI: mockProcessMessageForAPI
    };
    
    (UXOptimizationAgent as jest.Mock).mockImplementation(() => mockAgent);
    
    // Mock DI Container to return our mock agent
    const { DIContainer } = require('../../../src/services/dependency-injection');
    DIContainer.resolveAgent = jest.fn().mockResolvedValue(mockAgent);
    
    // Mock RequestContextService
    const { RequestContextService } = require('../../../src/services/request-context');
    RequestContextService.run = jest.fn().mockImplementation((context, fn) => fn());
    
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
      expect(response.body.message).toBe('Successfully extracted data from user message');
      expect(response.body).toHaveProperty('extractedData');
    });

    it('should return clarification request when needed', async () => {
      // Mock clarification response
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: null,
          extractedData: {},
          uiRequest: {
            requestId: 'clarify_123',
            templateType: 'form',
            semanticData: {
              title: 'Need more information',
              instructions: 'Please provide your business address',
              fields: []
            }
          },
          message: 'Please provide your business address',
          ephemeral: true
        })
      });
      
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
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: null,
          extractedData: {},
          uiRequest: null,
          message: 'Hello! How can I help you with your task?',
          ephemeral: true
        })
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Hello' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.extractedData).toEqual({});
    });

    it('should include UIRequest in response when present', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: null,
          extractedData: {},
          uiRequest: {
            requestId: 'ui_123',
            templateType: 'form'
          },
          message: 'Need clarification',
          ephemeral: true
        })
      });
      
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
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Mock DI resolution failure with task not found error
      DIContainer.resolveAgent.mockRejectedValueOnce(
        new Error('Task test-context-456 not found')
      );
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(404);
      
      expect(response.body.error).toBe('Task not found');
    });

    it('should return 404 for unauthorized task access', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Mock DI resolution failure with task not found (unauthorized)
      DIContainer.resolveAgent.mockRejectedValueOnce(
        new Error('Task test-context-456 not found')
      );
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(404);
      
      expect(response.body.error).toBe('Task not found');
    });

    it('should handle agent processing errors', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockRejectedValue(new Error('Processing failed'))
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(500);
      
      expect(response.body.error).toBe('Failed to process user message');
    });

    it('should handle database errors gracefully', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Mock DI resolution failure with database error
      DIContainer.resolveAgent.mockRejectedValueOnce(
        new Error('Database connection failed')
      );
      
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
      const { RequestContextService } = require('../../../src/services/request-context');
      
      await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test message' })
        .expect(200);
      
      // Verify the context passed includes the userId
      expect(RequestContextService.run).toHaveBeenCalled();
      const callArgs = RequestContextService.run.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('userId', mockUserId);
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
    it('should resolve agent through DI container', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test DI resolution' })
        .expect(200);
      
      expect(DIContainer.resolveAgent).toHaveBeenCalledWith('ux_optimization_agent', mockContextId);
      expect(response.body.success).toBe(true);
    });

    it('should handle DI resolution errors', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Mock DI resolution failure
      DIContainer.resolveAgent = jest.fn().mockRejectedValue(new Error('Agent not registered'));
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test DI failure' })
        .expect(500);
      
      expect(response.body.error).toBe('Failed to process user message');
    });

    it('should pass request context to DI container', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      const { RequestContextService } = require('../../../src/services/request-context');
      
      await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Test context passing' })
        .expect(200);
      
      // Verify RequestContextService.run was called with proper context
      expect(RequestContextService.run).toHaveBeenCalled();
      const callArgs = RequestContextService.run.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('userId', mockUserId);
      expect(callArgs[0]).toHaveProperty('tenantId', mockContextId);
      expect(callArgs[0]).toHaveProperty('businessId', mockContextId);
    });
  });

  describe('Ephemeral Message Handling', () => {
    it('should handle ephemeral messages', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: null,  // null eventId indicates ephemeral
          extractedData: {},
          uiRequest: null,
          message: 'Ephemeral conversation response',
          ephemeral: true
        })
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'What do I do?' })
        .expect(200);
      
      // Ephemeral messages should have null eventId
      expect(response.body.eventId).toBeNull();
      expect(response.body.ephemeral).toBe(true);
      expect(response.body.success).toBe(true);
    });

    it('should persist non-ephemeral messages with data', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: 'event_456',  // has eventId = persisted
          extractedData: { businessName: 'TestCorp' },
          uiRequest: null,
          message: 'Extracted business name',
          ephemeral: false
        })
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'My business is TestCorp' })
        .expect(200);
      
      // Non-ephemeral messages should have eventId
      expect(response.body.eventId).toBe('event_456');
      expect(response.body.ephemeral).toBe(false);
      expect(response.body.success).toBe(true);
      expect(response.body.extractedData).toEqual({ businessName: 'TestCorp' });
    });

    it('should handle messages with minimal response', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: null,
          extractedData: {},
          uiRequest: null,
          message: 'Understood',
          ephemeral: true
        })
      });
      
      const response = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Simple ephemeral message' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Understood');
    });

    it('should differentiate between ephemeral and persistent messages', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Test ephemeral message first
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: null,  // No eventId for ephemeral
          extractedData: {},
          uiRequest: null,
          message: 'Just chatting',
          ephemeral: true
        })
      });
      
      const ephemeralResponse = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Ephemeral' })
        .expect(200);
      
      expect(ephemeralResponse.body.ephemeral).toBe(true);
      expect(ephemeralResponse.body.eventId).toBeNull();
      
      // Test persistent message
      DIContainer.resolveAgent.mockResolvedValueOnce({
        processMessageForAPI: jest.fn().mockResolvedValue({
          success: true,
          contextId: mockContextId,
          eventId: 'event_789',  // Has eventId for persistent
          extractedData: { field: 'value' },
          uiRequest: null,
          message: 'Extracted data',
          ephemeral: false
        })
      });
      
      const persistentResponse = await request(app)
        .post(`/api/tasks/${mockContextId}/message`)
        .send({ message: 'Persistent message with data' })
        .expect(200);
      
      expect(persistentResponse.body.ephemeral).toBe(false);
      expect(persistentResponse.body.eventId).toBe('event_789');
    });
  });

  describe('Complete Flow Integration', () => {
    it('should handle complete conversation flow with DI', async () => {
      const { DIContainer } = require('../../../src/services/dependency-injection');
      
      // Mock varying responses for a conversation flow
      const responses = [
        { 
          success: true,
          contextId: mockContextId,
          eventId: null,
          extractedData: {},
          uiRequest: null,
          message: 'How can I help you?',
          ephemeral: true 
        },
        { 
          success: true,
          contextId: mockContextId,
          eventId: 'event_persist_1',
          extractedData: { name: 'Test' },
          uiRequest: null,
          message: 'I extracted your business name',
          ephemeral: false 
        },
        { 
          success: true,
          contextId: mockContextId,
          eventId: null,
          extractedData: {},
          uiRequest: null,
          message: 'Is there anything else?',
          ephemeral: true 
        }
      ];
      
      // Send multiple messages in a conversation
      for (let i = 0; i < 3; i++) {
        DIContainer.resolveAgent.mockResolvedValueOnce({
          processMessageForAPI: jest.fn().mockResolvedValue(responses[i])
        });
        
        const response = await request(app)
          .post(`/api/tasks/${mockContextId}/message`)
          .send({ message: `Message ${i}` })
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.ephemeral).toBe(responses[i].ephemeral);
        
        // Only the second message should have an eventId (persisted)
        if (i === 1) {
          expect(response.body.eventId).toBe('event_persist_1');
        } else {
          expect(response.body.eventId).toBeNull();
        }
      }
    });
  });
});