/**
 * DatabaseService Test Suite - New Schema
 * Tests for business-centric database operations
 */

import { 
  DatabaseService,
  BusinessRecord,
  ContextRecord,
  ContextEventRecord
} from '../../../src/services/database';

// Mock Supabase with proper chaining
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
    single: jest.fn()
  };
  
  // Make all methods return chainable except for terminal methods
  Object.keys(chainable).forEach(key => {
    if (key === 'single') {
      chainable[key].mockResolvedValue({ data: returnData, error: returnError });
    } else if (key === 'order' || key === 'limit') {
      // order and limit can be terminal methods
      chainable[key].mockImplementation(() => {
        // Return a promise if it's the last in chain
        const result = { ...chainable };
        // Also make it thenable
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

const mockSupabaseClient = {
  from: jest.fn(),
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

describe('DatabaseService - New Schema', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock functions
    mockSupabaseClient.from.mockClear();
    
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
      // First call - check existing business
      const firstChain = createChainableMock(null, null);
      mockSupabaseClient.from.mockReturnValueOnce(firstChain);
      
      // Second call - create business
      const secondChain = createChainableMock({ id: 'biz-123', name: 'Test Business' }, null);
      mockSupabaseClient.from.mockReturnValueOnce(secondChain);
      
      // Third call - create business_users relation (no return needed)
      const thirdChain = createChainableMock(null, null);
      mockSupabaseClient.from.mockReturnValueOnce(thirdChain);

      const business = await dbService.getOrCreateBusiness('user-123', {
        name: 'Test Business'
      });

      expect(business).toBeDefined();
      expect(business.id).toBe('biz-123');
    });

    it('should get user businesses', async () => {
      const chainMock = createChainableMock([
        { businesses: { id: 'biz-1', name: 'Business 1' } },
        { businesses: { id: 'biz-2', name: 'Business 2' } }
      ], null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const businesses = await dbService.getUserBusinesses('user-123');
      
      expect(Array.isArray(businesses)).toBe(true);
      expect(businesses).toHaveLength(2);
    });
  });

  describe('Context Operations', () => {
    it('should create a context', async () => {
      const chainMock = createChainableMock({
        id: 'ctx-123',
        business_id: 'biz-123',
        template_id: 'onboarding',
        current_state: {
          status: 'created',
          phase: 'initialization',
          completeness: 0,
          data: {}
        }
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

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
      const chainMock = createChainableMock({
        id: 'ctx-123',
        business_id: 'biz-123',
        current_state: { status: 'active' }
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const context = await dbService.getContext('ctx-123');
      
      expect(context).toBeDefined();
      expect(context?.id).toBe('ctx-123');
    });

    it('should return null for non-existent context', async () => {
      const chainMock = createChainableMock(null, { code: 'PGRST116' });
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const context = await dbService.getContext('non-existent');
      expect(context).toBeNull();
    });

    it('should get business contexts', async () => {
      const chainMock = createChainableMock([
        { id: 'ctx-1', business_id: 'biz-123' },
        { id: 'ctx-2', business_id: 'biz-123' }
      ], null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const contexts = await dbService.getBusinessContexts('biz-123');
      
      expect(Array.isArray(contexts)).toBe(true);
      expect(contexts).toHaveLength(2);
    });
  });

  describe('Event Sourcing', () => {
    it('should add a context event', async () => {
      // Mock for getTask check (skipped for system operations)
      // Mock for task_context_events insert - createTaskContextEvent returns full record
      const chainMock = createChainableMock({
        id: 'event-123',
        context_id: 'ctx-123',
        task_id: 'ctx-123',
        operation: 'status_update',
        actor_type: 'agent',
        actor_id: 'agent-1',
        data: { status: 'active' },
        reasoning: 'Legacy event migration',
        trigger: { source: 'api' },
        sequence_number: 1,
        created_at: new Date().toISOString()
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const event = await dbService.addContextEvent({
        context_id: 'ctx-123',
        actor_type: 'agent',
        actor_id: 'agent-1',
        operation: 'status_update',
        data: { status: 'active' }
      });

      expect(event).toBeDefined();
      expect(event.id).toBe('event-123');
      expect(event.context_id).toBe('ctx-123');
      expect(event.sequence_number).toBe(1);
    });
  });

  describe('UI Requests', () => {
    it('should create a UI request', async () => {
      // createUIRequest uses ui_requests table directly and returns the created record
      const chainMock = createChainableMock({
        id: 'ui-123',
        context_id: 'ctx-123',
        request_type: 'approval',
        status: 'pending',
        semantic_data: { message: 'Please approve' },
        created_at: new Date().toISOString()
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

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
      // getContextUIRequests returns an array directly from ui_requests table
      const chainMock = createChainableMock([
        { id: 'ui-1', context_id: 'ctx-123', request_type: 'approval', status: 'pending' },
        { id: 'ui-2', context_id: 'ctx-123', request_type: 'info', status: 'completed' }
      ], null);
      // Need to make the mock return the data directly, not wrapped
      chainMock.order = jest.fn().mockResolvedValue({ 
        data: [
          { id: 'ui-1', context_id: 'ctx-123', request_type: 'approval', status: 'pending' },
          { id: 'ui-2', context_id: 'ctx-123', request_type: 'info', status: 'completed' }
        ], 
        error: null 
      });
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const requests = await dbService.getContextUIRequests('ctx-123');
      
      expect(Array.isArray(requests)).toBe(true);
      expect(requests).toHaveLength(2);
    });
  });

  describe('Agent States', () => {
    it('should upsert agent state', async () => {
      // First call for checking existing version - returns null (not found)
      const firstChain = createChainableMock(null, null);
      firstChain.single = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.from.mockReturnValueOnce(firstChain);
      
      // Second call for upserting with new version
      const secondChain = createChainableMock({
        id: 'state-123',
        context_id: 'ctx-123',
        agent_role: 'orchestrator',
        version: 1,
        state_data: { status: 'active' }
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(secondChain);

      const state = await dbService.upsertAgentState(
        'ctx-123',
        'orchestrator',
        { status: 'active' }
      );

      expect(state).toBeDefined();
      expect(state.version).toBe(1);
    });

    it('should get context agent states', async () => {
      // getContextAgentStates returns an array from agent_states table
      const chainMock = createChainableMock(null, null);
      // Mock the chain to return data after eq()
      chainMock.eq = jest.fn().mockResolvedValue({ 
        data: [
          { id: 'state-1', agent_role: 'orchestrator', context_id: 'ctx-123' },
          { id: 'state-2', agent_role: 'legal_compliance', context_id: 'ctx-123' }
        ], 
        error: null 
      });
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const states = await dbService.getContextAgentStates('ctx-123');
      
      expect(Array.isArray(states)).toBe(true);
      expect(states).toHaveLength(2);
    });
  });

  describe('Audit Operations', () => {
    it('should create audit log entry', async () => {
      // createAuditLog uses select().single() so it returns the inserted record
      const chainMock = createChainableMock({
        id: 'audit-123',
        action: 'context_created',
        resource_type: 'context',
        resource_id: 'ctx-123',
        created_at: new Date().toISOString()
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

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
      // Mock for business lookup - returns null (no existing business)
      const firstChain = createChainableMock(null, null);
      firstChain.single = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.from.mockReturnValueOnce(firstChain);
      
      // Mock for business creation - returns the new business
      const secondChain = createChainableMock({ id: 'biz-123', name: 'My Business' }, null);
      mockSupabaseClient.from.mockReturnValueOnce(secondChain);
      
      // Mock for business_users insert - just succeeds
      const thirdChain = createChainableMock(null, null);
      thirdChain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.from.mockReturnValueOnce(thirdChain);
      
      // Mock for context creation
      const fourthChain = createChainableMock({
        id: 'ctx-123',
        business_id: 'biz-123',
        current_state: { status: 'created', phase: 'init', completeness: 0, data: {} },
        template_id: 'onboarding',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(fourthChain);

      const task = await dbService.createTask('test-token', {
        title: 'Test Task',
        task_type: 'onboarding'
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.business_id).toBe('biz-123');
    });

    it('should get task using legacy method', async () => {
      // getTask queries the tasks table directly with user_id
      const chainMock = createChainableMock({
        id: 'ctx-123',
        user_id: 'test-user-123', 
        business_id: 'biz-123',
        template_id: 'onboarding',
        title: 'Test Task',
        status: 'in_progress',
        priority: 'medium',
        task_type: 'onboarding',
        metadata: { title: 'Test Task' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, null);
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      const task = await dbService.getTask('test-user-123', 'ctx-123');
      
      expect(task).toBeDefined();
      if (task) {
        expect(task.id).toBe('ctx-123');
        expect(task.status).toBe('in_progress');
      }
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
      // Create a mock that properly rejects
      const chainMock = createChainableMock(null, null);
      chainMock.single = jest.fn().mockRejectedValue(new Error('Database error'));
      mockSupabaseClient.from.mockReturnValueOnce(chainMock);

      await expect(dbService.getContext('ctx-123')).rejects.toThrow('Database error');
    });
  });
});