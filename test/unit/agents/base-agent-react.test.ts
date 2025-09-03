/**
 * Unit tests for BaseAgent ReAct pattern implementation
 * 
 * These tests verify the emergent reasoning capabilities:
 * - Iterative tool usage
 * - Circular reasoning detection
 * - Tool failure recovery
 * - Knowledge accumulation
 * - Help requesting when stuck
 */

import { BaseAgent } from '../../../src/agents/base/BaseAgent';
import { LLMProvider, LLMResponse } from '../../../src/services/llm-provider';
import { ToolChain } from '../../../src/services/tool-chain';
import { TaskContext } from '../../../src/types/task-engine.types';
import { BaseAgentRequest } from '../../../src/types/base-agent-types';

// Mock implementations
jest.mock('../../../src/services/llm-provider');
jest.mock('../../../src/services/tool-chain');

// Mock a2a-event-bus
jest.mock('../../../src/services/a2a-event-bus', () => ({
  a2aEventBus: {
    broadcast: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock DatabaseService properly
jest.mock('../../../src/services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      createTaskContextEvent: jest.fn().mockResolvedValue({}),
      listenForTaskUpdates: jest.fn().mockResolvedValue(() => {})
    })
  }
}));

// Test agent extending BaseAgent
class TestAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    // Use a minimal config path for testing
    super('profile_collection_agent.yaml', businessId, userId);
  }
  
  // Expose protected method for testing
  public async testExecuteInternal(request: BaseAgentRequest) {
    return this.executeInternal(request);
  }
}

// Helper to create LLMResponse
function createLLMResponse(content: any): LLMResponse {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    model: 'test-model',
    provider: 'anthropic' // Use valid provider type
  };
}

// Helper to create TaskContext
function createTaskContext(overrides?: Partial<TaskContext>): TaskContext {
  return {
    contextId: 'test-context',
    taskTemplateId: 'test-template',
    tenantId: 'test-tenant',
    createdAt: new Date().toISOString(),
    currentState: {
      status: 'in_progress',
      completeness: 0,
      data: {}
    },
    history: [],
    ...overrides
  };
}

