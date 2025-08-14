/**
 * Data Collection Agent - Enhanced with Template Inheritance
 * 
 * This demonstrates how to use the EnhancedBaseAgent with template inheritance.
 * The agent inherits universal principles from base_agent.yaml and adds specialized behavior.
 */

import { EnhancedBaseAgent } from './base/EnhancedBaseAgent';
import { 
  BaseAgentRequest, 
  BaseAgentResponse 
} from '../types/base-agent-types';

/**
 * Data Collection Agent Implementation
 * Inherits from EnhancedBaseAgent which merges base_agent.yaml + data_collection_agent.yaml
 */
export class DataCollectionAgentEnhanced extends EnhancedBaseAgent {
  
  constructor() {
    // Load data_collection_agent.yaml which extends base_agent
    super('data_collection_agent.yaml');
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
   * Specialized method for business discovery
   */
  async discoverBusiness(email: string, taskContext: any): Promise<BaseAgentResponse> {
    const request: BaseAgentRequest = {
      taskContext,
      operation: 'business_discovery',
      parameters: { 
        email,
        searchStrategy: 'comprehensive',
        sources: ['ca_sos', 'federal_ein', 'business_registries']
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

// Example usage demonstration
export async function demonstrateDataCollectionAgent(): Promise<void> {
  console.log('🚀 Demonstrating Enhanced Data Collection Agent with Template Inheritance');
  
  const agent = new DataCollectionAgentEnhanced();
  
  // Display agent capabilities
  const capabilities = agent.getCapabilities();
  console.log('Agent Capabilities:', capabilities);
  
  // Validate configuration
  const validation = agent.validateConfiguration();
  console.log('Configuration Validation:', validation);
  
  if (!validation.isValid) {
    console.error('Agent configuration invalid:', validation.errors);
    return;
  }
  
  // Mock task context
  const mockTaskContext = {
    taskId: 'task_demo_001',
    userId: 'user_123',
    businessId: 'biz_456',
    history: [],
    currentState: {
      progress: 25,
      data: {
        email: 'contact@techcorp.com'
      }
    }
  };
  
  try {
    // Example 1: Business discovery from email
    console.log('\\n📧 Discovering business from email...');
    const discoveryResult = await agent.discoverBusiness(
      'contact@techcorp.com',
      mockTaskContext
    );
    
    console.log('Discovery Result:', {
      status: discoveryResult.status,
      confidence: discoveryResult.confidence,
      operation: discoveryResult.contextUpdate.operation
    });
    
    // Example 2: Create progressive disclosure form
    console.log('\\n📝 Creating progressive disclosure form...');
    const formResult = await agent.createProgressiveDisclosureForm(
      mockTaskContext,
      ['businessName', 'entityType', 'formationState']
    );
    
    console.log('Form Creation Result:', {
      status: formResult.status,
      hasUIRequests: formResult.uiRequests && formResult.uiRequests.length > 0,
      confidence: formResult.confidence
    });
    
  } catch (error) {
    console.error('Error in demonstration:', error instanceof Error ? error.message : String(error));
  }
}

// Export for testing
export { DataCollectionAgentEnhanced as default };