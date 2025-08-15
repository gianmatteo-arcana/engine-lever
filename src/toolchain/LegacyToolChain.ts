/**
 * LegacyToolChain - Implementation for current hardcoded tools
 * Wraps existing tool implementations in the stable ToolChain interface
 */

import { ToolChain, Tool, ToolExecutionResult } from './ToolChain';

interface LegacyTool extends Tool {
  execute: (params: Record<string, unknown>) => Promise<any>;
}

export class LegacyToolChain implements ToolChain {
  private tools = new Map<string, LegacyTool>();

  constructor() {
    this.initializeTools();
  }

  private initializeTools(): void {
    // CA SOS Search tool
    this.tools.set('ca_sos_search', {
      id: 'ca_sos_search',
      name: 'California Secretary of State Search',
      description: 'Search California business registrations',
      version: '1.0.0',
      capabilities: ['business_search', 'public_records'],
      parameters: {
        businessName: { type: 'string', required: true },
        state: { type: 'string', required: false, default: 'CA' }
      },
      execute: async (_params) => {
        // Mock implementation - in real code this would call the actual API
        const businessName = _params.businessName as string;
        return {
          found: businessName.toLowerCase().includes('corp'),
          business: businessName.toLowerCase().includes('corp') ? {
            name: businessName,
            entityNumber: 'C1234567',
            state: 'CA',
            status: 'Active'
          } : undefined
        };
      }
    });

    // Web Search tool
    this.tools.set('web_search', {
      id: 'web_search',
      name: 'Web Search',
      description: 'Search the web for information',
      version: '1.0.0',
      capabilities: ['web_search', 'information_retrieval'],
      parameters: {
        query: { type: 'string', required: true },
        limit: { type: 'number', required: false, default: 10 }
      },
      execute: async (_params) => {
        // Mock implementation
        return {
          results: [],
          count: 0,
          query: _params.query
        };
      }
    });

    // Business Enrichment tool
    this.tools.set('business_enrichment', {
      id: 'business_enrichment',
      name: 'Business Data Enrichment',
      description: 'Enrich business data from various sources',
      version: '1.0.0',
      capabilities: ['data_enrichment', 'business_intelligence'],
      parameters: {
        domain: { type: 'string', required: false },
        businessName: { type: 'string', required: false },
        email: { type: 'string', required: false }
      },
      execute: async (_params) => {
        // Mock implementation
        return {
          enriched: true,
          confidence: 0.8,
          data: {}
        };
      }
    });

    // Data Validation tool
    this.tools.set('data_validation', {
      id: 'data_validation',
      name: 'Data Validation',
      description: 'Validate data formats and integrity',
      version: '1.0.0',
      capabilities: ['data_validation', 'format_checking'],
      parameters: {
        data: { type: 'object', required: true },
        schema: { type: 'object', required: false }
      },
      execute: async (_params) => {
        // Mock implementation
        return {
          valid: true,
          errors: []
        };
      }
    });

    // User Authentication tool
    this.tools.set('user_authentication', {
      id: 'user_authentication',
      name: 'User Authentication',
      description: 'Validate user credentials and permissions',
      version: '1.0.0',
      capabilities: ['authentication', 'authorization'],
      parameters: {
        userId: { type: 'string', required: true },
        token: { type: 'string', required: true }
      },
      execute: async (_params) => {
        // Mock implementation - always return success for testing
        return {
          authenticated: true,
          userId: _params.userId
        };
      }
    });

    // Backend API tool
    this.tools.set('backend_api', {
      id: 'backend_api',
      name: 'Backend API Client',
      description: 'Make HTTP requests to the backend API',
      version: '1.0.0',
      capabilities: ['http_client', 'api_communication'],
      parameters: {
        endpoint: { type: 'string', required: true },
        method: { type: 'string', required: false, default: 'GET' },
        headers: { type: 'object', required: false },
        body: { type: 'object', required: false }
      },
      execute: async (_params) => {
        // Mock implementation
        return {
          status: 200,
          data: { mock: 'response' }
        };
      }
    });
  }

  async getAvailableTools(): Promise<Tool[]> {
    return Array.from(this.tools.values());
  }

  async findToolsByCapability(capability: string): Promise<Tool[]> {
    const tools = Array.from(this.tools.values());
    return tools.filter(tool => tool.capabilities.includes(capability));
  }

  async executeTool(toolId: string, params: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolId}`
      };
    }

    try {
      const startTime = Date.now();
      const data = await tool.execute(params);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data,
        executionTime,
        metadata: {
          toolId,
          toolName: tool.name,
          toolVersion: tool.version
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getToolInfo(toolId: string): Promise<Tool | null> {
    return this.tools.get(toolId) || null;
  }

  async isToolAvailable(toolId: string): Promise<boolean> {
    return this.tools.has(toolId);
  }
}