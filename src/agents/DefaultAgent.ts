/**
 * DefaultAgent - Concrete implementation of BaseAgent for YAML-configured agents
 * 
 * This is the standard agent implementation used when a YAML configuration
 * doesn't require special behavior. It simply uses the BaseAgent's execute
 * method with the configuration loaded from YAML.
 * 
 * Most agents should use this class rather than creating custom implementations.
 * Only create a specialized agent class when you need behavior that can't be
 * achieved through YAML configuration alone (e.g., OrchestratorAgent, TaskManagementAgent).
 */

import { BaseAgent } from './base/BaseAgent';
import { BaseAgentRequest, BaseAgentResponse } from '../types/base-agent-types';

export class DefaultAgent extends BaseAgent {
  /**
   * DefaultAgent uses the standard BaseAgent constructor
   * to load YAML configuration and initialize services
   */
  constructor(
    specializedConfigPath: string,
    businessId: string,
    userId?: string
  ) {
    super(specializedConfigPath, businessId, userId);
  }

  /**
   * Process request delegates to the base execute method
   * The behavior is entirely driven by the YAML configuration
   */
  async processRequest(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    return this.execute(request);
  }

  /**
   * Alternative interface for message processing
   * Converts message format to BaseAgentRequest
   */
  async processMessage(message: any): Promise<any> {
    const request: BaseAgentRequest = {
      operation: message.type || 'process',
      parameters: message.payload || {},
      taskContext: message.context || this.taskContext,
      llmModel: 'gpt-4'
    };
    
    return this.execute(request);
  }

  /**
   * Get agent configuration for introspection
   */
  getConfiguration() {
    return {
      agent: this.specializedTemplate.agent,
      capabilities: this.specializedTemplate.agent?.agent_card?.skills || [],
      version: this.specializedTemplate.agent?.version || '1.0.0'
    };
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      id: this.specializedTemplate.agent?.id || 'default',
      status: 'active',
      businessId: this.businessId,
      userId: this.userId
    };
  }
}