/**
 * Data Collection Agent
 * 
 * Specialized agent for gathering business information from various sources.
 * Demonstrates how specialized agents extend the consolidated BaseAgent class
 * to inherit common functionality while adding domain-specific capabilities.
 */

import { BaseAgent } from './base/BaseAgent';
import { 
  BaseAgentRequest, 
  BaseAgentResponse 
} from '../types/base-agent-types';

/**
 * Data Collection Agent Implementation
 * 
 * Extends BaseAgent to provide specialized data collection capabilities:
 * - Business discovery from public records
 * - Progressive disclosure form creation
 * - Business data validation
 */
export class DataCollectionAgent extends BaseAgent {
  
  constructor(businessId: string, userId?: string) {
    // Load data_collection_agent.yaml configuration
    super('data_collection_agent.yaml', businessId, userId);
  }
  
  /**
   * Specialized method for gathering business information
   * Uses the template inheritance system for LLM execution
   */
  async gatherBusinessInfo(taskContext: any, parameters: any): Promise<BaseAgentResponse> {
    const request: BaseAgentRequest = {
      taskContext,
      operation: 'gather_business_info',
      parameters,
      urgency: 'medium'
    };
    
    // Execute using inherited template system
    // This will merge base_agent.yaml principles with data_collection_agent.yaml specialization
    return await this.execute(request);
  }
  
  /**
   * Specialized method for entity discovery
   * Task Templates define which specific sources to search
   */
  async discoverBusiness(email: string, taskContext: any): Promise<BaseAgentResponse> {
    const request: BaseAgentRequest = {
      taskContext,
      operation: 'entity_discovery',
      parameters: { 
        email,
        searchStrategy: 'comprehensive',
        sources: taskContext.templateData?.dataSources || ['public_records', 'registries']
      },
      urgency: 'high'
    };
    
    return await this.execute(request);
  }
  
  /**
   * Progressive disclosure form creation
   * Demonstrates UI request generation with batching
   */
  async createProgressiveDisclosureForm(taskContext: any, missingFields: string[]): Promise<BaseAgentResponse> {
    const request: BaseAgentRequest = {
      taskContext,
      operation: 'create_progressive_disclosure_form',
      parameters: {
        missingFields,
        userProgress: taskContext.currentState?.progress || 0,
        batchingEnabled: true
      },
      urgency: 'medium'
    };
    
    return await this.execute(request);
  }
  
  /**
   * Validate collected business data
   */
  async validateBusinessData(businessData: any, taskContext: any): Promise<BaseAgentResponse> {
    const request: BaseAgentRequest = {
      taskContext,
      operation: 'validate_business_data',
      parameters: {
        businessData,
        validationLevel: 'comprehensive',
        crossReferencePublicRecords: true
      },
      urgency: 'medium'
    };
    
    return await this.execute(request);
  }
}

// Demonstration code removed - demos should be in separate test files

// Export for testing
export { DataCollectionAgent as default };