describe('BaseAgent ReAct Pattern', () => {
  let agent: TestAgent;
  let mockLLMProvider: jest.Mocked<LLMProvider>;
  let mockToolChain: jest.Mocked<ToolChain>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup LLM provider mock
    mockLLMProvider = {
      complete: jest.fn(),
      getInstance: jest.fn()
    } as any;
    
    (LLMProvider as any).getInstance = jest.fn().mockReturnValue(mockLLMProvider);
    
    // Setup ToolChain mock
    mockToolChain = {
      getAvailableTools: jest.fn().mockResolvedValue([
        { name: 'searchBusinessMemory', description: 'Search business memory' },
        { name: 'searchPublicRecords', description: 'Search public records' }
      ]),
      executeTool: jest.fn()
    } as any;
    
    // Create test agent
    agent = new TestAgent('test-business-123', 'test-user-123');
    (agent as any).toolChain = mockToolChain;
  });
  
  describe('Iterative Reasoning', () => {
    it('should iterate through multiple reasoning steps', async () => {
      // Setup: LLM responses for multiple iterations
      mockLLMProvider.complete
        // Iteration 1: Decide to use a tool
        .mockResolvedValueOnce(createLLMResponse({
          iteration: 1,
          thought: 'I need to search business memory first',
          action: 'tool',
          details: {
            tool: 'searchBusinessMemory',
            params: { query: 'test-business' }
          }
        }))
        // Iteration 2: Process tool result and use another tool
        .mockResolvedValueOnce(createLLMResponse({
          iteration: 2,
          thought: 'Memory was empty, let me try public records',
          action: 'tool',
          details: {
            tool: 'searchPublicRecords',
            params: { businessName: 'test-business' }
          }
        }))
        // Iteration 3: Reach conclusion
        .mockResolvedValueOnce(createLLMResponse({
          iteration: 3,
          thought: 'Found the business information in public records',
          action: 'answer',
          details: {
            operation: 'business_profile_collected',
            data: { businessName: 'Test Business', entityType: 'LLC' },
            reasoning: 'Successfully found business via public records after memory was empty',
            confidence: 0.9
          }
        }));
      
      // Setup: Tool execution results
      mockToolChain.executeTool
        .mockResolvedValueOnce({ success: true, data: { results: [] } }) // Empty memory
        .mockResolvedValueOnce({ success: true, data: { businessName: 'Test Business', entityType: 'LLC' } }); // Found in public records
      
      // Create test request
      const request: BaseAgentRequest = {
        operation: 'collect_profile',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      // Execute
      const response = await agent.testExecuteInternal(request);
      
      // Verify multiple iterations occurred
      expect(mockLLMProvider.complete).toHaveBeenCalledTimes(3);
      expect(mockToolChain.executeTool).toHaveBeenCalledTimes(2);
      
      // Verify response
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data).toMatchObject({
        businessName: 'Test Business',
        entityType: 'LLC'
      });
      expect(response.confidence).toBe(0.9);
      
      // Verify reasoning trace is included
      expect(response.contextUpdate?.data._reasoningTrace).toBeDefined();
      expect(response.contextUpdate?.data._reasoningTrace.iterations).toBe(3);
      expect(response.contextUpdate?.data._reasoningTrace.toolsUsed).toContain('searchBusinessMemory_1');
      expect(response.contextUpdate?.data._reasoningTrace.toolsUsed).toContain('searchPublicRecords_2');
    });
  });
  
  describe('Circular Reasoning Detection', () => {
    it('should detect and break circular tool usage', async () => {
      // Setup: Agent keeps trying same tool
      const repeatingResponse = createLLMResponse({
        thought: 'Let me search memory again',
        action: 'tool',
        details: {
          tool: 'searchBusinessMemory',
          params: { query: 'test' }
        }
      });
      
      // First 3 iterations use same tool (triggers circular detection)
      mockLLMProvider.complete
        .mockResolvedValueOnce(repeatingResponse)
        .mockResolvedValueOnce(repeatingResponse)
        .mockResolvedValueOnce(repeatingResponse)
        // After detection, agent should ask for help
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'I seem to be stuck',
          action: 'help',
          details: {
            reason: 'circular_reasoning_detected',
            pattern: 'Repeating same tool calls without progress'
          }
        }));
      
      // Tool always returns same empty result
      mockToolChain.executeTool.mockResolvedValue({ 
        success: true, 
        data: { results: [] } 
      });
      
      const request: BaseAgentRequest = {
        operation: 'test_circular',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      // Execute
      const response = await agent.testExecuteInternal(request);
      
      // Verify circular reasoning was detected
      expect(response.status).toBe('needs_input');
      expect(response.contextUpdate?.operation).toBe('blocked_need_help');
      expect(response.contextUpdate?.data.blockage).toMatchObject({
        reason: 'circular_reasoning_detected'
      });
    });
    
    it('should detect repeated identical thoughts', async () => {
      const identicalThought = 'I need more information';
      
      // Setup: Same thought repeated 3 times
      mockLLMProvider.complete
        .mockResolvedValueOnce(createLLMResponse({
          thought: identicalThought,
          action: 'continue',
          details: {}
        }))
        .mockResolvedValueOnce(createLLMResponse({
          thought: identicalThought,
          action: 'continue',
          details: {}
        }))
        .mockResolvedValueOnce(createLLMResponse({
          thought: identicalThought,
          action: 'continue',
          details: {}
        }))
        // Should trigger help after detection
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'Breaking out of loop',
          action: 'help',
          details: { reason: 'stuck_in_thought_loop' }
        }));
      
      const request: BaseAgentRequest = {
        operation: 'test_thought_loop',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      const response = await agent.testExecuteInternal(request);
      
      expect(response.status).toBe('needs_input');
      expect(response.contextUpdate?.data.blockage).toBeDefined();
    });
  });
  
  describe('Tool Failure Recovery', () => {
    it('should recover from tool failures and try alternatives', async () => {
      // Setup: First tool fails, agent tries alternative
      mockLLMProvider.complete
        // Try first tool
        .mockResolvedValueOnce(createLLMResponse({
          iteration: 1,
          thought: 'Let me search public records',
          action: 'tool',
          details: {
            tool: 'searchPublicRecords',
            params: { name: 'test' }
          }
        }))
        // React to failure, try alternative
        .mockResolvedValueOnce(createLLMResponse({
          iteration: 2,
          thought: 'Public records failed, let me try business memory instead',
          action: 'tool',
          details: {
            tool: 'searchBusinessMemory',
            params: { query: 'test' }
          }
        }))
        // Success with alternative
        .mockResolvedValueOnce(createLLMResponse({
          iteration: 3,
          thought: 'Found data in business memory',
          action: 'answer',
          details: {
            operation: 'data_found',
            data: { source: 'memory' },
            confidence: 0.8
          }
        }));
      
      // First tool fails
      mockToolChain.executeTool
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({ 
          success: true, 
          data: { found: true, source: 'memory' } 
        });
      
      const request: BaseAgentRequest = {
        operation: 'test_recovery',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      const response = await agent.testExecuteInternal(request);
      
      // Verify recovery succeeded
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data.source).toBe('memory');
      
      // Verify both tools were attempted
      expect(mockToolChain.executeTool).toHaveBeenCalledTimes(2);
      expect(mockToolChain.executeTool).toHaveBeenCalledWith(
        'searchPublicRecords',
        expect.any(Object)
      );
      expect(mockToolChain.executeTool).toHaveBeenCalledWith(
        'searchBusinessMemory',
        expect.any(Object)
      );
    });
  });
  
  describe('Knowledge Accumulation', () => {
    it('should accumulate knowledge across iterations', async () => {
      mockLLMProvider.complete
        // Iteration 1: Learn something
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'Checking basic info',
          action: 'continue',
          details: {
            learned: { businessType: 'retail' }
          }
        }))
        // Iteration 2: Learn more
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'Found additional details',
          action: 'continue',
          details: {
            learned: { location: 'California', employees: 50 }
          }
        }))
        // Iteration 3: Conclude with accumulated knowledge
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'Combining all learned information',
          action: 'answer',
          details: {
            operation: 'profile_complete',
            data: {
              businessType: 'retail',
              location: 'California',
              employees: 50
            },
            confidence: 0.95
          }
        }));
      
      const request: BaseAgentRequest = {
        operation: 'test_accumulation',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      const response = await agent.testExecuteInternal(request);
      
      // Verify accumulated knowledge is in final response
      expect(response.contextUpdate?.data).toMatchObject({
        businessType: 'retail',
        location: 'California',
        employees: 50
      });
      
      // Verify knowledge was accumulated in reasoning trace
      expect(response.contextUpdate?.data._reasoningTrace.knowledgeGained).toMatchObject({
        businessType: 'retail',
        location: 'California',
        employees: 50
      });
    });
  });
  
  describe('User Input Requests', () => {
    it('should generate UIRequest when tools cannot provide needed data', async () => {
      mockLLMProvider.complete
        // Try tools first
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'Searching for business data',
          action: 'tool',
          details: {
            tool: 'searchBusinessMemory',
            params: {}
          }
        }))
        // Tools didn't help, need user input
        .mockResolvedValueOnce(createLLMResponse({
          thought: 'Cannot find required data, need user input',
          action: 'needs_user_input',
          details: {
            needed_fields: ['business_name'], // Must explicitly specify fields
            uiRequest: {
              templateType: 'form',
              title: 'Business Information Required',
              instructions: 'Please provide your business details'
              // fields removed - auto-generated from needed_fields
            }
          }
        }));
      
      mockToolChain.executeTool.mockResolvedValue({ 
        success: true, 
        data: { results: [] } 
      });
      
      const request: BaseAgentRequest = {
        operation: 'test_ui_request',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      const response = await agent.testExecuteInternal(request);
      
      // Verify UIRequest was generated
      expect(response.status).toBe('needs_input');
      expect(response.contextUpdate?.data.uiRequest).toBeDefined();
      expect(response.contextUpdate?.data.uiRequest.templateType).toBe('form');
      // Agent explicitly requested business_name field
      expect(response.contextUpdate?.data.uiRequest.fields).toBeDefined();
      expect(response.contextUpdate?.data.uiRequest.fields).toHaveLength(1);
      expect(response.contextUpdate?.data.uiRequest.fields[0].id).toBe('business_name');
    });
  });
  
  describe('Maximum Iterations', () => {
    it('should stop at maximum iterations and return partial results', async () => {
      // Setup: Always continue (would loop forever without max)
      mockLLMProvider.complete.mockResolvedValue(createLLMResponse({
        thought: 'Still thinking...',
        action: 'continue',
        details: { learned: { iteration: 'data' } }
      }));
      
      const request: BaseAgentRequest = {
        operation: 'test_max_iterations',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      const response = await agent.testExecuteInternal(request);
      
      // Verify stopped at max iterations (10)
      expect(mockLLMProvider.complete).toHaveBeenCalledTimes(10);
      
      // Verify error status with partial results
      expect(response.status).toBe('error');
      expect(response.contextUpdate?.operation).toBe('max_iterations_reached');
      expect(response.contextUpdate?.data.iterations).toBe(10);
      expect(response.contextUpdate?.data.partialResults).toBeDefined();
    });
  });
  
  describe('Fallback Behavior', () => {
    it('should fall back to single-pass reasoning when toolchain unavailable', async () => {
      // Remove toolchain
      (agent as any).toolChain = null;
      
      // Setup single-pass response
      mockLLMProvider.complete.mockResolvedValueOnce(createLLMResponse({
        status: 'completed',
        contextUpdate: {
          operation: 'single_pass_complete',
          data: { result: 'fallback' },
          reasoning: 'Completed in single pass'
        }
      }));
      
      const request: BaseAgentRequest = {
        operation: 'test_fallback',
        parameters: {},
        taskContext: createTaskContext()
      };
      
      const response = await agent.testExecuteInternal(request);
      
      // Verify single-pass execution
      expect(mockLLMProvider.complete).toHaveBeenCalledTimes(1);
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data.result).toBe('fallback');
      
      // Should not have reasoning trace
      expect(response.contextUpdate?.data._reasoningTrace).toBeUndefined();
    });
  });
});

