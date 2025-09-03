/**
 * Test script to demonstrate the ReAct reasoning pattern
 * 
 * This test shows how agents can now:
 * 1. Autonomously discover and use tools
 * 2. Reason about tool failures and try alternatives
 * 3. Build knowledge iteratively
 * 4. Request help when stuck
 */

import { ProfileCollectionAgent } from '../src/agents/ProfileCollectionAgent';
import { TaskContext } from '../src/types/task-engine.types';
import { BaseAgentRequest } from '../src/types/base-agent-types';
import { logger } from '../src/utils/logger';

async function testReActReasoning() {
  logger.info('🧪 Testing ReAct reasoning with ProfileCollectionAgent');
  
  // Create agent instance
  const agent = new ProfileCollectionAgent('test-business-123', 'test-user-123');
  
  // Create a test task context
  const taskContext: TaskContext = {
    contextId: 'test-task-123',
    taskTemplateId: 'soi_filing',
    tenantId: 'test-user-123',
    createdAt: new Date().toISOString(),
    currentState: {
      status: 'in_progress',
      completeness: 0,
      data: {
        businessName: 'Emergent Behaviors Inc',
        // Deliberately missing data to trigger tool usage
      }
    },
    history: [],
    businessProfile: {
      businessId: 'test-business-123',
      tenantId: 'test-user-123',
      name: 'Emergent Behaviors Inc'
    }
  };
  
  // Create a test request
  const request: BaseAgentRequest = {
    operation: 'collect_business_profile',
    parameters: {
      taskType: 'business_formation',
      requiredFields: ['business_name', 'entity_type', 'formation_state', 'contact_email']
    },
    taskContext,
    constraints: {
      timeLimit: 60000,
      mustBeComplete: true
    }
  };
  
  try {
    logger.info('📤 Sending request to agent with ReAct reasoning enabled');
    
    // Execute with ReAct pattern
    const response = await agent.executeInternal(request);
    
    logger.info('📥 Agent response received', {
      status: response.status,
      confidence: response.confidence,
      operation: response.contextUpdate?.operation,
      hasReasoningTrace: !!response.contextUpdate?.data?._reasoningTrace
    });
    
    // Extract and display reasoning trace
    const trace = response.contextUpdate?.data?._reasoningTrace;
    if (trace) {
      logger.info('🔍 Reasoning trace:', {
        iterations: trace.iterations,
        toolsUsed: trace.toolsUsed,
        duration: `${trace.totalDuration}ms`,
        knowledgeGained: trace.knowledgeGained
      });
    }
    
    // Display the semantic conclusion
    logger.info('✅ Semantic conclusion:', {
      operation: response.contextUpdate?.operation,
      reasoning: response.contextUpdate?.reasoning,
      data: response.contextUpdate?.data
    });
    
  } catch (error) {
    logger.error('❌ Test failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the test
testReActReasoning().catch(console.error);