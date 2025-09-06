/**
 * Unit tests for TaskIntrospectionTool integration with ToolChain
 */

import { ToolChain } from '../../../src/services/tool-chain';
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

describe('ToolChain - TaskIntrospection Integration', () => {
  let toolChain: ToolChain;
  let mockDbService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database service
    mockDbService = {
      getTask: jest.fn(),
      getContextHistory: jest.fn()
    };
    
    (DatabaseService as any).getInstance = jest.fn(() => mockDbService);
    
    toolChain = new ToolChain();
  });

  describe('Tool Registry', () => {
    it('should include taskIntrospection in the tool registry', () => {
      const registry = (toolChain as any).getToolRegistry();
      expect(registry.taskIntrospection).toBeDefined();
      expect(registry.taskIntrospection.name).toBe('taskIntrospection');
    });

    it('should have correct metadata for taskIntrospection', () => {
      const registry = (toolChain as any).getToolRegistry();
      const tool = registry.taskIntrospection;
      
      expect(tool.description).toContain('Analyze and understand current task internals');
      expect(tool.category).toBe('task_analysis');
      expect(tool.capabilities).toContain('task_scoped');
      expect(tool.capabilities).toContain('introspective_analysis');
      expect(tool.limitations).toContain('Scoped to single task only');
    });

    it('should have required parameters defined', () => {
      const registry = (toolChain as any).getToolRegistry();
      const tool = registry.taskIntrospection;
      
      expect(tool.parameters.taskId).toBeDefined();
      expect(tool.parameters.taskId.required).toBe(true);
      expect(tool.parameters.userId).toBeDefined();
      expect(tool.parameters.userId.required).toBe(true);
      expect(tool.parameters.aspectToInspect).toBeDefined();
      expect(tool.parameters.aspectToInspect.required).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    const mockTask = {
      id: 'task-123',
      user_id: 'user-456',
      title: 'Test Task',
      description: 'Test Description',
      task_type: 'onboarding',
      status: 'in_progress',
      created_at: new Date().toISOString(),
      metadata: {
        taskTemplateId: 'test-template',
        taskDefinition: {
          name: 'Test Template',
          description: 'Template for testing',
          category: 'test'
        }
      }
    };

    const mockHistory = [
      {
        operation: 'data_collection',
        timestamp: new Date().toISOString(),
        data: {
          extractedData: {
            businessName: 'Test Corp',
            businessAddress: '123 Main St'
          },
          status: 'success'
        }
      }
    ];

    it('should execute taskIntrospection tool successfully', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'all'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.taskId).toBe('task-123');
      expect(result.executionTime).toBeDefined();
    });

    it('should return introspection data with all aspects', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'all'
      });

      expect(result.data.template).toBeDefined();
      expect(result.data.progress).toBeDefined();
      expect(result.data.collectedData).toBeDefined();
      expect(result.data.objectives).toBeDefined();
      expect(result.data.insights).toBeDefined();
    });

    it('should handle specific aspect requests', async () => {
      mockDbService.getTask.mockResolvedValue(mockTask);
      mockDbService.getContextHistory.mockResolvedValue(mockHistory);

      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: 'task-123',
        userId: 'user-456',
        aspectToInspect: 'progress'
      });

      expect(result.success).toBe(true);
      expect(result.data.progress).toBeDefined();
      expect(result.data.progress.status).toBe('in_progress');
    });

    it('should validate required parameters', async () => {
      const result = await toolChain.executeTool('taskIntrospection', {
        // Missing required taskId
        userId: 'user-456'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle task not found error', async () => {
      mockDbService.getTask.mockResolvedValue(null);

      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: 'nonexistent',
        userId: 'user-456',
        aspectToInspect: 'all'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle empty string parameters', async () => {
      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: '',
        userId: 'user-456'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle undefined literal string', async () => {
      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: 'undefined',
        userId: 'user-456'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle null literal string', async () => {
      const result = await toolChain.executeTool('taskIntrospection', {
        taskId: 'null',
        userId: 'user-456'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('Tool Discovery', () => {
    it('should list taskIntrospection in available tools', async () => {
      const tools = await toolChain.getAvailableTools();
      const introspectionTool = tools.find(t => t.id === 'taskIntrospection');
      
      expect(introspectionTool).toBeDefined();
      expect(introspectionTool?.name).toBe('taskIntrospection');
      expect(introspectionTool?.capabilities).toContain('task_scoped');
    });

    it('should find taskIntrospection by capability', async () => {
      const tools = await toolChain.findToolsByCapability('introspective_analysis');
      const introspectionTool = tools.find(t => t.id === 'taskIntrospection');
      
      expect(introspectionTool).toBeDefined();
    });

    it('should get taskIntrospection info', async () => {
      const toolInfo = await toolChain.getToolInfo('taskIntrospection');
      
      expect(toolInfo).toBeDefined();
      expect(toolInfo?.id).toBe('taskIntrospection');
      expect(toolInfo?.parameters).toBeDefined();
    });

    it('should confirm taskIntrospection is available', async () => {
      const isAvailable = await toolChain.isToolAvailable('taskIntrospection');
      expect(isAvailable).toBe(true);
    });
  });

  describe('Tool Description', () => {
    it('should include taskIntrospection in available tools description', () => {
      const description = toolChain.getAvailableToolsDescription();
      
      expect(description).toContain('taskIntrospection');
      expect(description).toContain('Analyze current task internals');
      expect(description).toContain('SCOPE: Task-specific introspective analysis only');
    });
  });
});