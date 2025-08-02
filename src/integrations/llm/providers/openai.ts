import { BaseLLMProvider } from './base';
import { RequestEnvelope, ResponsePayload } from '../types';

export class OpenAIProvider extends BaseLLMProvider {
  constructor(private apiKey: string) {
    super();
  }

  async generateResponse(
    requestEnvelope: RequestEnvelope,
    masterPrompt: string
  ): Promise<ResponsePayload> {
    const assembledPrompt = this.assemblePrompt(requestEnvelope, masterPrompt);
    this.logDevMode(requestEnvelope, assembledPrompt);

    const llmStartTime = Date.now();
    console.log('=== CALLING OPENAI API ===');
    console.log('Request ID:', requestEnvelope.session_id);
    console.log('Prompt length:', assembledPrompt.length);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: assembledPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
    });

    const llmDuration = Date.now() - llmStartTime;
    console.log('=== OPENAI API RESPONSE ===');
    console.log('Duration:', `${llmDuration}ms`);
    console.log('Status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('=== OPENAI API ERROR ===');
      console.error('Status:', response.status);
      console.error('Error data:', errorData);
      throw new Error(`OpenAI request failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content?.trim() ?? '';

    console.log('=== RAW OPENAI RESPONSE ===');
    console.log('Response length:', generatedText.length);
    console.log('Usage tokens:', data.usage);

    if (requestEnvelope.env === 'dev') {
      console.log('=== FULL RAW RESPONSE ===');
      console.log(generatedText);
      console.log('=== END RAW RESPONSE ===');
    }

    return this.parseAndValidateResponse(generatedText, requestEnvelope, 'OpenAI');
  }
}