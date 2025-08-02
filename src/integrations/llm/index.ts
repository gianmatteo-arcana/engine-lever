import { RequestEnvelope, ResponsePayload, LLMProvider } from './types';
import { supabase } from '../supabase/client';
import { LLMProviderFactory, type ProviderConfig } from './providers';
import masterPrompt from '../../../src/prompts/master_prompt.md?raw';

let provider: LLMProvider = (import.meta.env.VITE_LLM_PROVIDER as LLMProvider | undefined) ?? 'openai';

export function setLLMProvider(newProvider: LLMProvider) {
  provider = newProvider;
}

export function getLLMProvider(): LLMProvider {
  return provider;
}

async function getProviderConfig(): Promise<ProviderConfig> {
  const { data: secrets } = await supabase.functions.invoke('get-secrets');
  
  return {
    openAIApiKey: secrets?.OPENAI_API_KEY,
    anthropicApiKey: secrets?.ANTHROPIC_API_KEY,
    mcpServerUrl: secrets?.MCP_SERVER_URL,
    mcpAuthToken: secrets?.MCP_AUTH_TOKEN,
  };
}

export async function generateResponse(
  requestEnvelope: RequestEnvelope,
  overrideProvider?: LLMProvider
): Promise<ResponsePayload> {
  const activeProvider = overrideProvider ?? provider;
  
  try {
    const config = await getProviderConfig();
    const llmProvider = LLMProviderFactory.create(activeProvider, config);
    return await llmProvider.generateResponse(requestEnvelope, masterPrompt);
  } catch (error) {
    console.error(`Error with ${activeProvider} provider:`, error);
    
    // Fallback to edge functions for backward compatibility
    const { generateOpenAIResponse } = await import('./openai');
    const { generateClaudeResponse } = await import('./claude');
    const { generateClaudeMCPResponse } = await import('./claude-mcp');
    
    switch (activeProvider) {
      case 'claude':
        return generateClaudeResponse(requestEnvelope);
      case 'claude-mcp':
        return generateClaudeMCPResponse(requestEnvelope);
      case 'openai':
      default:
        return generateOpenAIResponse(requestEnvelope);
    }
  }
}

