/**
 * LLM Provider Service
 * 
 * Provides access to Claude LLM for orchestration and agent reasoning.
 * This service abstracts the LLM integration to allow for easy switching
 * between providers (Claude, GPT-4, etc.) in the future.
 */

import { logger } from '../utils/logger';

// LLM request/response types
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

export class LLMProvider {
  private config: LLMConfig;
  private static instance: LLMProvider;

  private constructor(config?: Partial<LLMConfig>) {
    // Initialize with environment variables or provided config
    this.config = {
      provider: (process.env.LLM_PROVIDER as 'anthropic' | 'openai') || 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
      defaultModel: process.env.LLM_MODEL || 'claude-3-sonnet-20240229',
      maxRetries: 3,
      timeout: 30000, // 30 seconds
      ...config
    };

    if (!this.config.apiKey) {
      logger.warn('LLM Provider initialized without API key. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
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
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      // Log the request (without sensitive content)
      logger.info('LLM request initiated', {
        model: request.model || this.config.defaultModel,
        messageCount: request.messages.length,
        metadata: request.metadata
      });

      // Route to appropriate provider
      let response: LLMResponse;
      
      if (this.config.provider === 'anthropic') {
        response = await this.completeWithAnthropic(request);
      } else {
        response = await this.completeWithOpenAI(request);
      }

      // Log success
      logger.info('LLM request completed', {
        model: response.model,
        usage: response.usage,
        duration: Date.now() - startTime,
        metadata: request.metadata
      });

      return response;

    } catch (error) {
      logger.error('LLM request failed', {
        error,
        duration: Date.now() - startTime,
        metadata: request.metadata
      });
      throw error;
    }
  }

  /**
   * Complete request using Anthropic's Claude API
   */
  private async completeWithAnthropic(request: LLMRequest): Promise<LLMResponse> {
    // TODO: Implement actual Anthropic API integration
    // For now, return a mock response for testing
    
    if (this.config.apiKey === 'test-key') {
      // Return mock response for testing
      return this.getMockResponse(request);
    }
    
    if (!this.config.apiKey) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
    }

    // Anthropic API implementation would go here
    // Example using the Anthropic SDK:
    /*
    const anthropic = new Anthropic({
      apiKey: this.config.apiKey,
    });

    const response = await anthropic.messages.create({
      model: request.model || this.config.defaultModel,
      messages: request.messages,
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.7,
      system: request.systemPrompt,
    });

    return {
      content: response.content[0].text,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason,
    };
    */

    throw new Error('Anthropic API integration not yet implemented. Set ANTHROPIC_API_KEY=test-key for mock responses.');
  }

  /**
   * Complete request using OpenAI's API
   */
  private async completeWithOpenAI(_request: LLMRequest): Promise<LLMResponse> {
    // TODO: Implement actual OpenAI API integration
    throw new Error('OpenAI API integration not yet implemented');
  }

  /**
   * Get mock response for testing
   */
  private getMockResponse(request: LLMRequest): LLMResponse {
    const lastMessage = request.messages[request.messages.length - 1];
    
    // Provide context-aware mock responses for testing
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
  }

  /**
   * Validate configuration
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey !== '';
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<LLMConfig, 'apiKey'> & { hasApiKey: boolean } {
    return {
      provider: this.config.provider,
      defaultModel: this.config.defaultModel,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      hasApiKey: !!this.config.apiKey
    };
  }
}