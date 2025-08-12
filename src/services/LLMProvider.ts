/**
 * LLM Provider Service - Abstraction for LLM calls
 * Matches PRD requirement for LLM-agnostic architecture
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface LLMRequest {
  model: string;
  prompt: string;
  responseFormat?: 'text' | 'json';
  schema?: any;
  temperature?: number;
  maxTokens?: number;
  parameters?: any; // Added for backward compatibility
}

export interface LLMResponse {
  content: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

/**
 * LLM Provider - abstracts different LLM providers
 * Supports OpenAI and Anthropic as per PRD
 */
export class LLMProvider {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  
  constructor() {
    // Initialize providers based on available API keys
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
  }
  
  /**
   * Complete a prompt using the specified model
   */
  async complete(request: LLMRequest): Promise<any> {
    const provider = this.getProvider(request.model);
    
    if (provider === 'openai') {
      return this.completeWithOpenAI(request);
    } else if (provider === 'anthropic') {
      return this.completeWithAnthropic(request);
    } else {
      throw new Error('No LLM provider configured. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables.');
    }
  }
  
  /**
   * Complete using OpenAI
   */
  private async completeWithOpenAI(request: LLMRequest): Promise<any> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Please check your OPENAI_API_KEY.');
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model: request.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that follows instructions precisely.'
          },
          {
            role: 'user',
            content: request.prompt
          }
        ],
        temperature: request.temperature || 0.3,
        max_tokens: request.maxTokens || 2000,
        response_format: request.responseFormat === 'json' 
          ? { type: 'json_object' } 
          : undefined
      });
      
      const content = response.choices[0].message.content;
      
      if (request.responseFormat === 'json') {
        return JSON.parse(content || '{}');
      }
      
      return content;
    } catch (error) {
      console.error('[LLMProvider] OpenAI error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
  
  /**
   * Complete using Anthropic Claude
   */
  private async completeWithAnthropic(request: LLMRequest): Promise<any> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized. Please check your ANTHROPIC_API_KEY.');
    }
    
    try {
      const response = await this.anthropic.messages.create({
        model: request.model,
        max_tokens: request.maxTokens || 2000,
        temperature: request.temperature || 0.3,
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ]
      });
      
      const content = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
      
      if (request.responseFormat === 'json') {
        return JSON.parse(content);
      }
      
      return content;
    } catch (error) {
      console.error('[LLMProvider] Anthropic error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
  
  
  /**
   * Determine which provider to use based on model name
   */
  private getProvider(model: string): string {
    if (model.includes('gpt') || model.includes('turbo')) {
      return 'openai';
    }
    if (model.includes('claude')) {
      return 'anthropic';
    }
    throw new Error(`Unknown model: ${model}. Please use a supported OpenAI or Anthropic model.`);
  }
  
  /**
   * Stream a completion (for future use)
   */
  async stream(_request: LLMRequest): Promise<AsyncIterable<string>> {
    // TODO: Implement streaming
    throw new Error('Streaming not yet implemented');
  }
  
  /**
   * Count tokens in a text (approximation)
   */
  countTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}