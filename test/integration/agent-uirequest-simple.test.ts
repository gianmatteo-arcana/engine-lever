/**
 * Simple Agent UIRequest Test
 * 
 * Tests that agents properly return UIRequests when they need user input
 * using the actual LLM provider.
 */

import dotenv from 'dotenv';
import { DefaultAgent } from '../../src/agents/DefaultAgent';
import { AgentExecutor } from '../../src/services/agent-executor';
import { logger } from '../../src/utils/logger';
import { mockEnvironmentVariables } from '../helpers/mock-env';

// Load environment variables from .env file
dotenv.config();

// Apply mock environment variables for testing
mockEnvironmentVariables();

// Mock database to prevent actual DB operations
jest.mock('../../src/services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      insertTaskContextEntry: jest.fn().mockResolvedValue({ id: 'mock-id' }),
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

// Silence logger during tests unless debugging
if (!process.env.DEBUG) {
  logger.transports.forEach(t => t.silent = true);
}

// Set test timeout to 30 seconds for LLM calls
jest.setTimeout(30000);

describe.skip('Agent UIRequest Generation - Simple Tests', () => {
  
  it('profile_collection_agent should return UIRequest when no data available', async () => {
    console.log('\n🧪 Testing profile_collection_agent UIRequest generation...\n');
    
    // Create agent
    const agent = new DefaultAgent(
      'profile_collection_agent.yaml',
      'test-business-id',
      'test-user-id'
    );

    // Create request - this is what the orchestrator sends
    const request: any = {
      requestId: `test-${Date.now()}`,
      operation: 'execute_subtask',
      instruction: 'Collect business profile information from the user',
      data: {}, // No data available - should trigger UIRequest
      context: {
        subtaskDescription: 'Collect core business identity information',
        expectedOutput: 'Business profile data',
        successCriteria: 'All required fields collected' // Using string instead of array
      },
      taskContext: {
        contextId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        taskTemplateId: 'onboarding',
        tenantId: 'test-business',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: {
            taskId: 'test-task',
            taskType: 'onboarding'
          }
        },
        history: [],
        metadata: {}
      }
    };

    // Execute agent
    console.log('📤 Sending request to agent...');
    const response = await AgentExecutor.execute(agent, request);
    
    // Log response
    console.log('\n📥 Response:');
    console.log('  Status:', response.status);
    console.log('  Has UIRequests:', response.uiRequests && response.uiRequests.length > 0);
    
    // Verify response
    expect(response.status).toBe('needs_input');
    expect(response.uiRequests).toBeDefined();
    expect(response.uiRequests).toHaveLength(1);
    
    const uiRequest = response.uiRequests![0];
    console.log('\n✅ UIRequest created successfully');
    console.log('  Template Type:', uiRequest.templateType);
    
    // Check if semanticData contains the expected fields
    if (uiRequest.semanticData) {
      console.log('  Title:', uiRequest.semanticData.title || 'N/A');
      console.log('  Has fields:', !!uiRequest.semanticData.fields);
      
      if (uiRequest.semanticData.fields && Array.isArray(uiRequest.semanticData.fields)) {
        const fieldNames = uiRequest.semanticData.fields.map((f: any) => f.name);
        console.log('  Field names:', fieldNames.join(', '));
        
        // Should include business_name as it's a core field
        expect(fieldNames).toContain('business_name');
      }
    }
  });

  it('should consistently return UIRequests across multiple calls', async () => {
    console.log('\n🧪 Testing consistency across 3 attempts...\n');
    
    const results = [];
    
    for (let i = 0; i < 3; i++) {
      console.log(`\nAttempt ${i + 1}:`);
      
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        `test-business-${i}`,
        `test-user-${i}`
      );

      const request: any = {
        requestId: `consistency-test-${i}`,
        operation: 'execute_subtask',
        instruction: 'Implement progressive disclosure form to collect business information',
        data: {},
        context: {
          subtaskDescription: 'Business data collection'
        },
        taskContext: {
          contextId: `test-${i}`,
          currentState: {
            status: 'pending',
            phase: 'init',
            data: {}
          },
          history: [],
          metadata: {}
        }
      };

      const response = await AgentExecutor.execute(agent, request);
      
      const hasUIRequest = !!(response.uiRequests && response.uiRequests.length > 0);
      console.log(`  Status: ${response.status}, Has UIRequest: ${hasUIRequest}`);
      
      results.push({
        status: response.status,
        hasUIRequest
      });
    }
    
    // All should return needs_input with UIRequests
    console.log('\n📊 Consistency check:');
    const allNeedInput = results.every(r => r.status === 'needs_input');
    const allHaveUIRequest = results.every(r => r.hasUIRequest);
    
    console.log(`  All need input: ${allNeedInput}`);
    console.log(`  All have UIRequest: ${allHaveUIRequest}`);
    
    expect(allNeedInput).toBe(true);
    expect(allHaveUIRequest).toBe(true);
  });

  it('should extract UIRequest from contextUpdate.data.uiRequest location', async () => {
    console.log('\n🧪 Testing UIRequest extraction from agent response...\n');
    
    // Create a mock agent response to test extraction
    const mockAgent = {
      getAgentId: () => 'test_agent',
      executeInternal: jest.fn().mockResolvedValue({
        status: 'needs_input',
        contextUpdate: {
          operation: 'test_operation',
          data: {
            uiRequest: {
              templateType: 'form',
              title: 'Test Form',
              instructions: 'Please fill out this form',
              fields: [
                { name: 'test_field', type: 'text', label: 'Test', required: true }
              ]
            }
          },
          reasoning: 'Need user input',
          confidence: 0.9
        }
      }),
      recordExecutionEvent: jest.fn()
    } as any;

    const request: any = {
      requestId: 'extraction-test',
      operation: 'test',
      instruction: 'Test',
      data: {},
      context: {},
      taskContext: { contextId: 'test' }
    };

    const response = await AgentExecutor.execute(mockAgent, request);
    
    console.log('Response status:', response.status);
    console.log('UIRequests extracted:', response.uiRequests!.length);
    
    // Verify extraction worked
    expect(response.status).toBe('needs_input');
    expect(response.uiRequests).toHaveLength(1);
    
    // The extracted UIRequest should match what was in contextUpdate.data.uiRequest
    const extracted = response.uiRequests![0];
    expect(extracted).toEqual({
      templateType: 'form',
      title: 'Test Form',
      instructions: 'Please fill out this form',
      fields: [
        { name: 'test_field', type: 'text', label: 'Test', required: true }
      ]
    });
    
    console.log('✅ UIRequest correctly extracted from contextUpdate.data.uiRequest');
  });
});