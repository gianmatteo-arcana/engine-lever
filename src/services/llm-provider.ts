/**
 * LLM Provider Service - Legacy wrapper for backward compatibility
 * 
 * This file now wraps the UnifiedLLMProvider to maintain backward compatibility
 * while providing the new generic, model-agnostic implementation.
 * 
 * @deprecated Use UnifiedLLMProvider directly for new code
 */

import { logger } from '../utils/logger';
import { UnifiedLLMProvider, LLMRequest as UnifiedRequest } from './unified-llm-provider';

// Legacy request/response types for backward compatibility
export interface LLMRequest {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  metadata?: {
    taskId?: string;
    agentRole?: string;
    purpose?: string;
  };
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  metadata?: Record<string, any>;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Legacy LLMProvider class
 * Wraps UnifiedLLMProvider for backward compatibility
 */
export class LLMProvider {
  private unifiedProvider: UnifiedLLMProvider;
  private static instance: LLMProvider;

  private constructor(config?: Partial<LLMConfig>) {
    this.unifiedProvider = UnifiedLLMProvider.getInstance();
    
    // Set default model if provided in config
    if (config?.defaultModel) {
      try {
        this.unifiedProvider.setDefaultModel(config.defaultModel);
      } catch (error) {
        logger.warn(`Failed to set default model: ${config.defaultModel}`, error);
      }
    }
  }

  public static getInstance(config?: Partial<LLMConfig>): LLMProvider {
    if (!LLMProvider.instance) {
      LLMProvider.instance = new LLMProvider(config);
    }
    return LLMProvider.instance;
  }

  /**
   * Send a request to the LLM
   * Converts legacy format to unified format
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Convert to unified request format
      const unifiedRequest: UnifiedRequest = {
        prompt: '', // Will be overridden by messages
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        systemPrompt: request.systemPrompt,
        messages: request.messages,
        metadata: request.metadata,
        responseFormat: 'text'
      };
      
      // If there are messages, extract the last user message as the prompt
      if (request.messages && request.messages.length > 0) {
        const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
          unifiedRequest.prompt = lastUserMessage.content;
        }
      }
      
      // Call unified provider
      const response = await this.unifiedProvider.complete(unifiedRequest);
      
      // Convert response to legacy format
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        finishReason: response.finishReason,
        metadata: request.metadata
      };
      
    } catch (error) {
      logger.error('LLM request failed', {
        error,
        metadata: request.metadata
      });
      throw error;
    }
  }

  /**
   * Backward compatibility method
   * @deprecated Use complete() instead
   */
  async completeWithAnthropic(request: LLMRequest): Promise<LLMResponse> {
    return this.complete({
      ...request,
      model: request.model || 'claude-3-sonnet-20240229'
    });
  }

  /**
   * Backward compatibility method
   * @deprecated Use complete() instead
   */
  async completeWithOpenAI(request: LLMRequest): Promise<LLMResponse> {
    return this.complete({
      ...request,
      model: request.model || 'gpt-4'
    });
  }

  /**
   * Check if the LLM provider is configured with an API key
   */
  isConfigured(): boolean {
    return this.unifiedProvider.isConfigured();
  }

  /**
   * Get the current configuration (without exposing API keys)
   */
  getConfig(): Record<string, any> {
    const provider = this.unifiedProvider.getCurrentProvider();
    const defaultModel = this.unifiedProvider.getDefaultModel();
    
    return {
      provider,
      defaultModel,
      hasApiKey: this.isConfigured(),
      maxRetries: 3,
      timeout: 30000
    };
  }
}

// Export singleton for backward compatibility
export const llmProvider = LLMProvider.getInstance();