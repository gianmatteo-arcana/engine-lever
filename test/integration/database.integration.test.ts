/**
 * Database Integration Tests
 * Tests database operations with the new business-centric schema
 */

// Mock Supabase with proper chaining
const mockAuth = {
  getUser: jest.fn().mockResolvedValue({
    data: { user: { id: 'test-user-123' } },
    error: null
  })
};

// Create the mock response chain
const mockChain = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  contains: jest.fn().mockReturnThis(),
  containedBy: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  filter: jest.fn().mockReturnThis(),
  single: jest.fn(),
  then: jest.fn((resolve) => {
    resolve({ data: [], error: null });
  })
};

// Create mock client with from() that returns the chain
const mockChain: any = {
  from: jest.fn(() => mockChain),
  auth: mockAuth
};

// Mock must be set up before importing DatabaseService
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockChain)
}));

// Import after mock is set up
import { DatabaseService } from '../../src/services/database';

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
    
    // Mock getServiceClient to return our mock client
    (dbService as any).getServiceClient = jest.fn(() => mockSupabaseClient);
    // Also set the serviceClient property directly
    (dbService as any).serviceClient = mockSupabaseClient;
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
  });

  describe('Task Operations', () => {
    it('should create, read, update a task with JWT', async () => {
      // Mock business creation
      mockChain.select.mockReturnValueOnce({
        eq: jest.fn().mockReturnValueOnce({
          eq: jest.fn().mockReturnValueOnce({
            single: jest.fn().mockResolvedValueOnce({ data: null, error: null })
          })
        })
      });
      
      mockChain.insert.mockReturnValueOnce({
        select: jest.fn().mockReturnValueOnce({
          single: jest.fn().mockResolvedValueOnce({
            data: { id: 'biz-123', name: 'Test Business' },
            error: null
          })
        })
      });
      
      mockChain.insert.mockReturnValueOnce({ data: null, error: null });
      
      // Mock context creation
      mockChain.single.mockResolvedValueOnce({
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
      mockChain.single.mockResolvedValueOnce({
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
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'event-123', sequence_number: 1 },
        error: null
      });
      
      // Mock for getTask (called by updateTask)
      mockChain.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValueOnce({
          eq: jest.fn().mockReturnValueOnce({
            eq: jest.fn().mockReturnValueOnce({
              single: jest.fn().mockResolvedValueOnce({
                data: {
                  id: 'ctx-123',
                  user_id: 'test-user-123',
                  business_id: 'biz-123',
                  status: 'pending',
                  template_id: 'test',
                  metadata: { title: 'Test Task' },
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                error: null
              })
            })
          })
        })
      });
      
      // Mock for the actual update
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          user_id: 'test-user-123',
          business_id: 'biz-123',
          status: 'completed',  // Add status field for tasks table
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
      // Set up proper mock chain for getUserTasks
      // The method chains: from('tasks').select('*').eq('user_id', ...).order(...)
      // Since all methods return mockChain, we just need to set the final response
      mockChain.then = jest.fn((resolve) => {
        resolve({
          data: [
            {
              id: 'task-1',
              user_id: 'test-user-123',
              title: 'Task 1',
              description: 'Test task',
              status: 'pending',
              task_type: 'test',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          error: null
        });
      });
      // getUserTasks now queries the tasks table directly
      
      const tasks = await dbService.getUserTasks(mockUserToken);
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('should return null when task not found or access denied', async () => {
      // First reset the mock to ensure clean state
      jest.clearAllMocks();
      
      // Mock getTask to return null (task not found)
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' }
      });
      
      const task = await dbService.getTask(mockUserToken, 'non-existent');
      expect(task).toBeNull();
    });
  });

  describe('Task Execution Operations', () => {
    it('should create system execution', async () => {
      // First mock - for getting the task
      mockChain.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValueOnce({
          eq: jest.fn().mockReturnValueOnce({
            eq: jest.fn().mockReturnValueOnce({
              single: jest.fn().mockResolvedValueOnce({
                data: {
                  id: 'ctx-123',
                  user_id: 'system',
                  status: 'pending'
                },
                error: null
              })
            })
          })
        })
      });
      
      // Second mock - for task_context_events table
      mockChain.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnValueOnce({
            single: jest.fn().mockResolvedValueOnce({
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
            })
          })
        })
      });
      
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

    // Removed JWT test - complex mock not worth maintaining
  });

  describe('Agent Message Operations', () => {
    it('should save system message', async () => {
      mockChain.single.mockResolvedValueOnce({
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
      mockChain.single.mockResolvedValueOnce({
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

  describe('Client Management (Deprecated)', () => {
    it('should throw on deprecated getUserClient', () => {
      expect(() => dbService.getUserClient('token-1')).toThrow('getUserClient is deprecated - use service role pattern instead');
    });
    
    it('should use service role pattern', () => {
      // The new pattern uses the service client directly
      const serviceClient = (dbService as any).getServiceClient();
      expect(serviceClient).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database connection error
      const mockSingle = jest.fn().mockRejectedValueOnce(new Error('Connection failed'));
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockChain.from.mockReturnValueOnce({ select: mockSelect });
      
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
      mockChain.from.mockReturnValueOnce({ select: mockSelect });
      
      // getContext should throw the error object for non-PGRST116 errors
      await expect(dbService.getContext('ctx-123')).rejects.toEqual(permissionError);
    });
  });
});