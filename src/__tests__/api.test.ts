import request from 'supertest';
import express from 'express';
import { apiRoutes } from '../api';
import { AgentManager } from '../agents';

// Initialize AgentManager for tests
beforeAll(async () => {
  await AgentManager.initialize();
});

afterAll(async () => {
  await AgentManager.stop();
});

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

  describe('POST /api/tasks', () => {
    it('should create task successfully', async () => {
      const taskData = {
        userId: 'user-123',
        businessId: 'biz-123',
        templateId: 'soi-filing',
        priority: 'high'
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('taskId');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should handle invalid task data', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid priority', async () => {
      const taskData = {
        userId: 'user-123',
        businessId: 'biz-123',
        templateId: 'soi-filing',
        priority: 'invalid'
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    it('should return task status', async () => {
      const response = await request(app)
        .get('/api/tasks/task-123')
        .expect(200);

      expect(response.body).toHaveProperty('taskId', 'task-123');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/executions/:executionId', () => {
    it('should return 404 for non-existent execution', async () => {
      const response = await request(app)
        .get('/api/executions/exec-nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Execution not found');
    });
  });

  describe('GET /api/agents', () => {
    it('should return agents list', async () => {
      const response = await request(app)
        .get('/api/agents')
        .expect(200);

      expect(response.body).toHaveProperty('agents');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.agents)).toBe(true);
    });
  });

  describe('GET /api/agents/:role', () => {
    it('should return agent status by role', async () => {
      const response = await request(app)
        .get('/api/agents/orchestrator')
        .expect(200);

      expect(response.body).toHaveProperty('role', 'orchestrator');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 for unknown agent', async () => {
      const response = await request(app)
        .get('/api/agents/unknown')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Agent not found');
    });
  });

  describe('GET /api/tools', () => {
    it('should return tools list', async () => {
      const response = await request(app)
        .get('/api/tools')
        .expect(200);

      expect(response.body).toHaveProperty('tools');
      expect(response.body).toHaveProperty('count', 4);
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.tools)).toBe(true);
      expect(response.body.tools.length).toBe(4);
    });
  });

  describe('POST /api/tools/:toolName/invoke', () => {
    it('should invoke tool successfully', async () => {
      const toolName = 'business_analyzer';
      const toolParams = {
        data: { revenue: 100000 },
        analysisType: 'financial'
      };

      const response = await request(app)
        .post(`/api/tools/${toolName}/invoke`)
        .send(toolParams)
        .expect(200);

      expect(response.body).toEqual({
        status: 'tool_invoked',
        toolName,
        result: 'Tool execution pending implementation',
        timestamp: expect.any(String)
      });
    });

    it('should handle empty tool parameters', async () => {
      const toolName = 'document_processor';

      const response = await request(app)
        .post(`/api/tools/${toolName}/invoke`)
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        status: 'tool_invoked',
        toolName,
        result: 'Tool execution pending implementation',
        timestamp: expect.any(String)
      });
    });

    it('should handle special characters in toolName', async () => {
      const toolName = 'test_tool-v2.0';

      const response = await request(app)
        .post(`/api/tools/${toolName}/invoke`)
        .send({ param: 'value' })
        .expect(200);

      expect(response.body.toolName).toBe(toolName);
    });
  });

  describe('POST /api/soi/file', () => {
    it('should initiate SOI filing', async () => {
      const soiData = {
        userId: 'user-123',
        businessId: 'biz-123',
        businessData: {
          businessType: 'LLC',
          incorporationDate: '2024-01-01'
        }
      };

      const response = await request(app)
        .post('/api/soi/file')
        .send(soiData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'SOI filing initiated');
      expect(response.body).toHaveProperty('taskId');
      expect(response.body).toHaveProperty('executionId');
      expect(response.body).toHaveProperty('estimatedCompletion');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/soi/file')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });
  });

  describe('GET /api/queues/status', () => {
    it('should return queue status', async () => {
      const response = await request(app)
        .get('/api/queues/status')
        .expect(200);

      expect(response.body).toHaveProperty('queues');
      expect(response.body.queues).toHaveProperty('agents');
      expect(response.body.queues).toHaveProperty('executions');
      expect(response.body.queues.agents).toHaveProperty('active');
      expect(response.body.queues.agents).toHaveProperty('idle');
      expect(response.body.queues.agents).toHaveProperty('error');
      expect(response.body.queues.executions).toHaveProperty('running');
      expect(response.body.queues.executions).toHaveProperty('completed');
      expect(response.body.queues.executions).toHaveProperty('failed');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app)
        .get('/api/unknown-route')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });

  describe('Route parameters validation', () => {
    it('should handle empty taskId', async () => {
      await request(app)
        .get('/api/tasks/')
        .expect(404); // Route won't match
    });

    it('should handle empty toolName', async () => {
      await request(app)
        .post('/api/tools//invoke')
        .send({ param: 'value' })
        .expect(404); // Route won't match
    });
  });
});