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

// Create mock responses storage
let mockResponses: any = {
  insert: { data: null, error: null },
  select: { data: [], error: null },
  update: { data: null, error: null },
  single: { data: null, error: null }
};

// Create a fully chainable mock
const createChainableMock = (returnData: any = null, returnError: any = null) => {
  const chainable: any = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    in: jest.fn(),
    contains: jest.fn(),
    containedBy: jest.fn(),
    range: jest.fn(),
    filter: jest.fn(),
    single: jest.fn()
  };
  
  // Make all methods return chainable except for terminal methods
  Object.keys(chainable).forEach(key => {
    if (key === 'single') {
      chainable[key].mockResolvedValue({ data: returnData, error: returnError });
    } else if (key === 'order' || key === 'limit') {
      // order and limit can be terminal methods
      chainable[key].mockImplementation(() => {
        const result = { ...chainable };
        result.then = (callback: any) => Promise.resolve({ data: returnData, error: returnError }).then(callback);
        result.catch = (callback: any) => Promise.resolve({ data: returnData, error: returnError }).catch(callback);
        return result;
      });
    } else {
      chainable[key].mockReturnValue(chainable);
    }
  });
  
  // Make the chainable object thenable for cases where it's used as a promise
  chainable.then = (callback: any) => Promise.resolve({ data: returnData, error: returnError }).then(callback);
  chainable.catch = (callback: any) => Promise.resolve({ data: returnData, error: returnError }).catch(callback);
  
  return chainable;
};

// Create the mock client
const mockSupabaseClient: any = {
  auth: mockAuth,
  from: jest.fn()
};

