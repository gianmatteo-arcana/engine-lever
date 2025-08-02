import { RequestEnvelope, ResponsePayload, LLMProvider } from './types';
import { supabase } from '../supabase/client';

// Default master prompt - can be overridden per request
const DEFAULT_MASTER_PROMPT = `You are Ally, an AI assistant for small business owners. You help with compliance, administrative tasks, and business operations. Always respond with valid JSON in the exact format specified.

Your response must be a JSON object with these fields:
- message: A helpful, conversational response to the user
- actions: An array of action objects with 'label' and 'instruction' fields
- timestamp: Current ISO timestamp

Example:
{
  "message": "I can help you with that task.",
  "actions": [
    {"label": "Get Started", "instruction": "Begin the process"}
  ],
  "timestamp": "${new Date().toISOString()}"
}`;

let provider: LLMProvider = (import.meta.env.VITE_LLM_PROVIDER as LLMProvider | undefined) ?? 'openai';

export function setLLMProvider(newProvider: LLMProvider) {
  provider = newProvider;
}

export function getLLMProvider(): LLMProvider {
  return provider;
}

export async function generateResponse(
  requestEnvelope: RequestEnvelope,
  overrideProvider?: LLMProvider,
  masterPrompt?: string
): Promise<ResponsePayload> {
  const activeProvider = overrideProvider ?? provider;
  const prompt = masterPrompt ?? DEFAULT_MASTER_PROMPT;
  
  try {
    // Use the existing chat-completion edge function which handles provider routing
    // This avoids client-side secret management and uses the server-side abstraction
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        requestEnvelope,
        provider: activeProvider,
        masterPrompt: prompt
      }
    });

    if (error) {
      console.error(`Error with ${activeProvider} provider via chat-completion:`, error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`Error with ${activeProvider} provider:`, error);
    
    // Fallback to direct edge function calls for backward compatibility
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

