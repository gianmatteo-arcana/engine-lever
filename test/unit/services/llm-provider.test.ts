/**
 * Tests for LLM Provider Service
 */

import { UnifiedLLMProvider, LLMRequest, LLMResponse } from '../../../src/services/unified-llm-provider';

// Mock the complete method to avoid actual API calls
const mockComplete = jest.fn();

describe('UnifiedLLMProvider', () => {
  let provider: UnifiedLLMProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Clear singleton instances
    UnifiedLLMProvider.resetInstance();
    
    // Reset mock
    mockComplete.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clear singleton instances
    UnifiedLLMProvider.resetInstance();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      provider = UnifiedLLMProvider.getInstance();
      const config = provider.getConfig();

      // Default provider is determined by the default model
      expect(config.provider).toBe('anthropic');
      expect(config.defaultModel).toBe('claude-3-sonnet-20240229');
      expect(config.hasApiKey).toBe(false);
    });

    it('should use environment variables when available', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.LLM_DEFAULT_MODEL = 'gpt-4';

      provider = UnifiedLLMProvider.getInstance();
      const config = provider.getConfig();

      // The provider is determined by the default model in UnifiedProvider
      expect(config.provider).toBe('openai');
      expect(config.defaultModel).toBe('gpt-4');
      expect(config.hasApiKey).toBe(true);
    });

    it('should maintain singleton instance', () => {
      const instance1 = LLMProvider.getInstance();
      const instance2 = LLMProvider.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should accept custom configuration', () => {
      provider = LLMProvider.getInstance({
        provider: 'openai',
        defaultModel: 'gpt-4-turbo-preview',
        maxRetries: 5,
        timeout: 60000
      });
      const config = provider.getConfig();

      // Provider is derived from the model, not from the config
      expect(config.provider).toBe('openai');
      expect(config.defaultModel).toBe('gpt-4-turbo-preview');
      // These are hardcoded in the wrapper
      expect(config.maxRetries).toBe(3);
      expect(config.timeout).toBe(30000);
    });
  });

  describe('complete (mocked)', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      provider = UnifiedLLMProvider.getInstance();
      
      // Mock the complete method to avoid actual API calls
      provider.complete = mockComplete.mockImplementation(async (request: LLMRequest): Promise<LLMResponse> => {
        const lastMessage = request.messages[request.messages.length - 1];
        let content = 'Mock LLM response';
        
        if (lastMessage.content.toLowerCase().includes('plan')) {
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
        } else if (lastMessage.content.toLowerCase().includes('analyze')) {
          content = JSON.stringify({
            analysis: {
              taskType: 'onboarding',
              complexity: 'medium',
              requiredSteps: 5,
              confidence: 0.85
            }
          });
        }
        
        return {
          content,
          model: 'claude-3-mock',
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150
          },
          finishReason: 'stop'
        };
      });
    });

    it('should handle basic completion request', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.model).toBe('claude-3-mock');
      expect(response.usage).toBeDefined();
    });

    it('should return plan response for plan requests', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Create a plan for onboarding' }
        ],
        metadata: { purpose: 'planning' }
      };

      const response = await provider.complete(request);
      const content = JSON.parse(response.content);

      expect(content.plan).toBeDefined();
      expect(content.plan.phases).toHaveLength(3);
      expect(content.plan.requiredAgents).toContain('data_collection_agent');
    });

    it('should return analysis response for analyze requests', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Analyze this task requirement' }
        ]
      };

      const response = await provider.complete(request);
      const content = JSON.parse(response.content);

      expect(content.analysis).toBeDefined();
      expect(content.analysis.taskType).toBe('onboarding');
      expect(content.analysis.confidence).toBeGreaterThan(0);
    });

    it('should handle system prompts', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' }
        ],
        systemPrompt: 'Always be concise',
        temperature: 0.5,
        maxTokens: 100
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      expect(response.finishReason).toBe('stop');
    });

    it('should handle multiple messages', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '2+2 equals 4' },
          { role: 'user', content: 'And 3+3?' }
        ]
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });

    it('should include metadata in request', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Test message' }
        ],
        metadata: {
          taskId: 'task-123',
          agentRole: 'orchestrator',
          purpose: 'testing'
        }
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({
          taskId: 'task-123',
          agentRole: 'orchestrator',
          purpose: 'testing'
        })
      }));
    });
  });

  describe('isConfigured', () => {
    it('should return false without API key', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      provider = UnifiedLLMProvider.getInstance();
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true with API key', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      // Reset singletons to pick up new env var
      (LLMProvider as any).instance = null;
      (UnifiedLLMProvider as any).instance = null;
      provider = UnifiedLLMProvider.getInstance();
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration without API key', () => {
      process.env.ANTHROPIC_API_KEY = 'secret-key';
      // Reset singletons to pick up new env var
      (LLMProvider as any).instance = null;
      (UnifiedLLMProvider as any).instance = null;
      provider = UnifiedLLMProvider.getInstance();
      const config = provider.getConfig();

      expect(config.hasApiKey).toBe(true);
      expect(config).not.toHaveProperty('apiKey');
      expect(config.provider).toBe('anthropic');
    });
  });

  describe('error handling', () => {
    it('should throw error when API key is not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.LLM_DEFAULT_MODEL;
      // Reset singletons to clear any cached instance
      (LLMProvider as any).instance = null;
      (UnifiedLLMProvider as any).instance = null;
      provider = UnifiedLLMProvider.getInstance();
      
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      // Default model is Claude, so will try Anthropic
      await expect(provider.complete(request)).rejects.toThrow('Anthropic client not initialized');
    });

    it('should throw error for OpenAI when not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      process.env.LLM_DEFAULT_MODEL = 'gpt-4';
      // Reset singletons to pick up new settings
      (LLMProvider as any).instance = null;
      (UnifiedLLMProvider as any).instance = null;
      provider = UnifiedLLMProvider.getInstance();

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        model: 'gpt-4'
      };

      await expect(provider.complete(request)).rejects.toThrow('OpenAI client not initialized');
    });
  });
});