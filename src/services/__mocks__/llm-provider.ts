/**
 * Mock LLM Provider for Testing
 * This file contains mock responses for LLM calls used in tests
 */

import { LLMRequest, LLMResponse } from '../unified-llm-provider';

export class MockLLMProvider {
  /**
   * Get mock response for testing
   */
  static getMockResponse(request: LLMRequest): LLMResponse {
    const lastMessage = request.messages ? request.messages[request.messages.length - 1] : null;
    const promptContent = lastMessage?.content || request.prompt || '';
    
    // Provide context-aware mock responses for testing
    let content = 'Mock LLM response';
    
    if (promptContent.toLowerCase().includes('plan')) {
      content = JSON.stringify({
        plan: {
          phases: [
            { phase: 'data_collection', description: 'Collect business information' },
            { phase: 'validation', description: 'Validate collected data' },
            { phase: 'submission', description: 'Submit to appropriate agencies' }
          ],
          requiredAgents: ['data_collection_agent', 'validation_agent'],
          estimatedDuration: '15 minutes'
        }
      });
    } else if (promptContent.toLowerCase().includes('analyze')) {
      content = JSON.stringify({
        analysis: {
          taskType: 'onboarding',
          complexity: 'medium',
          requiredSteps: 5,
          confidence: 0.85
        }
      });
    } else if (promptContent.toLowerCase().includes('business')) {
      content = JSON.stringify({
        businessName: 'Test Business LLC',
        entityType: 'LLC',
        state: 'CA',
        ein: '12-3456789'
      });
    } else if (promptContent.toLowerCase().includes('soi')) {
      content = JSON.stringify({
        filingRequired: true,
        dueDate: '2024-03-15',
        filingType: 'Annual',
        fee: 25
      });
    }
    
    return {
      content,
      model: 'claude-3-mock',
      provider: 'anthropic',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      },
      finishReason: 'stop'
    };
  }

  /**
   * Create a mock LLM provider for testing
   */
  static createMock() {
    return {
      complete: jest.fn(async (request: LLMRequest) => {
        return MockLLMProvider.getMockResponse(request);
      }),
      completeWithStreaming: jest.fn(),
      countTokens: jest.fn((text: string) => Math.ceil(text.length / 4))
    };
  }
}

// Export mock factory for jest
export const createMockLLMProvider = MockLLMProvider.createMock;