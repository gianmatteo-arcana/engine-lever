import { RequestEnvelope, ResponsePayload } from './types';
import { supabase } from "@/integrations/supabase/client";

export async function generateClaudeMCPResponse(
  requestEnvelope: RequestEnvelope
): Promise<ResponsePayload> {
  const startTime = Date.now();
  
  try {
    console.log('🔗 Starting Claude MCP request...');
    
    // Call the chat-completion edge function with claude-mcp provider
    const { data, error } = await supabase.functions.invoke('chat-completion', {
      body: {
        requestEnvelope,
        provider: 'claude-mcp',
        masterPrompt: `You are Ally, an AI assistant for small business owners. You help with compliance, administrative tasks, and business operations. Always respond with valid JSON in the exact format specified.

Your response must be a JSON object with these fields:
- message: A helpful, conversational response to the user
- actions: An array of action objects with 'label' and 'instruction' fields
- timestamp: Current ISO timestamp

Example:
{
  "message": "I can help you with that task.",
  "actions": [
    {"label": "Get Started", "instruction": "Begin the process"}
  ],
  "timestamp": "${new Date().toISOString()}"
}`
      }
    });

    const duration = Date.now() - startTime;

    if (error) {
      console.error('❌ Supabase function error:', error);
      throw error;
    }

    if (!data) {
      console.error('❌ No data returned from chat-completion function');
      throw new Error('No response data received from MCP server');
    }

    // Validate the response structure
    if (!data.message || !Array.isArray(data.actions)) {
      console.error('❌ Invalid response structure:', data);
      throw new Error('Invalid response structure from MCP server');
    }

    console.log(`✅ Claude MCP response received (${duration}ms)`);
    console.log('Actions count:', data.actions?.length || 0);

    // Log development information if in dev mode
    if (requestEnvelope.env === 'dev') {
      console.log('🔧 DEV MODE: Claude MCP Response Details');
      console.log('Response message length:', data.message?.length || 0);
      console.log('Actions:', data.actions);
      console.log('Duration:', duration + 'ms');
      
      if (data.dev_notes) {
        console.log('Dev notes:', data.dev_notes);
      }
    }

    return {
      message: data.message,
      task_id: data.task_id,
      actions: data.actions || [],
      timestamp: data.timestamp || new Date().toISOString(),
      dev_notes: data.dev_notes
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Claude MCP error (${duration}ms):`, error);
    
    // Log detailed error information
    console.error('Error details:', {
      type: error.constructor.name,
      message: error.message,
      duration: duration + 'ms',
      requestId: requestEnvelope.session_id
    });

    // Re-throw the error to be handled by the caller
    throw error;
  }
}