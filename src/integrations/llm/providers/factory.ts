import { LLMProviderInterface } from './base';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { ClaudeMCPProvider } from './claude-mcp';

export interface ProviderConfig {
  openAIApiKey?: string;
  anthropicApiKey?: string;
  mcpServerUrl?: string;
  mcpAuthToken?: string;
}

export class LLMProviderFactory {
  static create(provider: string, config: ProviderConfig): LLMProviderInterface {
    switch (provider) {
      case 'openai':
        if (!config.openAIApiKey) {
          throw new Error('OpenAI API key not configured in Supabase secrets');
        }
        return new OpenAIProvider(config.openAIApiKey);
        
      case 'claude':
        if (!config.anthropicApiKey) {
          throw new Error('Anthropic API key not configured in Supabase secrets');
        }
        return new ClaudeProvider(config.anthropicApiKey);
        
      case 'claude-mcp':
        if (!config.mcpServerUrl) {
          throw new Error('MCP Server URL not configured in Supabase secrets');
        }
        if (!config.mcpAuthToken) {
          throw new Error('MCP Auth Token not configured in Supabase secrets');
        }
        return new ClaudeMCPProvider(config.mcpServerUrl, config.mcpAuthToken);
        
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}