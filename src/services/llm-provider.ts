/**
 * LLM Provider Service
 * 
 * Model-agnostic LLM provider that supports multiple models and providers.
 * Includes multi-modal support for images, documents, audio, and video.
 * Defaults to Claude 3 Sonnet but allows specifying any model.
 * 
 * Supported providers:
 * - Anthropic (Claude models) - supports images and documents
 * - OpenAI (GPT models) - supports images only
 * 
 * USAGE EXAMPLES:
 * 
 * ## Basic Text-Only Usage
 * ```typescript
 * const llm = LLMProvider.getInstance();
 * 
 * // Simple prompt
 * const response = await llm.complete({
 *   prompt: "Explain quantum computing in simple terms"
 * });
 * 
 * // With specific model and parameters
 * const response = await llm.complete({
 *   prompt: "Analyze this business plan",
 *   model: "claude-3-opus-20240229",
 *   temperature: 0.3,
 *   maxTokens: 1000,
 *   responseFormat: 'json'
 * });
 * 
 * // With system prompt
 * const response = await llm.complete({
 *   prompt: "Write a business proposal",
 *   systemPrompt: "You are a business consultant with 20 years of experience",
 *   temperature: 0.5
 * });
 * ```
 * 
 * ## Multi-Modal Usage with Images
 * ```typescript
 * // Using legacy attachments format
 * const response = await llm.complete({
 *   prompt: "What do you see in this image?",
 *   model: "claude-3-sonnet-20240229",
 *   attachments: [{
 *     type: 'image',
 *     data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
 *     mediaType: 'image/png',
 *     size: 68
 *   }]
 * });
 * 
 * // Using new messages format
 * const response = await llm.complete({
 *   messages: [{
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: 'Analyze this screenshot for UI/UX issues:' },
 *       { 
 *         type: 'image', 
 *         image: { 
 *           data: 'base64-image-data-here',
 *           detail: 'high' 
 *         } 
 *       }
 *     ]
 *   }],
 *   model: "claude-3-opus-20240229"
 * });
 * 
 * // Using image URL
 * const response = await llm.complete({
 *   messages: [{
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: 'Describe this image:' },
 *       { 
 *         type: 'image', 
 *         image: { 
 *           url: 'https://example.com/image.jpg',
 *           detail: 'auto' 
 *         } 
 *       }
 *     ]
 *   }],
 *   model: "gpt-4-vision-preview"
 * });
 * ```
 * 
 * ## Document Processing (Claude only)
 * ```typescript
 * const pdfBuffer = fs.readFileSync('contract.pdf');
 * 
 * const response = await llm.complete({
 *   prompt: "Summarize the key terms in this contract",
 *   model: "claude-3-opus-20240229",
 *   attachments: [{
 *     type: 'document',
 *     data: pdfBuffer,
 *     mediaType: 'application/pdf',
 *     filename: 'contract.pdf',
 *     size: pdfBuffer.length
 *   }]
 * });
 * 
 * // Or using messages format
 * const response = await llm.complete({
 *   messages: [{
 *     role: 'user',
 *     content: [
 *       { type: 'text', text: 'Extract all dates and deadlines from this document:' },
 *       { 
 *         type: 'document', 
 *         document: { 
 *           data: pdfBuffer,
 *           mediaType: 'application/pdf',
 *           filename: 'legal-document.pdf' 
 *         } 
 *       }
 *     ]
 *   }],
 *   model: "claude-3-sonnet-20240229"
 * });
 * ```
 * 
 * ## Model Capability Checking
 * ```typescript
 * const llm = LLMProvider.getInstance();
 * 
 * // Check if model supports images
 * if (llm.supportsMediaType('image', 'claude-3-opus-20240229')) {
 *   console.log('Model supports images');
 * }
 * 
 * // Get detailed capabilities
 * const capabilities = llm.getModelCapabilities('gpt-4-vision-preview');
 * console.log('Max image size:', capabilities.maxImageSize);
 * console.log('Supported image types:', capabilities.supportedImageTypes);
 * 
 * // Validate attachment before sending
 * const attachment = {
 *   type: 'image' as const,
 *   data: 'base64-data',
 *   mediaType: 'image/jpeg',
 *   size: 1024 * 1024 // 1MB
 * };
 * 
 * const validation = llm.validateAttachment(attachment, 'claude-3-sonnet-20240229');
 * if (!validation.valid) {
 *   console.error('Attachment invalid:', validation.error);
 * }
 * ```
 * 
 * ## Conversational Usage
 * ```typescript
 * const response = await llm.complete({
 *   messages: [
 *     { role: 'user', content: 'What is the capital of France?' },
 *     { role: 'assistant', content: 'The capital of France is Paris.' },
 *     { role: 'user', content: 'What is its population?' }
 *   ],
 *   model: "claude-3-sonnet-20240229"
 * });
 * ```
 * 
 * ## Error Handling
 * ```typescript
 * try {
 *   const response = await llm.complete({
 *     prompt: "Analyze this image",
 *     model: "claude-2.1", // Text-only model
 *     attachments: [{ type: 'image', data: 'base64-data', mediaType: 'image/jpeg' }]
 *   });
 * } catch (error) {
 *   if (error.message.includes('does not support image attachments')) {
 *     console.log('Model does not support images, falling back to text-only');
 *     // Retry without attachments or use different model
 *   }
 * }
 * ```
 * 
 * ## Configuration and Management
 * ```typescript
 * const llm = LLMProvider.getInstance();
 * 
 * // Check configuration
 * const config = llm.getConfig();
 * console.log('Current provider:', config.currentProvider);
 * console.log('Default model:', config.defaultModel);
 * console.log('Available models:', config.availableModels);
 * 
 * // Check if provider is configured
 * if (!llm.isConfigured()) {
 *   throw new Error('LLM provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY');
 * }
 * 
 * // Get supported file types
 * const imageTypes = llm.getSupportedImageTypes('claude-3-opus-20240229');
 * const docTypes = llm.getSupportedDocumentTypes('claude-3-opus-20240229');
 * ```
 * 
 * ## Environment Variables
 * Set these environment variables to configure the provider:
 * - `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude models
 * - `OPENAI_API_KEY`: Your OpenAI API key for GPT models  
 * - `LLM_DEFAULT_MODEL`: Default model to use (e.g., "claude-3-sonnet-20240229")
 * 
 * ## Model Support Matrix
 * | Model | Images | Documents | Audio | Video | Max Image Size | Max Attachments |
 * |-------|--------|-----------|-------|-------|----------------|-----------------|
 * | claude-3-opus | ✅ | ✅ | ❌ | ❌ | 5MB | 20 |
 * | claude-3-sonnet | ✅ | ✅ | ❌ | ❌ | 5MB | 20 |
 * | claude-3-haiku | ✅ | ✅ | ❌ | ❌ | 5MB | 20 |
 * | gpt-4-vision | ✅ | ❌ | ❌ | ❌ | 20MB | 10 |
 * | gpt-4 | ❌ | ❌ | ❌ | ❌ | 0 | 0 |
 * | claude-2.1 | ❌ | ❌ | ❌ | ❌ | 0 | 0 |
 * 
 * ## Common Patterns for Agents
 * ```typescript
 * // Task analysis with optional document review
 * async analyzeTask(taskDescription: string, documents?: Buffer[]): Promise<string> {
 *   const attachments = documents?.map(doc => ({
 *     type: 'document' as const,
 *     data: doc,
 *     mediaType: 'application/pdf'
 *   })) || [];
 * 
 *   return await this.llm.complete({
 *     prompt: `Analyze this task: ${taskDescription}`,
 *     model: "claude-3-sonnet-20240229",
 *     attachments,
 *     systemPrompt: "You are a business process analyst",
 *     responseFormat: 'json'
 *   });
 * }
 * 
 * // Screenshot analysis for UI automation
 * async analyzeScreenshot(screenshot: string, instruction: string): Promise<string> {
 *   return await this.llm.complete({
 *     messages: [{
 *       role: 'user',
 *       content: [
 *         { type: 'text', text: instruction },
 *         { type: 'image', image: { data: screenshot, detail: 'high' } }
 *       ]
 *     }],
 *     model: "claude-3-opus-20240229",
 *     temperature: 0.1 // Low temperature for precise analysis
 *   });
 * }
 * ```
 */