// Helper to set mock responses
const setMockResponse = (data: any, error: any = null) => {
  mockSupabaseClient.from.mockReturnValueOnce(createChainableMock(data, error));
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
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
    
    // Reset all mock functions to return 'this' for chaining
    mockChain.select.mockReturnThis();
    mockChain.insert.mockReturnThis();
    mockChain.update.mockReturnThis();
    mockChain.upsert.mockReturnThis();
    mockChain.eq.mockReturnThis();
    mockChain.order.mockReturnThis();
    mockChain.limit.mockReturnThis();
    mockChain.gte.mockReturnThis();
    mockChain.lte.mockReturnThis();
    mockChain.in.mockReturnThis();
    mockChain.contains.mockReturnThis();
    mockChain.containedBy.mockReturnThis();
    mockChain.range.mockReturnThis();
    mockChain.filter.mockReturnThis();
    mockChain.single.mockResolvedValue({ data: null, error: null });
    mockChain.then = jest.fn((resolve) => {
      resolve({ data: [], error: null });
    });
    
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
      // Mock for business check - returns null (no existing business)
      setMockResponse(null, null);
      
      // Mock for business creation
      setMockResponse({ id: 'biz-123', name: 'Test Business' }, null);
      
      // Mock for user_businesses insert - no return needed
      const businessUsersChain = createChainableMock(null, null);
      businessUsersChain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.from.mockReturnValueOnce(businessUsersChain);
      
      // Mock for task_contexts creation
      setMockResponse({
        id: 'ctx-123',
        business_id: 'biz-123',
        current_state: { status: 'created', phase: 'init', completeness: 0, data: {} },
        template_id: 'test',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, null);
      
      // Create task
      const task = await dbService.createTask(mockUserToken, {
        title: 'Test Task',
        task_type: 'onboarding'
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.business_id).toBe('biz-123');
      
      // Mock read - getTask queries tasks table with user_id
      setMockResponse({
        id: 'ctx-123',
        user_id: 'test-user-123',
        business_id: 'biz-123',
        status: 'in_progress',
        priority: 'high',
        task_type: 'test',
        title: 'Test Task',
        template_id: 'test',
        metadata: { title: 'Test Task' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, null);
      
      const readTask = await dbService.getTask('test-user-123', 'ctx-123');
      expect(readTask).toBeDefined();
      expect(readTask?.id).toBe('ctx-123');
      
      // Mock for task_context_events insert (updateTask uses addContextEvent)
      setMockResponse({
        id: 'event-123', 
        context_id: 'ctx-123',
        task_id: 'ctx-123',
        operation: 'task_updated',
        actor_type: 'system',
        actor_id: 'system',
        data: { status: 'completed' },
        sequence_number: 1,
        created_at: new Date().toISOString()
      }, null);
      
      // Mock for the second getTask call (updateTask fetches after updating)
      setMockResponse({
        id: 'ctx-123',
        user_id: 'test-user-123',
        business_id: 'biz-123',
        status: 'completed',
        priority: 'high',
        task_type: 'test',
        title: 'Test Task',
        template_id: 'test',
        metadata: { title: 'Test Task' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, null);
      
      const updated = await dbService.updateTask('test-user-123', 'ctx-123', {
        status: 'completed'
      });
      
      expect(updated).toBeDefined();
      expect(updated.status).toBe('completed');
    });

    it('should get user tasks with RLS filtering', async () => {
      // Mock getUserTasks query - returns array of tasks
      setMockResponse([
        {
          id: 'task-1',
          user_id: 'test-user-123',
          title: 'Task 1',
          description: 'Test task',
          status: 'pending',
          task_type: 'test',
          priority: 'medium',
          business_id: 'biz-123',
          template_id: 'test',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ], null);
      
      const tasks = await dbService.getUserTasks('test-user-123');
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('should return null when task not found or access denied', async () => {
      // Mock getTask to return null (task not found)
      setMockResponse(null, { code: 'PGRST116', message: 'Row not found' });
      
      const task = await dbService.getTask('test-user-123', 'non-existent');
      expect(task).toBeNull();
    });
  });

  describe('Task Execution Operations', () => {
    it('should create system execution', async () => {
      // Mock for task_context_events insert (createSystemExecution uses addContextEvent)
      setMockResponse({ 
        id: 'event-123', 
        context_id: 'ctx-123',
        task_id: 'ctx-123',
        sequence_number: 1,
        operation: 'execution_started',
        actor_type: 'system',
        actor_id: 'system',
        data: {
          execution_id: 'exec-123',
          status: 'running'
        },
        created_at: new Date().toISOString()
      }, null);
      
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
  });

  describe('Agent Message Operations', () => {
    it('should save system message', async () => {
      // Mock for audit_log insert (saveSystemMessage uses createAuditLog)
      setMockResponse({ 
        id: 'audit-123',
        action: 'agent_message',
        resource_type: 'agent_message',
        resource_id: 'msg-123',
        created_at: new Date().toISOString()
      }, null);
      
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
      // Mock for audit_log insert (createSystemAuditEntry uses createAuditLog)
      setMockResponse({ 
        id: 'audit-123',
        action: 'task_created',
        resource_type: 'task',
        resource_id: 'ctx-123',
        metadata: { test: true },
        created_at: new Date().toISOString()
      }, null);
      
      await expect(dbService.createSystemAuditEntry({
        task_id: 'ctx-123',
        action: 'task_created',
        details: { test: true }
      })).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database connection error
      const errorChain = createChainableMock(null, null);
      errorChain.single = jest.fn().mockRejectedValue(new Error('Connection failed'));
      mockSupabaseClient.from.mockReturnValueOnce(errorChain);
      
      await expect(dbService.getContext('ctx-123')).rejects.toThrow('Connection failed');
    });

    it('should handle RLS permission errors', async () => {
      // Mock a permission error from the database
      const permissionError = { code: 'PGRST301', message: 'Permission denied' };
      const errorChain = createChainableMock(null, permissionError);
      mockSupabaseClient.from.mockReturnValueOnce(errorChain);
      
      // getContext should throw the error object for non-PGRST116 errors
      await expect(dbService.getContext('ctx-123')).rejects.toEqual(permissionError);
    });
  });
});