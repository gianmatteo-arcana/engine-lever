import { RequestEnvelope, ResponsePayload } from './types';
import { supabase } from "@/integrations/supabase/client";

export async function generateClaudeMCPResponse(
  requestEnvelope: RequestEnvelope
): Promise<ResponsePayload> {
  const startTime = Date.now();
  
  try {
    console.log('🔗 Starting Claude MCP request...');
    console.log('🔧 Session ID:', requestEnvelope.session_id);
    
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
    
    console.log(`⏱️ MCP request completed in ${duration}ms`);

    if (error) {
      console.error('🚨 SUPABASE FUNCTION ERROR DETAILS:');
      console.error('Error object:', error);
      console.error('Error message:', error?.message);
      console.error('Error details:', error?.details);
      console.error('Error hint:', error?.hint);
      console.error('Error code:', error?.code);
      
      // Check for common configuration issues
      if (error?.message?.includes('fetch')) {
        console.error('🚨 NETWORK/CONFIGURATION ISSUE DETECTED:');
        console.error('This suggests the MCP server URL might be wrong or the server is down');
        console.error('Check these in Supabase secrets:');
        console.error('  - MCP_SERVER_URL: Should be full URL with correct endpoint (e.g., /chat)');
        console.error('  - MCP_AUTH_TOKEN: Should be valid authentication token');
      }
      
      if (error?.message?.includes('404')) {
        console.error('🚨 404 ERROR - ENDPOINT NOT FOUND:');
        console.error('Your MCP server URL likely needs a specific path:');
        console.error('  - Try adding /chat to your URL');
        console.error('  - Try adding /completion to your URL');
        console.error('  - Try adding /api/chat to your URL');
      }
      
      if (error?.message?.includes('401') || error?.message?.includes('403')) {
        console.error('🚨 AUTHENTICATION ERROR:');
        console.error('Check your MCP_AUTH_TOKEN in Supabase secrets');
        console.error('Make sure the token is valid and has the right permissions');
      }
      
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

    // Check if it's a 404 error suggesting endpoint issue
    if (error.message && error.message.includes('404')) {
      console.error('🚨 MCP Server 404 Error - Possible Solutions:');
      console.error('   1. Check if your MCP server URL needs a specific path (e.g., /chat, /api/completion)');
      console.error('   2. Verify your server accepts POST requests');
      console.error('   3. Confirm the server is running and accessible');
      console.error('   Current URL configured in MCP_SERVER_URL secret');
    }

    // Re-throw the error to be handled by the caller
    throw error;
  }
}