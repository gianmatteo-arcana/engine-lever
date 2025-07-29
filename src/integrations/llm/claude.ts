import { RequestEnvelope, ResponsePayload } from './types';
import { supabase } from '@/integrations/supabase/client';
import masterPrompt from '@/prompts/master_prompt.md?raw';

export async function generateClaudeResponse(requestEnvelope: RequestEnvelope): Promise<ResponsePayload> {
  const requestId = requestEnvelope.session_id || 'unknown';
  const startTime = performance.now();

  try {
    console.log("=== CLIENT CALLING EDGE FUNCTION ===", requestId);
    console.log("Request envelope keys:", Object.keys(requestEnvelope));
    console.log("Environment mode:", requestEnvelope.env);

    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        requestEnvelope,
        provider: 'claude',
        masterPrompt
      }
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    if (error) {
      console.error('=== SUPABASE FUNCTION ERROR ===', requestId);
      console.error('Error details:', error);
      console.error('Request duration:', `${duration.toFixed(2)}ms`);
      throw new Error(`Chat completion failed: ${error.message}`);
    }

    if (!data) {
      console.error('=== NO DATA RECEIVED ===', requestId);
      console.error('Request duration:', `${duration.toFixed(2)}ms`);
      throw new Error('No data received from chat completion');
    }

    console.log("=== EDGE FUNCTION RESPONSE RECEIVED ===", requestId);
    console.log("Response duration:", `${duration.toFixed(2)}ms`);
    console.log("Response data keys:", Object.keys(data));

    // Check for DEV mode JSON parse errors first
    if (requestEnvelope.env === 'dev' && data.error) {
      console.error('=== DEV MODE: LLM ERROR DETECTED ===', requestId);
      console.error('Error type:', data.error);
      console.error('Error details:', data.details);
      
      // Log to DevConsole for high visibility
      if ((window as any).devConsoleLog) {
        (window as any).devConsoleLog({
          type: 'error',
          message: `[CRITICAL] ${data.error}: ${data.message}`,
          data: data.details
        });
      }
      
      throw new Error(`DEV MODE: ${data.error} - ${data.message}. Check DevConsole for details.`);
    }

    // Check for parse errors in dev_notes
    if (requestEnvelope.env === 'dev' && data.dev_notes && data.dev_notes.includes('Parse error:')) {
      console.error('=== DEV MODE: JSON PARSE ERROR IN RESPONSE ===', requestId);
      console.error('Dev notes:', data.dev_notes);
      
      // Log to DevConsole for high visibility
      if ((window as any).devConsoleLog) {
        (window as any).devConsoleLog({
          type: 'error',
          message: `[CRITICAL] Claude returned invalid JSON format`,
          data: {
            devNotes: data.dev_notes,
            responseData: data,
            requestId: requestId,
            troubleshooting: 'Claude did not follow JSON-only output instructions'
          }
        });
      }
      
      throw new Error(`DEV MODE: Claude JSON parse error detected - ${data.dev_notes}`);
    }

    // Validate ResponsePayload structure
    if (!data.message || !Array.isArray(data.actions)) {
      console.error('=== INVALID RESPONSE PAYLOAD ===', requestId);
      console.error('Expected: { message: string, actions: Action[] }');
      console.error('Received keys:', Object.keys(data));
      console.error('Message exists:', !!data.message);
      console.error('Actions is array:', Array.isArray(data.actions));
      console.error('Full data:', JSON.stringify(data, null, 2));
      throw new Error('Invalid ResponsePayload structure received');
    }

    console.log("=== VALID RESPONSE PAYLOAD RECEIVED ===", requestId);
    console.log("Message length:", data.message.length);
    console.log("Actions count:", data.actions.length);
    console.log("Response timestamp:", data.timestamp);

    if (requestEnvelope.env === 'dev') {
    console.log("=== DEV MODE: FULL RESPONSE ===", requestId);
    console.log("Message content:", data.message);
    console.log("Actions:", data.actions);
    if (data.dev_notes) {
      console.log("Dev notes:", data.dev_notes);
    }

    // Log to DevConsole in DEV MODE
    if ((window as any).devConsoleLog) {
      (window as any).devConsoleLog({
        type: 'info',
        message: `[DEV] Parsed Request Envelope - Session: ${requestId}`,
        data: requestEnvelope
      });

      (window as any).devConsoleLog({
        type: 'info',
        message: `[DEV] Validated Response Payload - Session: ${requestId}`,
        data: data
      });
    }
    }

    return data as ResponsePayload;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.error('=== CLAUDE INTEGRATION ERROR ===', requestId);
    console.error('Error duration:', `${duration.toFixed(2)}ms`);
    console.error('Error type:', (error as any).constructor.name);
    console.error('Error message:', (error as any).message);
    console.error('Full error:', error);
    throw error;
  }
}
