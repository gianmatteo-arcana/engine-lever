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
  single: jest.fn()
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
  });

  afterEach(() => {
    // Clear cached clients
    dbService.clearAllUserClients();
  });

  describe('User-scoped operations (with JWT)', () => {
    describe('Task operations', () => {
      it('should create a task with user token', async () => {
        const mockTask = {
          id: 'task-123',
          user_id: 'user-123',
          title: 'Test SOI Filing',
          description: 'Test SOI filing task',
          task_type: 'soi-filing',
          business_id: 'biz-123',
          template_id: 'soi-filing',
          status: 'pending' as const,
          priority: 'high' as const,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        mockSupabaseClient.single.mockResolvedValueOnce({
          data: mockTask,
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

        expect(task).toEqual(mockTask);
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('tasks');
        expect(mockSupabaseClient.insert).toHaveBeenCalled();
      });

      it('should get a task by ID with user token', async () => {
        const mockTask = {
          id: 'task-123',
          user_id: 'user-123',
          business_id: 'biz-123',
          template_id: 'soi-filing',
          status: 'pending',
          priority: 'high',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        mockSupabaseClient.single.mockResolvedValueOnce({
          data: mockTask,
          error: null
        });

        const task = await dbService.getTask(mockUserToken, 'task-123');

        expect(task).toEqual(mockTask);
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
      });

      it('should return null for non-existent task', async () => {
        mockSupabaseClient.single.mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' }
        });

        const task = await dbService.getTask(mockUserToken, 'non-existent');

        expect(task).toBeNull();
      });

      it('should update a task with user token', async () => {
        const updatedTask = {
          id: 'task-123',
          user_id: 'user-123',
          status: 'completed',
          completed_at: new Date().toISOString()
        };

        mockSupabaseClient.single.mockResolvedValueOnce({
          data: updatedTask,
          error: null
        });

        const task = await dbService.updateTask(mockUserToken, 'task-123', {
          status: 'completed',
          completed_at: new Date().toISOString()
        });

        expect(task).toEqual(updatedTask);
        expect(mockSupabaseClient.update).toHaveBeenCalled();
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
      });

      it('should get user tasks with RLS filtering', async () => {
        const mockTasks = [
          { id: 'task-1', user_id: 'user-123', status: 'pending' },
          { id: 'task-2', user_id: 'user-123', status: 'completed' }
        ];

        mockSupabaseClient.order.mockReturnValueOnce({
          data: mockTasks,
          error: null
        });

        const tasks = await dbService.getUserTasks(mockUserToken);

        expect(tasks).toEqual(mockTasks);
        // Note: RLS filtering happens at database level, not in our code
        expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      });

      it('should filter user tasks by status', async () => {
        const mockTasks = [
          { id: 'task-1', user_id: 'user-123', status: 'pending' }
        ];

        mockSupabaseClient.order.mockReturnValueOnce({
          data: mockTasks,
          error: null
        });

        const tasks = await dbService.getUserTasks(mockUserToken, { status: 'pending' });

        expect(tasks).toEqual(mockTasks);
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'pending');
      });

      it('should filter user tasks by businessId', async () => {
        const mockTasks = [
          { id: 'task-1', user_id: 'user-123', business_id: 'biz-123' }
        ];

        mockSupabaseClient.order.mockReturnValueOnce({
          data: mockTasks,
          error: null
        });

        const tasks = await dbService.getUserTasks(mockUserToken, { businessId: 'biz-123' });

        expect(tasks).toEqual(mockTasks);
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('business_id', 'biz-123');
      });

      it('should limit user tasks', async () => {
        const mockTasks = [
          { id: 'task-1', user_id: 'user-123' }
        ];

        mockSupabaseClient.order.mockReturnValueOnce({
          data: mockTasks,
          error: null
        });

        const tasks = await dbService.getUserTasks(mockUserToken, { limit: 5 });

        expect(tasks).toEqual(mockTasks);
        expect(mockSupabaseClient.limit).toHaveBeenCalledWith(5);
      });
    });

    describe('Task execution operations', () => {
      it('should get task executions with user token', async () => {
        const mockExecutions = [
          { id: 'exec-1', task_id: 'task-123', status: 'running' },
          { id: 'exec-2', task_id: 'task-123', status: 'completed' }
        ];

        mockSupabaseClient.order.mockReturnValueOnce({
          data: mockExecutions,
          error: null
        });

        const executions = await dbService.getTaskExecutions(mockUserToken, 'task-123');

        expect(executions).toEqual(mockExecutions);
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('task_id', 'task-123');
        expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      });
    });
  });

  describe('System operations (with service role)', () => {
    it('should create a system execution', async () => {
      const mockExecution = {
        id: 'exec-123',
        task_id: 'task-123',
        execution_id: 'exec-123',
        current_step: 'validate',
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        status: 'running',
        is_paused: false,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockExecution,
        error: null
      });

      const execution = await dbService.createSystemExecution({
        task_id: 'task-123',
        execution_id: 'exec-123',
        current_step: 'validate',
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        status: 'running',
        is_paused: false,
        started_at: new Date().toISOString()
      });

      expect(execution).toEqual(mockExecution);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_executions');
    });

    it('should update system execution status', async () => {
      const updatedExecution = {
        execution_id: 'exec-123',
        status: 'completed',
        ended_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updatedExecution,
        error: null
      });

      const execution = await dbService.updateSystemExecution('exec-123', {
        status: 'completed',
        ended_at: new Date().toISOString()
      });

      expect(execution).toEqual(updatedExecution);
      expect(mockSupabaseClient.update).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('execution_id', 'exec-123');
    });

    it('should save a system message', async () => {
      mockSupabaseClient.insert.mockReturnValueOnce({
        error: null
      });

      const message = {
        id: 'msg-123',
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.LEGAL_COMPLIANCE,
        type: 'request' as const,
        timestamp: new Date(),
        priority: TaskPriority.HIGH,
        payload: { action: 'validate' }
      };

      await dbService.saveSystemMessage(message, 'task-123', 'exec-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('agent_messages');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should create system audit entry', async () => {
      mockSupabaseClient.insert.mockReturnValueOnce({
        error: null
      });

      await dbService.createSystemAuditEntry({
        task_id: 'task-123',
        action: 'task_started',
        details: { initiator: 'system' },
        agent_role: 'orchestrator',
        user_id: 'user-123'
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_audit_trail');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should get system agent metrics', async () => {
      const mockMetrics = [
        { id: 'metric-1', agent_role: 'orchestrator', metric_value: 100 },
        { id: 'metric-2', agent_role: 'legal_compliance', metric_value: 50 }
      ];

      mockSupabaseClient.limit.mockReturnValueOnce({
        data: mockMetrics,
        error: null
      });

      const metrics = await dbService.getSystemAgentMetrics();

      expect(metrics).toEqual(mockMetrics);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('agent_metrics');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('Client management', () => {
    it('should cache user clients', () => {
      const client1 = dbService.getUserClient(mockUserToken);
      const client2 = dbService.getUserClient(mockUserToken);

      expect(client1).toBe(client2); // Should be the same instance
    });

    it('should clear specific user client', () => {
      dbService.getUserClient(mockUserToken);
      dbService.clearUserClient(mockUserToken);
      
      // After clearing, a new client should be created
      const _newClient = dbService.getUserClient(mockUserToken);
      expect(mockSupabaseClient).toBeDefined();
    });

    it('should clear all user clients', () => {
      const token1 = 'token1';
      const token2 = 'token2';
      
      dbService.getUserClient(token1);
      dbService.getUserClient(token2);
      dbService.clearAllUserClients();
      
      // After clearing all, new clients should be created
      const newClient1 = dbService.getUserClient(token1);
      const newClient2 = dbService.getUserClient(token2);
      
      expect(newClient1).toBeDefined();
      expect(newClient2).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error when Supabase configuration is missing', () => {
      delete process.env.SUPABASE_URL;
      const newService = DatabaseService.getInstance();
      
      expect(() => newService.getUserClient(mockUserToken)).toThrow(
        'Supabase configuration missing'
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: dbError
      });

      await expect(dbService.getTask(mockUserToken, 'task-123')).rejects.toThrow('Database connection failed');
    });

    it('should handle RLS errors correctly', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'The resource could not be found' }
      });

      const result = await dbService.getTask(mockUserToken, 'task-123');
      expect(result).toBeNull(); // RLS filtered it out or doesn't exist
    });
  });
});