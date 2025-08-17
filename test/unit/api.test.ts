import request from 'supertest';
import express from 'express';
import { apiRoutes } from '../../src/api';

// Mock dependencies to avoid real initialization
jest.mock('../../src/agents', () => ({
  AgentManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockReturnValue(true)
  }
}));

jest.mock('../../src/middleware/auth', () => ({
  extractUserContext: (req: any, res: any, next: any) => next(),
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.userId = 'test-user-id';
    req.userToken = 'test-token';
    next();
  }
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('API Routes', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        module: 'api'
      });
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication for protected routes', async () => {
      const response = await request(app)
        .post('/api/tasks/create')
        .send({ templateId: 'test' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });
});