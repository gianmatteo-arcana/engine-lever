import { RequestEnvelope, ResponsePayload } from './types';
import { supabase } from '@/integrations/supabase/client';
import masterPrompt from '@/prompts/master_prompt.md?raw';

export async function generateOpenAIResponse(requestEnvelope: RequestEnvelope): Promise<ResponsePayload> {
  try {
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        requestEnvelope,
        masterPrompt
      }
    });

    if (error) {
      console.error('Supabase function error:', error);
      throw new Error(`Chat completion failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data received from chat completion');
    }

    // Validate ResponsePayload structure
    if (!data.message || !Array.isArray(data.actions)) {
      throw new Error('Invalid ResponsePayload structure received');
    }

    return data as ResponsePayload;
  } catch (error) {
    console.error('OpenAI integration error:', error);
    throw error;
  }
}
