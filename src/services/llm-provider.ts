/**
 * LLM Provider Service
 * 
 * Model-agnostic LLM provider that supports multiple models and providers.
 * Defaults to Claude 3 Sonnet but allows specifying any model.
 * 
 * Supported providers:
 * - Anthropic (Claude models)
 * - OpenAI (GPT models)
 * 
 * Usage:
 * const llm = UnifiedLLMProvider.getInstance();
 * const response = await llm.complete({
 *   prompt: "Your prompt here",
 *   model: "claude-3-opus-20240229", // Optional, uses default if not specified
 *   temperature: 0.3 // Optional
 * });
 */

import { logger } from '../utils/logger';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Unified request interface
export interface LLMRequest {
  prompt: string;
  model?: string; // Optional - uses default if not specified
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  systemPrompt?: string;
  messages?: Array<{
    role: 'user' | 'assistant';  // 'system' should only come from systemPrompt field
    content: string;
  }>;
  metadata?: {
    taskId?: string;
    agentRole?: string;
    purpose?: string;
  };
}

// Unified response interface
export interface LLMResponse {
  content: string;
  model: string;
  provider: 'anthropic' | 'openai';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  metadata?: Record<string, any>;
}

// Model configuration
interface ModelConfig {
  provider: 'anthropic' | 'openai';
  modelName: string;
  maxTokens: number;
  defaultTemperature: number;
}

// Model registry - easily extensible
const MODEL_REGISTRY: Record<string, ModelConfig> = {
  // Anthropic Claude models
  'claude-3-opus-20240229': {
    provider: 'anthropic',
    modelName: 'claude-3-opus-20240229',
    maxTokens: 4096,
    defaultTemperature: 0.3
  },
  'claude-3-sonnet-20240229': {
    provider: 'anthropic',
    modelName: 'claude-3-sonnet-20240229',
    maxTokens: 4096,
    defaultTemperature: 0.3
  },
  'claude-3-haiku-20240307': {
    provider: 'anthropic',
    modelName: 'claude-3-haiku-20240307',
    maxTokens: 4096,
    defaultTemperature: 0.3
  },
  'claude-2.1': {
    provider: 'anthropic',
    modelName: 'claude-2.1',
    maxTokens: 4096,
    defaultTemperature: 0.3
  },
  
  // OpenAI GPT models
  'gpt-4': {
    provider: 'openai',
    modelName: 'gpt-4',
    maxTokens: 8192,
    defaultTemperature: 0.3
  },
  'gpt-4-turbo-preview': {
    provider: 'openai',
    modelName: 'gpt-4-turbo-preview',
    maxTokens: 4096,
    defaultTemperature: 0.3
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    maxTokens: 4096,
    defaultTemperature: 0.3
  }
};

export class LLMProvider {
  private static instance: LLMProvider;
  private anthropicClient?: Anthropic;
  private openaiClient?: OpenAI;
  private defaultModel: string;

  private constructor() {
    // Set default model from environment or use Claude 3 Sonnet
    this.defaultModel = process.env.LLM_DEFAULT_MODEL || 'claude-3-sonnet-20240229';
    
    // Initialize Anthropic client if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      logger.info('Anthropic client initialized');
    }
    
