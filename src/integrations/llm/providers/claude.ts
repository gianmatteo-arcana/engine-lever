import { BaseLLMProvider } from './base';
import { RequestEnvelope, ResponsePayload } from '../types';

export class ClaudeProvider extends BaseLLMProvider {
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
    console.log('=== CALLING CLAUDE API ===');
    console.log('Request ID:', requestEnvelope.session_id);
    console.log('Prompt length:', assembledPrompt.length);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': `${this.apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: 'user', content: assembledPrompt }]
      })
    });

    const llmDuration = Date.now() - llmStartTime;
    console.log('=== CLAUDE API RESPONSE ===');
    console.log('Duration:', `${llmDuration}ms`);
    console.log('Status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('=== CLAUDE API ERROR ===');
      console.error('Status:', response.status);
      console.error('Error data:', errorData);
      throw new Error(`Claude request failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const generatedText = data.content?.[0]?.text?.trim() ?? '';

    console.log('=== RAW CLAUDE RESPONSE ===');
    console.log('Response length:', generatedText.length);
    console.log('Usage tokens:', data.usage);

    if (requestEnvelope.env === 'dev') {
      console.log('=== FULL RAW RESPONSE ===');
      console.log(generatedText);
      console.log('=== END RAW RESPONSE ===');
    }

    return this.parseAndValidateResponse(generatedText, requestEnvelope, 'Claude');
  }
}