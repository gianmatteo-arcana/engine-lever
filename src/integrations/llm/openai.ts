import { LLMMessage } from './types';
import { supabase } from '@/integrations/supabase/client';
import masterPrompt from '@/prompts/master_prompt.md?raw';

export async function generateOpenAIResponse(messages: LLMMessage[]): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        messages,
        masterPrompt
      }
    });

    if (error) {
      console.error('Supabase function error:', error);
      throw new Error(`Chat completion failed: ${error.message}`);
    }

    if (!data?.content) {
      throw new Error('No content received from chat completion');
    }

    return data.content;
  } catch (error) {
    console.error('OpenAI integration error:', error);
    throw error;
  }
}
