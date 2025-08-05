/**
 * Tests for SSE Streaming API
 */

import request from 'supertest';
import express from 'express';
import { streamingRoutes } from '../streaming';
import { DatabaseService } from '../../services/database';
import { taskEventEmitter, emitTaskEvent } from '../../services/task-events';

// Mock dependencies
jest.mock('../../services/database');
jest.mock('../../utils/logger');

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  requireAuth: jest.fn((req: any, res: any, next: any) => {
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
app.use('/api/streaming', streamingRoutes);

// Mock database service
const mockDbServiceInstance = {
  getTask: jest.fn(),
  getUserTasks: jest.fn()
};

(DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbServiceInstance);

describe('SSE Streaming API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    taskEventEmitter.removeAllListeners();
  });

  describe('GET /api/streaming/task/:taskId', () => {
    it('should return 404 for non-existent task', async () => {
      mockDbServiceInstance.getTask.mockResolvedValue(null);

      await request(app)
        .get('/api/streaming/task/non-existent')
        .expect(404)
        .expect({ error: 'Task not found' });
    });

    // Note: Full SSE testing requires proper EventSource client
    // These tests verify basic setup only
  });

  // Note: SSE endpoints are tested for basic functionality only
  // Full streaming tests would require EventSource client

  describe('emitTaskEvent', () => {
    it('should emit events with correct format', (done) => {
      const testData = { taskId: 'test-123', progress: 50 };

      taskEventEmitter.once('task:progress', (data) => {
        expect(data).toEqual(testData);
        done();
      });

      emitTaskEvent('progress', testData);
    });

    it('should emit wildcard events for user streams', (done) => {
      const testData = { taskId: 'test-123', status: 'completed' };

      taskEventEmitter.once('task:*', (data) => {
        expect(data).toEqual({ ...testData, eventType: 'completed' });
        done();
      });

      emitTaskEvent('completed', testData);
    });
  });

  describe('Event listener management', () => {
    it('should add and remove listeners', () => {
      const initialCount = taskEventEmitter.listenerCount('task:status');
      
      // Add a listener
      const listener = () => {};
      taskEventEmitter.on('task:status', listener);
      expect(taskEventEmitter.listenerCount('task:status')).toBe(initialCount + 1);
      
      // Remove the listener
      taskEventEmitter.off('task:status', listener);
      expect(taskEventEmitter.listenerCount('task:status')).toBe(initialCount);
    });
  });
});