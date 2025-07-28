import { LLMMessage } from './types';
import masterPrompt from '@/prompts/master_prompt.md?raw';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

export async function generateOpenAIResponse(messages: LLMMessage[]): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OpenAI API key');
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'system', content: masterPrompt }, ...messages],
    temperature: 0.2,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
