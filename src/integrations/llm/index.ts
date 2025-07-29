import { RequestEnvelope, ResponsePayload } from './types';
import { generateOpenAIResponse } from './openai';

const PROVIDER = (import.meta.env.VITE_LLM_PROVIDER as string | undefined) ?? 'openai';

export async function generateResponse(requestEnvelope: RequestEnvelope): Promise<ResponsePayload> {
  switch (PROVIDER) {
    case 'openai':
    default:
      return generateOpenAIResponse(requestEnvelope);
  }
}
