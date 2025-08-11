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
      // Fallback to mock for development
      return this.mockComplete(request);
    }
  }
  
  /**
   * Complete using OpenAI
   */
  private async completeWithOpenAI(request: LLMRequest): Promise<any> {
    if (!this.openai) {
      return this.mockComplete(request);
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
      return this.mockComplete(request);
    }
  }
  
  /**
   * Complete using Anthropic Claude
   */
  private async completeWithAnthropic(request: LLMRequest): Promise<any> {
    if (!this.anthropic) {
      return this.mockComplete(request);
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
      return this.mockComplete(request);
    }
  }
  
  /**
   * Mock completion for development/testing
   */
  private mockComplete(_request: LLMRequest): any {
    console.log('[LLMProvider] Using mock response for:', _request.model);
    
    // Parse the prompt to understand what's being asked
    const prompt = _request.prompt.toLowerCase();
    
    // Return appropriate mock based on context
    if (prompt.includes('task context') && prompt.includes('operation')) {
      // Agent execution response
      return {
        status: 'complete',
        contextUpdate: {
          operation: 'data_collected',
          data: {
            source: 'mock_llm',
            business: {
              name: 'Example Business LLC',
              entityType: 'LLC'
            }
          },
          reasoning: 'Mock LLM response - gathered business data from available sources'
        }
      };
    }
    
    if (prompt.includes('execution plan')) {
      // Orchestrator planning response
      return {
        plan: {
          phases: [
            {
              id: 'phase_1',
              goal: 'gather_user_info',
              agents: ['data_collection_agent'],
              strategy: 'sequential',
              estimatedDuration: 30
            },
            {
              id: 'phase_2',
              goal: 'collect_business_data',
              agents: ['data_collection_agent'],
              strategy: 'sequential',
              estimatedDuration: 60
            }
          ],
          reasoning: 'Mock LLM - Standard onboarding flow',
          userInputPoints: 2,
          estimatedTotalDuration: 90
        }
      };
    }
    
    if (prompt.includes('optimize') && prompt.includes('ui requests')) {
      // UI optimization response
      return {
        optimizedRequests: _request.parameters?.requests || [],
        reasoning: 'Mock LLM - Requests ordered for progressive disclosure'
      };
    }
    
    // Default mock response
    return {
      status: 'complete',
      message: 'Mock LLM response',
      data: {}
    };
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
    return 'mock';
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