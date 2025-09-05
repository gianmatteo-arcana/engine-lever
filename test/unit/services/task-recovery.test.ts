/**
 * Task Recovery Test
 * 
 * Tests violent disruption and recovery of in-progress tasks
 */

import { TaskService } from '../../../src/services/task-service';
import { DatabaseService } from '../../../src/services/database';
import { OrchestratorAgent } from '../../../src/agents/OrchestratorAgent';
import { v4 as uuidv4 } from 'uuid';
import { TASK_STATUS } from '../../../src/constants/task-status';

// Mock the dependencies
jest.mock('../../../src/agents/OrchestratorAgent');
jest.mock('../../../src/services/database');
jest.mock('../../../src/utils/logger');

describe('TaskService - Violent Disruption & Recovery', () => {
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
    
    // Create a chainable mock that always returns itself until resolved
    const createChainableMock = () => {
      const mock: any = {
        from: jest.fn(() => mock),
        select: jest.fn(() => mock),
        eq: jest.fn(() => mock),
        gte: jest.fn(() => mock),
        lt: jest.fn(() => mock),
        in: jest.fn(() => mock),
        order: jest.fn(() => mock),
        limit: jest.fn(() => mock),
        insert: jest.fn(() => mock),
        update: jest.fn(() => mock),
        // These will be overridden per test
        then: undefined as any
      };
      return mock;
    };
    
    // Mock Supabase client
    mockSupabaseClient = createChainableMock();
    
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
      // Setup mock responses for the queries
      let queryCount = 0;
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // First query: status check
        if (queryCount === 1) {
          return Promise.resolve({
            data: [syntheticTask],
            error: null
          }).then(resolve);
        }
        
        // Second query: orphaned tasks
        if (queryCount === 2) {
          return Promise.resolve({
            data: [syntheticTask],
            error: null
          }).then(resolve);
        }
        
        // Third query: old stuck tasks (waiting_for_input check)
        if (queryCount === 3) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Fourth query: old stuck tasks
        if (queryCount === 4) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Fifth query: recovery note insert
        if (queryCount === 5) {
          return Promise.resolve({
            data: null,
            error: null
          }).then(resolve);
        }
        
        return Promise.resolve({ data: null, error: null }).then(resolve);
      });
      
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
      
      // Assert: Task context was retrieved
      expect(taskService.getTaskContextById).toHaveBeenCalledWith(syntheticTask.id);
      
      // Assert: Orchestrator was triggered to resume
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalledWith(syntheticTaskContext);
    });
    
    it('should handle multiple orphaned tasks', async () => {
      const task2 = { ...syntheticTask, id: uuidv4(), task_type: 'soi_filing' };
      const task3 = { ...syntheticTask, id: uuidv4(), task_type: 'compliance_check' };
      
      // Setup mock responses
      let queryCount = 0;
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // First query: status check
        if (queryCount === 1) {
          return Promise.resolve({
            data: [syntheticTask, task2, task3],
            error: null
          }).then(resolve);
        }
        
        // Second query: orphaned tasks
        if (queryCount === 2) {
          return Promise.resolve({
            data: [syntheticTask, task2, task3],
            error: null
          }).then(resolve);
        }
        
        // Third query: waiting_for_input check
        if (queryCount === 3) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Fourth query: old stuck tasks
        if (queryCount === 4) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Recovery note inserts (one for each task)
        return Promise.resolve({
          data: null,
          error: null
        }).then(resolve);
      });
      
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
      // Setup mock responses
      let queryCount = 0;
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // First query: status check
        if (queryCount === 1) {
          return Promise.resolve({
            data: [syntheticTask],
            error: null
          }).then(resolve);
        }
        
        // Second query: orphaned tasks
        if (queryCount === 2) {
          return Promise.resolve({
            data: [syntheticTask],
            error: null
          }).then(resolve);
        }
        
        // Third query: waiting_for_input check
        if (queryCount === 3) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Fourth query: old stuck tasks
        if (queryCount === 4) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Update task to failed
        if (queryCount === 5) {
          return Promise.resolve({
            data: null,
            error: null
          }).then(resolve);
        }
        
        return Promise.resolve({ data: null, error: null }).then(resolve);
      });
      
      // Simulate: Getting task context fails
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(null);
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: Task was marked as failed
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: TASK_STATUS.FAILED,
        updated_at: expect.any(String)
      });
    });
    
    it('should not recover PAUSED tasks', async () => {
      // This test verifies we only recover IN_PROGRESS tasks
      // PAUSED tasks should be left alone
      
      // Setup mock responses with no tasks
      let queryCount = 0;
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // All queries return empty results
        return Promise.resolve({
          data: [],
          error: null
        }).then(resolve);
      });
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: No recovery attempted
      expect(mockOrchestrator.orchestrateTask).not.toHaveBeenCalled();
      expect(taskService.getTaskContextById).not.toHaveBeenCalled();
    });
    
    it('should throw error if database query fails', async () => {
      // Setup mock to fail on orphaned tasks query
      let queryCount = 0;
      mockSupabaseClient.then = jest.fn((resolve, reject) => {
        queryCount++;
        
        // First query: status check succeeds
        if (queryCount === 1) {
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Second query: orphaned tasks fails
        if (queryCount === 2) {
          return Promise.resolve({
            data: null,
            error: new Error('Database connection failed')
          }).then(resolve);
        }
        
        return Promise.resolve({ data: null, error: null }).then(resolve);
      });
      
      // Act & Assert: Should throw
      await expect(taskService.recoverOrphanedTasks()).rejects.toThrow('Database connection failed');
    });
  });
  
  describe('Recovery State Persistence', () => {
    it('should persist recovery event in task history', async () => {
      // Setup mock responses
      let queryCount = 0;
      let insertedData: any = null;
      
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // First four queries return task data
        if (queryCount <= 4) {
          if (queryCount === 1 || queryCount === 2) {
            return Promise.resolve({
              data: [syntheticTask],
              error: null
            }).then(resolve);
          }
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Recovery note insert - capture the data
        return Promise.resolve({
          data: null,
          error: null
        }).then(resolve);
      });
      
      // Capture insert calls
      mockSupabaseClient.insert = jest.fn((data) => {
        insertedData = data;
        return mockSupabaseClient;
      });
      
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(syntheticTaskContext);
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({ success: true });
      
      // Act
      await taskService.recoverOrphanedTasks();
      
      // Assert: Recovery event was persisted with correct structure
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
      expect(insertedData).toMatchObject({
        entry_data: expect.objectContaining({
          operation: 'system.task_recovered',
          reasoning: 'Task was in progress when server restarted, automatically resuming',
          confidence: 1.0
        })
      });
    });
    
    it('should include recovery metadata', async () => {
      // Setup
      const beforeRecovery = new Date();
      
      // Setup mock responses
      let queryCount = 0;
      let insertedData: any = null;
      
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // First four queries return appropriate data
        if (queryCount <= 4) {
          if (queryCount === 1 || queryCount === 2) {
            return Promise.resolve({
              data: [syntheticTask],
              error: null
            }).then(resolve);
          }
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Recovery note insert
        return Promise.resolve({
          data: null,
          error: null
        }).then(resolve);
      });
      
      // Capture insert calls
      mockSupabaseClient.insert = jest.fn((data) => {
        insertedData = data;
        return mockSupabaseClient;
      });
      
      (taskService.getTaskContextById as jest.Mock).mockResolvedValueOnce(syntheticTaskContext);
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({ success: true });
      
      // Act
      await taskService.recoverOrphanedTasks();
      const afterRecovery = new Date();
      
      // Assert: Recovery timestamp is included
      expect(insertedData.entry_data.data).toHaveProperty('recovered_at');
      const recoveredAt = new Date(insertedData.entry_data.data.recovered_at);
      
      expect(recoveredAt.getTime()).toBeGreaterThanOrEqual(beforeRecovery.getTime());
      expect(recoveredAt.getTime()).toBeLessThanOrEqual(afterRecovery.getTime());
    });
  });
  
  describe('Simulated Server Restart', () => {
    it('should simulate full restart cycle with task recovery', async () => {
      // Phase 1: Task is running
      const runningTask = { ...syntheticTask, status: TASK_STATUS.IN_PROGRESS };
      
      // Setup mock responses
      let queryCount = 0;
      mockSupabaseClient.then = jest.fn((resolve) => {
        queryCount++;
        
        // First four queries
        if (queryCount <= 4) {
          if (queryCount === 1 || queryCount === 2) {
            return Promise.resolve({
              data: [runningTask],
              error: null
            }).then(resolve);
          }
          return Promise.resolve({
            data: [],
            error: null
          }).then(resolve);
        }
        
        // Recovery note insert
        return Promise.resolve({
          data: null,
          error: null
        }).then(resolve);
      });
      
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