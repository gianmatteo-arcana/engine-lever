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
    
    (UXOptimizationAgent as jest.Mock).mockImplementation(() => ({
      handleUserMessage: mockHandleUserMessage
    }));
    
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
        .send({ message: 'My business needs help' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // Check for uiRequest which contains clarification
      expect(response.body).toHaveProperty('uiRequest');
    });

    it('should handle empty extracted data', async () => {
      const mockAgent = UXOptimizationAgent as jest.Mock;
      mockAgent.mockImplementationOnce(() => ({
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
});