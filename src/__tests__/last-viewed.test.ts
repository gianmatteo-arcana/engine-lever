/**
 * Unit tests for last_viewed_at column functionality
 * Tests the new column added to track when tasks are viewed
 */

import { DatabaseService } from '../services/database';
import { TaskContext } from '../agents/base/types';

describe('Last Viewed At Feature', () => {
  let dbService: DatabaseService;
  let mockSupabase: any;

  beforeEach(() => {
    // Initialize database service
    dbService = DatabaseService.getInstance();
    
    // Mock the Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      rpc: jest.fn()
    };

    // Override the supabase client in DatabaseService
    (dbService as any).supabase = mockSupabase;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task View Tracking', () => {
    it('should update last_viewed_at when a task is retrieved', async () => {
      const taskId = 'test-task-123';
      const now = new Date().toISOString();
      
      // Mock the update response
      mockSupabase.single.mockResolvedValue({
        data: { id: taskId, last_viewed_at: now },
        error: null
      });

      // Call a method that should update last_viewed_at
      await dbService.updateTaskLastViewed(taskId);

      // Verify the update was called with correct parameters
      expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabase.update).toHaveBeenCalledWith({
        last_viewed_at: expect.any(String)
      });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', taskId);
    });

    it('should handle null last_viewed_at for new tasks', async () => {
      const taskData = {
        id: 'new-task-456',
        title: 'Test Task',
        description: 'A test task',
        status: 'pending' as const,
        user_id: 'user-123',
        last_viewed_at: null
      };

      mockSupabase.single.mockResolvedValue({
        data: taskData,
        error: null
      });

      const result = await dbService.getTask('new-task-456');

      expect(result).toBeDefined();
      expect(result?.last_viewed_at).toBeNull();
    });

    it('should include last_viewed_at in task queries', async () => {
      const userId = 'user-789';
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Recently Viewed',
          last_viewed_at: '2025-08-03T12:00:00Z',
          status: 'pending'
        },
        {
          id: 'task-2',
          title: 'Never Viewed',
          last_viewed_at: null,
          status: 'pending'
        }
      ];

      mockSupabase.select.mockResolvedValue({
        data: mockTasks,
        error: null
      });

      const result = await dbService.getUserTasks(userId);

      expect(mockSupabase.select).toHaveBeenCalledWith('*');
      expect(result).toHaveLength(2);
      expect(result[0].last_viewed_at).toBe('2025-08-03T12:00:00Z');
      expect(result[1].last_viewed_at).toBeNull();
    });

    it('should sort tasks by last_viewed_at in descending order', async () => {
      const userId = 'user-999';
      
      // Mock ordering function
      const orderMock = jest.fn().mockResolvedValue({
        data: [
          { id: '1', last_viewed_at: '2025-08-03T15:00:00Z' },
          { id: '2', last_viewed_at: '2025-08-03T14:00:00Z' },
          { id: '3', last_viewed_at: null }
        ],
        error: null
      });

      mockSupabase.order = orderMock;

      await dbService.getRecentlyViewedTasks(userId, 10);

      expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', userId);
      expect(orderMock).toHaveBeenCalledWith('last_viewed_at', { 
        ascending: false, 
        nullsFirst: false 
      });
    });
  });

  describe('Database Schema Validation', () => {
    it('should confirm last_viewed_at column exists in schema', async () => {
      // Mock the RPC call to check column existence
      mockSupabase.rpc.mockResolvedValue({
        data: {
          exists: true,
          data_type: 'timestamp with time zone',
          is_nullable: true
        },
        error: null
      });

      const columnExists = await dbService.checkColumnExists('tasks', 'last_viewed_at');

      expect(columnExists).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('check_column_exists', {
        table_name: 'tasks',
        column_name: 'last_viewed_at'
      });
    });

    it('should confirm index exists for last_viewed_at', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: {
          index_exists: true,
          index_name: 'idx_tasks_last_viewed_at'
        },
        error: null
      });

      const indexExists = await dbService.checkIndexExists('idx_tasks_last_viewed_at');

      expect(indexExists).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when updating last_viewed_at', async () => {
      const taskId = 'error-task';
      const error = new Error('Database error');

      mockSupabase.single.mockResolvedValue({
        data: null,
        error
      });

      await expect(dbService.updateTaskLastViewed(taskId))
        .rejects.toThrow('Database error');
    });

    it('should gracefully handle missing last_viewed_at column', async () => {
      const error = {
        message: 'column "last_viewed_at" does not exist',
        code: '42703'
      };

      mockSupabase.single.mockResolvedValue({
        data: null,
        error
      });

      // Should log warning but not throw
      const result = await dbService.getTask('any-task');
      expect(result).toBeNull();
    });
  });
});

// Add the new methods to DatabaseService (these would be implemented in database.ts)
declare module '../services/database' {
  interface DatabaseService {
    updateTaskLastViewed(taskId: string): Promise<void>;
    getUserTasks(userId: string): Promise<any[]>;
    getRecentlyViewedTasks(userId: string, limit: number): Promise<any[]>;
    checkColumnExists(table: string, column: string): Promise<boolean>;
    checkIndexExists(indexName: string): Promise<boolean>;
  }
}