import { logger } from '../utils/logger';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ModelRegistry, ModelConfig } from './llm-model-registry';

// Media attachment interface
export interface MediaAttachment {
  type: 'image' | 'document' | 'audio' | 'video';
  data: string | Buffer; // base64 string or Buffer
  mediaType: string; // MIME type (e.g., 'image/jpeg', 'application/pdf')
  filename?: string;
  size?: number; // bytes
  url?: string; // Alternative to data for URL-based attachments
}

// Multi-modal message content
export interface MessageContent {
  type: 'text' | 'image' | 'document';
  text?: string;
  image?: {
    url?: string;
    data?: string; // base64
    detail?: 'low' | 'high' | 'auto';
  };
  document?: {
    data: string | Buffer;
    mediaType: string;
    filename?: string;
  };
}

// Enhanced message interface
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

// Unified request interface with multi-modal support
export interface LLMRequest {
  prompt?: string; // Optional when using messages with rich content
  model?: string; // Optional - uses default if not specified
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  systemPrompt?: string;
  messages?: LLMMessage[];
  attachments?: MediaAttachment[]; // Legacy support for simple attachments
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

// Model capabilities interface
export interface ModelCapabilities {
  supportsImages: boolean;
  supportsDocuments: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  maxImageSize: number; // bytes
  maxDocumentSize: number; // bytes
  supportedImageTypes: string[]; // MIME types
  supportedDocumentTypes: string[]; // MIME types
  maxAttachmentsPerRequest: number;
  maxTotalAttachmentSize: number; // bytes
}

// Get model registry instance
const modelRegistry = ModelRegistry.getInstance();

// Model registry is now dynamically managed via ModelRegistry class
// Access models through modelRegistry.getModel() or modelRegistry.exportConfig()

// Original static definitions (kept for reference but commented out)
/*
const STATIC_MODEL_REGISTRY: Record<string, ModelConfig> = {
  // Anthropic Claude 3.5 Sonnet (latest)
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    maxTokens: 8192,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 5 * 1024 * 1024, // 5MB
      maxDocumentSize: 100 * 1024 * 1024, // 100MB
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024 // 100MB total
    }
  },
  // Anthropic Claude 3 models with vision
  'claude-3-opus-20240229': {
    provider: 'anthropic',
    modelName: 'claude-3-opus-20240229',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 5 * 1024 * 1024, // 5MB
      maxDocumentSize: 100 * 1024 * 1024, // 100MB
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024 // 100MB total
    }
  },
  'claude-3-sonnet-20240229': {
    provider: 'anthropic',
    modelName: 'claude-3-sonnet-20240229',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 5 * 1024 * 1024, // 5MB
      maxDocumentSize: 100 * 1024 * 1024, // 100MB
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024 // 100MB total
    }
  },
  'claude-3-haiku-20240307': {
    provider: 'anthropic',
    modelName: 'claude-3-haiku-20240307',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 5 * 1024 * 1024, // 5MB
      maxDocumentSize: 100 * 1024 * 1024, // 100MB
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024 // 100MB total
    }
  },
  'claude-2.1': {
    provider: 'anthropic',
    modelName: 'claude-2.1',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: false,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 0,
      maxDocumentSize: 0,
      supportedImageTypes: [],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 0,
      maxTotalAttachmentSize: 0
    }
  },
  
  // OpenAI GPT models
  'gpt-4': {
    provider: 'openai',
    modelName: 'gpt-4',
    maxTokens: 8192,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: false,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 0,
      maxDocumentSize: 0,
      supportedImageTypes: [],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 0,
      maxTotalAttachmentSize: 0
    }
  },
  'gpt-4o': {
    provider: 'openai',
    modelName: 'gpt-4o',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024, // 20MB
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 10,
      maxTotalAttachmentSize: 20 * 1024 * 1024 // 20MB total
    }
  },
  'gpt-4-vision-preview': {
    provider: 'openai',
    modelName: 'gpt-4-vision-preview',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024, // 20MB
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 10,
      maxTotalAttachmentSize: 20 * 1024 * 1024 // 20MB total
    }
  },
  'gpt-4-turbo-preview': {
    provider: 'openai',
    modelName: 'gpt-4-turbo-preview',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: false,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 0,
      maxDocumentSize: 0,
      supportedImageTypes: [],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 0,
      maxTotalAttachmentSize: 0
    }
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: false,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 0,
      maxDocumentSize: 0,
      supportedImageTypes: [],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 0,
      maxTotalAttachmentSize: 0
    }
  }
};
*/

export class LLMProvider {
  private static instance: LLMProvider;
  private anthropicClient?: Anthropic;
  private openaiClient?: OpenAI;
  private defaultModel: string;

