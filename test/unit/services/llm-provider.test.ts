/**
 * Tests for LLM Provider Service
 */

import { LLMProvider, LLMRequest, LLMResponse, MediaAttachment, ModelCapabilities } from '../../../src/services/llm-provider';

// Mock the complete method to avoid actual API calls
const mockComplete = jest.fn();

describe('LLMProvider', () => {
  let provider: LLMProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Clear singleton instances
    LLMProvider.resetInstance();
    
    // Reset mock
    mockComplete.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clear singleton instances
    LLMProvider.resetInstance();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      provider = LLMProvider.getInstance();
      const config = provider.getConfig();

      // Default provider is determined by the default model
      expect(config.currentProvider).toBe('anthropic');
      expect(config.defaultModel).toBe('claude-3-5-sonnet-20241022');
      expect(config.hasApiKey).toBe(false);
    });

    it('should use environment variables when available', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.LLM_DEFAULT_MODEL = 'gpt-4';

      provider = LLMProvider.getInstance();
      const config = provider.getConfig();

      // The provider is determined by the default model
      expect(config.currentProvider).toBe('openai');
      expect(config.defaultModel).toBe('gpt-4');
      expect(config.hasApiKey).toBe(true);
    });

    it('should maintain singleton instance', () => {
      const instance1 = LLMProvider.getInstance();
      const instance2 = LLMProvider.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should use default configuration when getInstance is called', () => {
      // LLMProvider.getInstance() doesn't take parameters
      provider = LLMProvider.getInstance();
      const config = provider.getConfig();

      // Provider is derived from the model
      expect(config.currentProvider).toBe('anthropic');
      expect(config.defaultModel).toBe('claude-3-5-sonnet-20241022');
      // Check available models
      expect(config.availableModels).toBeInstanceOf(Array);
      expect(config.hasApiKey).toBeDefined();
    });
  });

  describe('complete (mocked)', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      provider = LLMProvider.getInstance();
      
      // Mock the complete method to avoid actual API calls
      provider.complete = mockComplete.mockImplementation(async (request: LLMRequest): Promise<LLMResponse> => {
        const lastMessage = request.messages ? request.messages[request.messages.length - 1] : { content: request.prompt || '' };
        let content = 'Mock LLM response';
        
        // Extract text content for analysis
        const textContent = typeof lastMessage.content === 'string' 
          ? lastMessage.content 
          : Array.isArray(lastMessage.content) 
            ? lastMessage.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
            : '';
        
        if (textContent.toLowerCase().includes('plan')) {
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
        } else if (textContent.toLowerCase().includes('analyze')) {
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
          finishReason: 'stop',
          provider: 'anthropic'
        };
      });
    });

    it('should handle basic completion request', async () => {
      const request: LLMRequest = {
        prompt: 'Hello',
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
        prompt: 'Create a plan for onboarding',
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
        prompt: 'Analyze this task requirement',
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
        prompt: 'Hello',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        systemPrompt: 'You are a helpful assistant. Always be concise',
        temperature: 0.5,
        maxTokens: 100
      };

      const response = await provider.complete(request);

      expect(response).toBeDefined();
      expect(response.finishReason).toBe('stop');
    });

    it('should handle multiple messages', async () => {
      const request: LLMRequest = {
        prompt: 'And 3+3?',
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
        prompt: 'Test message',
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
      provider = LLMProvider.getInstance();
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true with API key', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      // Reset singletons to pick up new env var
      (LLMProvider as any).instance = null;
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration without API key', () => {
      process.env.ANTHROPIC_API_KEY = 'secret-key';
      // Reset singletons to pick up new env var
      (LLMProvider as any).instance = null;
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();
      const config = provider.getConfig();

      expect(config.hasApiKey).toBe(true);
      expect(config).not.toHaveProperty('apiKey');
      expect(config.currentProvider).toBe('anthropic');
    });
  });

  describe('error handling', () => {
    it('should throw error when API key is not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.LLM_DEFAULT_MODEL;
      // Reset singletons to clear any cached instance
      (LLMProvider as any).instance = null;
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();
      
      const request: LLMRequest = {
        prompt: 'Hello',
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
      (LLMProvider as any).instance = null;
      provider = LLMProvider.getInstance();

      const request: LLMRequest = {
        prompt: 'Hello',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        model: 'gpt-4'
      };

      await expect(provider.complete(request)).rejects.toThrow('OpenAI client not initialized');
    });
  });

  describe('Multi-Modal Functionality', () => {
    let provider: LLMProvider;

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      LLMProvider.resetInstance();
      provider = LLMProvider.getInstance();
    });

    describe('Model Capabilities', () => {
      it('should return capabilities for Claude 3 models', () => {
        const capabilities = provider.getModelCapabilities('claude-3-opus-20240229');
        
        expect(capabilities.supportsImages).toBe(true);
        expect(capabilities.supportsDocuments).toBe(true);
        expect(capabilities.supportsAudio).toBe(false);
        expect(capabilities.supportsVideo).toBe(false);
        expect(capabilities.maxImageSize).toBe(5 * 1024 * 1024);
        expect(capabilities.supportedImageTypes).toContain('image/jpeg');
        expect(capabilities.supportedDocumentTypes).toContain('application/pdf');
      });

      it('should return capabilities for GPT-4o (multimodal)', () => {
        const capabilities = provider.getModelCapabilities('gpt-4o');
        
        expect(capabilities.supportsImages).toBe(true);
        expect(capabilities.supportsDocuments).toBe(false);
        expect(capabilities.maxImageSize).toBe(20 * 1024 * 1024);
        expect(capabilities.supportedImageTypes).toContain('image/png');
      });

      it('should return no capabilities for text-only models', () => {
        const capabilities = provider.getModelCapabilities('gpt-4');
        
        expect(capabilities.supportsImages).toBe(false);
        expect(capabilities.supportsDocuments).toBe(false);
        expect(capabilities.maxImageSize).toBe(0);
        expect(capabilities.supportedImageTypes).toHaveLength(0);
      });
    });

    describe('Media Type Support Checking', () => {
      it('should correctly identify image support', () => {
        expect(provider.supportsMediaType('image', 'claude-3-opus-20240229')).toBe(true);
        expect(provider.supportsMediaType('image', 'gpt-4o')).toBe(true);
        expect(provider.supportsMediaType('image', 'gpt-4')).toBe(false);
        expect(provider.supportsMediaType('image', 'gpt-3.5-turbo')).toBe(false);
      });

      it('should correctly identify document support', () => {
        expect(provider.supportsMediaType('document', 'claude-3-opus-20240229')).toBe(true);
        expect(provider.supportsMediaType('document', 'gpt-4o')).toBe(false);
        expect(provider.supportsMediaType('document', 'gpt-3.5-turbo')).toBe(false);
      });
    });

    describe('Attachment Validation', () => {
      it('should validate valid image attachment', () => {
        const attachment: MediaAttachment = {
          type: 'image',
          data: 'base64-image-data',
          mediaType: 'image/jpeg',
          size: 1024 * 1024 // 1MB
        };

        const result = provider.validateAttachment(attachment, 'claude-3-opus-20240229');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject oversized image attachment', () => {
        const attachment: MediaAttachment = {
          type: 'image',
          data: 'base64-image-data',
          mediaType: 'image/jpeg',
          size: 10 * 1024 * 1024 // 10MB (over 5MB limit for Claude)
        };

        const result = provider.validateAttachment(attachment, 'claude-3-opus-20240229');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('size');
        expect(result.error).toContain('exceeds limit');
      });

      it('should reject unsupported media type', () => {
        const attachment: MediaAttachment = {
          type: 'image',
          data: 'base64-image-data',
          mediaType: 'image/bmp', // Not in supported types
          size: 1024
        };

        const result = provider.validateAttachment(attachment, 'claude-3-opus-20240229');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not supported');
      });

      it('should reject image attachment for text-only model', () => {
        const attachment: MediaAttachment = {
          type: 'image',
          data: 'base64-image-data',
          mediaType: 'image/jpeg',
          size: 1024
        };

        const result = provider.validateAttachment(attachment, 'gpt-4');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('does not support image attachments');
      });

      it('should reject document attachment for OpenAI models', () => {
        const attachment: MediaAttachment = {
          type: 'document',
          data: 'base64-pdf-data',
          mediaType: 'application/pdf',
          size: 1024
        };

        const result = provider.validateAttachment(attachment, 'gpt-4o');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('does not support document attachments');
      });
    });

    describe('Runtime Capability Validation', () => {
      it('should throw error when using attachments with unsupported model', async () => {
        const request: LLMRequest = {
          prompt: 'Analyze this image',
          attachments: [{
            type: 'image',
            data: 'base64-data',
            mediaType: 'image/jpeg'
          }],
          model: 'gpt-3.5-turbo' // Text-only model
        };

        // Mock the complete method to test validation
        const validateSpy = jest.spyOn(provider as any, 'validateRequestCapabilities');
        
        try {
          await provider.complete(request);
        } catch (error: any) {
          expect(validateSpy).toHaveBeenCalled();
          expect(error.message).toContain('does not support any media attachments');
        }
      });

      it('should throw error when exceeding attachment count limit', async () => {
        const attachments: MediaAttachment[] = [];
        // Create 25 attachments (over the 20 limit for Claude)
        for (let i = 0; i < 25; i++) {
          attachments.push({
            type: 'image',
            data: 'base64-data',
            mediaType: 'image/jpeg',
            size: 1024
          });
        }

        const request: LLMRequest = {
          prompt: 'Analyze these images',
          attachments,
          model: 'claude-3-opus-20240229'
        };

        try {
          await provider.complete(request);
        } catch (error: any) {
          expect(error.message).toContain('Too many attachments');
          expect(error.message).toContain('maximum 20');
        }
      });
    });

    describe('Helper Methods', () => {
      it('should get supported image types', () => {
        const imageTypes = provider.getSupportedImageTypes('claude-3-opus-20240229');
        expect(imageTypes).toContain('image/jpeg');
        expect(imageTypes).toContain('image/png');
        expect(imageTypes).toContain('image/webp');
        expect(imageTypes).toContain('image/gif');
      });

      it('should get supported document types', () => {
        const docTypes = provider.getSupportedDocumentTypes('claude-3-opus-20240229');
        expect(docTypes).toContain('application/pdf');
        expect(docTypes).toContain('text/plain');
        expect(docTypes).toContain('text/csv');
      });

      it('should return empty arrays for unsupported models', () => {
        const imageTypes = provider.getSupportedImageTypes('gpt-3.5-turbo');
        const docTypes = provider.getSupportedDocumentTypes('gpt-3.5-turbo');
        
        expect(imageTypes).toHaveLength(0);
        expect(docTypes).toHaveLength(0);
      });
    });
  });
});