# LLM Model Registry Documentation

## Overview

The LLM Model Registry provides a flexible, runtime-configurable system for managing LLM models across different providers (OpenAI, Anthropic). Instead of hard-coding model configurations, the registry allows:

- Dynamic model discovery and registration
- Environment-based configuration
- Deprecation warnings and migration paths
- Capability validation at runtime

## Key Features

### 1. No More Hard-Coded Models
Models are now managed through a registry pattern that can be updated without code changes.

### 2. Deprecation Management
The registry automatically warns when deprecated models are used and suggests replacements.

### 3. Environment Configuration
Models can be configured via environment variables:

```bash
# Add custom models via JSON
export LLM_CUSTOM_MODELS='{
  "my-custom-model": {
    "provider": "openai",
    "modelName": "gpt-4-custom",
    "maxTokens": 8192,
    "defaultTemperature": 0.3,
    "capabilities": {
      "supportsImages": false,
      "supportsDocuments": false,
      "supportsAudio": false,
      "supportsVideo": false,
      "maxImageSize": 0,
      "maxDocumentSize": 0,
      "supportedImageTypes": [],
      "supportedDocumentTypes": [],
      "maxAttachmentsPerRequest": 0,
      "maxTotalAttachmentSize": 0
    }
  }
}'

# Override existing model configurations
export LLM_MODEL_OVERRIDES='{
  "gpt-4": {
    "maxTokens": 16384,
    "defaultTemperature": 0.5
  }
}'
```

## Current Model Support (January 2025)

### OpenAI Models

#### GPT-5 Family (Latest Generation - NEW!)
- **gpt-5** - Flagship model with 256k context, full multimodal support (text, images, documents, audio, video)
- **gpt-5-mini** - Balanced performance, 128k context, supports text, images, and documents
- **gpt-5-nano** - Lightweight variant, 64k context, supports text and images

#### O3 Series (Advanced Reasoning - NEW!)
- **o3** - Latest reasoning model, 128k context
- **o3-mini** - Smaller reasoning model, 64k context
- **o1** - Previous generation reasoning model
- **o1-mini** - Smaller previous generation reasoning model

#### GPT-4o Family (Previous Flagship)
- **gpt-4o** - Multimodal (text + images), 128k context
- **gpt-4o-mini** - Smaller, faster variant of GPT-4o
- **gpt-4-turbo** - GPT-4 with vision capabilities

#### Standard Models
- **gpt-4** - Text-only, 8k context
- **gpt-3.5-turbo** - Fast, cost-effective, 4k completion tokens

### Anthropic Models

#### Claude 3.5 Series (Latest)
- **claude-3-5-sonnet-20241022** - Balanced performance, multimodal
- **claude-3-5-haiku-20241022** - Fast, efficient, multimodal

#### Claude 3 Series
- **claude-3-opus-20240229** - Most capable, multimodal
- **claude-3-haiku-20240307** - Fast response, multimodal

### Removed Deprecated Models
These models have been removed from the registry:
- **gpt-4-vision-preview** → Use `gpt-5` or `gpt-4o` instead
- **claude-3-sonnet-20240229** → Use `claude-3-5-sonnet-20241022`
- **claude-2.1** → Use `claude-3-5-haiku-20241022`

### Recommended Upgrades
- **From gpt-4o** → Upgrade to `gpt-5` for significantly better performance
- **From gpt-4o-mini** → Upgrade to `gpt-5-mini` for better capabilities
- **From o1** → Upgrade to `o3` for improved reasoning

## Usage Examples

### Basic Usage
```typescript
import { ModelRegistry } from './services/llm-model-registry';

const registry = ModelRegistry.getInstance();

// Get all active (non-deprecated) models
const activeModels = registry.getActiveModels();

// Get models by provider
const openaiModels = registry.getModelsByProvider('openai');
const anthropicModels = registry.getModelsByProvider('anthropic');

// Check model capabilities
const supportsImages = registry.modelSupports('gpt-4o', 'supportsImages');
```

### Register Custom Models
```typescript
registry.registerModel('custom-llama', {
  provider: 'openai', // or your custom provider
  modelName: 'llama-3-70b',
  maxTokens: 8192,
  defaultTemperature: 0.3,
  capabilities: {
    supportsImages: false,
    supportsDocuments: true,
    supportsAudio: false,
    supportsVideo: false,
    maxImageSize: 0,
    maxDocumentSize: 10 * 1024 * 1024,
    supportedImageTypes: [],
    supportedDocumentTypes: ['application/pdf', 'text/plain'],
    maxAttachmentsPerRequest: 5,
    maxTotalAttachmentSize: 50 * 1024 * 1024
  }
});
```

### Export/Import Configurations
```typescript
// Export current configuration
const config = registry.exportConfig();
fs.writeFileSync('models.json', JSON.stringify(config, null, 2));

// Import configuration
const savedConfig = JSON.parse(fs.readFileSync('models.json', 'utf-8'));
registry.importConfig(savedConfig);
```

### Future Enhancement: Runtime Discovery
```typescript
// This could be implemented to discover models from APIs
const availableModels = await registry.discoverModels('openai');
// Would make actual API call to list available models
```

## Model Capabilities

Each model defines its capabilities:

```typescript
interface ModelCapabilities {
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
```

## Best Practices

1. **Don't Hard-Code Models**: Use the registry to get available models
2. **Check Capabilities**: Always validate model capabilities before using features
3. **Handle Deprecation**: Listen to deprecation warnings and plan migrations
4. **Use Environment Config**: Configure models via environment for different deployments
5. **Test with Multiple Models**: Ensure your code works with different model configurations

## Migration from Hard-Coded Models

### Before (Hard-coded):
```typescript
const MODEL_REGISTRY = {
  'gpt-5': { ... }, // Fictional model!
  'gpt-4': { ... },
  // Fixed list, requires code changes to update
};
```

### After (Registry):
```typescript
const registry = ModelRegistry.getInstance();
const model = registry.getModel('gpt-4o'); // Real models only
// Can add/modify models without code changes
```

## Common Issues and Solutions

### Issue: Model not found
```typescript
// Check available models
const models = registry.getAllModels();
console.log('Available models:', models);
```

### Issue: Deprecated model warnings
```typescript
// The registry will automatically warn:
// ⚠️ Model 'claude-2.1' is deprecated.
//    Please migrate to 'claude-3-5-haiku-20241022'.
```

### Issue: Capability mismatch
```typescript
// Always check capabilities before use
if (!registry.modelSupports('gpt-3.5-turbo', 'supportsImages')) {
  console.log('Model does not support images, using text-only');
}
```

## Future Roadmap

1. **API-based Discovery**: Automatically discover available models from provider APIs
2. **Usage Analytics**: Track model usage and performance
3. **Cost Optimization**: Choose models based on cost/performance requirements
4. **Capability Auto-Detection**: Automatically test and verify model capabilities
5. **Model Versioning**: Better version management and rollback capabilities

## Summary

The Model Registry provides a flexible, maintainable approach to LLM model management that:
- Eliminates hard-coded model configurations
- Supports runtime configuration
- Provides clear deprecation paths
- Enables easy addition of new models
- Validates capabilities at runtime

This approach ensures the system can adapt to the rapidly evolving LLM landscape without requiring code changes for each new model release.