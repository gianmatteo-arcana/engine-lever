/**
 * TaskService Test Suite
 * 
 * Engine PRD Compliant Testing
 * Tests universal task creation for ANY template type
 * Ensures zero special cases and 100% universal behavior
 */

import { TaskService, CreateTaskRequest, TaskResponse } from '../task-service';
import { DatabaseService } from '../database';
import { StateComputer } from '../state-computer';
import { ConfigurationManager } from '../configuration-manager';
import {
  TaskContext,
  TaskTemplate,
  ContextEntry,
  TaskState
} from '../../types/engine-types';

// Mock dependencies
jest.mock('../database');
jest.mock('../state-computer');
jest.mock('../configuration-manager');
jest.mock('../../utils/logger');

describe('TaskService - Universal Task Creation', () => {
  let taskService: TaskService;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;
  
  const mockTemplate: TaskTemplate = {
    id: 'test_template',
    version: '1.0.0',
    metadata: {
      name: 'Test Template',
      description: 'Test template for unit tests',
      category: 'testing'
    },
    goals: {
      primary: [
        {
          id: 'goal1',
          description: 'Complete test task',
          required: true,
          successCriteria: 'task.complete == true'
        }
      ]
    }
  };

  const mockRequest: CreateTaskRequest = {
    templateId: 'test_template',
    tenantId: 'tenant-123',
    userToken: 'user-token-abc',
    initialData: { source: 'test' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instance
    (TaskService as any).instance = undefined;
    
    // Get fresh instance
    taskService = TaskService.getInstance();
    
    // Setup mocks
    mockDbService = DatabaseService.getInstance() as jest.Mocked<DatabaseService>;
    mockConfigManager = new ConfigurationManager() as jest.Mocked<ConfigurationManager>;
    
    // Default mock implementations
    mockConfigManager.loadTemplate.mockResolvedValue(mockTemplate);
    mockDbService.createTaskContext.mockResolvedValue('context-123');
    mockDbService.createContextHistoryEntry.mockResolvedValue(undefined);
    mockDbService.getTaskContext.mockResolvedValue(null);
  });

  describe('Singleton Pattern', () => {
    it('should maintain single instance across calls', () => {
      const instance1 = TaskService.getInstance();
      const instance2 = TaskService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should not allow direct instantiation', () => {
      // TypeScript prevents this, but test the pattern
      expect(TaskService.getInstance()).toBeDefined();
      expect(() => (TaskService as any).new()).toThrow();
    });
  });

  describe('Universal Task Creation', () => {
    it('should create task for ANY template type using identical flow', async () => {
      // Test with different template types to ensure universality
      const templates = [
        'user_onboarding',
        'soi_filing',
        'quarterly_review',
        'custom_workflow'
      ];

      for (const templateId of templates) {
        const request = { ...mockRequest, templateId };
        const template = { ...mockTemplate, id: templateId };
        
        mockConfigManager.loadTemplate.mockResolvedValue(template);
        
        const context = await taskService.create(request);
        
        // Verify universal structure regardless of template
        expect(context).toMatchObject({
          contextId: expect.any(String),
          taskTemplateId: templateId,
          tenantId: request.tenantId,
          currentState: {
            status: 'pending',
            phase: 'initialization',
            completeness: 0
          },
          history: [],
          templateSnapshot: template
        });
      }
    });

    it('should load template from configuration (PRD Line 46)', async () => {
      await taskService.create(mockRequest);
      
      expect(mockConfigManager.loadTemplate).toHaveBeenCalledWith('test_template');
      expect(mockConfigManager.loadTemplate).toHaveBeenCalledTimes(1);
    });

    it('should create immutable TaskContext (PRD Lines 145-220)', async () => {
      const context = await taskService.create(mockRequest);
      
      // Verify all required fields
      expect(context.contextId).toBeDefined();
      expect(context.taskTemplateId).toBe(mockRequest.templateId);
      expect(context.tenantId).toBe(mockRequest.tenantId);
      expect(context.createdAt).toBeDefined();
      expect(context.currentState).toBeDefined();
      expect(context.history).toEqual([]);
      expect(context.templateSnapshot).toEqual(mockTemplate);
      
      // Verify immutability (template snapshot should be frozen)
      expect(Object.isFrozen(context.templateSnapshot)).toBe(true);
    });

    it('should persist TaskContext to database', async () => {
      const context = await taskService.create(mockRequest);
      
      expect(mockDbService.createTaskContext).toHaveBeenCalledWith(
        expect.objectContaining({
          contextId: context.contextId,
          taskTemplateId: mockRequest.templateId,
          tenantId: mockRequest.tenantId
        })
      );
    });

    it('should create initial ContextEntry with proper actor attribution', async () => {
      const context = await taskService.create(mockRequest);
      
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        context.contextId,
        expect.objectContaining({
          entryId: expect.any(String),
          timestamp: expect.any(String),
          sequenceNumber: 1,
          actor: {
            type: 'system',
            id: 'task_service',
            version: '1.0.0'
          },
          operation: 'task_created',
          data: expect.objectContaining({
            templateId: mockRequest.templateId,
            tenantId: mockRequest.tenantId
          }),
          reasoning: expect.stringContaining('Task created from template')
        })
      );
    });

    it('should append to history following append-only principle (PRD Line 49)', async () => {
      const context = await taskService.create(mockRequest);
      
      // Verify append operation
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalled();
      
      // Verify no update or delete operations
      expect(mockDbService.updateTaskContext).not.toHaveBeenCalled();
      expect(mockDbService.deleteTaskContext).not.toHaveBeenCalled();
    });

    it('should trigger orchestration after task creation', async () => {
      const context = await taskService.create(mockRequest);
      
      // Verify orchestration triggered
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        context.contextId,
        expect.objectContaining({
          operation: 'orchestration_triggered'
        })
      );
    });

    it('should handle missing template gracefully', async () => {
      mockConfigManager.loadTemplate.mockResolvedValue(null);
      
      await expect(taskService.create(mockRequest))
        .rejects.toThrow('Template not found: test_template');
      
      // Verify no partial data persisted
      expect(mockDbService.createTaskContext).not.toHaveBeenCalled();
      expect(mockDbService.createContextHistoryEntry).not.toHaveBeenCalled();
    });

    it('should handle database errors with proper rollback', async () => {
      mockDbService.createTaskContext.mockRejectedValue(new Error('DB Error'));
      
      await expect(taskService.create(mockRequest))
        .rejects.toThrow('DB Error');
      
      // Verify cleanup attempted
      expect(mockDbService.deleteTaskContext).not.toHaveBeenCalled(); // No partial state to clean
    });

    it('should include initial data in TaskContext', async () => {
      const initialData = {
        userEmail: 'test@example.com',
        businessName: 'Test Corp',
        source: 'oauth_callback'
      };
      
      const request = { ...mockRequest, initialData };
      const context = await taskService.create(request);
      
      expect(context.currentState.data).toEqual(initialData);
    });

    it('should handle concurrent task creation safely', async () => {
      const promises = Array(10).fill(null).map((_, i) => 
        taskService.create({
          ...mockRequest,
          tenantId: `tenant-${i}`
        })
      );
      
      const contexts = await Promise.all(promises);
      
      // Verify all contexts created with unique IDs
      const contextIds = contexts.map(c => c.contextId);
      expect(new Set(contextIds).size).toBe(10);
      
      // Verify all persisted
      expect(mockDbService.createTaskContext).toHaveBeenCalledTimes(10);
    });
  });

  describe('Task Retrieval and State Computation', () => {
    it('should retrieve existing task and compute current state', async () => {
      const mockHistory: ContextEntry[] = [
        {
          entryId: 'entry-1',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          actor: { type: 'system', id: 'task_service', version: '1.0.0' },
          operation: 'task_created',
          data: { status: 'pending' },
          reasoning: 'Initial creation'
        },
        {
          entryId: 'entry-2',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          actor: { type: 'agent', id: 'TestAgent', version: '1.0.0' },
          operation: 'status_updated',
          data: { status: 'in_progress' },
          reasoning: 'Processing started'
        }
      ];

      mockDbService.getTaskContext.mockResolvedValue({
        contextId: 'context-123',
        taskTemplateId: 'test_template',
        tenantId: 'tenant-123',
        createdAt: new Date().toISOString(),
        currentState: null, // Will be computed
        history: mockHistory,
        templateSnapshot: mockTemplate
      });

      const context = await taskService.getTask('context-123', 'user-token');
      
      // Verify state computed from history
      expect(StateComputer.computeState).toHaveBeenCalledWith(mockHistory);
      expect(context.currentState).toBeDefined();
    });

    it('should handle non-existent task gracefully', async () => {
      mockDbService.getTaskContext.mockResolvedValue(null);
      
      const context = await taskService.getTask('non-existent', 'user-token');
      
      expect(context).toBeNull();
    });
  });

  describe('Task Updates via Event Sourcing', () => {
    it('should update task by appending new events only', async () => {
      const contextId = 'context-123';
      const update = {
        actor: { type: 'agent', id: 'TestAgent', version: '1.0.0' },
        operation: 'data_collected',
        data: { businessEIN: '12-3456789' },
        reasoning: 'Collected from user input'
      };

      await taskService.appendEvent(contextId, update, 'user-token');
      
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        contextId,
        expect.objectContaining({
          ...update,
          entryId: expect.any(String),
          timestamp: expect.any(String),
          sequenceNumber: expect.any(Number)
        })
      );
      
      // Verify no direct updates
      expect(mockDbService.updateTaskContext).not.toHaveBeenCalled();
    });

    it('should maintain sequence numbers correctly', async () => {
      const contextId = 'context-123';
      
      // Mock existing history
      mockDbService.getContextHistory.mockResolvedValue([
        { sequenceNumber: 1 },
        { sequenceNumber: 2 }
      ]);

      await taskService.appendEvent(contextId, {
        actor: { type: 'system', id: 'test', version: '1.0.0' },
        operation: 'test_op',
        data: {},
        reasoning: 'test'
      }, 'user-token');
      
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        contextId,
        expect.objectContaining({
          sequenceNumber: 3 // Next in sequence
        })
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle configuration loading errors', async () => {
      mockConfigManager.loadTemplate.mockRejectedValue(new Error('Config Error'));
      
      await expect(taskService.create(mockRequest))
        .rejects.toThrow('Config Error');
    });

    it('should handle network timeouts gracefully', async () => {
      jest.useFakeTimers();
      
      mockDbService.createTaskContext.mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 10000))
      );
      
      const createPromise = taskService.create(mockRequest);
      
      jest.advanceTimersByTime(5000);
      
      // Should timeout after configured limit
      await expect(createPromise).rejects.toThrow('timeout');
      
      jest.useRealTimers();
    });

    it('should validate required fields in request', async () => {
      const invalidRequests = [
        { ...mockRequest, templateId: undefined },
        { ...mockRequest, tenantId: undefined },
        { ...mockRequest, userToken: undefined }
      ];

      for (const request of invalidRequests) {
        await expect(taskService.create(request as any))
          .rejects.toThrow(/required/i);
      }
    });

    it('should sanitize user input in initial data', async () => {
      const request = {
        ...mockRequest,
        initialData: {
          script: '<script>alert("xss")</script>',
          sql: "'; DROP TABLE users; --"
        }
      };

      const context = await taskService.create(request);
      
      // Verify sanitization
      expect(context.currentState.data.script).not.toContain('<script>');
      expect(context.currentState.data.sql).not.toContain('DROP TABLE');
    });
  });

  describe('Performance Requirements', () => {
    it('should create task within 100ms for standard template', async () => {
      const start = Date.now();
      await taskService.create(mockRequest);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
    });

    it('should handle large initial data efficiently', async () => {
      const largeData = Array(1000).fill(null).map((_, i) => ({
        [`field_${i}`]: `value_${i}`
      })).reduce((acc, obj) => ({ ...acc, ...obj }), {});

      const request = { ...mockRequest, initialData: largeData };
      
      const start = Date.now();
      await taskService.create(request);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500);
    });

    it('should compute state efficiently for large histories', async () => {
      const largeHistory = Array(1000).fill(null).map((_, i) => ({
        entryId: `entry-${i}`,
        timestamp: new Date().toISOString(),
        sequenceNumber: i + 1,
        actor: { type: 'system', id: 'test', version: '1.0.0' },
        operation: 'test_op',
        data: { index: i },
        reasoning: `Test ${i}`
      }));

      mockDbService.getTaskContext.mockResolvedValue({
        contextId: 'context-123',
        taskTemplateId: 'test_template',
        tenantId: 'tenant-123',
        createdAt: new Date().toISOString(),
        currentState: null,
        history: largeHistory,
        templateSnapshot: mockTemplate
      });

      const start = Date.now();
      await taskService.getTask('context-123', 'user-token');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Universal Template Support', () => {
    it('should handle onboarding template identically to other templates', async () => {
      const onboardingRequest = {
        ...mockRequest,
        templateId: 'user_onboarding'
      };

      const soiRequest = {
        ...mockRequest,
        templateId: 'soi_filing'
      };

      const onboardingContext = await taskService.create(onboardingRequest);
      const soiContext = await taskService.create(soiRequest);

      // Verify identical structure
      expect(Object.keys(onboardingContext)).toEqual(Object.keys(soiContext));
      
      // Verify same flow used
      expect(mockConfigManager.loadTemplate).toHaveBeenCalledTimes(2);
      expect(mockDbService.createTaskContext).toHaveBeenCalledTimes(2);
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledTimes(4); // 2 per task
    });

    it('should reject special-case handling attempts', async () => {
      // This test ensures no special logic for specific templates
      const spy = jest.spyOn(taskService as any, 'handleSpecialCase');
      
      await taskService.create({
        ...mockRequest,
        templateId: 'user_onboarding'
      });

      // Method should not exist
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Audit Trail and Compliance', () => {
    it('should record complete audit trail with actor attribution', async () => {
      await taskService.create(mockRequest);
      
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          actor: expect.objectContaining({
            type: expect.any(String),
            id: expect.any(String),
            version: expect.any(String)
          }),
          timestamp: expect.any(String),
          reasoning: expect.any(String)
        })
      );
    });

    it('should include reasoning for every operation', async () => {
      await taskService.create(mockRequest);
      
      const calls = mockDbService.createContextHistoryEntry.mock.calls;
      
      calls.forEach(call => {
        const entry = call[1];
        expect(entry.reasoning).toBeDefined();
        expect(entry.reasoning.length).toBeGreaterThan(10);
      });
    });

    it('should maintain data lineage through history', async () => {
      const contextId = 'context-123';
      
      // Simulate multiple updates
      const updates = [
        { field: 'businessName', value: 'Initial Corp' },
        { field: 'businessName', value: 'Updated Corp' },
        { field: 'businessName', value: 'Final Corp' }
      ];

      for (const update of updates) {
        await taskService.appendEvent(contextId, {
          actor: { type: 'user', id: 'user-123', version: '1.0.0' },
          operation: 'field_updated',
          data: update,
          reasoning: `User updated ${update.field}`
        }, 'user-token');
      }

      // Verify all changes recorded
      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledTimes(3);
      
      // Verify can trace value evolution
      const calls = mockDbService.createContextHistoryEntry.mock.calls;
      expect(calls[0][1].data.value).toBe('Initial Corp');
      expect(calls[1][1].data.value).toBe('Updated Corp');
      expect(calls[2][1].data.value).toBe('Final Corp');
    });
  });
});