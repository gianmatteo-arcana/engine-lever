/**
 * Unit tests for TaskIntrospectionTool
 */

import { TaskIntrospectionTool } from '../../../src/tools/task-introspection';
import { DatabaseService } from '../../../src/services/database';

// Mock the database service
jest.mock('../../../src/services/database');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  createTaskLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }))
}));

describe('TaskIntrospectionTool', () => {
  let tool: TaskIntrospectionTool;
  let mockDbService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database service
    mockDbService = {
      getTask: jest.fn(),
      getContextHistory: jest.fn()
    };
    
    (DatabaseService as any).getInstance = jest.fn(() => mockDbService);
    
    tool = new TaskIntrospectionTool();
  });

  describe('Basic Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('TaskIntrospection');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Analyze and understand the current task context, progress, and objectives');
    });
  });

  describe('introspect method', () => {
    const mockTask = {
      id: 'task-123',
      user_id: 'user-456',
      title: 'Business Registration',
      description: 'Register a new business',
      task_type: 'onboarding',
      status: 'in_progress',
      created_at: new Date().toISOString(),
      metadata: {
        taskTemplateId: 'business-registration-v1',
        taskDefinition: {
          name: 'Business Registration',
          description: 'Complete business registration process',
          category: 'registration'
        }
      }
    };

    const mockHistory = [
      {
        operation: 'business_info_collection',
        timestamp: new Date().toISOString(),
        data: {
          extractedData: {
            businessName: 'Test Corp',
            businessAddress: '123 Main St'
          },
          status: 'success'
        }
      },
      {
        operation: 'ein_verification',
        timestamp: new Date().toISOString(),
        data: {
          uiRequest: {
            semanticData: {
              title: 'EIN Verification',
              fields: [
                { name: 'ein', required: true },
                { name: 'taxId', required: false }
              ]
            }
          }
        }
      }
    ];

    it('should return complete introspection for all aspects', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'all'
      });

      expect(result.taskId).toBe('task-123');
      expect(result.template).toBeDefined();
      expect(result.progress).toBeDefined();
      expect(result.collectedData).toBeDefined();
      expect(result.objectives).toBeDefined();
      expect(result.insights).toBeDefined();
    });

    it('should analyze template correctly', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'template'
      });

      expect(result.template).toEqual(expect.objectContaining({
        id: 'business-registration-v1',
        name: 'Business Registration',
        category: 'registration',
        requiredFields: expect.arrayContaining(['businessName', 'businessAddress', 'ein'])
      }));
    });

    it('should analyze progress correctly', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'progress'
      });

      expect(result.progress).toEqual(expect.objectContaining({
        status: 'in_progress',
        lastActivity: 'ein_verification',
        completeness: expect.any(Number)
      }));
      expect(result.progress?.completeness).toBeGreaterThanOrEqual(0);
      expect(result.progress?.completeness).toBeLessThanOrEqual(100);
    });

    it('should analyze collected data correctly', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'data'
      });

      expect(result.collectedData).toEqual(expect.objectContaining({
        fields: expect.objectContaining({
          businessName: 'Test Corp',
          businessAddress: '123 Main St'
        }),
        missingRequired: expect.arrayContaining(['ein']),
        dataQuality: expect.any(Number)
      }));
    });

    it('should analyze objectives correctly', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'objectives'
      });

      expect(result.objectives).toEqual(expect.objectContaining({
        primaryGoal: expect.stringContaining('business'),
        subGoals: expect.any(Array),
        successCriteria: expect.any(Array),
        currentFocus: expect.any(String),
        nextActions: expect.any(Array)
      }));
    });

    it('should generate helpful insights', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'all'
      });

      expect(result.insights).toEqual(expect.objectContaining({
        summary: expect.any(String),
        recommendations: expect.any(Array),
        warnings: expect.any(Array)
      }));
      
      // Should recommend collecting missing EIN
      expect(result.insights?.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ein')
        ])
      );
    });

    it('should handle task not found error', async () => {
      mockDbService.getTask.mockResolvedValue(null);

      await expect(tool.introspect({
        taskId: 'nonexistent',
        userId: 'user-456',
        aspectToInspect: 'all'
      })).rejects.toThrow('Task nonexistent not found or unauthorized');
    });

    it('should handle empty history gracefully', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue([]);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'all'
      });

      expect(result.progress?.completeness).toBe(0);
      expect(result.collectedData?.fields).toEqual({});
      expect(result.insights?.warnings).toEqual(
        expect.arrayContaining([
          'No progress has been made on this task'
        ])
      );
    });

    it('should calculate data quality correctly', async () => {
      const historyWithPoorData = [
        {
          operation: 'data_collection',
          data: {
            extractedData: {
              businessName: 'A', // Too short
              businessAddress: ''  // Empty
            },
            uiRequest: {
              semanticData: {
                fields: [
                  { name: 'businessName', required: true },
                  { name: 'businessAddress', required: true },
                  { name: 'ein', required: true }
                ]
              }
            }
          }
        }
      ];

      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(historyWithPoorData);

      const result = await tool.introspect({
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'all'  // Use 'all' to generate insights
      });

      // Data quality should be low due to short/empty values and missing required field
      expect(result.collectedData?.dataQuality).toBeLessThan(70);
      
      // Should have warnings due to low quality or missing progress
      if (result.collectedData?.dataQuality && result.collectedData.dataQuality < 50) {
        expect(result.insights?.warnings).toEqual(
          expect.arrayContaining([
            'Data quality is below acceptable threshold'
          ])
        );
      }
    });
  });
});