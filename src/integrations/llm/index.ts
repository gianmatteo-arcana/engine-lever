import { LLMMessage } from './types';
import { generateOpenAIResponse } from './openai';

const PROVIDER = (import.meta.env.VITE_LLM_PROVIDER as string | undefined) ?? 'openai';

export async function generateResponse(messages: LLMMessage[]): Promise<string> {
  switch (PROVIDER) {
    case 'openai':
    default:
      return generateOpenAIResponse(messages);
  }
}
