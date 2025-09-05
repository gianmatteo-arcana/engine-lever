/**
 * Task Recovery Service Test
 * 
 * Tests violent disruption and recovery of in-progress tasks
 */

import { TaskRecoveryService } from '../../../src/services/task-recovery';
import { TaskService } from '../../../src/services/task-service';
import { OrchestratorAgent } from '../../../src/agents/OrchestratorAgent';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Mock the dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../../../src/agents/OrchestratorAgent');
jest.mock('../../../src/services/task-service');
jest.mock('../../../src/utils/logger');

describe('TaskRecoveryService - Violent Disruption & Recovery', () => {
  let recoveryService: TaskRecoveryService;
  let mockSupabaseClient: any;
  let mockOrchestrator: any;
  let mockTaskService: any;
  
  // Synthetic task that will be disrupted
  const syntheticTask = {
    id: uuidv4(),
    task_type: 'onboarding',
    business_id: 'test-business-123',
    user_id: 'test-user-456',
    status: 'AGENT_EXECUTION_IN_PROGRESS',
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
      status: 'AGENT_EXECUTION_IN_PROGRESS',
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
    
    // Mock Supabase client
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis()
    };
    
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock OrchestratorAgent
    mockOrchestrator = {
      orchestrateTask: jest.fn()
    };
    (OrchestratorAgent.getInstance as jest.Mock).mockReturnValue(mockOrchestrator);
    
    // Mock TaskService
    mockTaskService = {
      getTaskContextById: jest.fn()
    };
    (TaskService.getInstance as jest.Mock).mockReturnValue(mockTaskService);
    
    // Create recovery service instance
    recoveryService = new TaskRecoveryService();
  });
  
  describe('Violent Disruption Scenarios', () => {
    it('should detect and recover a task interrupted mid-execution', async () => {
      // Simulate: Task was in progress when server crashed
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [syntheticTask],
        error: null
      });
      
      // Mock getting the full task context
      mockTaskService.getTaskContextById.mockResolvedValueOnce(syntheticTaskContext);
      
      // Mock successful recovery note insertion
      mockSupabaseClient.insert.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      // Mock orchestrator resuming the task
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({
        success: true
      });
      
      // Act: Run recovery
      await recoveryService.recoverOrphanedTasks();
      
      // Assert: Task was detected
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'AGENT_EXECUTION_IN_PROGRESS');
      
      // Assert: Recovery note was added
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('context_entries');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
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
      expect(mockTaskService.getTaskContextById).toHaveBeenCalledWith(syntheticTask.id);
      
      // Assert: Orchestrator was triggered to resume
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalledWith(syntheticTaskContext);
    });
    
    it('should handle multiple orphaned tasks', async () => {
      const task2 = { ...syntheticTask, id: uuidv4(), task_type: 'soi_filing' };
      const task3 = { ...syntheticTask, id: uuidv4(), task_type: 'compliance_check' };
      
      // Simulate: Multiple tasks were interrupted
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [syntheticTask, task2, task3],
        error: null
      });
      
      // Mock getting task contexts for all three
      mockTaskService.getTaskContextById
        .mockResolvedValueOnce(syntheticTaskContext)
        .mockResolvedValueOnce({ ...syntheticTaskContext, contextId: task2.id })
        .mockResolvedValueOnce({ ...syntheticTaskContext, contextId: task3.id });
      
      // Mock successful recovery for all
      mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });
      mockOrchestrator.orchestrateTask.mockResolvedValue({ success: true });
      
      // Act
      await recoveryService.recoverOrphanedTasks();
      
      // Assert: All three tasks were recovered
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalledTimes(3);
      expect(mockTaskService.getTaskContextById).toHaveBeenCalledTimes(3);
    });
    
    it('should mark task as FAILED if recovery fails', async () => {
      // Simulate: Task found but recovery fails
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [syntheticTask],
        error: null
      });
      
      // Simulate: Getting task context fails
      mockTaskService.getTaskContextById.mockResolvedValueOnce(null);
      
      // Mock update to mark as failed
      mockSupabaseClient.update.mockReturnThis();
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: null
      });
      
      // Act
      await recoveryService.recoverOrphanedTasks();
      
      // Assert: Task was marked as failed
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: 'FAILED',
        updated_at: expect.any(String)
      });
    });
    
    it('should not recover PAUSED tasks', async () => {
      // This test verifies we only recover IN_PROGRESS tasks
      // PAUSED tasks should be left alone
      
      // Simulate: No IN_PROGRESS tasks found
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [],
        error: null
      });
      
      // Act
      await recoveryService.recoverOrphanedTasks();
      
      // Assert: No recovery attempted
      expect(mockOrchestrator.orchestrateTask).not.toHaveBeenCalled();
      expect(mockTaskService.getTaskContextById).not.toHaveBeenCalled();
    });
    
    it('should throw error if database query fails', async () => {
      // Simulate: Database error
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: null,
        error: new Error('Database connection failed')
      });
      
      // Act & Assert: Should throw
      await expect(recoveryService.recoverOrphanedTasks()).rejects.toThrow('Database connection failed');
    });
  });
  
  describe('Recovery State Persistence', () => {
    it('should persist recovery event in task history', async () => {
      // Setup
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [syntheticTask],
        error: null
      });
      mockTaskService.getTaskContextById.mockResolvedValueOnce(syntheticTaskContext);
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: null, error: null });
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({ success: true });
      
      // Act
      await recoveryService.recoverOrphanedTasks();
      
      // Assert: Recovery event was persisted
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
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
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [syntheticTask],
        error: null
      });
      mockTaskService.getTaskContextById.mockResolvedValueOnce(syntheticTaskContext);
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: null, error: null });
      mockOrchestrator.orchestrateTask.mockResolvedValueOnce({ success: true });
      
      // Act
      await recoveryService.recoverOrphanedTasks();
      const afterRecovery = new Date();
      
      // Assert: Recovery timestamp is included
      const insertCall = mockSupabaseClient.insert.mock.calls[0][0];
      const recoveredAt = new Date(insertCall.entry_data.data.recovered_at);
      
      expect(recoveredAt.getTime()).toBeGreaterThanOrEqual(beforeRecovery.getTime());
      expect(recoveredAt.getTime()).toBeLessThanOrEqual(afterRecovery.getTime());
    });
  });
  
  describe('Simulated Server Restart', () => {
    it('should simulate full restart cycle with task recovery', async () => {
      // Phase 1: Task is running
      const runningTask = { ...syntheticTask, status: 'AGENT_EXECUTION_IN_PROGRESS' };
      
      // Phase 2: Server crashes (violent disruption)
      // - No graceful shutdown
      // - Task left in IN_PROGRESS state
      // - No cleanup performed
      
      // Phase 3: Server restarts
      // - Recovery service runs on startup
      mockSupabaseClient.eq.mockResolvedValueOnce({
        data: [runningTask],
        error: null
      });
      mockTaskService.getTaskContextById.mockResolvedValueOnce(syntheticTaskContext);
      mockSupabaseClient.insert.mockResolvedValueOnce({ data: null, error: null });
      
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
      await recoveryService.recoverOrphanedTasks();
      
      // Assert: Task was recovered and resumed from correct state
      expect(mockOrchestrator.orchestrateTask).toHaveBeenCalled();
      const calledContext = mockOrchestrator.orchestrateTask.mock.calls[0][0];
      expect(calledContext.currentState.status).toBe('AGENT_EXECUTION_IN_PROGRESS');
      expect(calledContext.currentState.phase).toBe('data_collection');
    });
  });
});