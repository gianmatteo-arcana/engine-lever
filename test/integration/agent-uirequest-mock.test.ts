/**
 * Mock Agent UIRequest Test
 * 
 * Tests UIRequest generation by calling the agent's executeInternal method directly
 * without requiring database persistence.
 */

import dotenv from 'dotenv';
import { DefaultAgent } from '../../src/agents/DefaultAgent';
import { BaseAgentRequest } from '../../src/types/base-agent-types';
import { logger } from '../../src/utils/logger';
import { mockEnvironmentVariables } from '../helpers/mock-env';

// Load environment variables from .env file
dotenv.config();

// Apply mock environment variables for testing
mockEnvironmentVariables();
// Mock the database service to prevent actual DB writes
jest.mock('../../src/services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      insertTaskContextEntry: jest.fn().mockResolvedValue({ id: 'mock-id' }),
      createTaskContextEvent: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
      getServiceClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: jest.fn().mockResolvedValue({ data: null, error: null })
      })
    })
  }
}));

// Mock the A2A event bus
jest.mock('../../src/services/a2a-event-bus', () => ({
  a2aEventBus: {
    broadcast: jest.fn().mockResolvedValue(undefined)
  }
}));

// Silence logger during tests
logger.transports.forEach(t => t.silent = true);

// Set test timeout to 30 seconds for LLM calls
jest.setTimeout(30000);

