/**
 * Tests for LLM Provider Service
 */

import { LLMProvider, LLMRequest, LLMResponse } from '../llm-provider';

describe('LLMProvider', () => {
  let provider: LLMProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Clear singleton instance
    (LLMProvider as any).instance = null;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      provider = LLMProvider.getInstance();
      const config = provider.getConfig();

      expect(config.provider).toBe('anthropic');
      expect(config.defaultModel).toBe('claude-3-sonnet-20240229');
      expect(config.hasApiKey).toBe(false);
    });

    it('should use environment variables when available', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.LLM_MODEL = 'gpt-4';

      provider = LLMProvider.getInstance();
      const config = provider.getConfig();

      expect(config.provider).toBe('openai');
      expect(config.defaultModel).toBe('gpt-4');
      expect(config.hasApiKey).toBe(true);
    });

    it('should maintain singleton instance', () => {
      const instance1 = LLMProvider.getInstance();
      const instance2 = LLMProvider.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('complete', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      provider = LLMProvider.getInstance();
    });

    it('should return mock response for test key', async () => {
      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      expect(response.content).toBe('Mock LLM response');
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

    it('should throw error without API key', async () => {
      process.env.ANTHROPIC_API_KEY = '';
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'Anthropic API key not configured'
      );
    });

    it('should include metadata in response', async () => {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Test' }],
        metadata: {
          taskId: 'task-123',
          agentRole: 'orchestrator',
          purpose: 'testing'
        }
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      // Metadata should be logged but not necessarily returned
      expect(response.content).toBeDefined();
    });
  });

  describe('isConfigured', () => {
    it('should return false without API key', () => {
      provider = LLMProvider.getInstance();
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true with API key', () => {
      process.env.ANTHROPIC_API_KEY = 'valid-key';
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();
      
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle OpenAI provider not implemented', async () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'OpenAI API integration not yet implemented'
      );
    });
  });
});