    // Initialize OpenAI client if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      logger.info('OpenAI client initialized');
    }
    
    if (!this.anthropicClient && !this.openaiClient) {
      logger.warn('No LLM API keys configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variables.');
    }
  }

  public static getInstance(): LLMProvider {
    if (!LLMProvider.instance) {
      LLMProvider.instance = new LLMProvider();
    }
    return LLMProvider.instance;
  }

  /**
   * Reset singleton instance (for testing)
   * @internal
   */
  public static resetInstance(): void {
    LLMProvider.instance = undefined as any;
  }

  /**
   * Main entry point for LLM completion
   * Automatically routes to the appropriate provider based on model
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    // Use specified model or default
    const model = request.model || this.defaultModel;
    
    // Get model configuration
    const modelConfig = MODEL_REGISTRY[model];
    if (!modelConfig) {
      // If model not in registry, try to infer provider
      const inferredConfig = this.inferModelConfig(model);
      if (!inferredConfig) {
        throw new Error(`Unknown model: ${model}. Please use a supported model or update MODEL_REGISTRY.`);
      }
      return this.completeWithInferredProvider(request, model, inferredConfig);
    }
    
    // Log the request (without sensitive content)
    logger.info('LLM request initiated', {
      model,
      provider: modelConfig.provider,
      temperature: request.temperature || modelConfig.defaultTemperature,
      metadata: request.metadata
    });
    
    try {
      let response: LLMResponse;
      
      // Route to appropriate provider
      if (modelConfig.provider === 'anthropic') {
        response = await this.completeWithAnthropic(request, modelConfig);
      } else if (modelConfig.provider === 'openai') {
        response = await this.completeWithOpenAI(request, modelConfig);
      } else {
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
      }
      
      // Log success
      logger.info('LLM request completed', {
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        duration: Date.now() - startTime,
        metadata: request.metadata
      });
      
      return response;
      
    } catch (error) {
      logger.error('LLM request failed', {
        error,
        model,
        duration: Date.now() - startTime,
        metadata: request.metadata
      });
      throw error;
    }
  }

  /**
   * Complete using Anthropic Claude
   */
  private async completeWithAnthropic(request: LLMRequest, config: ModelConfig): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized. Set ANTHROPIC_API_KEY environment variable.');
    }
    
    try {
      // Build messages array
      let messages: any[] = [];
      
      if (request.messages) {
        // Use provided messages (no system messages should be in this array)
        messages = request.messages.map(m => ({
          role: m.role,
          content: m.content
        }));
      } else {
        // Convert simple prompt to message
        messages = [{
          role: 'user' as const,
          content: request.prompt
        }];
      }
      
      // Use explicit system prompt (no fallback to messages array)
      const systemPrompt = request.systemPrompt || 
        'You are a helpful AI assistant that follows instructions precisely and returns well-structured responses.';
      
      // Create the completion
      const response = await this.anthropicClient.messages.create({
        model: config.modelName,
        messages,
        max_tokens: request.maxTokens || config.maxTokens,
        temperature: request.temperature || config.defaultTemperature,
        system: systemPrompt,
      });
      
      // Extract text content
      let content = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }
      
      // Parse JSON if requested
      if (request.responseFormat === 'json') {
        try {
          content = JSON.stringify(JSON.parse(content));
        } catch (e) {
          logger.warn('Failed to parse response as JSON, returning raw text');
        }
      }
      
      return {
        content,
        model: response.model,
        provider: 'anthropic',
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: response.stop_reason || undefined,
      };
      
    } catch (error: any) {
      this.handleProviderError(error, 'Anthropic');
      throw error;
    }
  }

  /**
   * Complete using OpenAI GPT
   */
  private async completeWithOpenAI(request: LLMRequest, config: ModelConfig): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable.');
    }
    
    try {
      // Build messages array
      let messages: any[] = [];
      
      // Use explicit system prompt (no fallback to messages array)
      const systemPrompt = request.systemPrompt || 
        'You are a helpful AI assistant that follows instructions precisely and returns well-structured responses.';
      
      messages.push({
        role: 'system',
        content: systemPrompt
      });
      
      if (request.messages) {
        // Add provided messages (no system messages should be in this array)
        messages.push(...request.messages);
      } else {
        // Convert simple prompt to message
        messages.push({
          role: 'user',
          content: request.prompt
        });
      }
      
      // Create the completion
      const response = await this.openaiClient.chat.completions.create({
        model: config.modelName,
        messages,
        max_tokens: request.maxTokens || config.maxTokens,
        temperature: request.temperature || config.defaultTemperature,
        response_format: request.responseFormat === 'json' 
          ? { type: 'json_object' } 
          : undefined
      });
      
      const content = response.choices[0].message.content || '';
      
      return {
        content,
        model: response.model,
        provider: 'openai',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        finishReason: response.choices[0].finish_reason || undefined,
      };
      
    } catch (error: any) {
      this.handleProviderError(error, 'OpenAI');
      throw error;
    }
  }

  /**
   * Infer model configuration for unknown models
   */
  private inferModelConfig(model: string): { provider: 'anthropic' | 'openai' } | null {
    if (model.includes('claude')) {
      return { provider: 'anthropic' };
    } else if (model.includes('gpt')) {
      return { provider: 'openai' };
    }
    return null;
  }

  /**
   * Complete with inferred provider for unknown models
   */
  private async completeWithInferredProvider(
    request: LLMRequest, 
    model: string, 
    config: { provider: 'anthropic' | 'openai' }
  ): Promise<LLMResponse> {
    const defaultConfig: ModelConfig = {
      provider: config.provider,
      modelName: model,
      maxTokens: 4096,
      defaultTemperature: 0.3
    };
    
    if (config.provider === 'anthropic') {
      return this.completeWithAnthropic(request, defaultConfig);
    } else {
      return this.completeWithOpenAI(request, defaultConfig);
    }
  }

  /**
   * Handle provider-specific errors with helpful messages
   */
  private handleProviderError(error: any, provider: string): void {
    logger.error(`${provider} API error`, {
      error: error.message,
      status: error.status,
      type: error.error?.type
    });
    
    if (error.status === 401) {
      throw new Error(`Invalid ${provider} API key. Please check your ${provider.toUpperCase()}_API_KEY environment variable.`);
    } else if (error.status === 429) {
      throw new Error(`${provider} API rate limit exceeded. Please try again later.`);
    } else if (error.status === 400) {
      throw new Error(`Invalid request to ${provider} API: ${error.message}`);
    }
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): string[] {
    return Object.keys(MODEL_REGISTRY);
  }

  /**
   * Get current default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Set default model
   */
  setDefaultModel(model: string): void {
    if (!MODEL_REGISTRY[model] && !this.inferModelConfig(model)) {
      throw new Error(`Unknown model: ${model}`);
    }
    this.defaultModel = model;
    
    // Update current provider based on model
    const modelConfig = MODEL_REGISTRY[model] || this.inferModelConfig(model);
    if (modelConfig) {
      this.currentProvider = modelConfig.provider;
    }
    
    logger.info(`Default model set to: ${model}`);
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    const provider = this.getCurrentProvider();
    if (provider === 'anthropic') {
      return !!process.env.ANTHROPIC_API_KEY;
    } else if (provider === 'openai') {
      return !!process.env.OPENAI_API_KEY;
    }
    return false;
  }

  /**
   * Get current configuration (without exposing API keys)
   */
  getConfig(): Record<string, any> {
    return {
      currentProvider: this.getCurrentProvider(),
      defaultModel: this.defaultModel,
      availableModels: this.getAvailableModels(),
      hasApiKey: this.isConfigured()
    };
  }

  /**
   * Get current provider based on default model
   */
  getCurrentProvider(): string {
    const modelConfig = MODEL_REGISTRY[this.defaultModel];
    if (modelConfig) {
      return modelConfig.provider;
    }
    
    // Infer from model name
    const inferred = this.inferModelConfig(this.defaultModel);
    return inferred ? inferred.provider : 'anthropic';
  }
  
  private currentProvider: string = 'anthropic';
}

// Export singleton instance for backward compatibility
export const llmProvider = LLMProvider.getInstance();