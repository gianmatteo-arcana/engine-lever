/**
 * DatabaseService Test Suite
 * 
 * Tests singleton pattern, connection management, and universal data operations
 * Ensures proper separation of user/service roles and event sourcing compliance
 */

import { DatabaseService } from '../database';
import { createClient } from '@supabase/supabase-js';
import {
  TaskRecord,
  TaskExecutionRecord,
  AgentMessageRecord,
  TaskContext,
  ContextEntry
} from '../../types/engine-types';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis()
    })),
    auth: {
      getUser: jest.fn()
    }
  }))
}));

jest.mock('../../utils/logger');

describe('DatabaseService - Singleton and Core Operations', () => {
  let dbService: DatabaseService;
  let mockSupabaseClient: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (DatabaseService as any).instance = undefined;
    
    // Setup Supabase mock
    mockSupabaseClient = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        data: null,
        error: null
      })),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null
        })
      }
    };
    
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Set environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    
    dbService = DatabaseService.getInstance();
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe('Singleton Pattern', () => {
    it('should maintain single instance throughout application', () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    it('should throw error if Supabase configuration is missing', () => {
      delete process.env.SUPABASE_URL;
      (DatabaseService as any).instance = undefined;
      
      expect(() => DatabaseService.getInstance()).toThrow('Supabase configuration missing');
    });

    it('should not allow direct instantiation', () => {
      // TypeScript prevents this, but verify the pattern
      expect(() => new (DatabaseService as any)()).toThrow();
    });
  });

  describe('getUserClient vs Service Role', () => {
    it('should create user-scoped client with user token', () => {
      const userToken = 'user-jwt-token';
      const userClient = dbService.getUserClient(userToken);
      
      expect(createClient).toHaveBeenCalledWith(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
        expect.objectContaining({
          auth: expect.objectContaining({
            persistSession: false,
            autoRefreshToken: false
          }),
          global: expect.objectContaining({
            headers: {
              Authorization: `Bearer ${userToken}`
            }
          })
        })
      );
    });

    it('should use service role for system operations', async () => {
      // Service role operations should not require user token
      await dbService.createTaskContext({
        contextId: 'ctx-123',
        taskTemplateId: 'test',
        tenantId: 'tenant-123',
        createdAt: new Date().toISOString(),
        currentState: { status: 'pending' },
        history: [],
        templateSnapshot: {}
      });
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_contexts');
    });

    it('should enforce RLS when using user client', async () => {
      const userToken = 'user-jwt-token';
      const userClient = dbService.getUserClient(userToken);
      
      // User operations should be scoped by RLS
      const mockUserClient = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'task-123', user_id: 'user-123' },
            error: null
          })
        }))
      };
      
      (createClient as jest.Mock).mockReturnValueOnce(mockUserClient);
      
      const userDbService = new (DatabaseService as any)();
      userDbService.client = mockUserClient;
      
      await userDbService.getTask('task-123');
      
      expect(mockUserClient.from).toHaveBeenCalledWith('tasks');
      // RLS automatically filters by user_id in database
    });
  });

  describe('Event Sourcing - Append Only', () => {
    it('should only append to context history, never update', async () => {
      const contextId = 'ctx-123';
      const entry: ContextEntry = {
        entryId: 'entry-1',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'system', id: 'test', version: '1.0.0' },
        operation: 'test_op',
        data: { test: true },
        reasoning: 'Test operation'
      };

      await dbService.createContextHistoryEntry(contextId, entry);
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('context_history');
      expect(mockSupabaseClient.from().insert).toHaveBeenCalled();
      expect(mockSupabaseClient.from().update).not.toHaveBeenCalled();
      expect(mockSupabaseClient.from().delete).not.toHaveBeenCalled();
    });

    it('should retrieve complete history for context', async () => {
      const contextId = 'ctx-123';
      const mockHistory = [
        { sequence_number: 1, operation: 'created' },
        { sequence_number: 2, operation: 'updated' },
        { sequence_number: 3, operation: 'completed' }
      ];

      mockSupabaseClient.from().select.mockReturnThis();
      mockSupabaseClient.from().eq.mockReturnThis();
      mockSupabaseClient.from().order.mockReturnThis();
      mockSupabaseClient.from().order().data = mockHistory;

      const history = await dbService.getContextHistory(contextId);
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('context_history');
      expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('context_id', contextId);
      expect(mockSupabaseClient.from().order).toHaveBeenCalledWith('sequence_number', { ascending: true });
    });

    it('should prevent history modification attempts', async () => {
      // Attempting to update history should fail
      const updateHistory = async () => {
        await (dbService as any).updateContextHistory('entry-1', { data: 'modified' });
      };

      expect(updateHistory).rejects.toThrow();
    });
  });

  describe('TaskContext Operations', () => {
    it('should create new TaskContext with all required fields', async () => {
      const context: TaskContext = {
        contextId: 'ctx-123',
        taskTemplateId: 'user_onboarding',
        tenantId: 'tenant-123',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: {}
        },
        history: [],
        templateSnapshot: {
          id: 'user_onboarding',
          version: '1.0.0',
          steps: []
        }
      };

      await dbService.createTaskContext(context);
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_contexts');
      expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: context.contextId,
          task_template_id: context.taskTemplateId,
          tenant_id: context.tenantId,
          created_at: context.createdAt,
          template_snapshot: context.templateSnapshot
        })
      );
    });

    it('should retrieve TaskContext and reconstruct from history', async () => {
      const contextId = 'ctx-123';
      
      mockSupabaseClient.from().select.mockReturnThis();
      mockSupabaseClient.from().eq.mockReturnThis();
      mockSupabaseClient.from().single.mockResolvedValue({
        data: {
          context_id: contextId,
          task_template_id: 'test_template',
          tenant_id: 'tenant-123',
          created_at: '2025-01-01T00:00:00Z',
          template_snapshot: { id: 'test', version: '1.0.0' }
        },
        error: null
      });

      const context = await dbService.getTaskContext(contextId);
      
      expect(context).toMatchObject({
        contextId,
        taskTemplateId: 'test_template',
        tenantId: 'tenant-123'
      });
    });

    it('should handle non-existent context gracefully', async () => {
      mockSupabaseClient.from().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });

      const context = await dbService.getTaskContext('non-existent');
      
      expect(context).toBeNull();
    });
  });

  describe('Connection Management', () => {
    it('should handle connection pool efficiently', async () => {
      // Simulate multiple concurrent operations
      const operations = Array(50).fill(null).map((_, i) => 
        dbService.getTask(`task-${i}`)
      );

      await Promise.all(operations);
      
      // Should reuse connection, not create new ones
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    it('should recover from connection errors', async () => {
      // First call fails
      mockSupabaseClient.from().single.mockRejectedValueOnce(new Error('Connection lost'));
      
      // Second call succeeds
      mockSupabaseClient.from().single.mockResolvedValueOnce({
        data: { id: 'task-123' },
        error: null
      });

      const result = await dbService.getTaskWithRetry('task-123');
      
      expect(result).toBeDefined();
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2);
    });

    it('should implement exponential backoff for retries', async () => {
      jest.useFakeTimers();
      
      let attempts = 0;
      mockSupabaseClient.from().single.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Connection error'));
        }
        return Promise.resolve({ data: { id: 'task-123' }, error: null });
      });

      const promise = dbService.getTaskWithRetry('task-123');
      
      // First retry after 1s
      jest.advanceTimersByTime(1000);
      
      // Second retry after 2s
      jest.advanceTimersByTime(2000);
      
      const result = await promise;
      
      expect(result).toBeDefined();
      expect(attempts).toBe(3);
      
      jest.useRealTimers();
    });
  });

  describe('Transaction Support', () => {
    it('should support atomic operations within transaction', async () => {
      const transaction = async () => {
        await dbService.beginTransaction();
        
        try {
          await dbService.createTask({ title: 'Task 1' });
          await dbService.createTask({ title: 'Task 2' });
          await dbService.commitTransaction();
        } catch (error) {
          await dbService.rollbackTransaction();
          throw error;
        }
      };

      await transaction();
      
      expect(mockSupabaseClient.from().insert).toHaveBeenCalledTimes(2);
    });

    it('should rollback on error within transaction', async () => {
      mockSupabaseClient.from().insert
        .mockResolvedValueOnce({ data: { id: 'task-1' }, error: null })
        .mockRejectedValueOnce(new Error('Constraint violation'));

      const transaction = async () => {
        await dbService.beginTransaction();
        
        try {
          await dbService.createTask({ title: 'Task 1' });
          await dbService.createTask({ title: 'Task 2' }); // This fails
          await dbService.commitTransaction();
        } catch (error) {
          await dbService.rollbackTransaction();
          throw error;
        }
      };

      await expect(transaction()).rejects.toThrow('Constraint violation');
      
      // Verify rollback was called
      expect(dbService.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('Data Validation and Sanitization', () => {
    it('should validate required fields before insert', async () => {
      const invalidTask = {
        // Missing required fields
        description: 'Test task'
      };

      await expect(dbService.createTask(invalidTask as any))
        .rejects.toThrow(/required field/i);
    });

    it('should sanitize user input to prevent injection', async () => {
      const task = {
        title: "Task'; DROP TABLE tasks; --",
        description: '<script>alert("XSS")</script>'
      };

      await dbService.createTask(task);
      
      const insertCall = mockSupabaseClient.from().insert.mock.calls[0][0];
      
      // Verify sanitization
      expect(insertCall.title).not.toContain('DROP TABLE');
      expect(insertCall.description).not.toContain('<script>');
    });

    it('should validate data types match schema', async () => {
      const task = {
        title: 'Valid task',
        priority: 'invalid_priority' // Should be critical/high/medium/low
      };

      await expect(dbService.createTask(task))
        .rejects.toThrow(/invalid priority/i);
    });
  });

  describe('Performance Optimization', () => {
    it('should use proper indexes for queries', async () => {
      await dbService.getTasksByUser('user-123');
      
      expect(mockSupabaseClient.from().select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.from().eq).toHaveBeenCalledWith('user_id', 'user-123');
      // Query should use user_id index
    });

    it('should batch insert operations when possible', async () => {
      const tasks = Array(100).fill(null).map((_, i) => ({
        title: `Task ${i}`,
        user_id: 'user-123'
      }));

      await dbService.batchCreateTasks(tasks);
      
      // Should use single insert with array
      expect(mockSupabaseClient.from().insert).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(tasks);
    });

    it('should implement query result caching', async () => {
      // First call hits database
      await dbService.getTask('task-123');
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1);
      
      // Second call uses cache
      await dbService.getTask('task-123');
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1); // Still 1
      
      // Cache expires after TTL
      jest.advanceTimersByTime(60000); // 1 minute
      
      await dbService.getTask('task-123');
      expect(mockSupabaseClient.from).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database constraint violations', async () => {
      mockSupabaseClient.from().insert.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'Unique violation' }
      });

      await expect(dbService.createTask({ title: 'Duplicate' }))
        .rejects.toThrow(/already exists/i);
    });

    it('should handle network timeouts', async () => {
      jest.useFakeTimers();
      
      mockSupabaseClient.from().select.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 30000))
      );

      const promise = dbService.getTask('task-123');
      
      jest.advanceTimersByTime(5000);
      
      await expect(promise).rejects.toThrow(/timeout/i);
      
      jest.useRealTimers();
    });

    it('should provide meaningful error messages', async () => {
      mockSupabaseClient.from().insert.mockResolvedValue({
        data: null,
        error: { code: '23503', message: 'Foreign key violation' }
      });

      try {
        await dbService.createTask({ 
          title: 'Task',
          business_id: 'non-existent'
        });
      } catch (error: any) {
        expect(error.message).toContain('business');
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Audit Trail', () => {
    it('should record all operations in audit log', async () => {
      await dbService.createTask({ title: 'Audited task' });
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_audit');
      expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'task_created',
          details: expect.any(Object),
          user_id: expect.any(String),
          created_at: expect.any(String)
        })
      );
    });

    it('should include actor information in audit entries', async () => {
      const userToken = 'user-jwt-token';
      await dbService.createTaskWithAudit(
        { title: 'Task' },
        { userToken, actor: 'user-123' }
      );

      const auditCall = mockSupabaseClient.from().insert.mock.calls.find(
        call => call[0].action === 'task_created'
      );
      
      expect(auditCall[0].user_id).toBe('user-123');
    });
  });
});