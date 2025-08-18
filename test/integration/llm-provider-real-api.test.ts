/**
 * Integration Tests for LLM Provider with Real API Endpoints
 * 
 * These tests make actual API calls to OpenAI and Anthropic.
 * They are skipped by default and only run when API keys are available.
 * 
 * To run these tests:
 * 1. Set environment variables: ANTHROPIC_API_KEY and/or OPENAI_API_KEY
 * 2. Run: npm test -- --testNamePattern="Real API"
 */

import { LLMProvider, LLMRequest, MediaAttachment } from '../../src/services/llm-provider';
import fs from 'fs';
import path from 'path';

describe('LLM Provider Real API Integration Tests', () => {
  let llmProvider: LLMProvider;
  
  beforeAll(() => {
    llmProvider = LLMProvider.getInstance();
  });
  
  afterEach(() => {
    // Reset singleton for clean state
    LLMProvider.resetInstance();
    llmProvider = LLMProvider.getInstance();
  });

  describe('Anthropic Claude Real API Tests', () => {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    beforeEach(() => {
      if (!anthropicApiKey) {
        console.log('⏭️ Skipping Anthropic tests - ANTHROPIC_API_KEY not set');
      }
    });

    it('should complete text request with Claude 3 Sonnet', async () => {
      if (!anthropicApiKey) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        prompt: 'What is the capital of France? Answer in exactly 3 words.',
        model: 'claude-3-sonnet-20240229',
        temperature: 0.1,
        maxTokens: 50
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.model).toBe('claude-3-sonnet-20240229');
      expect(response.provider).toBe('anthropic');
      expect(response.usage).toBeDefined();
      expect(response.usage!.totalTokens).toBeGreaterThan(0);
      
      // Should contain "Paris" or similar
      expect(response.content.toLowerCase()).toContain('paris');
      
      console.log('✅ Claude 3 Sonnet response:', response.content);
      console.log('📊 Token usage:', response.usage);
    }, 30000);

    it('should complete text request with messages format', async () => {
      if (!anthropicApiKey) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'Explain quantum computing in exactly one sentence.' }
        ],
        model: 'claude-3-haiku-20240307',
        temperature: 0.3,
        systemPrompt: 'You are a helpful science teacher who explains complex topics clearly.'
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.model).toBe('claude-3-haiku-20240307');
      expect(response.provider).toBe('anthropic');
      
      // Should contain quantum-related terms
      expect(response.content.toLowerCase()).toMatch(/quantum|qubit|superposition|entanglement/);
      
      console.log('✅ Claude 3 Haiku response:', response.content);
    }, 30000);

    it('should process image with Claude 3 Vision', async () => {
      if (!anthropicApiKey) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      // Create a simple test image (1x1 red pixel PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What color is this image? Answer in one word.' },
            { 
              type: 'image', 
              image: { 
                data: testImageBase64,
                detail: 'low'
              } 
            }
          ]
        }],
        model: 'claude-3-sonnet-20240229',
        temperature: 0.1
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.provider).toBe('anthropic');
      
      // Should identify the color (red/pink/etc)
      expect(response.content.toLowerCase()).toMatch(/red|pink|coral|crimson/);
      
      console.log('✅ Claude 3 Vision response:', response.content);
    }, 30000);

    it('should handle document processing with legacy attachments format', async () => {
      if (!anthropicApiKey) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      // Create a simple text document
      const testDocument = Buffer.from('This is a test document containing the word IMPORTANT.');
      
      const attachment: MediaAttachment = {
        type: 'document',
        data: testDocument,
        mediaType: 'text/plain',
        filename: 'test.txt',
        size: testDocument.length
      };

      const request: LLMRequest = {
        prompt: 'What word is emphasized in this document?',
        model: 'claude-3-sonnet-20240229',
        attachments: [attachment],
        temperature: 0.1
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      
      // Should identify the emphasized word
      expect(response.content.toUpperCase()).toContain('IMPORTANT');
      
      console.log('✅ Claude document processing response:', response.content);
    }, 30000);

    it('should return JSON response when requested', async () => {
      if (!anthropicApiKey) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        prompt: 'List 3 programming languages in JSON format with fields: name, year, paradigm',
        model: 'claude-3-sonnet-20240229',
        responseFormat: 'json',
        temperature: 0.1
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      
      // Should be valid JSON
      let parsedJson;
      expect(() => {
        parsedJson = JSON.parse(response.content);
      }).not.toThrow();
      
      expect(parsedJson).toBeDefined();
      expect(Array.isArray(parsedJson) || typeof parsedJson === 'object').toBe(true);
      
      console.log('✅ Claude JSON response:', response.content);
    }, 30000);
  });

  describe('OpenAI GPT Real API Tests', () => {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    beforeEach(() => {
      if (!openaiApiKey) {
        console.log('⏭️ Skipping OpenAI tests - OPENAI_API_KEY not set');
      }
    });

    it('should complete text request with GPT-4', async () => {
      if (!openaiApiKey) {
        console.log('⏭️ Skipping - OPENAI_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        prompt: 'What is 2 + 2? Answer with just the number.',
        model: 'gpt-4',
        temperature: 0.1,
        maxTokens: 10
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.model).toBe('gpt-4');
      expect(response.provider).toBe('openai');
      expect(response.usage).toBeDefined();
      expect(response.usage!.totalTokens).toBeGreaterThan(0);
      
      // Should contain "4"
      expect(response.content).toContain('4');
      
      console.log('✅ GPT-4 response:', response.content);
      console.log('📊 Token usage:', response.usage);
    }, 30000);

    it('should complete conversational request with GPT-3.5', async () => {
      if (!openaiApiKey) {
        console.log('⏭️ Skipping - OPENAI_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        messages: [
          { role: 'user', content: 'What is the largest planet?' },
          { role: 'assistant', content: 'Jupiter is the largest planet in our solar system.' },
          { role: 'user', content: 'How many moons does it have? Answer in one sentence.' }
        ],
        model: 'gpt-3.5-turbo',
        temperature: 0.3
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.model).toBe('gpt-3.5-turbo');
      expect(response.provider).toBe('openai');
      
      // Should mention Jupiter's moons
      expect(response.content.toLowerCase()).toMatch(/jupiter|moon|79|95/);
      
      console.log('✅ GPT-3.5 Turbo response:', response.content);
    }, 30000);

    it('should process image with GPT-4 Vision', async () => {
      if (!openaiApiKey) {
        console.log('⏭️ Skipping - OPENAI_API_KEY not available');
        return;
      }

      // Create a simple test image (1x1 blue pixel PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEUlEQVR42mNkYPhfz0AEYBxOAGMGABJNBgUOAAAAAElFTkSuQmCC';
      
      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is the dominant color in this image? Answer in one word.' },
            { 
              type: 'image', 
              image: { 
                data: testImageBase64,
                detail: 'low'
              } 
            }
          ]
        }],
        model: 'gpt-4-vision-preview',
        temperature: 0.1,
        maxTokens: 50
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.provider).toBe('openai');
      
      // Should identify the color (blue/cyan/etc)
      expect(response.content.toLowerCase()).toMatch(/blue|cyan|navy|azure/);
      
      console.log('✅ GPT-4 Vision response:', response.content);
    }, 30000);

    it('should handle image URL with GPT-4 Vision', async () => {
      if (!openaiApiKey) {
        console.log('⏭️ Skipping - OPENAI_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image briefly in one sentence.' },
            { 
              type: 'image', 
              image: { 
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png',
                detail: 'auto'
              } 
            }
          ]
        }],
        model: 'gpt-4-vision-preview',
        temperature: 0.3
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.provider).toBe('openai');
      
      // Should describe something about transparency or PNG
      expect(response.content.toLowerCase()).toMatch(/transparency|png|checkered|pattern|demonstration/);
      
      console.log('✅ GPT-4 Vision URL response:', response.content);
    }, 30000);

    it('should return JSON response with GPT-4', async () => {
      if (!openaiApiKey) {
        console.log('⏭️ Skipping - OPENAI_API_KEY not available');
        return;
      }

      const request: LLMRequest = {
        prompt: 'Create a JSON object with 2 colors and their hex codes',
        model: 'gpt-4',
        responseFormat: 'json',
        temperature: 0.1
      };

      const response = await llmProvider.complete(request);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      
      // Should be valid JSON
      let parsedJson;
      expect(() => {
        parsedJson = JSON.parse(response.content);
      }).not.toThrow();
      
      expect(parsedJson).toBeDefined();
      expect(typeof parsedJson === 'object').toBe(true);
      
      console.log('✅ GPT-4 JSON response:', response.content);
    }, 30000);
  });

  describe('Cross-Provider Model Capability Tests', () => {
    it('should correctly identify model capabilities', () => {
      // Claude 3 capabilities
      const claudeCapabilities = llmProvider.getModelCapabilities('claude-3-opus-20240229');
      expect(claudeCapabilities.supportsImages).toBe(true);
      expect(claudeCapabilities.supportsDocuments).toBe(true);
      expect(claudeCapabilities.maxImageSize).toBe(5 * 1024 * 1024);
      expect(claudeCapabilities.supportedImageTypes).toContain('image/jpeg');
      expect(claudeCapabilities.supportedDocumentTypes).toContain('application/pdf');

      // GPT-4 Vision capabilities
      const gptVisionCapabilities = llmProvider.getModelCapabilities('gpt-4-vision-preview');
      expect(gptVisionCapabilities.supportsImages).toBe(true);
      expect(gptVisionCapabilities.supportsDocuments).toBe(false);
      expect(gptVisionCapabilities.maxImageSize).toBe(20 * 1024 * 1024);
      expect(gptVisionCapabilities.supportedImageTypes).toContain('image/png');

      // Text-only model capabilities
      const textOnlyCapabilities = llmProvider.getModelCapabilities('gpt-4');
      expect(textOnlyCapabilities.supportsImages).toBe(false);
      expect(textOnlyCapabilities.supportsDocuments).toBe(false);
      expect(textOnlyCapabilities.maxImageSize).toBe(0);

      console.log('✅ Model capabilities correctly identified');
    });

    it('should validate attachments against model capabilities', () => {
      const imageAttachment: MediaAttachment = {
        type: 'image',
        data: 'base64-data',
        mediaType: 'image/jpeg',
        size: 1024 * 1024 // 1MB
      };

      // Should be valid for Claude 3
      const claudeValidation = llmProvider.validateAttachment(imageAttachment, 'claude-3-sonnet-20240229');
      expect(claudeValidation.valid).toBe(true);

      // Should be valid for GPT-4 Vision
      const gptVisionValidation = llmProvider.validateAttachment(imageAttachment, 'gpt-4-vision-preview');
      expect(gptVisionValidation.valid).toBe(true);

      // Should be invalid for text-only GPT-4
      const gptTextValidation = llmProvider.validateAttachment(imageAttachment, 'gpt-4');
      expect(gptTextValidation.valid).toBe(false);
      expect(gptTextValidation.error).toContain('does not support image attachments');

      console.log('✅ Attachment validation working correctly');
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle invalid API key gracefully', async () => {
      // Temporarily set invalid API key
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'invalid-key-123';
      
      // Reset instance to pick up new environment
      LLMProvider.resetInstance();
      const testProvider = LLMProvider.getInstance();

      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'claude-3-sonnet-20240229'
      };

      await expect(testProvider.complete(request)).rejects.toThrow(/Invalid.*API key/i);

      // Restore original key
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      
      console.log('✅ Invalid API key error handled correctly');
    }, 15000);

    it('should reject unsupported model/attachment combinations', async () => {
      const request: LLMRequest = {
        prompt: 'Analyze this image',
        model: 'claude-2.1', // Text-only model
        attachments: [{
          type: 'image',
          data: 'base64-data',
          mediaType: 'image/jpeg'
        }]
      };

      await expect(llmProvider.complete(request)).rejects.toThrow(/does not support.*media attachments/i);
      
      console.log('✅ Unsupported model/attachment combination rejected correctly');
    });

    it('should reject oversized attachments', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      // Create an oversized attachment (simulate 10MB)
      const request: LLMRequest = {
        prompt: 'Analyze this image',
        model: 'claude-3-sonnet-20240229',
        attachments: [{
          type: 'image',
          data: 'x'.repeat(1000), // Small data but large reported size
          mediaType: 'image/jpeg',
          size: 10 * 1024 * 1024 // 10MB (over 5MB limit for Claude)
        }]
      };

      await expect(llmProvider.complete(request)).rejects.toThrow(/size.*exceeds limit/i);
      
      console.log('✅ Oversized attachment rejected correctly');
    });
  });

  describe('Performance and Configuration Tests', () => {
    it('should respect temperature and token limits', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('⏭️ Skipping - ANTHROPIC_API_KEY not available');
        return;
      }

      const lowTempRequest: LLMRequest = {
        prompt: 'Say "exactly this phrase": Hello World Test',
        model: 'claude-3-sonnet-20240229',
        temperature: 0.0,
        maxTokens: 10
      };

      const response = await llmProvider.complete(lowTempRequest);
      
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.usage!.completionTokens).toBeLessThanOrEqual(10);
      
      // Low temperature should produce consistent output
      expect(response.content.toLowerCase()).toContain('hello world');
      
      console.log('✅ Temperature and token limits respected');
      console.log('📊 Actual completion tokens:', response.usage!.completionTokens);
    }, 30000);

    it('should provide configuration information', () => {
      const config = llmProvider.getConfig();
      
      expect(config).toBeDefined();
      expect(config.currentProvider).toBeDefined();
      expect(config.defaultModel).toBeDefined();
      expect(config.availableModels).toBeInstanceOf(Array);
      expect(config.availableModels.length).toBeGreaterThan(0);
      expect(config.hasApiKey).toBeDefined();
      
      console.log('✅ Configuration:', {
        provider: config.currentProvider,
        model: config.defaultModel,
        modelCount: config.availableModels.length,
        hasKey: config.hasApiKey
      });
    });
  });
});