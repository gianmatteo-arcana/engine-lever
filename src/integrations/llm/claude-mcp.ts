import { RequestEnvelope, ResponsePayload } from './types';
import { supabase } from "@/integrations/supabase/client";

export async function generateClaudeMCPResponse(
  requestEnvelope: RequestEnvelope
): Promise<ResponsePayload> {
  const requestId = requestEnvelope.session_id || 'unknown';
  const startTime = performance.now();
  
  try {
    console.log("=== CLAUDE MCP CLIENT REQUEST ===", requestId);
    console.log("Request envelope keys:", Object.keys(requestEnvelope));
    console.log("Environment mode:", requestEnvelope.env);
    console.log('🔗 Starting Claude MCP request...');
    console.log('🔧 Session ID:', requestEnvelope.session_id);
    
    // Call the new claude-mcp proxy edge function
    const { data, error } = await supabase.functions.invoke('claude-mcp', {
      body: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "claude_query",
          arguments: {
            prompt: `You are Ally, an AI assistant for small business owners. You help with compliance, administrative tasks, and business operations. Always respond with valid JSON in the exact format specified.

Your response must be a JSON object with these fields:
- message: A helpful, conversational response to the user
- actions: An array of action objects with 'label' and 'instruction' fields
- timestamp: Current ISO timestamp

User Message: ${requestEnvelope.user_message}
Business Profile: ${JSON.stringify(requestEnvelope.business_profile)}
Task Context: ${JSON.stringify(requestEnvelope.task)}

Example Response:
{
  "message": "I can help you with that task.",
  "actions": [
    {"label": "Get Started", "instruction": "Begin the process"}
  ],
  "timestamp": "${new Date().toISOString()}"
}`
          }
        },
        id: requestEnvelope.session_id || "1"
      }
    });

    const duration = Date.now() - startTime;
    
    console.log(`⏱️ MCP request completed in ${duration}ms`);

    if (error) {
      console.error('=== CLAUDE MCP PROXY ERROR ===', requestId);
      console.error('Error details:', error);
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      console.error('Error status:', error?.status);
      console.error('Request duration:', `${(performance.now() - startTime).toFixed(2)}ms`);
      
      // Log to DevConsole for high visibility
      if ((window as any).devConsoleLog) {
        (window as any).devConsoleLog({
          type: 'error',
          message: `[CRITICAL] Claude MCP Error: ${error.message}`,
          data: {
            error: error,
            requestId: requestId,
            duration: `${(performance.now() - startTime).toFixed(2)}ms`
          }
        });
      }
      
      // Check for specific error details in the response
      if (error?.context?.body) {
        const errorBody = error.context.body;
        console.error('Error body from function:', errorBody);
        
        if (errorBody.error?.includes('MCP_API_KEY')) {
          console.error('🚨 MCP API KEY MISSING OR INVALID:');
          console.error('Please ensure MCP_API_KEY is configured in Supabase secrets');
          console.error('Expected format: mcp_[64-character-hex-string]');
        }
        
        if (errorBody.error?.includes('MCP_AUTH_TOKEN')) {
          console.error('🚨 MCP AUTH TOKEN MISSING OR INVALID:');
          console.error('Please ensure MCP_AUTH_TOKEN is configured in Supabase secrets');
          console.error('This should be your Google OAuth JWT token');
        }
        
        // Throw a more specific error
        throw new Error(errorBody.error || error.message);
      }
      
      throw error;
    }

    if (!data) {
      console.error('❌ No data returned from claude-mcp proxy');
      throw new Error('No response data received from MCP proxy');
    }

    // Parse the MCP response
    let mcpResponse;
    try {
      if (typeof data === 'string') {
        mcpResponse = JSON.parse(data);
      } else {
        mcpResponse = data;
      }
    } catch (parseError) {
      console.error('❌ Failed to parse MCP response:', parseError);
      console.error('Raw response:', data);
      throw new Error('Invalid JSON response from MCP server');
    }

    // Extract the actual response from MCP format
    let responseData;
    if (mcpResponse.result && mcpResponse.result.content) {
      // Handle MCP tool response format
      const content = mcpResponse.result.content;
      if (Array.isArray(content) && content[0]?.text) {
        try {
          responseData = JSON.parse(content[0].text);
        } catch (e) {
          responseData = { message: content[0].text, actions: [], timestamp: new Date().toISOString() };
        }
      } else {
        responseData = { message: content, actions: [], timestamp: new Date().toISOString() };
      }
    } else if (mcpResponse.message || mcpResponse.actions) {
      // Direct response format
      responseData = mcpResponse;
    } else {
      console.error('❌ Unexpected MCP response format:', mcpResponse);
      throw new Error('Unexpected response format from MCP server');
    }

    console.log(`✅ Claude MCP response received (${duration}ms)`);
    console.log('Actions count:', responseData.actions?.length || 0);

    // Log development information if in dev mode
    if (requestEnvelope.env === 'dev') {
      console.log('🔧 DEV MODE: Claude MCP Response Details');
      console.log('Response message length:', responseData.message?.length || 0);
      console.log('Actions:', responseData.actions);
      console.log('Duration:', duration + 'ms');
      console.log('Raw MCP Response:', mcpResponse);
      
      // Log to DevConsole in DEV MODE
      if ((window as any).devConsoleLog) {
        (window as any).devConsoleLog({
          type: 'info',
          message: `[DEV] Claude MCP Request - Session: ${requestId}`,
          data: requestEnvelope
        });

        (window as any).devConsoleLog({
          type: 'info',
          message: `[DEV] Claude MCP Response - Session: ${requestId}`,
          data: responseData
        });
      }
    }

    return {
      message: responseData.message,
      task_id: responseData.task_id,
      actions: responseData.actions || [],
      timestamp: responseData.timestamp || new Date().toISOString(),
      dev_notes: responseData.dev_notes
    };

  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.error('=== CLAUDE MCP INTEGRATION ERROR ===', requestId);
    console.error('Error duration:', `${duration.toFixed(2)}ms`);
    console.error('Error type:', (error as any).constructor.name);
    console.error('Error message:', (error as any).message);
    console.error('Full error:', error);
    console.error('Error stack:', (error as any).stack);
    console.error('Full error object:', error);
    
    // Log to DevConsole for high visibility
    if ((window as any).devConsoleLog) {
      (window as any).devConsoleLog({
        type: 'error',
        message: `[CRITICAL] Claude MCP Integration Failed: ${(error as any).message}`,
        data: {
          error: error,
          requestId: requestId,
          duration: `${duration.toFixed(2)}ms`,
          provider: 'claude-mcp'
        }
      });
    }

    // Check if it's a 404 error suggesting endpoint issue
    if ((error as any).message && (error as any).message.includes('404')) {
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