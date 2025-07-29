import { RequestEnvelope, ResponsePayload } from './types';
import { supabase } from '@/integrations/supabase/client';
import masterPrompt from '@/prompts/master_prompt.md?raw';

export async function generateOpenAIResponse(requestEnvelope: RequestEnvelope): Promise<ResponsePayload> {
  const requestId = requestEnvelope.session_id || 'unknown';
  const startTime = performance.now();
  
  try {
    console.log("=== CLIENT CALLING EDGE FUNCTION ===", requestId);
    console.log("Request envelope keys:", Object.keys(requestEnvelope));
    console.log("Environment mode:", requestEnvelope.env);
    
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        requestEnvelope,
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
    }

    return data as ResponsePayload;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.error('=== OPENAI INTEGRATION ERROR ===', requestId);
    console.error('Error duration:', `${duration.toFixed(2)}ms`);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}