describe.skip('Agent UIRequest Generation with Mocked DB', () => {
  
  it('should generate UIRequest when profile_collection_agent needs user input', async () => {
    console.log('\n🧪 Testing profile_collection_agent with real LLM...\n');
    
    // Create the agent with mock business/user IDs
    const agent = new DefaultAgent(
      'profile_collection_agent.yaml',
      'mock-business-id',
      'mock-user-id'
    );

    // Create a request that would typically trigger UIRequest
    const request: BaseAgentRequest = {
      operation: 'execute_subtask',
      parameters: {
        instruction: 'Collect comprehensive business profile information from the user using progressive disclosure',
        data: {}, // No data available - should trigger UIRequest
        context: {
          subtaskDescription: 'Collect core business identity information',
          expectedOutput: 'Complete business profile',
          successCriteria: ['All required fields collected', 'Contact information validated']
        }
      },
      taskContext: {
        contextId: 'mock-task-id',
        taskTemplateId: 'onboarding',
        tenantId: 'mock-business-id',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: {
            taskId: 'mock-task-id',
            taskType: 'onboarding',
            title: 'Test Onboarding Task',
            description: 'Testing UIRequest generation'
          }
        },
        history: [],
        metadata: {
          taskType: 'onboarding',
          requiredInputs: {
            minimal: ['user_email', 'business_name', 'entity_type', 'formation_state']
          }
        }
      }
    };

    console.log('📤 Calling agent.executeInternal() with instruction:');
    console.log('   "' + request.parameters.instruction?.substring(0, 60) + '..."');
    
    // Call the agent's executeInternal method directly
    const response = await agent.executeInternal(request);
    
    console.log('\n📥 Agent Response:');
    console.log('  Status:', response.status);
    console.log('  Has contextUpdate:', !!response.contextUpdate);
    console.log('  Has data.uiRequest:', !!response.contextUpdate?.data?.uiRequest);
    
    // Verify the response
    expect(response.status).toBe('needs_input');
    expect(response.contextUpdate).toBeDefined();
    expect(response.contextUpdate?.data?.uiRequest).toBeDefined();
    
    const uiRequest = response.contextUpdate?.data?.uiRequest;
    if (uiRequest) {
      console.log('\n✅ UIRequest Generated:');
      console.log('  Template Type:', uiRequest.templateType || 'N/A');
      console.log('  Title:', uiRequest.title || 'N/A');
      console.log('  Instructions:', (uiRequest.instructions || '').substring(0, 60) + '...');
      
      if (uiRequest.fields && Array.isArray(uiRequest.fields)) {
        const fieldNames = uiRequest.fields.map((f: any) => f.name);
        console.log('  Fields:', fieldNames.join(', '));
        
        // Verify expected fields
        expect(fieldNames).toContain('business_name');
        expect(uiRequest.templateType).toBe('form');
      }
    }
    
    // Log the reasoning
    console.log('\n🧠 Agent Reasoning:');
    console.log('  ' + (response.contextUpdate?.reasoning || '').substring(0, 150) + '...');
  });

  it('should consistently generate UIRequests across multiple LLM calls', async () => {
    console.log('\n🧪 Testing consistency across 3 LLM calls...\n');
    
    const results = [];
    
    for (let i = 0; i < 3; i++) {
      console.log(`\n📊 Attempt ${i + 1}/3:`);
      
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        `mock-business-${i}`,
        `mock-user-${i}`
      );

      const request: BaseAgentRequest = {
        operation: 'collect_business_profile',
        parameters: {
          instruction: 'Implement a form to collect business information',
          data: {
            existing_data: {} // Empty data should trigger UIRequest
          }
        },
        taskContext: {
          contextId: `mock-task-${i}`,
          currentState: {
            status: 'pending',
            data: {}
          }
        } as any
      };

      const response = await agent.executeInternal(request);
      
      const hasUIRequest = !!response.contextUpdate?.data?.uiRequest;
      console.log(`  Status: ${response.status}`);
      console.log(`  Has UIRequest: ${hasUIRequest}`);
      
      if (hasUIRequest) {
        const uiRequest = response.contextUpdate.data.uiRequest;
        console.log(`  Fields count: ${uiRequest.fields?.length || 0}`);
      }
      
      results.push({
        attempt: i + 1,
        status: response.status,
        hasUIRequest
      });
    }
    
    console.log('\n📈 Consistency Results:');
    const allNeedInput = results.every(r => r.status === 'needs_input');
    const allHaveUIRequest = results.every(r => r.hasUIRequest);
    
    console.log(`  All returned needs_input: ${allNeedInput} ✅`);
    console.log(`  All have UIRequest: ${allHaveUIRequest} ✅`);
    
    expect(allNeedInput).toBe(true);
    expect(allHaveUIRequest).toBe(true);
  });

  it('should generate UIRequest with proper fields for onboarding', async () => {
    console.log('\n🧪 Testing UIRequest field structure...\n');
    
    const agent = new DefaultAgent(
      'profile_collection_agent.yaml',
      'mock-business',
      'mock-user'
    );

    // Simulate the exact instruction from orchestrator
    const request: BaseAgentRequest = {
      operation: 'execute_subtask',
      parameters: {
        instruction: 'Implement progressive disclosure form to collect business name, contact details, and preliminary entity type. Use smart defaults and inference where possible.',
        data: {
          business_name: 'string',
          contact_email: 'string',
          phone: 'string'
        },
        context: {
          subtaskDescription: 'Collect core business identity information',
          expectedOutput: 'Validated basic business profile',
          successCriteria: ['Complete basic profile collected', 'Contact information validated']
        }
      },
      taskContext: {
        contextId: 'mock-onboarding-task',
        taskTemplateId: 'onboarding',
        metadata: {
          taskDefinition: {
            requiredInputs: {
              minimal: ['user_email', 'business_name', 'entity_type', 'formation_state'],
              recommended: ['ein', 'business_address', 'industry_classification']
            }
          }
        }
      } as any
    };

    const response = await agent.executeInternal(request);
    
    expect(response.status).toBe('needs_input');
    
    const uiRequest = response.contextUpdate?.data?.uiRequest;
    expect(uiRequest).toBeDefined();
    
    console.log('✅ UIRequest Structure:');
    console.log('  Template Type:', uiRequest?.templateType);
    console.log('  Has title:', !!uiRequest?.title);
    console.log('  Has instructions:', !!uiRequest?.instructions);
    console.log('  Has fields array:', Array.isArray(uiRequest?.fields));
    
    if (uiRequest?.fields) {
      console.log('\n📋 Fields Generated:');
      uiRequest.fields.forEach((field: any) => {
        console.log(`  - ${field.name} (${field.type}): ${field.label}`);
        console.log(`    Required: ${field.required}, Placeholder: "${field.placeholder || 'N/A'}"`);
      });
      
      // Verify critical fields are present
      const fieldNames = uiRequest.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('business_name');
      
      // Verify field structure
      const businessNameField = uiRequest.fields.find((f: any) => f.name === 'business_name');
      expect(businessNameField).toHaveProperty('type');
      expect(businessNameField).toHaveProperty('label');
      expect(businessNameField).toHaveProperty('required');
    }
  });
});