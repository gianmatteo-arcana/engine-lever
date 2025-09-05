/**
 * Task Recovery Test
 * 
 * Tests violent disruption and recovery of in-progress tasks
 */

import { TaskService } from '../../../src/services/task-service';
import { DatabaseService } from '../../../src/services/database';
import { OrchestratorAgent } from '../../../src/agents/OrchestratorAgent';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { TASK_STATUS } from '../../../src/constants/task-status';

// Mock the dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../../../src/agents/OrchestratorAgent');
jest.mock('../../../src/services/database');
jest.mock('../../../src/utils/logger');

describe.skip('TaskService - Violent Disruption & Recovery', () => {
  let taskService: TaskService;
  let mockSupabaseClient: any;
  let mockOrchestrator: any;
  let mockDatabaseService: any;
  
  // Synthetic task that will be disrupted
  const syntheticTask = {
    id: uuidv4(),
    task_type: 'onboarding',
    business_id: 'test-business-123',
    user_id: 'test-user-456',
    status: TASK_STATUS.IN_PROGRESS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      last_agent: 'data_collection_agent',
      iteration: 3,
      disrupted: true
    }
  };
  
  const syntheticTaskContext = {
    contextId: syntheticTask.id,
    taskTemplateId: 'onboarding',
    tenantId: 'test-tenant',
    businessId: syntheticTask.business_id,
    createdAt: syntheticTask.created_at,
    currentState: {
      status: TASK_STATUS.IN_PROGRESS,
      phase: 'data_collection',
      data: {
        businessName: 'Test Corp',
        entityType: 'LLC',
        // Partial data - task was interrupted mid-collection
        formationState: null,
        ein: null
      }
    },
    history: [
      {
        id: '1',
        operation: 'system.task_started',
        timestamp: new Date().toISOString(),
        confidence: 1.0
      },
      {
        id: '2',
        operation: 'agent.data_collection.started',
        timestamp: new Date().toISOString(),
        confidence: 1.0
      },
      {
        id: '3',
        operation: 'agent.data_collection.partial_complete',
        timestamp: new Date().toISOString(),
        confidence: 0.7
      }
      // Task was violently interrupted here
    ]
  };
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create a mock query builder that supports chaining
    const createQueryBuilder = (finalResult: any) => {
      const builder: any = {
        from: jest.fn(() => builder),
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        lt: jest.fn(() => builder),
        in: jest.fn(() => builder),
        order: jest.fn(() => builder),
        limit: jest.fn(() => Promise.resolve(finalResult)),
        insert: jest.fn(() => Promise.resolve(finalResult)),
        update: jest.fn(() => builder),
        then: (resolve: any) => Promise.resolve(finalResult).then(resolve)
      };
      return builder;
    };
    
    // Mock Supabase client
    mockSupabaseClient = {
      from: jest.fn(),
      select: jest.fn(),
      eq: jest.fn(),
      gte: jest.fn(),
      lt: jest.fn(),
      in: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      order: jest.fn(),
      limit: jest.fn()
    };
    
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock OrchestratorAgent
    mockOrchestrator = {
      orchestrateTask: jest.fn()
    };
    (OrchestratorAgent.getInstance as jest.Mock).mockReturnValue(mockOrchestrator);
    
    // Mock DatabaseService
    mockDatabaseService = {
      getServiceClient: jest.fn().mockReturnValue(mockSupabaseClient)
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDatabaseService);
    
    // Create task service instance with mocked database
    taskService = new TaskService(mockDatabaseService);
    taskService.getTaskContextById = jest.fn();
  });
  
  describe('Violent Disruption Scenarios', () => {
    it('should detect and recover a task interrupted mid-execution', async () => {
      // Create query builders for each query in recoverOrphanedTasks
      
      // First query: from('tasks').select().order().limit(10) - status check
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      // Second query: from('tasks').select().eq().gte().order() - orphaned tasks
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      // Third query: from('tasks').select().in().lt() - old stuck tasks
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      // Fourth query: from('context_entries').insert() - recovery note
      const insertBuilder = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      };
      
      // Set up the mock returns in order
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder)
        .mockReturnValueOnce(insertBuilder);
      
      // Mock getting the full task context
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(syntheticTaskContext);
      
      // Mock orchestrator resuming the task
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({
        success: true
      });
      
      // Act: Run recovery
      await taskService.recoverOrphanedTasks();
      
      // Assert: Tasks table was queried
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('tasks');
      
      // Assert: Recovery note was added
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('context_entries');
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: syntheticTask.id,
          entry_type: 'system',
          entry_data: expect.objectContaining({
            operation: 'system.task_recovered',
            data: expect.objectContaining({
              reason: 'Server restart detected'
            })
          })
        })
      );
      
      // Assert: Task context was retrieved
      expect(taskService.getTaskContextById).toHaveBeenCalledWith(syntheticTask.id);
      
      // Assert: Orchestrator was triggered to resume
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalledWith(syntheticTaskContext);
    });
    
    it('should handle multiple orphaned tasks', async () => {
      const task2 = { ...syntheticTask, id: uuidv4(), task_type: 'soi_filing' };
      const task3 = { ...syntheticTask, id: uuidv4(), task_type: 'compliance_check' };
      
      // Create query builders
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [syntheticTask, task2, task3],
          error: null
        })
      };
      
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [syntheticTask, task2, task3],
          error: null
        })
      };
      
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      // Mock multiple insert operations for recovery notes
      const insertBuilder = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder)
        .mockReturnValue(insertBuilder); // Return insertBuilder for all recovery note inserts
      
      // Mock getting task contexts for all three
      (taskService.getTaskContextById as jest.Mock)
        .mockResolvedValueOnce(syntheticTaskContext)
        .mockResolvedValueOnce({ ...syntheticTaskContext, contextId: task2.id })
        .mockResolvedValueOnce({ ...syntheticTaskContext, contextId: task3.id });
      
      // Mock successful recovery for all
      mockOrchestrator.orchestrateTask.mockResolvedValue({ success: true });
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: All three tasks were recovered
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalledTimes(3);
      expect(taskService.getTaskContextById).toHaveBeenCalledTimes(3);
    });
    
    it('should mark task as FAILED if recovery fails', async () => {
      // Create query builders
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      // Update task to failed
      const updateBuilder = {
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder)
        .mockReturnValueOnce(updateBuilder);
      
      // Simulate: Getting task context fails
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(null);
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: Task was marked as failed
      expect(updateBuilder.update).toHaveBeenCalledWith({
        status: TASK_STATUS.FAILED,
        updated_at: expect.any(String)
      });
    });
    
    it('should not recover PAUSED tasks', async () => {
      // This test verifies we only recover IN_PROGRESS tasks
      // PAUSED tasks should be left alone
      
      // Create query builders with no tasks
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder);
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: No recovery attempted
      expect(mockOrchestrator.orchestrateTask).not.toHaveBeenCalled();
      expect(taskService.getTaskContextById).not.toHaveBeenCalled();
    });
    
    it('should throw error if database query fails', async () => {
      // Create query builders
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      const failedQueryBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Database connection failed')
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(failedQueryBuilder);
      
      // Act & Assert: Should throw
      await expect(taskService.recoverOrphanedTasks()).rejects.toThrow('Database connection failed');
    });
  });
  
  describe('Recovery State Persistence', () => {
    it('should persist recovery event in task history', async () => {
      // Create query builders
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      const insertBuilder = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder)
        .mockReturnValueOnce(insertBuilder);
      
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(syntheticTaskContext);
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({ success: true });
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: Recovery event was persisted
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          entry_data: expect.objectContaining({
            operation: 'system.task_recovered',
            reasoning: 'Task was in progress when server restarted, automatically resuming',
            confidence: 1.0
          })
        })
      );
    });
    
    it('should include recovery metadata', async () => {
      // Setup
      const beforeRecovery = new Date();
      
      // Create query builders
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [syntheticTask],
          error: null
        })
      };
      
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      const insertBuilder = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder)
        .mockReturnValueOnce(insertBuilder);
      
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(syntheticTaskContext);
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({ success: true });
      
      // Act
      await taskService.recoverOrphanedTasks();
      const afterRecovery = new Date();
      
      // Assert: Recovery timestamp is included
      const insertCall = insertBuilder.insert.mock.calls[0][0];
      const recoveredAt = new Date(insertCall.entry_data.data.recovered_at);
      
      expect(recoveredAt.getTime()).toBeGreaterThanOrEqual(beforeRecovery.getTime());
      expect(recoveredAt.getTime()).toBeLessThanOrEqual(afterRecovery.getTime());
    });
  });
  
  describe('Simulated Server Restart', () => {
    it('should simulate full restart cycle with task recovery', async () => {
      // Phase 1: Task is running
      const runningTask = { ...syntheticTask, status: TASK_STATUS.IN_PROGRESS };
      
      // Phase 2: Server crashes (violent disruption)
      // - No graceful shutdown
      // - Task left in IN_PROGRESS state
      // - No cleanup performed
      
      // Phase 3: Server restarts
      // - Recovery service runs on startup
      
      // Create query builders
      const statusCheckBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [runningTask],
          error: null
        })
      };
      
      const orphanedTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [runningTask],
          error: null
        })
      };
      
      const oldTasksBuilder = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        lt: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };
      
      const insertBuilder = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({
          data: null,
          error: null
        })
      };
      
      mockSupabaseClient.from
        .mockReturnValueOnce(statusCheckBuilder)
        .mockReturnValueOnce(orphanedTasksBuilder)
        .mockReturnValueOnce(oldTasksBuilder)
        .mockReturnValueOnce(insertBuilder);
      
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(syntheticTaskContext);
      
      // Simulate orchestrator resuming from last known state
      mockOrchestrator.orchestrateTask.mockImplementationOnce(async (context: any) => {
        // Verify context has previous state
        expect(context.currentState.data.businessName).toBe('Test Corp');
        expect(context.currentState.data.entityType).toBe('LLC');
        expect(context.history.length).toBe(3);
        
        // Simulate continuing from where it left off
        return {
          success: true,
          resumedFrom: 'data_collection',
          continueWithAgent: 'data_collection_agent'
        };
      });
      
      // Act: Run recovery (simulating server restart)
      await taskService.recoverOrphanedTasks();
      
      // Assert: Task was recovered and resumed from correct state
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalled();
      const calledContext = mockOrchestrator.orchestrateTask.mock.calls[0][0];
      expect(calledContext.currentState.status).toBe(TASK_STATUS.IN_PROGRESS);
      expect(calledContext.currentState.phase).toBe('data_collection');
    });
  });
});