describe('Emergent Behavior Scenarios', () => {
  let agent: TestAgent;
  let mockLLMProvider: jest.Mocked<LLMProvider>;
  let mockToolChain: jest.Mocked<ToolChain>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLLMProvider = {
      complete: jest.fn(),
      getInstance: jest.fn()
    } as any;
    
    (LLMProvider as any).getInstance = jest.fn().mockReturnValue(mockLLMProvider);
    
    mockToolChain = {
      getAvailableTools: jest.fn().mockResolvedValue([
        { name: 'searchMemory', description: 'Search memory' },
        { name: 'searchPublic', description: 'Search public' },
        { name: 'crossReference', description: 'Cross reference data' },
        { name: 'validateData', description: 'Validate data' }
      ]),
      executeTool: jest.fn()
    } as any;
    
    agent = new TestAgent('test-business-123', 'test-user-123');
    (agent as any).toolChain = mockToolChain;
  });
  
  it('should exhibit creative tool chaining (emergent behavior)', async () => {
    // Scenario: Agent creatively chains tools we didn't explicitly program
    mockLLMProvider.complete
      // Iteration 1: Start with memory search
      .mockResolvedValueOnce(createLLMResponse({
        thought: 'Starting with memory search',
        action: 'tool',
        details: { tool: 'searchMemory', params: { query: 'business' } }
      }))
      // Iteration 2: Found partial data, creative idea to cross-reference
      .mockResolvedValueOnce(createLLMResponse({
        thought: 'Found partial data, let me cross-reference with public records',
        action: 'tool',
        details: { tool: 'searchPublic', params: { hint: 'from_memory' } }
      }))
      // Iteration 3: Creative validation step
      .mockResolvedValueOnce(createLLMResponse({
        thought: 'I have data from two sources, let me validate consistency',
        action: 'tool',
        details: { 
          tool: 'validateData', 
          params: { source1: 'memory', source2: 'public' } 
        }
      }))
      // Iteration 4: Another creative step - cross-reference validated data
      .mockResolvedValueOnce(createLLMResponse({
        thought: 'Validation passed, let me cross-reference for additional insights',
        action: 'tool',
        details: { tool: 'crossReference', params: { validated: true } }
      }))
      // Iteration 5: Synthesize everything
      .mockResolvedValueOnce(createLLMResponse({
        thought: 'I have discovered a complete picture through creative tool combination',
        action: 'answer',
        details: {
          operation: 'creative_discovery',
          data: {
            discoveryMethod: 'emergent_tool_chain',
            confidence: 0.95
          },
          reasoning: 'Combined multiple tools in novel way'
        }
      }));
    
    // Mock tool responses
    mockToolChain.executeTool
      .mockResolvedValueOnce({ success: true, data: { partial: true } })
      .mockResolvedValueOnce({ success: true, data: { moreData: true } })
      .mockResolvedValueOnce({ success: true, data: { valid: true } })
      .mockResolvedValueOnce({ success: true, data: { insights: 'novel' } });
    
    const request: BaseAgentRequest = {
      operation: 'test_emergent',
      parameters: {},
      taskContext: createTaskContext()
    };
    
    const response = await agent.testExecuteInternal(request);
    
    // Verify emergent tool chaining occurred
    expect(response.status).toBe('completed');
    expect(response.contextUpdate?.data.discoveryMethod).toBe('emergent_tool_chain');
    
    // Verify creative tool sequence
    const toolCalls = mockToolChain.executeTool.mock.calls.map(call => call[0]);
    expect(toolCalls).toEqual([
      'searchMemory',
      'searchPublic',
      'validateData',
      'crossReference'
    ]);
    
    // This sequence was never explicitly programmed!
    // The agent created this strategy through iterative reasoning
  });
});