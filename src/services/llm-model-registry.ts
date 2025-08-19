/**
 * LLM Model Registry - Dynamic model configuration
 * 
 * This module provides runtime model discovery and configuration
 * instead of hard-coding model availability.
 */

import { ModelCapabilities } from './llm-provider';

export interface ModelConfig {
  provider: 'anthropic' | 'openai';
  modelName: string;
  maxTokens: number;
  defaultTemperature: number;
  capabilities: ModelCapabilities;
  deprecated?: boolean;
  deprecationDate?: string;
  replacementModel?: string;
}

/**
 * Default model configurations
 * These can be overridden by environment variables or external config
 */
const DEFAULT_MODEL_CONFIGS: Record<string, ModelConfig> = {
  // GPT-5 Family (Latest Generation - Released January 2025!)
  'gpt-5': {
    provider: 'openai',
    modelName: 'gpt-5',
    maxTokens: 256000,  // Significantly higher context
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: true,
      supportsVideo: true,
      maxImageSize: 50 * 1024 * 1024,  // 50MB
      maxDocumentSize: 100 * 1024 * 1024,  // 100MB
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv', 'application/json'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 200 * 1024 * 1024
    }
  },
  'gpt-5-mini': {
    provider: 'openai',
    modelName: 'gpt-5-mini',
    maxTokens: 128000,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 25 * 1024 * 1024,
      maxDocumentSize: 50 * 1024 * 1024,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 15,
      maxTotalAttachmentSize: 100 * 1024 * 1024
    }
  },
  'gpt-5-nano': {
    provider: 'openai',
    modelName: 'gpt-5-nano',
    maxTokens: 64000,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 10 * 1024 * 1024,
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 5,
      maxTotalAttachmentSize: 20 * 1024 * 1024
    }
  },
  
  // O3 Series (Advanced Reasoning Models)
  'o3': {
    provider: 'openai',
    modelName: 'o3',
    maxTokens: 128000,
    defaultTemperature: 0.1,  // Lower for reasoning
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
  'o3-mini': {
    provider: 'openai',
    modelName: 'o3-mini',
    maxTokens: 64000,
    defaultTemperature: 0.1,
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
  
  // GPT-4o Family (Previous flagship, still excellent)
  'gpt-4o': {
    provider: 'openai',
    modelName: 'gpt-4o',
    maxTokens: 128000,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024,
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 10,
      maxTotalAttachmentSize: 20 * 1024 * 1024
    }
  },
  'gpt-4o-mini': {
    provider: 'openai',
    modelName: 'gpt-4o-mini',
    maxTokens: 128000,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024,
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 10,
      maxTotalAttachmentSize: 20 * 1024 * 1024
    }
  },
  'gpt-4-turbo': {
    provider: 'openai',
    modelName: 'gpt-4-turbo',
    maxTokens: 128000,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024,
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 10,
      maxTotalAttachmentSize: 20 * 1024 * 1024
    }
  },
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
  'gpt-3.5-turbo': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    maxTokens: 4096,  // Maximum completion tokens supported
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

  // OpenAI O-series (Reasoning models)
  'o1': {
    provider: 'openai',
    modelName: 'o1',
    maxTokens: 128000,
    defaultTemperature: 1.0, // O-series models don't support temperature
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
  'o1-mini': {
    provider: 'openai',
    modelName: 'o1-mini',
    maxTokens: 128000,
    defaultTemperature: 1.0, // O-series models don't support temperature
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

  // Anthropic Claude Models
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
      maxImageSize: 5 * 1024 * 1024,
      maxDocumentSize: 100 * 1024 * 1024,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024
    }
  },
  'claude-3-5-haiku-20241022': {
    provider: 'anthropic',
    modelName: 'claude-3-5-haiku-20241022',
    maxTokens: 8192,
    defaultTemperature: 0.3,
    capabilities: {
      supportsImages: true,
      supportsDocuments: true,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 5 * 1024 * 1024,
      maxDocumentSize: 100 * 1024 * 1024,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024
    }
  },
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
      maxImageSize: 5 * 1024 * 1024,
      maxDocumentSize: 100 * 1024 * 1024,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024
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
      maxImageSize: 5 * 1024 * 1024,
      maxDocumentSize: 100 * 1024 * 1024,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      maxAttachmentsPerRequest: 20,
      maxTotalAttachmentSize: 100 * 1024 * 1024
    }
  },

  // Deprecated models (kept for backward compatibility)
  'gpt-4-vision-preview': {
    provider: 'openai',
    modelName: 'gpt-4-vision-preview',
    maxTokens: 4096,
    defaultTemperature: 0.3,
    deprecated: true,
    deprecationDate: '2024-12-06',
    replacementModel: 'gpt-4o',
    capabilities: {
      supportsImages: true,
      supportsDocuments: false,
      supportsAudio: false,
      supportsVideo: false,
      maxImageSize: 20 * 1024 * 1024,
      maxDocumentSize: 0,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      supportedDocumentTypes: [],
      maxAttachmentsPerRequest: 10,
      maxTotalAttachmentSize: 20 * 1024 * 1024
    }
  }
  // Deprecated models removed:
  // - claude-3-sonnet-20240229: use claude-3-5-sonnet-20241022 instead
  // - claude-2.1: use claude-3-5-haiku-20241022 instead
};

