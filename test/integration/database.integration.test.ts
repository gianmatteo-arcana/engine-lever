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
const mockSupabaseClient: any = {
  from: jest.fn(() => mockChain),
  auth: mockAuth
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
      // Mock business creation
      mockChain.select.mockReturnValueOnce({
        eq: jest.fn().mockReturnValueOnce({
          single: jest.fn().mockResolvedValueOnce({ data: null, error: null })
        })
      });
      
      // Mock business creation response
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'biz-123', name: 'Test Business' },
        error: null
      });
      
      // Mock business_users association (uses then)
      mockChain.then = jest.fn((resolve) => {
        resolve({ data: null, error: null });
        // Reset for next call
        mockChain.then = jest.fn((resolve) => {
          resolve({ data: [], error: null });
        });
      });
      
      // Mock task creation
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
          template_id: 'onboarding',
          current_state: {
            status: 'created',
            phase: 'init',
            completeness: 0,
            data: {}
          },
          metadata: { title: 'Test Task' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      // Create task
      const task = await dbService.createTask(mockUserToken, {
        title: 'Test Task',
        task_type: 'onboarding'
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.business_id).toBe('biz-123');
    });
  });

  describe('Business Context Operations', () => {
    it('should get or create business context', async () => {
      // Mock existing business lookup
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'biz-123', name: 'Existing Business' },
        error: null
      });

      const business = await dbService.getOrCreateBusiness('user-123', {
        name: 'Existing Business'
      });

      expect(business).toBeDefined();
      expect(business.id).toBe('biz-123');
    });

    it('should create new business if none exists', async () => {
      // Mock no existing business
      mockChain.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: { id: 'biz-456', name: 'New Business' },
          error: null
        });

      const business = await dbService.getOrCreateBusiness('user-456', {
        name: 'New Business'
      });

      expect(business).toBeDefined();
      expect(business.id).toBe('biz-456');
    });
  });

  describe('Context Management', () => {
    it('should create and retrieve contexts', async () => {
      // Mock context creation
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-789',
          business_id: 'biz-789',
          template_id: 'onboarding',
          current_state: {
            status: 'created',
            phase: 'initialization',
            completeness: 0,
            data: {}
          }
        },
        error: null
      });

      const context = await dbService.createContext(
        'biz-789',
        'user-789',
        'onboarding',
        { template: 'data' }
      );

      expect(context).toBeDefined();
      expect(context.id).toBe('ctx-789');
      expect(context.business_id).toBe('biz-789');
    });

    it('should get business contexts', async () => {
      mockChain.order.mockResolvedValueOnce({
        data: [
          { id: 'ctx-1', business_id: 'biz-123' },
          { id: 'ctx-2', business_id: 'biz-123' }
        ],
        error: null
      });

      const contexts = await dbService.getBusinessContexts('biz-123');
      
      expect(Array.isArray(contexts)).toBe(true);
      expect(contexts).toHaveLength(2);
    });
  });

  describe('Event Management', () => {
    it('should add context events', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          context_id: 'ctx-123',
          sequence_number: 1,
          operation: 'status_change',
          actor_type: 'agent',
          actor_id: 'orchestrator',
          data: { status: 'active' },
          created_at: new Date().toISOString()
        },
        error: null
      });

      const event = await dbService.addContextEvent({
        context_id: 'ctx-123',
        actor_type: 'agent',
        actor_id: 'orchestrator',
        operation: 'status_change',
        data: { status: 'active' }
      });

      expect(event).toBeDefined();
      expect(event.sequence_number).toBe(1);
    });
  });

  describe('Legacy Compatibility', () => {
    it('should handle getUserTasks', async () => {
      // Mock the response for getUserTasks
      mockChain.then = jest.fn((resolve) => {
        resolve({
          data: [
            {
              id: 'ctx-1',
              business_id: 'biz-1',
              template_id: 'onboarding',
              current_state: { status: 'active', phase: 'processing', completeness: 50, data: {} },
              metadata: { title: 'Task 1' },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          error: null
        });
      });

      const tasks = await dbService.getUserTasks(mockUserToken);
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('ctx-1');
    });

    it('should handle getTask', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-456',
          business_id: 'biz-456',
          template_id: 'onboarding',
          current_state: { status: 'active', phase: 'processing', completeness: 75, data: {} },
          metadata: { title: 'Task 456' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const task = await dbService.getTask(mockUserToken, 'ctx-456');
      
      expect(task).toBeDefined();
      expect(task?.id).toBe('ctx-456');
      expect(task?.business_id).toBe('biz-456');
    });

    it('should handle updateTask', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-789',
          business_id: 'biz-789',
          current_state: { status: 'completed', phase: 'done', completeness: 100, data: {} },
          metadata: { title: 'Updated Task' },
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const updatedTask = await dbService.updateTask(mockUserToken, 'ctx-789', {
        status: 'completed',
        progress: 100
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask?.id).toBe('ctx-789');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockChain.single.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      await expect(dbService.getContext('invalid-id'))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle missing resources', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' }
      });

      const result = await dbService.getContext('non-existent');
      expect(result).toBeNull();
    });
  });
});