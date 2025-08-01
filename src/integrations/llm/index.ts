import { RequestEnvelope, ResponsePayload, LLMProvider } from './types';
import { generateOpenAIResponse } from './openai';
import { generateClaudeResponse } from './claude';
import { generateClaudeMCPResponse } from './claude-mcp';

let provider: LLMProvider = (import.meta.env.VITE_LLM_PROVIDER as LLMProvider | undefined) ?? 'openai';

export function setLLMProvider(newProvider: LLMProvider) {
  provider = newProvider;
}

export function getLLMProvider(): LLMProvider {
  return provider;
}

export async function generateResponse(
  requestEnvelope: RequestEnvelope,
  overrideProvider?: LLMProvider
): Promise<ResponsePayload> {
  const activeProvider = overrideProvider ?? provider;
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

