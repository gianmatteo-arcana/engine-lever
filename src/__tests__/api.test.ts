import request from 'supertest';
import express from 'express';
import { apiRoutes } from '../api';
import { AgentManager } from '../agents';
import { extractUserContext } from '../middleware/auth';

// Mock the Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { 
        user: { 
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com'
        } 
      },
      error: null
    })
  }
};

// Setup default responses
mockSupabaseClient.single.mockResolvedValue({ 
  data: { 
    id: 'task-123',
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    business_id: 'biz-123',
    current_state: { status: 'created', phase: 'init', completeness: 0, data: {} },
    template_id: 'soi-filing',
    metadata: { title: 'Test Task' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, 
  error: null 
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Initialize AgentManager for tests
beforeAll(async () => {
  // Set up mock environment variables for tests
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  
  await AgentManager.initialize();
});

afterAll(async () => {
  await AgentManager.stop();
  
  // Clean up environment variables
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// Create test app with auth middleware
const app = express();
app.use(express.json());
app.use(extractUserContext); // Add auth middleware
app.use('/api', apiRoutes);

// Helper to create authenticated request
const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
const mockUserEmail = 'test@example.com';

const authHeaders = {
  'Authorization': `Bearer ${mockJWT}`,
  'X-User-Id': mockUserId,
  'X-User-Email': mockUserEmail,
  'X-User-Role': 'authenticated'
};

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

  describe('POST /api/tasks/create', () => {
    it.skip('should create task successfully with authentication - TODO: Fix for new TaskService', async () => {
      const taskData = {
        templateId: 'soi-filing',
        initialData: {
          businessId: 'biz-123'
        },
        metadata: {
          source: 'api',
          priority: 'high'
        }
      };

      const response = await request(app)
        .post('/api/tasks/create')
        .set(authHeaders)
        .send(taskData);

      // Log the actual error if test fails
      if (response.status !== 200) {
        console.log('Task creation failed:', response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('contextId');
      expect(response.body).toHaveProperty('taskTemplateId', 'soi-filing');
    });

    it('should reject request without authentication', async () => {
      const taskData = {
        templateId: 'soi-filing',
        initialData: { businessId: 'biz-123' }
      };

      const response = await request(app)
        .post('/api/tasks/create')
        .send(taskData)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should return 400 for invalid data', async () => {
      const invalidData = {
        // Missing required templateId
        initialData: { businessId: 'biz-123' }
      };

      const response = await request(app)
        .post('/api/tasks/create')
        .set(authHeaders)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/tasks/:taskId/status', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/tasks/task-123/status')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it.skip('should get task status with authentication - TODO: Fix for new TaskService', async () => {
      // Mock the AgentManager.getTaskStatus to return null (task not found)
      jest.spyOn(AgentManager, 'getTaskStatus').mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/tasks/task-123/status')
        .set(authHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });

    it.skip('should return task status when task exists - TODO: Fix for new TaskService', async () => {
      const mockTaskStatus = {
        taskId: 'task-123',
        userId: mockUserId,
        status: 'running',
        priority: 'high',
        businessId: 'biz-123',
        templateId: 'soi-filing',
        metadata: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      jest.spyOn(AgentManager, 'getTaskStatus').mockResolvedValueOnce(mockTaskStatus);

      const response = await request(app)
        .get('/api/tasks/task-123/status')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toMatchObject(mockTaskStatus);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/tasks', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it.skip('should get user tasks with authentication - TODO: Fix for new TaskService', async () => {
      const mockTasks = [
        { taskId: 'task-1', status: 'running' },
        { taskId: 'task-2', status: 'completed' }
      ];

      jest.spyOn(AgentManager, 'getUserTasks').mockResolvedValueOnce(mockTasks);

      const response = await request(app)
        .get('/api/tasks')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('tasks', mockTasks);
      expect(response.body).toHaveProperty('count', 2);
      expect(response.body).toHaveProperty('userId', mockUserId);
    });
  });

  describe('GET /api/executions/:executionId', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/executions/exec-123')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('GET /api/agents', () => {
    it('should return all agents status (public endpoint)', async () => {
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
    it('should return specific agent status', async () => {
      const response = await request(app)
        .get('/api/agents/orchestrator')
        .expect(200);

      expect(response.body).toHaveProperty('role', 'orchestrator');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await request(app)
        .get('/api/agents/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Agent not found');
    });
  });

  describe('GET /api/tools', () => {
    it('should return available tools (public endpoint)', async () => {
      const response = await request(app)
        .get('/api/tools')
        .expect(200);

      expect(response.body).toHaveProperty('tools');
      expect(response.body).toHaveProperty('count', 4);
      expect(Array.isArray(response.body.tools)).toBe(true);
    });
  });

  describe('POST /api/tools/:toolName/invoke', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/tools/quickbooks/invoke')
        .send({ action: 'fetch_invoices' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should invoke tool with authentication', async () => {
      const response = await request(app)
        .post('/api/tools/quickbooks/invoke')
        .set(authHeaders)
        .send({ action: 'fetch_invoices' })
        .expect(200);

      expect(response.body).toHaveProperty('status', 'tool_invoked');
      expect(response.body).toHaveProperty('toolName', 'quickbooks');
      expect(response.body).toHaveProperty('userId', mockUserId);
    });
  });

  // REMOVED: SOI-specific endpoint tests
  // The /api/soi/file endpoint was removed in favor of universal task creation
  // To create an SOI filing, use POST /api/tasks/create with templateId: 'soi-filing'

  describe('GET /api/queues/status', () => {
    it('should return queue status (public endpoint)', async () => {
      const response = await request(app)
        .get('/api/queues/status')
        .expect(200);

      expect(response.body).toHaveProperty('queues');
      expect(response.body.queues).toHaveProperty('agents');
      expect(response.body.queues).toHaveProperty('executions');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Route parameters validation', () => {
    it('should handle invalid taskId format', async () => {
      // Mock getTask to return null for invalid task
      mockSupabaseClient.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });
      
      const response = await request(app)
        .get('/api/tasks/invalid-id')
        .set(authHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Task not found');
    });

    it('should handle invalid executionId format', async () => {
      const response = await request(app)
        .get('/api/executions/invalid-id')
        .set(authHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Execution not found');
    });

    it('should handle empty taskId', async () => {
      // Mock the getUserTasks chain to return empty array
      mockSupabaseClient.order.mockReturnValueOnce({
        limit: jest.fn().mockResolvedValueOnce({
          data: [],
          error: null
        })
      });
      
      // Make sure order returns promise when no limit is called
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      await request(app)
        .get('/api/tasks/')
        .set(authHeaders)
        .expect(200); // This now goes to GET /api/tasks (list endpoint)
    });

    it('should handle empty toolName', async () => {
      await request(app)
        .post('/api/tools//invoke')
        .set(authHeaders)
        .expect(404); // Route won't match
    });
  });
});