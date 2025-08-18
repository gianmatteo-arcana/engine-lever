/**
 * DatabaseService Test Suite - New Schema
 * Tests for business-centric database operations
 */

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
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    })
  }
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import after mock is set up
import { 
  DatabaseService,
  BusinessRecord,
  ContextRecord,
  ContextEventRecord
} from '../../../src/services/database';

describe('DatabaseService - New Schema', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Business Operations', () => {
    it('should get or create a business', async () => {
      // Mock no existing business
      mockChain.single
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ 
          data: { id: 'biz-123', name: 'Test Business' },
          error: null 
        });

      const business = await dbService.getOrCreateBusiness('user-123', {
        name: 'Test Business'
      });

      expect(business).toBeDefined();
      expect(business.id).toBe('biz-123');
    });

    it('should get user businesses', async () => {
      // Override the then method for this specific test
      mockChain.then = jest.fn((resolve) => {
        resolve({
          data: [
            { businesses: { id: 'biz-1', name: 'Business 1' } },
            { businesses: { id: 'biz-2', name: 'Business 2' } }
          ],
          error: null
        });
      });

      const businesses = await dbService.getUserBusinesses('user-123');
      
      expect(Array.isArray(businesses)).toBe(true);
      expect(businesses).toHaveLength(2);
    });
  });

  describe('Context Operations', () => {
    it('should create a context', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
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
        'biz-123',
        'user-123',
        'onboarding',
        { template: 'data' }
      );

      expect(context).toBeDefined();
      expect(context.id).toBe('ctx-123');
      expect(context.business_id).toBe('biz-123');
    });

    it('should get a context', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
          current_state: { status: 'active' }
        },
        error: null
      });

      const context = await dbService.getContext('ctx-123');
      
      expect(context).toBeDefined();
      expect(context?.id).toBe('ctx-123');
    });

    it('should return null for non-existent context', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      const context = await dbService.getContext('non-existent');
      expect(context).toBeNull();
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

  describe('Event Sourcing', () => {
    it('should add a context event', async () => {
      // Mock for getting the task (first single call)
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          user_id: 'system',
          status: 'pending'
        },
        error: null
      });
      
      // Mock for task_context_events insert (second single call)
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          sequence_number: 1,
          context_id: 'ctx-123',
          task_id: 'ctx-123',
          operation: 'status_update',
          actor_id: 'agent-1',
          actor_type: 'agent'
        },
        error: null
      });

      const event = await dbService.addContextEvent({
        context_id: 'ctx-123',
        actor_type: 'agent',
        actor_id: 'agent-1',
        operation: 'status_update',
        data: { status: 'active' }
      });

      expect(event).toBeDefined();
      expect(event.sequence_number).toBe(1);
    });
  });

  describe('UI Requests', () => {
    it('should create a UI request', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ui-123',
          context_id: 'ctx-123',
          request_type: 'approval',
          status: 'pending'
        },
        error: null
      });

      const request = await dbService.createUIRequest({
        context_id: 'ctx-123',
        request_type: 'approval',
        semantic_data: { message: 'Please approve' },
        status: 'pending'
      });

      expect(request).toBeDefined();
      expect(request.id).toBe('ui-123');
    });

    it('should get context UI requests', async () => {
      mockChain.order.mockResolvedValueOnce({
        data: [
          { id: 'ui-1', context_id: 'ctx-123' },
          { id: 'ui-2', context_id: 'ctx-123' }
        ],
        error: null
      });

      const requests = await dbService.getContextUIRequests('ctx-123');
      
      expect(Array.isArray(requests)).toBe(true);
      expect(requests).toHaveLength(2);
    });
  });

  describe('Agent States', () => {
    it('should upsert agent state', async () => {
      // First call for checking existing version
      mockChain.single
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: {
            id: 'state-123',
            context_id: 'ctx-123',
            agent_role: 'orchestrator',
            version: 1
          },
          error: null
        });

      const state = await dbService.upsertAgentState(
        'ctx-123',
        'orchestrator',
        { status: 'active' }
      );

      expect(state).toBeDefined();
      expect(state.version).toBe(1);
    });

    it('should get context agent states', async () => {
      // Override the then method for this specific test  
      mockChain.then = jest.fn((resolve) => {
        resolve({
          data: [
            { id: 'state-1', agent_role: 'orchestrator' },
            { id: 'state-2', agent_role: 'legal_compliance' }
          ],
          error: null
        });
      });

      const states = await dbService.getContextAgentStates('ctx-123');
      
      expect(Array.isArray(states)).toBe(true);
      expect(states).toHaveLength(2);
    });
  });

  describe('Audit Operations', () => {
    it('should create audit log entry', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'audit-123',
          action: 'context_created',
          resource_type: 'context'
        },
        error: null
      });

      const audit = await dbService.createAuditLog({
        action: 'context_created',
        resource_type: 'context',
        resource_id: 'ctx-123'
      });

      expect(audit).toBeDefined();
      expect(audit.id).toBe('audit-123');
    });
  });

  describe('Legacy Compatibility', () => {
    it('should create task using legacy method', async () => {
      // Mock for business lookup (returns null - no existing business)
      mockChain.single.mockResolvedValueOnce({ data: null, error: null });
      
      // Mock for business creation
      mockChain.single.mockResolvedValueOnce({
        data: { id: 'biz-123', name: 'My Business' },
        error: null
      });
      
      // Mock for business_users insert (uses then, not single)
      mockChain.then = jest.fn((resolve) => {
        resolve({ data: null, error: null });
        // Reset for next call
        mockChain.then = jest.fn((resolve) => {
          resolve({ data: [], error: null });
        });
      });
      
      // Mock for context creation
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          business_id: 'biz-123',
          current_state: { status: 'created', phase: 'init', completeness: 0, data: {} },
          template_id: 'onboarding',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const task = await dbService.createTask('test-token', {
        title: 'Test Task',
        task_type: 'onboarding'
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.business_id).toBe('biz-123');
    });

    it('should get task using legacy method', async () => {
      mockChain.single.mockResolvedValueOnce({
        data: {
          id: 'ctx-123',
          user_id: 'test-user-123',
          business_id: 'biz-123',
          template_id: 'onboarding',
          status: 'in_progress',
          current_state: { status: 'active', phase: 'processing', completeness: 50, data: {} },
          metadata: { title: 'Test Task' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const task = await dbService.getTask('test-token', 'ctx-123');
      
      expect(task).toBeDefined();
      expect(task?.id).toBe('ctx-123');
      expect(task?.status).toBe('in_progress'); // 'active' maps to 'in_progress'
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration', () => {
      delete process.env.SUPABASE_URL;
      (DatabaseService as any).instance = undefined;
      
      const service = DatabaseService.getInstance();
      expect(() => service.getUserClient('token')).toThrow('getUserClient is deprecated - use service role pattern instead');
    });

    it('should handle database errors', async () => {
      mockChain.single.mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(dbService.getContext('ctx-123')).rejects.toThrow('Database error');
    });
  });
});