/**
 * Model Registry Class - Manages model configurations
 */
export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: Map<string, ModelConfig>;
  private customModels: Map<string, ModelConfig>;

  private constructor() {
    this.models = new Map(Object.entries(DEFAULT_MODEL_CONFIGS));
    this.customModels = new Map();
    this.loadCustomModels();
  }

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  /**
   * Load custom models from environment or config file
   */
  private loadCustomModels(): void {
    // Load from environment variable if present
    const customModelsJson = process.env.LLM_CUSTOM_MODELS;
    if (customModelsJson) {
      try {
        const customModels = JSON.parse(customModelsJson);
        Object.entries(customModels).forEach(([key, config]) => {
          this.registerModel(key, config as ModelConfig);
        });
      } catch (error) {
        console.error('Failed to parse LLM_CUSTOM_MODELS:', error);
      }
    }

    // Override specific model configs from environment
    if (process.env.LLM_MODEL_OVERRIDES) {
      try {
        const overrides = JSON.parse(process.env.LLM_MODEL_OVERRIDES);
        Object.entries(overrides).forEach(([modelName, override]) => {
          const existing = this.models.get(modelName);
          if (existing) {
            this.models.set(modelName, { ...existing, ...override as Partial<ModelConfig> });
          }
        });
      } catch (error) {
        console.error('Failed to parse LLM_MODEL_OVERRIDES:', error);
      }
    }
  }

  /**
   * Register a new model or override an existing one
   */
  registerModel(name: string, config: ModelConfig): void {
    this.customModels.set(name, config);
    this.models.set(name, config);
  }

  /**
   * Get model configuration
   */
  getModel(name: string): ModelConfig | undefined {
    const model = this.models.get(name);
    
    // Warn if using deprecated model
    if (model?.deprecated) {
      console.warn(`⚠️ Model '${name}' is deprecated${model.deprecationDate ? ` (EOL: ${model.deprecationDate})` : ''}.`);
      if (model.replacementModel) {
        console.warn(`   Please migrate to '${model.replacementModel}'.`);
      }
    }
    
    return model;
  }

  /**
   * Get all available models
   */
  getAllModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider: 'anthropic' | 'openai'): string[] {
    return Array.from(this.models.entries())
      .filter(([_, config]) => config.provider === provider)
      .map(([name, _]) => name);
  }

  /**
   * Get non-deprecated models
   */
  getActiveModels(): string[] {
    return Array.from(this.models.entries())
      .filter(([_, config]) => !config.deprecated)
      .map(([name, _]) => name);
  }

  /**
   * Check if a model supports a specific capability
   */
  modelSupports(modelName: string, capability: keyof ModelCapabilities): boolean {
    const model = this.getModel(modelName);
    if (!model) return false;
    return !!model.capabilities[capability];
  }

  /**
   * Discover available models from API (future enhancement)
   * This could make actual API calls to list available models
   */
  async discoverModels(provider: 'anthropic' | 'openai'): Promise<string[]> {
    // Future: Make API calls to discover available models
    // For now, return configured models
    return this.getModelsByProvider(provider);
  }

  /**
   * Export current configuration
   */
  exportConfig(): Record<string, ModelConfig> {
    return Object.fromEntries(this.models);
  }

  /**
   * Import configuration
   */
  importConfig(config: Record<string, ModelConfig>): void {
    Object.entries(config).forEach(([name, modelConfig]) => {
      this.registerModel(name, modelConfig);
    });
  }
}

// Export singleton instance
export const modelRegistry = ModelRegistry.getInstance();