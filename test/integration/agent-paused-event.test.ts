/**
 * Test that agents properly pause (not complete) when they need user input
 */

import dotenv from 'dotenv';
import { DefaultAgent } from '../../src/agents/DefaultAgent';
import { AgentExecutor } from '../../src/services/agent-executor';
import { AgentRequest, TaskContext } from '../../src/types/engine-types';
import { logger } from '../../src/utils/logger';

// Load environment variables from .env file
dotenv.config();

// Silence logger during tests unless debugging
if (!process.env.DEBUG) {
  logger.transports.forEach(t => t.silent = true);
}

// Set test timeout to 30 seconds for LLM calls
jest.setTimeout(30000);

describe('Agent Execution Paused Event Tests', () => {
  
  describe('Agent should pause (not complete) when needing input', () => {
    it('should record AGENT_EXECUTION_PAUSED event when status is needs_input', async () => {
      console.log('\n🧪 Testing AGENT_EXECUTION_PAUSED event generation...\n');
      
      // Mock agent that returns needs_input with UIRequest
      const mockAgent = {
        getAgentId: () => 'test_agent',
        executeInternal: jest.fn().mockResolvedValue({
          status: 'needs_input',
          contextUpdate: {
            operation: 'collect_input',
            data: {
              uiRequest: {
                templateType: 'form',
                title: 'Business Information Required',
                instructions: 'Please provide your business details',
                fields: [
                  {
                    name: 'business_name',
                    type: 'text',
                    label: 'Business Name',
                    required: true
                  }
                ]
              }
            },
            reasoning: 'Need business information to proceed',
            confidence: 0.95
          }
        }),
        recordExecutionEvent: jest.fn().mockResolvedValue(undefined)
      } as any;

      const request: AgentRequest = {
        requestId: 'test-paused-event',
        operation: 'test',
        instruction: 'Collect business information',
        data: {},
        context: {},
        taskContext: {
          contextId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        } as any
      };

      const response = await AgentExecutor.execute(mockAgent, request);
      
      // Verify the response
      expect(response.status).toBe('needs_input');
      expect(response.uiRequests).toHaveLength(1);
      
      // Verify the correct event type was recorded
      expect(mockAgent.recordExecutionEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'AGENT_EXECUTION_PAUSED', // Should be PAUSED, not COMPLETED
          status: 'needs_input',
          uiRequests: expect.arrayContaining([
            expect.objectContaining({
              templateType: 'form',
              title: 'Business Information Required'
            })
          ])
        })
      );
      
      console.log('✅ AGENT_EXECUTION_PAUSED event correctly generated for needs_input status');
    });

    it('should record AGENT_EXECUTION_COMPLETED event when status is completed', async () => {
      console.log('\n🧪 Testing AGENT_EXECUTION_COMPLETED event for successful completion...\n');
      
      // Mock agent that completes successfully
      const mockAgent = {
        getAgentId: () => 'test_agent',
        executeInternal: jest.fn().mockResolvedValue({
          status: 'completed',
          contextUpdate: {
            operation: 'process_data',
            data: {
              result: 'Processing complete'
            },
            reasoning: 'Successfully processed the data',
            confidence: 0.9
          }
        }),
        recordExecutionEvent: jest.fn().mockResolvedValue(undefined)
      } as any;

      const request: AgentRequest = {
        requestId: 'test-completed-event',
        operation: 'test',
        instruction: 'Process the data',
        data: { some: 'data' },
        context: {},
        taskContext: {
          contextId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        } as any
      };

      const response = await AgentExecutor.execute(mockAgent, request);
      
      // Verify the response
      expect(response.status).toBe('completed');
      expect(response.uiRequests).toHaveLength(0);
      
      // Verify the correct event type was recorded
      expect(mockAgent.recordExecutionEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'AGENT_EXECUTION_COMPLETED', // Should be COMPLETED for successful completion
          status: 'completed',
          uiRequests: []
        })
      );
      
      console.log('✅ AGENT_EXECUTION_COMPLETED event correctly generated for completed status');
    });

    it('should include UIRequests in AGENT_EXECUTION_PAUSED event data', async () => {
      console.log('\n🧪 Testing UIRequests are included in PAUSED events...\n');
      
      // Mock agent with multiple UIRequests
      const mockAgent = {
        getAgentId: () => 'test_agent',
        executeInternal: jest.fn().mockResolvedValue({
          status: 'needs_input',
          contextUpdate: {
            operation: 'collect_comprehensive_data',
            data: {
              uiRequest: {
                templateType: 'form',
                title: 'Comprehensive Business Profile',
                instructions: 'We need complete information about your business',
                fields: [
                  {
                    name: 'legal_name',
                    type: 'text',
                    label: 'Legal Business Name',
                    required: true
                  },
                  {
                    name: 'entity_type',
                    type: 'select',
                    label: 'Entity Type',
                    required: true,
                    options: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship']
                  },
                  {
                    name: 'ein',
                    type: 'text',
                    label: 'EIN (Federal Tax ID)',
                    required: false,
                    placeholder: 'XX-XXXXXXX'
                  }
                ]
              }
            },
            reasoning: 'Comprehensive data needed for complete profile',
            confidence: 0.98
          }
        }),
        recordExecutionEvent: jest.fn().mockResolvedValue(undefined)
      } as any;

      const request: AgentRequest = {
        requestId: 'test-uirequests-in-event',
        operation: 'test',
        instruction: 'Collect comprehensive business data',
        data: {},
        context: {},
        taskContext: {
          contextId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        } as any
      };

      const response = await AgentExecutor.execute(mockAgent, request);
      
      // Verify UIRequests are extracted
      expect(response.uiRequests).toHaveLength(1);
      const uiRequest = response.uiRequests![0] as any;
      expect(uiRequest.fields).toHaveLength(3);
      
      // Verify the event includes the UIRequests
      // The second call should be the PAUSED event (first is STARTED)
      expect(mockAgent.recordExecutionEvent).toHaveBeenCalledTimes(2);
      const pausedEventCall = mockAgent.recordExecutionEvent.mock.calls[1];
      const eventData = pausedEventCall[1];
      
      expect(eventData.type).toBe('AGENT_EXECUTION_PAUSED');
      expect(eventData.uiRequests).toHaveLength(1);
      expect(eventData.uiRequests[0]).toMatchObject({
        templateType: 'form',
        title: 'Comprehensive Business Profile',
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'legal_name' }),
          expect.objectContaining({ name: 'entity_type' }),
          expect.objectContaining({ name: 'ein' })
        ])
      });
      
      console.log('✅ UIRequests properly included in AGENT_EXECUTION_PAUSED event');
      console.log(`   - Event contains ${eventData.uiRequests[0].fields.length} form fields`);
    });
  });

  describe('Integration with real agent', () => {
    it('profile_collection_agent should generate PAUSED event when needing input', async () => {
      console.log('\n🧪 Testing real profile_collection_agent PAUSED event...\n');
      
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        'test-business',
        'test-user'
      );

      // Spy on recordExecutionEvent
      const recordEventSpy = jest.spyOn(agent, 'recordExecutionEvent');
      recordEventSpy.mockResolvedValue(undefined); // Mock to avoid DB writes

      const request: AgentRequest = {
        requestId: `real-agent-test-${Date.now()}`,
        operation: 'execute_subtask',
        instruction: 'Collect business profile information from the user',
        data: {}, // No data - should trigger UIRequest
        context: {
          subtaskDescription: 'Collect core business identity information',
          expectedOutput: 'Business profile data',
          successCriteria: 'All required fields collected'
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
            data: {}
          },
          history: [],
          metadata: {}
        } as TaskContext
      };

      const response = await AgentExecutor.execute(agent, request);
      
      console.log('Response status:', response.status);
      console.log('Has UIRequests:', response.uiRequests && response.uiRequests.length > 0);
      
      // Verify the agent paused
      expect(response.status).toBe('needs_input');
      expect(response.uiRequests).toBeDefined();
      expect(response.uiRequests!.length).toBeGreaterThan(0);
      
      // Verify AGENT_EXECUTION_PAUSED event was recorded
      expect(recordEventSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'AGENT_EXECUTION_PAUSED',
          status: 'needs_input',
          uiRequests: expect.any(Array)
        })
      );
      
      console.log('✅ Real agent correctly generates AGENT_EXECUTION_PAUSED event');
      
      // Cleanup
      recordEventSpy.mockRestore();
    });
  });
});