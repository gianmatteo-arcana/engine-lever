/**
 * UIRequest LLM Integration Test
 * 
 * This test verifies that agents consistently return UIRequests when they need user input.
 * It uses the actual LLM provider to ensure the prompts are working correctly.
 */

import dotenv from 'dotenv';
import { LLMProvider } from '../../src/services/llm-provider';
import { DefaultAgent } from '../../src/agents/DefaultAgent';
import { AgentExecutor } from '../../src/services/agent-executor';
import { BaseAgentRequest } from '../../src/types/base-agent-types';
import { AgentRequest, TaskContext } from '../../src/types/engine-types';
import { logger } from '../../src/utils/logger';

// Load environment variables from .env file
dotenv.config();

// Set test timeout to 30 seconds for LLM calls
jest.setTimeout(30000);

describe('UIRequest LLM Integration Tests', () => {
  let llmProvider: LLMProvider;
  
  beforeAll(() => {
    // Use actual LLM provider
    llmProvider = LLMProvider.getInstance();
  });

  describe('Profile Collection Agent UIRequest Generation', () => {
    it('should return needs_input with UIRequest when no business data is available', async () => {
      console.log('\n🧪 Testing profile_collection_agent UIRequest generation...\n');
      
      // Create a profile collection agent
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        'test-business-123',
        'test-user-123'
      );

      // Create a task context for onboarding
      const taskContext: TaskContext = {
        contextId: 'test-task-123',
        taskTemplateId: 'onboarding',
        tenantId: 'test-business-123',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          completeness: 0,
          data: {
            taskId: 'test-task-123',
            userId: 'test-user-123',
            title: 'Test Onboarding Task',
            description: 'Testing UIRequest generation',
            taskType: 'onboarding'
          }
        },
        history: [],
        metadata: {
          taskType: 'onboarding',
          title: 'Test Onboarding Task'
        }
      };

      // Create an agent request
      const request: AgentRequest = {
        requestId: `test-${Date.now()}`,
        operation: 'execute_subtask',
        instruction: 'Collect core business identity information using progressive disclosure',
        data: {},
        context: {
          subtaskDescription: 'Collect business profile information',
          expectedOutput: 'Complete business profile',
          successCriteria: 'All required fields collected'
        },
        taskContext
      };

      // Execute the agent
      console.log('📤 Sending request to agent...');
      const response = await AgentExecutor.execute(agent, request);
      
      // Log the response for debugging
      console.log('\n📥 Agent Response:');
      console.log('Status:', response.status);
      console.log('Has UIRequests?', response.uiRequests && response.uiRequests.length > 0);
      
      if (response.uiRequests && response.uiRequests.length > 0) {
        console.log('\n✅ UIRequest Details:');
        const uiRequest = response.uiRequests[0];
        console.log('  Title:', uiRequest.semanticData?.title);
        console.log('  Type:', uiRequest.templateType);
        console.log('  Fields:', uiRequest.semanticData?.fields?.map((f: any) => f.name).join(', '));
      }

      // Assertions
      expect(response.status).toBe('needs_input');
      expect(response.uiRequests).toBeDefined();
      expect(response.uiRequests!.length).toBeGreaterThan(0);
      
      const uiRequest = response.uiRequests![0];
      expect(uiRequest).toHaveProperty('templateType');
      expect(uiRequest).toHaveProperty('semanticData');
      expect(uiRequest.semanticData).toHaveProperty('title');
      expect(uiRequest.semanticData).toHaveProperty('instructions');
      expect(uiRequest.semanticData).toHaveProperty('fields');
      expect(Array.isArray(uiRequest.semanticData.fields)).toBe(true);
      expect(uiRequest.semanticData.fields.length).toBeGreaterThan(0);
      
      // Verify expected fields are present
      const fieldNames = uiRequest.semanticData.fields.map((f: any) => f.name);
      expect(fieldNames).toContain('business_name');
    });

    it('should consistently return UIRequests across multiple attempts', async () => {
      console.log('\n🧪 Testing consistency across multiple LLM calls...\n');
      
      const attempts = 3;
      const results = [];
      
      for (let i = 0; i < attempts; i++) {
        console.log(`\n📊 Attempt ${i + 1}/${attempts}:`);
        
        // Create a fresh agent for each attempt
        const agent = new DefaultAgent(
          'profile_collection_agent.yaml',
          'test-business-456',
          'test-user-456'
        );

        const taskContext: TaskContext = {
          contextId: `test-task-${i}`,
          taskTemplateId: 'onboarding',
          tenantId: 'test-business-456',
          createdAt: new Date().toISOString(),
          currentState: {
            status: 'pending',
            completeness: 0,
            data: {
              taskId: `test-task-${i}`,
              userId: 'test-user-456',
              title: 'Test Task',
              taskType: 'onboarding'
            }
          },
          history: [],
          metadata: {}
        };

        const request: AgentRequest = {
          requestId: `test-${Date.now()}-${i}`,
          operation: 'execute_subtask',
          instruction: 'Gather initial business information from the user',
          data: {},
          context: {
            subtaskDescription: 'Initial data collection',
            expectedOutput: 'Business profile data',
            successCriteria: 'Required fields collected'
          },
          taskContext
        };

        const response = await AgentExecutor.execute(agent, request);
        
        console.log(`  Status: ${response.status}`);
        console.log(`  Has UIRequest: ${!!(response.uiRequests && response.uiRequests.length > 0)}`);
        
        results.push({
          status: response.status,
          hasUIRequest: !!(response.uiRequests && response.uiRequests.length > 0),
          uiRequestCount: response.uiRequests?.length || 0
        });
      }
      
      console.log('\n📈 Consistency Results:');
      results.forEach((r, i) => {
        console.log(`  Attempt ${i + 1}: status=${r.status}, hasUIRequest=${r.hasUIRequest}, count=${r.uiRequestCount}`);
      });
      
      // All attempts should return needs_input with UIRequests
      expect(results.every(r => r.status === 'needs_input')).toBe(true);
      expect(results.every(r => r.hasUIRequest)).toBe(true);
      expect(results.every(r => r.uiRequestCount > 0)).toBe(true);
    });
  });

  describe('Data Collection Agent UIRequest Generation', () => {
    it('should return UIRequest when unable to find business in public records', async () => {
      console.log('\n🧪 Testing data_collection_agent UIRequest generation...\n');
      
      const agent = new DefaultAgent(
        'data_collection_agent.yaml',
        'test-business-789',
        'test-user-789'
      );

      const taskContext: TaskContext = {
        contextId: 'test-task-data',
        taskTemplateId: 'compliance',
        tenantId: 'test-business-789',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          completeness: 0,
          data: {
            taskId: 'test-task-data',
            businessName: undefined // No business name available
          }
        },
        history: [],
        metadata: {}
      };

      const request: AgentRequest = {
        requestId: `test-data-${Date.now()}`,
        operation: 'execute_subtask',
        instruction: 'Search for business registration information in public records',
        data: {
          // No business data available
        },
        context: {
          subtaskDescription: 'Verify business registration',
          expectedOutput: 'Business registration details',
          successCriteria: 'Business entity verified'
        },
        taskContext
      };

      console.log('📤 Sending request to data collection agent...');
      const response = await AgentExecutor.execute(agent, request);
      
      console.log('\n📥 Data Collection Agent Response:');
      console.log('Status:', response.status);
      console.log('Reasoning:', response.reasoning?.substring(0, 100) + '...');
      
      // The agent should recognize it needs business information
      expect(response.status).toBe('needs_input');
      
      if (response.uiRequests && response.uiRequests.length > 0) {
        const uiRequest = response.uiRequests[0];
        console.log('\n✅ UIRequest Generated:');
        console.log('  Title:', uiRequest.semanticData?.title);
        console.log('  Instructions:', uiRequest.semanticData?.instructions?.substring(0, 100) + '...');
        
        expect(uiRequest).toHaveProperty('templateType');
        expect(uiRequest.semanticData).toHaveProperty('fields');
        
        // Should ask for business identification info
        const fieldNames = uiRequest.semanticData.fields.map((f: any) => f.name);
        console.log('  Fields requested:', fieldNames.join(', '));
      }
    });
  });

  describe('UIRequest Extraction in Agent Executor', () => {
    it('should properly extract UIRequest from contextUpdate.data.uiRequest', async () => {
      console.log('\n🧪 Testing UIRequest extraction from agent response...\n');
      
      // Mock an agent that returns UIRequest in the correct location
      const mockAgent = {
        getAgentId: () => 'test_agent',
        executeInternal: jest.fn().mockResolvedValue({
          status: 'needs_input',
          contextUpdate: {
            operation: 'test_operation',
            data: {
              phase: 'test',
              uiRequest: {
                templateType: 'form',
                title: 'Test Form',
                instructions: 'Test instructions',
                fields: [
                  {
                    name: 'test_field',
                    type: 'text',
                    label: 'Test Field',
                    required: true
                  }
                ]
              }
            },
            reasoning: 'Need user input for test',
            confidence: 0.9
          }
        }),
        recordExecutionEvent: jest.fn().mockResolvedValue(undefined)
      } as any;

      const request: AgentRequest = {
        requestId: 'test-extraction',
        operation: 'test',
        instruction: 'Test instruction',
        data: {},
        context: {},
        taskContext: {
          contextId: 'test-context'
        } as any
      };

      const response = await AgentExecutor.execute(mockAgent, request);
      
      console.log('✅ Extraction Test Results:');
      console.log('  Status:', response.status);
      console.log('  UIRequests count:', response.uiRequests!.length);
      console.log('  UIRequest title:', response.uiRequests![0]?.semanticData?.title);
      
      // Verify extraction worked correctly
      expect(response.status).toBe('needs_input');
      expect(response.uiRequests).toHaveLength(1);
      // The extracted UIRequest should match what was in contextUpdate.data.uiRequest
      const extracted = response.uiRequests![0];
      expect(extracted.templateType).toBe('form');
      expect(extracted.semanticData?.title).toBe('Test Form');
      expect(extracted.semanticData?.instructions).toBe('Test instructions');
      expect(extracted.semanticData?.fields).toEqual([
        {
          name: 'test_field',
          type: 'text',
          label: 'Test Field',
          required: true
        }
      ]);
    });
  });

  describe('Stress Test: Rapid Sequential Requests', () => {
    it('should handle rapid sequential requests without losing UIRequests', async () => {
      console.log('\n🧪 Stress testing with rapid requests...\n');
      
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const promise = (async () => {
          const agent = new DefaultAgent(
            'profile_collection_agent.yaml',
            `test-business-stress-${i}`,
            `test-user-stress-${i}`
          );

          const request: AgentRequest = {
            requestId: `stress-test-${i}`,
            operation: 'execute_subtask',
            instruction: 'Collect business information',
            data: {},
            context: {
              subtaskDescription: `Stress test ${i}`
            },
            taskContext: {
              contextId: `stress-task-${i}`,
              taskTemplateId: 'onboarding',
              tenantId: `test-business-stress-${i}`,
              createdAt: new Date().toISOString(),
              currentState: {
                status: 'pending',
                phase: 'init',
                completeness: 0,
                data: {}
              },
              history: [],
              metadata: {}
            } as TaskContext
          };

          const response = await AgentExecutor.execute(agent, request);
          return {
            id: i,
            status: response.status,
            hasUIRequest: !!(response.uiRequests && response.uiRequests.length > 0)
          };
        })();
        
        promises.push(promise);
      }
      
      const results = await Promise.all(promises);
      
      console.log('\n📊 Stress Test Results:');
      results.forEach(r => {
        console.log(`  Request ${r.id}: status=${r.status}, hasUIRequest=${r.hasUIRequest}`);
      });
      
      // All should succeed with UIRequests
      expect(results.every(r => r.status === 'needs_input')).toBe(true);
      expect(results.every(r => r.hasUIRequest)).toBe(true);
    });
  });
});