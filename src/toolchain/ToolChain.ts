/**
 * ToolChain Interface - Stable abstraction for tool access
 * Enables seamless migration from legacy tools to MCP protocol
 */

export interface Tool {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  parameters: Record<string, any>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  metadata?: Record<string, unknown>;
}

/**
 * ToolChain interface - This interface will NEVER change
 * Provides stable API for agents regardless of underlying tool implementation
 */
export interface ToolChain {
  /**
   * Get all available tools
   */
  getAvailableTools(): Promise<Tool[]>;

  /**
   * Find tools by capability
   */
  findToolsByCapability(capability: string): Promise<Tool[]>;

  /**
   * Execute a tool with parameters
   */
  executeTool(toolId: string, params: Record<string, unknown>): Promise<ToolExecutionResult>;

  /**
   * Get information about a specific tool
   */
  getToolInfo(toolId: string): Promise<Tool | null>;

  /**
   * Check if a tool is available
   */
  isToolAvailable(toolId: string): Promise<boolean>;
}