  private constructor() {
    // Set default model from environment or use Claude 3.5 Sonnet (latest)
    this.defaultModel = process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022';
    
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
    
    // Get model configuration from registry
    const modelConfig = modelRegistry.getModel(model);
    if (!modelConfig) {
      // If model not in registry, try to infer provider
      const inferredConfig = this.inferModelConfig(model);
      if (!inferredConfig) {
        const availableModels = modelRegistry.getActiveModels();
        throw new Error(
          `Unknown model: ${model}. Available models: ${availableModels.join(', ')}`
        );
      }
      return this.completeWithInferredProvider(request, model, inferredConfig);
    }
    
    // Validate request capabilities against model
    this.validateRequestCapabilities(request, modelConfig);
    
    // Log the request (without sensitive content)
    logger.info('🚀 LLM REQUEST INITIATED', {
      model,
      provider: modelConfig.provider,
      temperature: request.temperature || modelConfig.defaultTemperature,
      metadata: request.metadata,
      promptLength: request.prompt?.length || 0,
      hasMessages: !!request.messages,
      hasAttachments: !!request.attachments,
      promptPreview: request.prompt?.substring(0, 200)
    });
    
    // DEBUG: Log full prompt for tracing
    logger.debug('📝 Full LLM prompt', {
      model,
      prompt: request.prompt,
      messages: request.messages,
      systemPrompt: request.systemPrompt
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
      const duration = Date.now() - startTime;
      logger.info('✅ LLM REQUEST COMPLETED', {
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        duration: `${duration}ms`,
        metadata: request.metadata,
        responseLength: response.content.length,
        responsePreview: response.content.substring(0, 200)
      });
      
      // DEBUG: Log full response for tracing
      logger.debug('📄 Full LLM response', {
        model: response.model,
        fullResponse: response.content
      });
      
      return response;
      
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const errorType = error.type || error.name || 'UnknownError';
      const errorStatus = error.status || error.statusCode || 'Unknown';
      
      logger.error(`LLM request failed for ${model}: [${errorType}] ${errorMessage} (Status: ${errorStatus})`, {
        error: errorMessage,
        errorType,
        errorStatus,
        model,
        duration: Date.now() - startTime,
        metadata: request.metadata,
        provider: model.startsWith('claude') ? 'Anthropic' : model.startsWith('gpt') ? 'OpenAI' : 'Unknown',
        taskId: request.metadata?.taskId
      });
      
      // TODO: Automatic fallback to alternative provider
      // If Anthropic fails with overload, try OpenAI
      // If OpenAI fails, try Anthropic
      // This provides resilience against API outages
      if (error.status === 529 || error.message?.includes('Overloaded')) {
        logger.warn('Primary provider overloaded, attempting fallback', {
          failedProvider: modelConfig.provider,
          originalModel: model
        });
        
        // Try fallback provider
        if (modelConfig.provider === 'anthropic' && this.openaiClient) {
          logger.info('Falling back to OpenAI due to Anthropic overload');
          try {
            // Use GPT-4 as fallback
            const fallbackRequest = {
              ...request,
              model: 'gpt-4-turbo-preview'
            };
            const fallbackConfig = modelRegistry.getModel('gpt-4-turbo-preview');
            if (!fallbackConfig) {
              throw new Error('Fallback model gpt-4-turbo-preview not configured');
            }
            const response = await this.completeWithOpenAI(fallbackRequest, fallbackConfig);
            
            logger.info('✅ Fallback to OpenAI successful', {
              originalModel: model,
              fallbackModel: 'gpt-4-turbo-preview',
              duration: Date.now() - startTime
            });
            
            return response;
          } catch (fallbackError) {
            logger.error('Fallback to OpenAI also failed', { fallbackError });
            // Fall through to throw original error
          }
        } else if (modelConfig.provider === 'openai' && this.anthropicClient) {
          logger.info('Falling back to Anthropic due to OpenAI failure');
          try {
            // Use Claude as fallback
            const fallbackRequest = {
              ...request,
              model: 'claude-3-5-sonnet-20241022'
            };
            const fallbackConfig = modelRegistry.getModel('claude-3-5-sonnet-20241022');
            if (!fallbackConfig) {
              throw new Error('Fallback model claude-3-5-sonnet-20241022 not configured');
            }
            const response = await this.completeWithAnthropic(fallbackRequest, fallbackConfig);
            
            logger.info('✅ Fallback to Anthropic successful', {
              originalModel: model,
              fallbackModel: 'claude-3-5-sonnet-20241022',
              duration: Date.now() - startTime
            });
            
            return response;
          } catch (fallbackError) {
            logger.error('Fallback to Anthropic also failed', { fallbackError });
            // Fall through to throw original error
          }
        }
      }
      
      // If no fallback or fallback failed, throw original error
      throw error;
    }
  }

  /**
   * Validate request capabilities against model configuration
   */
  private validateRequestCapabilities(request: LLMRequest, config: ModelConfig): void {
    const capabilities = config.capabilities;
    const attachments = this.extractAllAttachments(request);
    
    if (attachments.length === 0) {
      return; // No attachments to validate
    }
    
    // Check if model supports any attachments
    if (!capabilities.supportsImages && !capabilities.supportsDocuments && 
        !capabilities.supportsAudio && !capabilities.supportsVideo) {
      throw new Error(
        `Model ${config.modelName} does not support any media attachments. ` +
        `Use a vision-enabled model like claude-3-opus-20240229 or gpt-4-vision-preview.`
      );
    }
    
    // Check attachment count limit
    if (attachments.length > capabilities.maxAttachmentsPerRequest) {
      throw new Error(
        `Too many attachments: ${attachments.length}. ` +
        `Model ${config.modelName} supports maximum ${capabilities.maxAttachmentsPerRequest} attachments per request.`
      );
    }
    
    let totalSize = 0;
    
    for (const attachment of attachments) {
      // Validate attachment type support
      this.validateAttachmentType(attachment, capabilities, config.modelName);
      
      // Calculate size
      const size = this.getAttachmentSize(attachment);
      totalSize += size;
      
      // Validate individual attachment size
      this.validateAttachmentSize(attachment, size, capabilities, config.modelName);
    }
    
    // Validate total attachment size
    if (totalSize > capabilities.maxTotalAttachmentSize) {
      throw new Error(
        `Total attachment size (${this.formatBytes(totalSize)}) exceeds limit ` +
        `(${this.formatBytes(capabilities.maxTotalAttachmentSize)}) for model ${config.modelName}.`
      );
    }
  }
  
  /**
   * Extract all attachments from request (both legacy and new format)
   */
  private extractAllAttachments(request: LLMRequest): MediaAttachment[] {
    const attachments: MediaAttachment[] = [];
    
    // Legacy attachments
    if (request.attachments) {
      attachments.push(...request.attachments);
    }
    
    // Extract from messages
    if (request.messages) {
      for (const message of request.messages) {
        if (Array.isArray(message.content)) {
          for (const content of message.content) {
            if (content.type === 'image' && content.image) {
              attachments.push({
                type: 'image',
                data: content.image.data || '',
                mediaType: this.inferMediaTypeFromData(content.image.data || content.image.url || ''),
                url: content.image.url
              });
            } else if (content.type === 'document' && content.document) {
              attachments.push({
                type: 'document',
                data: content.document.data,
                mediaType: content.document.mediaType,
                filename: content.document.filename
              });
            }
          }
        }
      }
    }
    
    return attachments;
  }
  
  /**
   * Validate specific attachment type against model capabilities
   */
  private validateAttachmentType(attachment: MediaAttachment, capabilities: ModelCapabilities, modelName: string): void {
    switch (attachment.type) {
      case 'image':
        if (!capabilities.supportsImages) {
          throw new Error(`Model ${modelName} does not support image attachments.`);
        }
        if (!capabilities.supportedImageTypes.includes(attachment.mediaType)) {
          throw new Error(
            `Image type ${attachment.mediaType} not supported by model ${modelName}. ` +
            `Supported types: ${capabilities.supportedImageTypes.join(', ')}`
          );
        }
        break;
        
      case 'document':
        if (!capabilities.supportsDocuments) {
          throw new Error(`Model ${modelName} does not support document attachments.`);
        }
        if (!capabilities.supportedDocumentTypes.includes(attachment.mediaType)) {
          throw new Error(
            `Document type ${attachment.mediaType} not supported by model ${modelName}. ` +
            `Supported types: ${capabilities.supportedDocumentTypes.join(', ')}`
          );
        }
        break;
        
      case 'audio':
        if (!capabilities.supportsAudio) {
          throw new Error(`Model ${modelName} does not support audio attachments.`);
        }
        break;
        
      case 'video':
        if (!capabilities.supportsVideo) {
          throw new Error(`Model ${modelName} does not support video attachments.`);
        }
        break;
        
      default:
        throw new Error(`Unknown attachment type: ${attachment.type}`);
    }
  }
  
  /**
   * Validate attachment size against model limits
   */
  private validateAttachmentSize(
    attachment: MediaAttachment, 
    size: number, 
    capabilities: ModelCapabilities, 
    modelName: string
  ): void {
    let maxSize = 0;
    let typeName = '';
    
    switch (attachment.type) {
      case 'image':
        maxSize = capabilities.maxImageSize;
        typeName = 'image';
        break;
      case 'document':
        maxSize = capabilities.maxDocumentSize;
        typeName = 'document';
        break;
      default:
        return; // No size limits for audio/video yet
    }
    
    if (size > maxSize) {
      throw new Error(
        `${typeName} size (${this.formatBytes(size)}) exceeds limit ` +
        `(${this.formatBytes(maxSize)}) for model ${modelName}.`
      );
    }
  }
  
  /**
   * Get attachment size in bytes
   */
  private getAttachmentSize(attachment: MediaAttachment): number {
    if (attachment.size) {
      return attachment.size;
    }
    
    if (typeof attachment.data === 'string') {
      // Base64 string - estimate size
      return Math.ceil(attachment.data.length * 3 / 4);
    } else if (Buffer.isBuffer(attachment.data)) {
      return attachment.data.length;
    }
    
    return 0;
  }
  
  /**
   * Infer media type from data or filename
   */
  private inferMediaTypeFromData(data: string): string {
    if (data.startsWith('data:')) {
      const match = data.match(/data:([^;]+)/);
      return match ? match[1] : 'application/octet-stream';
    }
    
    // Try to detect from base64 signature
    if (data.length > 16) {
      // Decode first few bytes to check signature
      try {
        const buffer = Buffer.from(data.substring(0, 32), 'base64');
        
        // Check for PNG signature
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
          return 'image/png';
        }
        
        // Check for JPEG signature
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
          return 'image/jpeg';
        }
        
        // Check for GIF signature
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
          return 'image/gif';
        }
        
        // Check for WebP signature
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
          return 'image/webp';
        }
      } catch (e) {
        // Not valid base64, fall through to default
      }
    }
    
    // Default fallback - assume PNG for images (most common in tests)
    return 'image/png';
  }
  
  /**
   * Format bytes for human-readable error messages
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Convert our unified content format to Anthropic's format
   */
  private convertToAnthropicContent(content: string | MessageContent[]): any {
    if (typeof content === 'string') {
      return content;
    }
    
    // Convert MessageContent[] to Anthropic format
    return content.map(item => {
      switch (item.type) {
        case 'text':
          return {
            type: 'text',
            text: item.text || ''
          };
          
        case 'image':
          if (item.image?.data) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: this.inferMediaTypeFromData(item.image.data),
                data: this.ensureBase64(item.image.data)
              }
            };
          } else if (item.image?.url) {
            return {
              type: 'image',
              source: {
                type: 'url',
                url: item.image.url
              }
            };
          }
          throw new Error('Image content must have either data or url');
          
        case 'document':
          // For documents, we'll include them as text for now
          // In the future, this could be enhanced to extract text from PDFs, etc.
          return {
            type: 'text',
            text: `[Document: ${item.document?.filename || 'unnamed'}]`
          };
          
        default:
          throw new Error(`Unsupported content type for Anthropic: ${item.type}`);
      }
    });
  }
  
  /**
   * Ensure data is in base64 format (strip data URL prefix if present)
   */
  private ensureBase64(data: string | Buffer): string {
    if (Buffer.isBuffer(data)) {
      return data.toString('base64');
    }
    
    if (typeof data === 'string') {
      // If it's a data URL, extract the base64 part
      if (data.startsWith('data:')) {
        const base64Index = data.indexOf(',');
        return base64Index !== -1 ? data.substring(base64Index + 1) : data;
      }
      return data;
    }
    
    throw new Error('Invalid data format for base64 conversion');
  }
  
  /**
   * Convert our unified content format to OpenAI's format
   */
  private convertToOpenAIContent(content: string | MessageContent[]): any {
    if (typeof content === 'string') {
      return content;
    }
    
    // Convert MessageContent[] to OpenAI format
    return content.map(item => {
      switch (item.type) {
        case 'text':
          return {
            type: 'text',
            text: item.text || ''
          };
          
        case 'image':
          if (item.image?.data) {
            return {
              type: 'image_url',
              image_url: {
                url: `data:${this.inferMediaTypeFromData(item.image.data)};base64,${this.ensureBase64(item.image.data)}`,
                detail: item.image.detail || 'auto'
              }
            };
          } else if (item.image?.url) {
            return {
              type: 'image_url',
              image_url: {
                url: item.image.url,
                detail: item.image.detail || 'auto'
              }
            };
          }
          throw new Error('Image content must have either data or url');
          
        case 'document':
          // OpenAI doesn't support documents directly, so we'll include them as text
          return {
            type: 'text',
            text: `[Document: ${item.document?.filename || 'unnamed'}]`
          };
          
        default:
          throw new Error(`Unsupported content type for OpenAI: ${item.type}`);
      }
    });
  }

  /**
   * Complete using Anthropic Claude
   */
  private async completeWithAnthropic(request: LLMRequest, config: ModelConfig): Promise<LLMResponse> {
    logger.info('🔍 ANTHROPIC: Starting completion request', {
      hasClient: !!this.anthropicClient,
      model: config.modelName,
      apiKeyLength: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0,
      apiKeyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...' : 'none'
    });
    
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized. Set ANTHROPIC_API_KEY environment variable.');
    }
    
    try {
      // Build messages array with multi-modal support
      let messages: any[] = [];
      
      if (request.messages) {
        // Process messages with potential multi-modal content
        messages = request.messages.map(m => ({
          role: m.role,
          content: this.convertToAnthropicContent(m.content)
        }));
      } else if (request.prompt) {
        // Handle legacy prompt with attachments
        const content: any[] = [{ type: 'text', text: request.prompt }];
        
        // Add legacy attachments if present
        if (request.attachments) {
          for (const attachment of request.attachments) {
            if (attachment.type === 'image') {
              content.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: attachment.mediaType,
                  data: this.ensureBase64(attachment.data)
                }
              });
            }
          }
        }
        
        messages = [{
          role: 'user' as const,
          content: content.length === 1 ? content[0].text : content
        }];
      } else {
        throw new Error('Either prompt or messages must be provided');
      }
      
      // Use explicit system prompt
      const systemPrompt = request.systemPrompt || 
        'You are a helpful AI assistant that follows instructions precisely and returns well-structured responses.';
      
      // Log the request details
      logger.info('🔍 ANTHROPIC: Preparing API call', {
        model: config.modelName,
        messageCount: messages.length,
        maxTokens: request.maxTokens || config.maxTokens,
        temperature: request.temperature || config.defaultTemperature,
        systemPromptLength: systemPrompt.length,
        firstMessagePreview: JSON.stringify(messages[0]).substring(0, 200)
      });
      
      // Create the completion with timeout wrapper
      logger.info('🚀 ANTHROPIC: Making API call to messages.create()...');
      const apiStartTime = Date.now();
      
      const response = await Promise.race([
        this.anthropicClient.messages.create({
          model: config.modelName,
          messages,
          max_tokens: request.maxTokens || config.maxTokens,
          temperature: request.temperature || config.defaultTemperature,
          system: systemPrompt,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Anthropic API call timed out after 30 seconds')), 30000)
        )
      ]) as any;
      
      const apiDuration = Date.now() - apiStartTime;
      logger.info('✅ ANTHROPIC: API call completed', {
        duration: `${apiDuration}ms`,
        model: response.model,
        stopReason: response.stop_reason,
        usage: response.usage
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
      const errorMessage = error.message || 'Unknown error';
      const errorStatus = error.status || error.statusCode || 'Unknown status';
      const errorType = error.type || error.name || 'Unknown type';
      
      // Build a descriptive error message
      let detailedMessage = `❌ ANTHROPIC: API call failed - ${errorType}: ${errorMessage}`;
      
      // Add specific details for common errors
      if (error.status === 429 || errorMessage.includes('rate_limit')) {
        detailedMessage += ' (Rate limit exceeded - too many requests)';
      } else if (error.status === 401) {
        detailedMessage += ' (Authentication failed - check API key)';
      } else if (error.status === 500 || error.status === 503) {
        detailedMessage += ' (Anthropic service error - API temporarily unavailable)';
      } else if (error.status === 400) {
        detailedMessage += ' (Bad request - check prompt format/size)';
      }
      
      logger.error(detailedMessage, {
        status: errorStatus,
        type: errorType,
        message: errorMessage,
        model: config.modelName || 'unknown',
        promptTokens: request.maxTokens,
        details: error.response?.data || error.details || undefined
      });
      
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
      // Build messages array with multi-modal support
      let messages: any[] = [];
      
      // Use explicit system prompt
      const systemPrompt = request.systemPrompt || 
        'You are a helpful AI assistant that follows instructions precisely and returns well-structured responses.';
      
      messages.push({
        role: 'system',
        content: systemPrompt
      });
      
      if (request.messages) {
        // Process messages with potential multi-modal content
        for (const message of request.messages) {
          messages.push({
            role: message.role,
            content: this.convertToOpenAIContent(message.content)
          });
        }
      } else if (request.prompt) {
        // Handle legacy prompt with attachments
        let content: any = request.prompt;
        
        // For vision models, convert to array format if there are image attachments
        if (request.attachments && config.capabilities.supportsImages) {
          content = [{ type: 'text', text: request.prompt }];
          
          for (const attachment of request.attachments) {
            if (attachment.type === 'image') {
              content.push({
                type: 'image_url',
                image_url: {
                  url: attachment.url || `data:${attachment.mediaType};base64,${this.ensureBase64(attachment.data)}`,
                  detail: 'auto'
                }
              });
            }
          }
        }
        
        messages.push({
          role: 'user',
          content
        });
      } else {
        throw new Error('Either prompt or messages must be provided');
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
      defaultTemperature: 0.3,
      capabilities: {
        supportsImages: config.provider === 'anthropic',
        supportsDocuments: config.provider === 'anthropic',
        supportsAudio: false,
        supportsVideo: false,
        maxImageSize: config.provider === 'anthropic' ? 5 * 1024 * 1024 : 20 * 1024 * 1024,
        maxDocumentSize: config.provider === 'anthropic' ? 100 * 1024 * 1024 : 0,
        supportedImageTypes: config.provider === 'anthropic' 
          ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
          : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        supportedDocumentTypes: config.provider === 'anthropic' 
          ? ['application/pdf', 'text/plain', 'text/csv'] 
          : [],
        maxAttachmentsPerRequest: config.provider === 'anthropic' ? 20 : 10,
        maxTotalAttachmentSize: config.provider === 'anthropic' ? 100 * 1024 * 1024 : 20 * 1024 * 1024
      }
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
    return modelRegistry.getActiveModels();
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
    if (!modelRegistry.getModel(model) && !this.inferModelConfig(model)) {
      throw new Error(`Unknown model: ${model}`);
    }
    this.defaultModel = model;
    
    // Update current provider based on model
    const modelConfig = modelRegistry.getModel(model) || this.inferModelConfig(model);
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
    const modelConfig = modelRegistry.getModel(this.defaultModel);
    if (modelConfig) {
      return modelConfig.provider;
    }
    
    // Infer from model name
    const inferred = this.inferModelConfig(this.defaultModel);
    return inferred ? inferred.provider : 'anthropic';
  }
  
  /**
   * Get model capabilities for a specific model
   */
  getModelCapabilities(model?: string): ModelCapabilities {
    const targetModel = model || this.defaultModel;
    const config = modelRegistry.getModel(targetModel);
    
    if (!config) {
      // Return default capabilities for unknown models
      return {
        supportsImages: false,
        supportsDocuments: false,
        supportsAudio: false,
        supportsVideo: false,
        maxImageSize: 0,
        maxDocumentSize: 0,
        supportedImageTypes: [],
        supportedDocumentTypes: [],
        maxAttachmentsPerRequest: 0,
        maxTotalAttachmentSize: 0
      };
    }
    
    return config.capabilities;
  }
  
  /**
   * Check if a model supports a specific media type
   */
  supportsMediaType(mediaType: 'image' | 'document' | 'audio' | 'video', model?: string): boolean {
    const capabilities = this.getModelCapabilities(model);
    
    switch (mediaType) {
      case 'image':
        return capabilities.supportsImages;
      case 'document':
        return capabilities.supportsDocuments;
      case 'audio':
        return capabilities.supportsAudio;
      case 'video':
        return capabilities.supportsVideo;
      default:
        return false;
    }
  }
  
  /**
   * Get supported image types for a model
   */
  getSupportedImageTypes(model?: string): string[] {
    return this.getModelCapabilities(model).supportedImageTypes;
  }
  
  /**
   * Get supported document types for a model
   */
  getSupportedDocumentTypes(model?: string): string[] {
    return this.getModelCapabilities(model).supportedDocumentTypes;
  }
  
  /**
   * Validate if an attachment is supported by a model
   */
  validateAttachment(attachment: MediaAttachment, model?: string): { valid: boolean; error?: string } {
    try {
      const targetModel = model || this.defaultModel;
      const config = modelRegistry.getModel(targetModel);
      
      if (!config) {
        return { valid: false, error: `Unknown model: ${targetModel}` };
      }
      
      this.validateAttachmentType(attachment, config.capabilities, config.modelName);
      
      const size = this.getAttachmentSize(attachment);
      this.validateAttachmentSize(attachment, size, config.capabilities, config.modelName);
      
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  private currentProvider: string = 'anthropic';
}

// Export singleton instance for backward compatibility
export const llmProvider = LLMProvider.getInstance();