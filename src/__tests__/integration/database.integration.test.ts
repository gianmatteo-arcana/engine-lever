/**
 * Database Integration Tests
 * Tests database operations with the new business-centric schema
 */

import { DatabaseService } from '../../services/database';

// Mock Supabase
const mockAuth = {
  getUser: jest.fn().mockResolvedValue({
    data: { user: { id: 'test-user-123' } },
    error: null
  })
};

const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
  auth: mockAuth
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

describe('Database Integration Tests', () => {
  let dbService: DatabaseService;
  const mockUserToken = 'test-jwt-token';
  const testUserId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    console.log(`Using test user ID: ${testUserId}`);
    
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    
    // Reset singleton
    (DatabaseService as any).instance = undefined;
    dbService = DatabaseService.getInstance();
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
  });

  describe('Task Operations', () => {
    it('should create, read, update a task with JWT', async () => {
      // Mock business creation
      mockSupabaseClient.select.mockReturnValueOnce({
        eq: jest.fn().mockReturnValueOnce({
          eq: jest.fn().mockReturnValueOnce({
            single: jest.fn().mockResolvedValueOnce({ data: null, error: null })
          })
        })
      });
      
      mockSupabaseClient.insert.mockReturnValueOnce({
        select: jest.fn().mockReturnValueOnce({
          single: jest.fn().mockResolvedValueOnce({
            data: { id: 'biz-123', name: 'Test Business' },
            error: null
          })
        })
      });
      
      mockSupabaseClient.insert.mockReturnValueOnce({ data: null, error: null });
      
      // Mock context creation
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
          current_state: { status: 'created', phase: 'init', completeness: 0, data: {} },
          template_id: 'test',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });
      
      // Create task
      const task = await dbService.createTask(mockUserToken, {
        title: 'Test Task',
        task_type: 'test',
        priority: 'high'
      });
      
      expect(task).toBeDefined();
      expect(task.id).toBe('ctx-123');
      expect(task.business_id).toBe('biz-123');
      
      // Mock read
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
          current_state: { status: 'active', phase: 'processing', completeness: 50, data: {} },
          template_id: 'test',
          metadata: { title: 'Test Task' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });
      
      const readTask = await dbService.getTask(mockUserToken, 'ctx-123');
      expect(readTask).toBeDefined();
      expect(readTask?.id).toBe('ctx-123');
      
      // Mock update (via event)
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'event-123', sequence_number: 1 },
        error: null
      });
      
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
          current_state: { status: 'completed', phase: 'done', completeness: 100, data: {} },
          template_id: 'test',
          metadata: { title: 'Test Task' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });
      
      const updated = await dbService.updateTask(mockUserToken, 'ctx-123', {
        status: 'completed'
      });
      
      expect(updated).toBeDefined();
      expect(updated.status).toBe('completed');
    });

    it('should get user tasks with RLS filtering', async () => {
      // Mock getUserBusinesses - first query
      const mockEqBusinessUsers = jest.fn().mockResolvedValueOnce({
        data: [{ businesses: { id: 'biz-123', name: 'Test Biz' } }],
        error: null
      });
      const mockSelectBusinessUsers = jest.fn().mockReturnValue({ eq: mockEqBusinessUsers });
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelectBusinessUsers });
      
      // Mock getBusinessContexts - second query
      const mockOrderContexts = jest.fn().mockResolvedValueOnce({
        data: [
          {
            id: 'ctx-1',
            business_id: 'biz-123',
            current_state: { status: 'active', phase: 'processing', completeness: 50, data: {} },
            template_id: 'test',
            metadata: { title: 'Task 1', description: 'Test task' },
            initiated_by_user_id: testUserId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        error: null
      });
      const mockEqContexts = jest.fn().mockReturnValue({ order: mockOrderContexts });
      const mockSelectContexts = jest.fn().mockReturnValue({ eq: mockEqContexts });
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelectContexts });
      
      const tasks = await dbService.getUserTasks(mockUserToken);
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('should return null when task not found or access denied', async () => {
      // Mock getContext to return null
      const mockSingle = jest.fn().mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' }
      });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelect });
      
      const task = await dbService.getTask(mockUserToken, 'non-existent');
      expect(task).toBeNull();
    });
  });

  describe('Task Execution Operations', () => {
    it('should create system execution', async () => {
      // Mock the insert operation for context_events
      const mockSingle = jest.fn().mockResolvedValueOnce({
        data: { 
          id: 'event-123', 
          context_id: 'ctx-123',
          sequence_number: 1,
          operation: 'start',
          actor: 'system',
          metadata: {
            execution_id: 'exec-123',
            status: 'running'
          },
          created_at: new Date().toISOString()
        },
        error: null
      });
      const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      mockSupabaseClient.from.mockReturnValueOnce({ insert: mockInsert });
      
      const execution = await dbService.createSystemExecution({
        task_id: 'ctx-123',
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
      expect(execution.task_id).toBe('ctx-123');
      expect(execution.status).toBe('running');
    });

    it('should get task executions with JWT', async () => {
      // Mock the context_events query
      const mockOrder = jest.fn().mockResolvedValueOnce({
        data: [
          { 
            id: 'event-1', 
            context_id: 'ctx-123',
            sequence_number: 1, 
            operation: 'start',
            actor: 'system',
            metadata: {
              execution_id: 'exec-1',
              status: 'running'
            },
            created_at: new Date().toISOString() 
          },
          { 
            id: 'event-2', 
            context_id: 'ctx-123',
            sequence_number: 2, 
            operation: 'update',
            actor: 'system',
            metadata: {
              execution_id: 'exec-1',
              status: 'completed'
            },
            created_at: new Date().toISOString() 
          }
        ],
        error: null
      });
      const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelect });
      
      const executions = await dbService.getTaskExecutions(mockUserToken, 'ctx-123');
      
      expect(Array.isArray(executions)).toBe(true);
      expect(executions.length).toBeGreaterThan(0);
    });
  });

  describe('Agent Message Operations', () => {
    it('should save system message', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'audit-123' },
        error: null
      });
      
      await expect(dbService.saveSystemMessage({
        id: 'msg-123',
        from: 'orchestrator' as any,
        to: 'legal_compliance' as any,
        type: 'request',
        priority: 1 as any,
        payload: { test: true },
        timestamp: new Date()
      }, 'ctx-123')).resolves.not.toThrow();
    });
  });

  describe('Audit Operations', () => {
    it('should create system audit entry', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'audit-123' },
        error: null
      });
      
      await expect(dbService.createSystemAuditEntry({
        task_id: 'ctx-123',
        action: 'task_created',
        details: { test: true }
      })).resolves.not.toThrow();
    });
  });

  describe('Client Management', () => {
    it('should cache and clear user clients', () => {
      const client1 = dbService.getUserClient('token-1');
      const client2 = dbService.getUserClient('token-1');
      
      expect(client1).toBe(client2); // Should be same cached instance
      
      dbService.clearUserClient('token-1');
      const client3 = dbService.getUserClient('token-1');
      
      expect(client3).toBeDefined(); // Should create new instance
      
      dbService.clearAllUserClients();
      // All clients should be cleared
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database connection error
      const mockSingle = jest.fn().mockRejectedValueOnce(new Error('Connection failed'));
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelect });
      
      await expect(dbService.getContext('ctx-123')).rejects.toThrow('Connection failed');
    });

    it('should handle RLS permission errors', async () => {
      // Mock a permission error from the database
      const permissionError = { code: 'PGRST301', message: 'Permission denied' };
      const mockSingle = jest.fn().mockResolvedValueOnce({
        data: null,
        error: permissionError
      });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelect });
      
      // getContext should throw the error object for non-PGRST116 errors
      await expect(dbService.getContext('ctx-123')).rejects.toEqual(permissionError);
    });
  });
});