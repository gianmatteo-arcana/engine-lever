import { DatabaseService } from '../../services/database';
import { AgentRole, TaskPriority } from '../../agents/base/types';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock Supabase for integration tests
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Integration tests - mock Supabase for unit test runs
describe('Database Integration Tests', () => {
  let testUserId: string;
  let testUserToken: string;
  let dbService: DatabaseService;

  beforeAll(async () => {
    // Set up test environment
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    
    // Get database service instance
    dbService = DatabaseService.getInstance();
    
    // Mock user credentials for testing
    testUserId = '123e4567-e89b-12d3-a456-426614174000';
    testUserToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
    console.log(`Using test user ID: ${testUserId}`);
  });

  afterAll(async () => {
    // Clean up
    dbService.clearAllUserClients();
  });

  describe('Task Operations', () => {
    it('should create, read, update a task with JWT', async () => {
      // Mock successful task creation
      const mockTask = {
        id: 'task-123',
        user_id: testUserId,
        title: 'Integration Test Task',
        description: 'Testing CRUD operations',
        task_type: 'integration-test',
        business_id: 'test-biz-' + Date.now(),
        template_id: 'integration-test',
        status: 'pending',
        priority: 'high',
        metadata: { test: true },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTask,
        error: null
      });

      // Create task with JWT token
      const createdTask = await dbService.createTask(testUserToken, {
        user_id: testUserId,
        title: 'Integration Test Task',
        description: 'Testing CRUD operations',
        task_type: 'integration-test',
        business_id: 'test-biz-' + Date.now(),
        template_id: 'integration-test',
        status: 'pending',
        priority: 'high',
        metadata: { test: true }
      });
      
      expect(createdTask.id).toBeDefined();
      expect(createdTask.title).toBe(mockTask.title);
      expect(createdTask.user_id).toBe(testUserId);
      expect(createdTask.status).toBe('pending');

      // Mock read operation
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTask,
        error: null
      });

      // Read task with JWT token
      const retrievedTask = await dbService.getTask(testUserToken, createdTask.id);
      expect(retrievedTask).toBeTruthy();
      expect(retrievedTask!.id).toBe(createdTask.id);
      expect(retrievedTask!.title).toBe(mockTask.title);

      // Mock update operation
      const updatedMockTask = {
        ...mockTask,
        status: 'completed',
        metadata: { ...mockTask.metadata, updated: true }
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updatedMockTask,
        error: null
      });

      // Update task with JWT token
      const updatedTask = await dbService.updateTask(testUserToken, createdTask.id, {
        status: 'completed',
        metadata: { ...mockTask.metadata, updated: true }
      });
      
      expect(updatedTask.status).toBe('completed');
      expect(updatedTask.metadata.updated).toBe(true);
    });

    it('should get user tasks with RLS filtering', async () => {
      const mockTasks = [
        { 
          id: 'task-1', 
          user_id: testUserId, 
          status: 'pending',
          title: 'Task 1',
          business_id: 'biz-1',
          created_at: new Date().toISOString()
        },
        { 
          id: 'task-2', 
          user_id: testUserId, 
          status: 'completed',
          title: 'Task 2',
          business_id: 'biz-1',
          created_at: new Date().toISOString()
        }
      ];

      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockTasks,
        error: null
      });

      // Get user tasks with JWT token (RLS automatically filters)
      const userTasks = await dbService.getUserTasks(testUserToken);
      expect(userTasks).toHaveLength(2);
      expect(userTasks[0].user_id).toBe(testUserId);
      expect(userTasks[1].user_id).toBe(testUserId);
    });

    it('should return null when task not found or access denied', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });

      const task = await dbService.getTask(testUserToken, 'non-existent');
      expect(task).toBeNull();
    });
  });

  describe('Task Execution Operations', () => {
    it('should create system execution', async () => {
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

      // System operations don't need JWT token
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

      expect(execution.id).toBeDefined();
      expect(execution.execution_id).toBe('exec-123');
      expect(execution.status).toBe('running');
    });

    it('should get task executions with JWT', async () => {
      const mockExecutions = [
        { 
          id: 'exec-1', 
          task_id: 'task-123', 
          status: 'running',
          created_at: new Date().toISOString()
        },
        { 
          id: 'exec-2', 
          task_id: 'task-123', 
          status: 'completed',
          created_at: new Date().toISOString()
        }
      ];

      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockExecutions,
        error: null
      });

      const executions = await dbService.getTaskExecutions(testUserToken, 'task-123');
      expect(executions).toHaveLength(2);
      expect(executions[0].task_id).toBe('task-123');
      expect(executions[1].task_id).toBe('task-123');
    });
  });

  describe('Agent Message Operations', () => {
    it('should save system message', async () => {
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

      // System operations don't need JWT token
      await dbService.saveSystemMessage(message, 'task-123', 'exec-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('agent_messages');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });
  });

  describe('Audit Operations', () => {
    it('should create system audit entry', async () => {
      mockSupabaseClient.insert.mockReturnValueOnce({
        error: null
      });

      await dbService.createSystemAuditEntry({
        task_id: 'task-123',
        action: 'task_started',
        details: { initiator: 'system' },
        agent_role: 'orchestrator',
        user_id: testUserId
      });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_audit_trail');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });
  });

  describe('Client Management', () => {
    it('should cache and clear user clients', () => {
      // Get client (creates and caches it)
      const client1 = dbService.getUserClient(testUserToken);
      const client2 = dbService.getUserClient(testUserToken);
      
      // Should return same cached instance
      expect(client1).toBe(client2);

      // Clear specific client
      dbService.clearUserClient(testUserToken);
      
      // After clearing, a new client should be created
      const client3 = dbService.getUserClient(testUserToken);
      expect(client3).toBeDefined();

      // Clear all clients
      dbService.clearAllUserClients();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Connection failed');
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: dbError
      });

      await expect(
        dbService.getTask(testUserToken, 'task-123')
      ).rejects.toThrow('Connection failed');
    });

    it('should handle RLS permission errors', async () => {
      // Mock the error object properly
      const permissionError = new Error('Permission denied');
      (permissionError as any).code = 'PGRST301';
      
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: permissionError
      });

      await expect(
        dbService.updateTask(testUserToken, 'task-123', { status: 'completed' })
      ).rejects.toThrow('Permission denied');
    });
  });
});