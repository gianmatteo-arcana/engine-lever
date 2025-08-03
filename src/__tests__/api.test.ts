import request from 'supertest';
import express from 'express';
import { apiRoutes } from '../api';

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

  describe('POST /api/webhooks/supabase', () => {
    it('should process webhook successfully', async () => {
      const webhookData = {
        event: 'task_created',
        data: { taskId: '123', userId: 'user-123' }
      };

      const response = await request(app)
        .post('/api/webhooks/supabase')
        .send(webhookData)
        .expect(200);

      expect(response.body).toEqual({
        status: 'received',
        timestamp: expect.any(String)
      });
    });

    it('should handle empty webhook data', async () => {
      const response = await request(app)
        .post('/api/webhooks/supabase')
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        status: 'received',
        timestamp: expect.any(String)
      });
    });

    it('should handle webhook processing successfully', async () => {
      const response = await request(app)
        .post('/api/webhooks/supabase')
        .send({ test: 'data' })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'received');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/agents', () => {
    it('should return agents list', async () => {
      const response = await request(app)
        .get('/api/agents')
        .expect(200);

      expect(response.body).toEqual({
        agents: [],
        count: 0,
        timestamp: expect.any(String)
      });
    });
  });

  describe('POST /api/agents/:agentId/tasks', () => {
    it('should assign task to agent', async () => {
      const agentId = 'agent-123';
      const taskData = {
        type: 'business_analysis',
        data: { company: 'Test Corp' }
      };

      const response = await request(app)
        .post(`/api/agents/${agentId}/tasks`)
        .send(taskData)
        .expect(200);

      expect(response.body).toEqual({
        status: 'task_queued',
        agentId,
        taskId: expect.stringMatching(/^task_\d+$/),
        timestamp: expect.any(String)
      });
    });

    it('should handle empty task data', async () => {
      const agentId = 'agent-123';

      const response = await request(app)
        .post(`/api/agents/${agentId}/tasks`)
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        status: 'task_queued',
        agentId,
        taskId: expect.stringMatching(/^task_\d+$/),
        timestamp: expect.any(String)
      });
    });

    it('should handle special characters in agentId', async () => {
      const agentId = 'agent-test_123';

      const response = await request(app)
        .post(`/api/agents/${agentId}/tasks`)
        .send({ type: 'test' })
        .expect(200);

      expect(response.body.agentId).toBe(agentId);
    });
  });

  describe('GET /api/tools', () => {
    it('should return tools list', async () => {
      const response = await request(app)
        .get('/api/tools')
        .expect(200);

      expect(response.body).toEqual({
        tools: [],
        count: 0,
        timestamp: expect.any(String)
      });
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
        result: 'Tool execution stub',
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
        result: 'Tool execution stub',
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

  describe('GET /api/queues/status', () => {
    it('should return queue status', async () => {
      const response = await request(app)
        .get('/api/queues/status')
        .expect(200);

      expect(response.body).toEqual({
        queues: {
          agents: { active: 0, waiting: 0, completed: 0, failed: 0 },
          mcp: { active: 0, waiting: 0, completed: 0, failed: 0 },
          general: { active: 0, waiting: 0, completed: 0, failed: 0 }
        },
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/webhooks/supabase')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle missing Content-Type header', async () => {
      await request(app)
        .post('/api/webhooks/supabase')
        .send('plain text data')
        .expect(200); // Express should handle this gracefully
    });
  });

  describe('Route parameters validation', () => {
    it('should handle empty agentId', async () => {
      await request(app)
        .post('/api/agents//tasks')
        .send({ type: 'test' })
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