import { BaseLLMProvider } from './base';
import { RequestEnvelope, ResponsePayload } from '../types';

export class ClaudeMCPProvider extends BaseLLMProvider {
  constructor(
    private mcpServerUrl: string,
    private mcpAuthToken: string
  ) {
    super();
  }

  async generateResponse(
    requestEnvelope: RequestEnvelope,
    masterPrompt: string
  ): Promise<ResponsePayload> {
    const assembledPrompt = this.assemblePrompt(requestEnvelope, masterPrompt);
    this.logDevMode(requestEnvelope, assembledPrompt);

    const llmStartTime = Date.now();
    console.log('=== CALLING CLAUDE MCP SERVER ===');
    console.log('Request ID:', requestEnvelope.session_id);
    console.log('MCP Server URL:', this.mcpServerUrl);
    console.log('Auth token present:', !!this.mcpAuthToken);

    // Try GET request first since your server responds to GET
    const searchParams = new URLSearchParams({
      prompt: assembledPrompt,
      model: 'claude-3-haiku-20240307',
      max_tokens: '1024',
      temperature: '0.2'
    });

    const getUrl = `${this.mcpServerUrl}?${searchParams.toString()}`;

    let response = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.mcpAuthToken}`,
        'Accept': 'application/json',
      }
    });

    // If GET fails, try POST as fallback
    if (!response.ok && response.status === 404) {
      console.log('GET request failed, trying POST...');
      response = await fetch(this.mcpServerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.mcpAuthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: assembledPrompt,
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          temperature: 0.2
        })
      });
    }

    const llmDuration = Date.now() - llmStartTime;
    console.log('=== CLAUDE MCP RESPONSE ===');
    console.log('Duration:', `${llmDuration}ms`);
    console.log('Status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('=== CLAUDE MCP ERROR ===');
      console.error('Status:', response.status);
      console.error('Error data:', errorData);
      throw new Error(`Claude MCP request failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    // Handle MCP server response format
    const generatedText = data.response?.trim() ?? data.content?.trim() ?? '';

    console.log('=== RAW CLAUDE MCP RESPONSE ===');
    console.log('Response length:', generatedText.length);

    if (requestEnvelope.env === 'dev') {
      console.log('=== FULL RAW RESPONSE ===');
      console.log(generatedText);
      console.log('=== END RAW RESPONSE ===');
    }

    return this.parseAndValidateResponse(generatedText, requestEnvelope, 'Claude-MCP');
  }
}