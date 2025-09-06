/**
 * Base class for all tools in the system
 * Provides common interface and functionality for tools
 */

export abstract class BaseTool {
  /**
   * The name of the tool
   */
  abstract get name(): string;

  /**
   * A description of what the tool does
   */
  abstract get description(): string;

  /**
   * Optional tags for categorizing the tool
   */
  get tags(): string[] {
    return [];
  }

  /**
   * Whether this tool requires authentication
   */
  get requiresAuth(): boolean {
    return true;
  }

  /**
   * Execute the tool with given parameters
   */
  async execute(_params: any): Promise<any> {
    // Default implementation - override in subclasses
    throw new Error(`Tool ${this.name} has not implemented execute method`);
  }

  /**
   * Validate parameters before execution
   */
  validateParams(_params: any): boolean {
    return true;
  }

  /**
   * Get tool metadata
   */
  getMetadata(): {
    name: string;
    description: string;
    tags: string[];
    requiresAuth: boolean;
  } {
    return {
      name: this.name,
      description: this.description,
      tags: this.tags,
      requiresAuth: this.requiresAuth
    };
  }
}