import { MCPServer } from '../mcp-server';

describe('MCPServer', () => {
  beforeEach(async () => {
    await MCPServer.stop();
  });

  afterEach(async () => {
    await MCPServer.stop();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(MCPServer.initialize()).resolves.not.toThrow();
      expect(MCPServer.isHealthy()).toBe(true);
    });

    it('should register default tools during initialization', async () => {
      await MCPServer.initialize();
      
      expect(MCPServer.getToolCount()).toBe(3);
      expect(MCPServer.getTool('business_analyzer')).toBeDefined();
      expect(MCPServer.getTool('document_processor')).toBeDefined();
      expect(MCPServer.getTool('compliance_checker')).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop successfully when initialized', async () => {
      await MCPServer.initialize();
      await expect(MCPServer.stop()).resolves.not.toThrow();
      expect(MCPServer.isHealthy()).toBe(false);
    });

    it('should clear tools when stopped', async () => {
      await MCPServer.initialize();
      expect(MCPServer.getToolCount()).toBe(3);
      
      await MCPServer.stop();
      expect(MCPServer.getToolCount()).toBe(0);
    });
  });

  describe('tool management', () => {
    beforeEach(async () => {
      await MCPServer.initialize();
    });

    it('should register a new tool', async () => {
      const toolName = 'test_tool';
      const schema = {
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        }
      };

      await MCPServer.registerTool(toolName, schema);
      
      expect(MCPServer.getToolCount()).toBe(4); // 3 default + 1 new
      expect(MCPServer.getTool(toolName)).toBeDefined();
    });

    it('should retrieve all tools', async () => {
      const tools = MCPServer.getAllTools();
      
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toContain('business_analyzer');
      expect(tools.map(t => t.name)).toContain('document_processor');
      expect(tools.map(t => t.name)).toContain('compliance_checker');
    });

    it('should retrieve specific tool by name', async () => {
      const tool = MCPServer.getTool('business_analyzer');
      
      expect(tool).toBeDefined();
      expect(tool.name).toBe('business_analyzer');
      expect(tool.schema).toBeDefined();
      expect(tool.handler).toBeInstanceOf(Function);
    });

    it('should return undefined for non-existent tool', async () => {
      const tool = MCPServer.getTool('non_existent_tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('tool invocation', () => {
    beforeEach(async () => {
      await MCPServer.initialize();
    });

    it('should invoke business_analyzer tool', async () => {
      const params = {
        data: { revenue: 100000, expenses: 75000 },
        analysisType: 'financial'
      };

      const result = await MCPServer.invokeTool('business_analyzer', params);
      
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.analysis).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should invoke document_processor tool', async () => {
      const params = {
        documentUrl: 'https://example.com/doc.pdf',
        processType: 'financial'
      };

      const result = await MCPServer.invokeTool('document_processor', params);
      
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.extractedData).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should invoke compliance_checker tool', async () => {
      const params = {
        businessType: 'restaurant',
        location: 'California'
      };

      const result = await MCPServer.invokeTool('compliance_checker', params);
      
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.compliance).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should throw error for non-existent tool', async () => {
      const params = { test: 'data' };
      
      await expect(
        MCPServer.invokeTool('non_existent_tool', params)
      ).rejects.toThrow('Tool not found: non_existent_tool');
    });

    it('should handle tool execution errors', async () => {
      // Register a tool that throws an error
      await MCPServer.registerTool('error_tool', {
        description: 'Tool that throws error',
        parameters: { type: 'object' }
      });

      // Mock the handler to throw an error
      const tool = MCPServer.getTool('error_tool');
      tool.handler = jest.fn().mockRejectedValue(new Error('Tool execution failed'));

      await expect(
        MCPServer.invokeTool('error_tool', {})
      ).rejects.toThrow('Tool execution failed');
    });
  });

  describe('health check', () => {
    it('should return false when not initialized', () => {
      expect(MCPServer.isHealthy()).toBe(false);
    });

    it('should return true when initialized', async () => {
      await MCPServer.initialize();
      expect(MCPServer.isHealthy()).toBe(true);
    });
  });

  describe('tool count', () => {
    it('should return 0 when not initialized', () => {
      expect(MCPServer.getToolCount()).toBe(0);
    });

    it('should return correct count after initialization', async () => {
      await MCPServer.initialize();
      expect(MCPServer.getToolCount()).toBe(3);
    });

    it('should update count when tools are registered', async () => {
      await MCPServer.initialize();
      expect(MCPServer.getToolCount()).toBe(3);

      await MCPServer.registerTool('new_tool', {
        description: 'New tool',
        parameters: { type: 'object' }
      });

      expect(MCPServer.getToolCount()).toBe(4);
    });
  });
});