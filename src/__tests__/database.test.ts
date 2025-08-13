import { DatabaseService } from '../services/database';
import { TaskPriority, AgentRole } from '../agents/base/types';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    })
  }
};

// Mock the Supabase module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  const mockUserToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

  beforeEach(() => {
    jest.clearAllMocks();
    dbService = DatabaseService.getInstance();
    // Set environment variables for the service
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    
    // Default mock responses for new schema
    mockSupabaseClient.single.mockResolvedValue({
      data: {
        id: 'default-id',
        business_id: 'biz-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      error: null
    });
  });

  afterEach(() => {
    // Clear cached clients
    dbService.clearAllUserClients();
  });

  describe('User-scoped operations (with JWT)', () => {
    describe('Task operations', () => {
      it('should create a task with user token', async () => {
        // Mock business lookup
        mockSupabaseClient.single
          .mockResolvedValueOnce({ data: null, error: null }) // No existing business
          .mockResolvedValueOnce({ // New business creation
            data: { id: 'biz-123', name: 'Test Business' },
            error: null
          })
          .mockResolvedValueOnce({ // Context creation
            data: { 
              id: 'context-123',
              business_id: 'biz-123',
              current_state: { status: 'created', phase: 'init', completeness: 0, data: {} }
            },
            error: null
          });

        const task = await dbService.createTask(mockUserToken, {
          user_id: 'user-123',
          title: 'Test SOI Filing',
          description: 'Test SOI filing task',
          task_type: 'soi-filing',
          business_id: 'biz-123',
          template_id: 'soi-filing',
          status: 'pending',
          priority: 'high',
          metadata: {}
        });

        expect(task).toBeDefined();
        expect(task.id).toBeDefined();
        expect(task.user_id).toBe('user-123');
      });

      it('should get a task by ID with user token', async () => {
        mockSupabaseClient.single.mockResolvedValueOnce({
          data: {
            id: 'task-123',
            business_id: 'biz-123',
            current_state: { status: 'active', phase: 'processing', completeness: 50, data: {} },
            template_id: 'soi-filing',
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          error: null
        });

        const task = await dbService.getTask(mockUserToken, 'task-123');

        expect(task).toBeDefined();
        if (task) {
          expect(task.id).toBe('task-123');
        }
      });

      it('should return null for non-existent task', async () => {
        mockSupabaseClient.single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' }
        });

        const task = await dbService.getTask(mockUserToken, 'non-existent');
        expect(task).toBeNull();
      });

      it('should update a task with user token', async () => {
        // Mock for adding context event
        mockSupabaseClient.single.mockResolvedValueOnce({
          data: { id: 'event-123', sequence_number: 1 },
          error: null
        });
        
        // Mock for getting updated task
        mockSupabaseClient.single.mockResolvedValueOnce({
          data: {
            id: 'task-123',
            business_id: 'biz-123',
            current_state: { status: 'completed', phase: 'done', completeness: 100, data: {} },
            template_id: 'soi-filing',
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          error: null
        });

        const updates = { status: 'completed' as const };
        const updated = await dbService.updateTask(mockUserToken, 'task-123', updates);

        expect(updated).toBeDefined();
        expect(updated.id).toBe('task-123');
      });

      it('should get user tasks with RLS filtering', async () => {
        // Mock getting user businesses
        mockSupabaseClient.select.mockReturnValueOnce({
          eq: jest.fn().mockResolvedValueOnce({
            data: [{ businesses: { id: 'biz-123', name: 'Test Biz' } }],
            error: null
          })
        });
        
        // Mock getting contexts for business
        const mockReset = mockSupabaseClient.from;
        mockSupabaseClient.from = jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValueOnce({
            data: [{
              id: 'ctx-1',
              business_id: 'biz-123',
              current_state: { status: 'active', phase: 'processing', completeness: 50, data: {} },
              template_id: 'soi-filing',
              metadata: { title: 'Task 1' },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }],
            error: null
          })
        });

        const tasks = await dbService.getUserTasks(mockUserToken);

        expect(Array.isArray(tasks)).toBe(true);
        mockSupabaseClient.from = mockReset;
      });

      it('should filter user tasks by status', async () => {
        // Mock getting user businesses
        mockSupabaseClient.select.mockReturnValueOnce({
          eq: jest.fn().mockResolvedValueOnce({
            data: [{ businesses: { id: 'biz-123', name: 'Test Biz' } }],
            error: null
          })
        });
        
        // Mock getting contexts with status filter
        const mockReset = mockSupabaseClient.from;
        mockSupabaseClient.from = jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValueOnce({
            data: [],
            error: null
          })
        });

        const tasks = await dbService.getUserTasks(mockUserToken, { status: 'pending' });

        expect(Array.isArray(tasks)).toBe(true);
        mockSupabaseClient.from = mockReset;
      });

      it('should filter user tasks by businessId', async () => {
        // Mock getting user businesses
        mockSupabaseClient.select.mockReturnValueOnce({
          eq: jest.fn().mockResolvedValueOnce({
            data: [{ businesses: { id: 'biz-123', name: 'Test Biz' } }],
            error: null
          })
        });
        
        // Mock getting contexts for specific business
        const mockReset = mockSupabaseClient.from;
        mockSupabaseClient.from = jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValueOnce({
            data: [],
            error: null
          })
        });

        const tasks = await dbService.getUserTasks(mockUserToken, { businessId: 'biz-123' });

        expect(Array.isArray(tasks)).toBe(true);
        mockSupabaseClient.from = mockReset;
      });

      it('should limit user tasks', async () => {
        // Mock getting user businesses
        mockSupabaseClient.select.mockReturnValueOnce({
          eq: jest.fn().mockResolvedValueOnce({
            data: [{ businesses: { id: 'biz-123', name: 'Test Biz' } }],
            error: null
          })
        });
        
        // Mock getting limited contexts
        const mockReset = mockSupabaseClient.from;
        mockSupabaseClient.from = jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValueOnce({
            data: [],
            error: null
          })
        });

        const tasks = await dbService.getUserTasks(mockUserToken, { limit: 10 });

        expect(Array.isArray(tasks)).toBe(true);
        mockSupabaseClient.from = mockReset;
      });
    });

    describe('Task execution operations', () => {
      it('should get task executions with user token', async () => {
        // Mock getting context events
        mockSupabaseClient.order.mockResolvedValueOnce({
          data: [
            { id: 'event-1', sequence_number: 1, operation: 'start', created_at: new Date().toISOString() },
            { id: 'event-2', sequence_number: 2, operation: 'update', created_at: new Date().toISOString() }
          ],
          error: null
        });

        const executions = await dbService.getTaskExecutions(mockUserToken, 'task-123');

        expect(Array.isArray(executions)).toBe(true);
        expect(executions).toHaveLength(1);
        if (executions.length > 0) {
          expect(executions[0].task_id).toBe('task-123');
        }
      });
    });
  });

  describe('System operations (with service role)', () => {
    it('should create a system execution', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'event-123', sequence_number: 1 },
        error: null
      });

      const execution = await dbService.createSystemExecution({
        task_id: 'task-123',
        execution_id: 'exec-123',
        status: 'running',
        started_at: new Date().toISOString(),
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        is_paused: false
      });

      expect(execution).toBeDefined();
      expect(execution.execution_id).toBe('exec-123');
    });

    it('should update system execution status', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'event-123', sequence_number: 2 },
        error: null
      });

      const updated = await dbService.updateSystemExecution('exec-123', {
        status: 'completed',
        ended_at: new Date().toISOString()
      });

      expect(updated).toBeDefined();
      expect(updated.execution_id).toBe('exec-123');
    });

    it('should save a system message', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'audit-123' },
        error: null
      });

      await expect(dbService.saveSystemMessage({
        id: 'msg-123',
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.LEGAL_COMPLIANCE,
        type: 'request',
        priority: TaskPriority.HIGH,
        payload: { test: true },
        timestamp: new Date()
      }, 'task-123', 'exec-123')).resolves.not.toThrow();
    });

    it('should create system audit entry', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'audit-123' },
        error: null
      });

      await expect(dbService.createSystemAuditEntry({
        task_id: 'task-123',
        agent_role: 'orchestrator',
        action: 'task_started',
        details: { test: true }
      })).resolves.not.toThrow();
    });

    it('should get system agent metrics', async () => {
      mockSupabaseClient.order.mockResolvedValueOnce({
        data: [
          { id: 'metric-1', resource_type: 'agent_message' },
          { id: 'metric-2', resource_type: 'agent_message' }
        ],
        error: null
      });

      const metrics = await dbService.getSystemAgentMetrics();

      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics).toHaveLength(2);
    });
  });

  describe('Client management', () => {
    it('should cache user clients', () => {
      const client1 = dbService.getUserClient('token-1');
      const client2 = dbService.getUserClient('token-1');

      expect(client1).toBe(client2);
    });

    it('should clear specific user client', () => {
      dbService.getUserClient('token-1');
      dbService.clearUserClient('token-1');

      const newClient = dbService.getUserClient('token-1');
      expect(newClient).toBeDefined();
    });

    it('should clear all user clients', () => {
      dbService.getUserClient('token-1');
      dbService.getUserClient('token-2');
      dbService.clearAllUserClients();

      // Should create new clients after clearing
      const newClient1 = dbService.getUserClient('token-1');
      const newClient2 = dbService.getUserClient('token-2');

      expect(newClient1).toBeDefined();
      expect(newClient2).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error when Supabase configuration is missing', () => {
      delete process.env.SUPABASE_URL;
      // Reset singleton
      (DatabaseService as any).instance = undefined;
      
      const newService = DatabaseService.getInstance();
      expect(() => newService.getUserClient('token')).toThrow('Supabase configuration missing');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error', code: 'DB001' }
      });

      await expect(dbService.getContext('task-123')).rejects.toThrow();
    });

    it('should handle RLS errors correctly', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      const result = await dbService.getContext('task-123');
      expect(result).toBeNull();
    });
  });
});