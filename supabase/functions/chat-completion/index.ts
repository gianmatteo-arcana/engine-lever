import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const mcpServerUrl = Deno.env.get('MCP_SERVER_URL');
const mcpAuthToken = Deno.env.get('MCP_AUTH_TOKEN');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestEnvelope {
  user_message: string;
  task_prompt?: string;
  task?: any;
  business_profile?: any;
  memory_context?: string[];
  psych_state?: any;
  session_id?: string;
  env?: 'production' | 'dev';
}

interface ResponsePayload {
  message: string;
  task_id?: string;
  actions: Array<{ label: string; instruction: string; }>;
  timestamp: string;
  dev_notes?: string;
}

// Helper function to get formatted section or "NONE"
function getFormattedSection(data: any, sectionName: string): string {
  if (!data) return "NONE";
  
  if (typeof data === 'string') {
    return data.trim() || "NONE";
  }
  
  if (Array.isArray(data)) {
    return data.length > 0 ? JSON.stringify(data, null, 2) : "NONE";
  }
  
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return keys.length > 0 ? JSON.stringify(data, null, 2) : "NONE";
  }
  
  return "NONE";
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requestEnvelope, provider: reqProvider, masterPrompt } = await req.json();

    if (!requestEnvelope || !requestEnvelope.user_message) {
      throw new Error('RequestEnvelope with user_message is required');
    }

    const provider = (reqProvider ?? Deno.env.get('LLM_PROVIDER') ?? 'openai') as 'openai' | 'claude' | 'claude-mcp';
    if (provider !== 'openai' && provider !== 'claude' && provider !== 'claude-mcp') {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const isDev = requestEnvelope.env === 'dev';

    // Assemble prompt according to EXACT Prompt-Assembly Protocol
    const promptSections = [];
    
    // 1. SYSTEM_PROMPT (was MASTER_PROMPT)
    promptSections.push(`### SYSTEM_PROMPT`);
    promptSections.push(masterPrompt || "NONE");
    
    // 2. TASK_PROMPT
    promptSections.push(`### TASK_PROMPT`);
    promptSections.push(getFormattedSection(requestEnvelope.task_prompt, "TASK_PROMPT"));
    
    // 3. TASK (was TASK_CONTEXT)
    promptSections.push(`### TASK`);
    promptSections.push(getFormattedSection(requestEnvelope.task, "TASK"));
    
    // 4. MEMORY_CONTEXT
    promptSections.push(`### MEMORY_CONTEXT`);
    promptSections.push(getFormattedSection(requestEnvelope.memory_context, "MEMORY_CONTEXT"));
    
    // 5. BUSINESS_PROFILE
    promptSections.push(`### BUSINESS_PROFILE`);
    promptSections.push(getFormattedSection(requestEnvelope.business_profile, "BUSINESS_PROFILE"));
    
    // 6. PSYCH_STATE
    promptSections.push(`### PSYCH_STATE`);
    promptSections.push(getFormattedSection(requestEnvelope.psych_state, "PSYCH_STATE"));
    
    // 7. USER_MESSAGE
    promptSections.push(`### USER_MESSAGE`);
    promptSections.push(getFormattedSection(requestEnvelope.user_message, "USER_MESSAGE"));
    
    const assembledPrompt = promptSections.join('\n');

    // Extensive DEV MODE logging
    if (isDev) {
      console.log('\n🔧 === DEV MODE: PROMPT ASSEMBLY PROTOCOL COMPLIANCE ===');
      console.log('📋 Section order validation:');
      console.log('1. ✅ SYSTEM_PROMPT');
      console.log('2. ✅ TASK_PROMPT');
      console.log('3. ✅ TASK');
      console.log('4. ✅ MEMORY_CONTEXT');
      console.log('5. ✅ BUSINESS_PROFILE');
      console.log('6. ✅ PSYCH_STATE');
      console.log('7. ✅ USER_MESSAGE');
      
      console.log('\n📝 Individual sections:');
      console.log('SYSTEM_PROMPT length:', (masterPrompt || "NONE").length);
      console.log('TASK_PROMPT:', requestEnvelope.task_prompt || "NONE");
      console.log('TASK:', requestEnvelope.task ? JSON.stringify(requestEnvelope.task, null, 2) : "NONE");
      console.log('MEMORY_CONTEXT:', requestEnvelope.memory_context || "NONE");
      console.log('BUSINESS_PROFILE:', requestEnvelope.business_profile ? JSON.stringify(requestEnvelope.business_profile, null, 2) : "NONE");
      console.log('PSYCH_STATE:', requestEnvelope.psych_state ? JSON.stringify(requestEnvelope.psych_state, null, 2) : "NONE");
      console.log('USER_MESSAGE:', requestEnvelope.user_message || "NONE");
      
      console.log('\n🎯 FULL ASSEMBLED PROMPT:');
      console.log('==========================================');
      console.log(assembledPrompt);
      console.log('==========================================');
      console.log('Total prompt length:', assembledPrompt.length);
    }

    const llmStartTime = Date.now();
    console.log(`=== CALLING ${provider.toUpperCase()} API ===`);
    console.log('Request ID:', requestEnvelope.session_id);
    console.log('Prompt length:', assembledPrompt.length);

    if (isDev) {
      console.log(`=== FULL PROMPT BEING SENT TO ${provider.toUpperCase()} ===`);
      console.log(assembledPrompt);
      console.log('=== END PROMPT ===');
    }

    let response: Response;
    if (provider === 'claude') {
      if (!anthropicApiKey) {
        throw new Error('Anthropic API key not configured in Supabase secrets');
      }
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': `${anthropicApiKey}`,
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
    } else if (provider === 'claude-mcp') {
      if (!mcpServerUrl) {
        throw new Error('MCP Server URL not configured in Supabase secrets');
      }
      if (!mcpAuthToken) {
        throw new Error('MCP Auth Token not configured in Supabase secrets');
      }
      
      console.log(`=== CALLING CLAUDE MCP SERVER ===`);
      console.log('MCP Server URL:', mcpServerUrl);
      console.log('Auth token present:', !!mcpAuthToken);
      
      response = await fetch(mcpServerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mcpAuthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: assembledPrompt,
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          temperature: 0.2
        })
      });
    } else {
      if (!openAIApiKey) {
        throw new Error('OpenAI API key not configured in Supabase secrets');
      }
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
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
    }

    const llmEndTime = Date.now();
    const llmDuration = llmEndTime - llmStartTime;

    console.log(`=== ${provider.toUpperCase()} API RESPONSE ===`);
    console.log('Duration:', `${llmDuration}ms`);
    console.log('Status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`=== ${provider.toUpperCase()} API ERROR ===`);
      console.error('Status:', response.status);
      console.error('Error data:', errorData);
      console.error('Request ID:', requestEnvelope.session_id);
      throw new Error(`${provider} request failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    let generatedText = '';
    if (provider === 'claude') {
      generatedText = data.content?.[0]?.text?.trim() ?? '';
    } else if (provider === 'claude-mcp') {
      // Handle MCP server response format
      generatedText = data.response?.trim() ?? data.content?.trim() ?? '';
    } else {
      generatedText = data.choices?.[0]?.message?.content?.trim() ?? '';
    }

    console.log(`=== RAW ${provider.toUpperCase()} RESPONSE ===`);
    console.log('Response length:', generatedText.length);
    console.log('Usage tokens:', data.usage);
    
    if (isDev) {
      console.log('=== FULL RAW RESPONSE ===');
      console.log(generatedText);
      console.log('=== END RAW RESPONSE ===');
    }

    // Validate response format before parsing
    if (!generatedText.trim().startsWith('{')) {
      console.error('=== INVALID RESPONSE FORMAT ===');
      console.error('Request ID:', requestEnvelope.session_id);
      console.error('Response does not start with JSON - starts with:', generatedText.substring(0, 50));
      console.error('Raw response length:', generatedText.length);
      
      if (isDev) {
        console.error('=== DEV MODE: HARD FAILURE FOR NON-JSON RESPONSE ===');
        console.error('Full raw response:', generatedText);
        return new Response(JSON.stringify({
          error: 'LLM_PARSE_ERROR',
          message: 'LLM returned prose instead of JSON in DEV mode',
          details: {
            responsePreview: generatedText.substring(0, 500),
            responseLength: generatedText.length,
            expectedFormat: 'JSON object starting with {',
            actualStart: generatedText.substring(0, 50),
            requestId: requestEnvelope.session_id,
            provider: provider
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 422
        });
      }
    }

    // Parse and validate ResponsePayload
    let responsePayload: ResponsePayload;
    try {
      console.log('=== PARSING JSON RESPONSE ===');
      responsePayload = JSON.parse(generatedText);
      
      console.log('=== JSON PARSE SUCCESS ===');
      console.log('Parsed keys:', Object.keys(responsePayload));
      
      if (isDev) {
        console.log('=== PARSED PAYLOAD STRUCTURE ===');
        console.log('Message type:', typeof responsePayload.message);
        console.log('Message length:', responsePayload.message?.length || 0);
        console.log('Actions type:', typeof responsePayload.actions);
        console.log('Actions is array:', Array.isArray(responsePayload.actions));
        console.log('Actions length:', responsePayload.actions?.length || 0);
        console.log('Full parsed payload:', JSON.stringify(responsePayload, null, 2));
      }
      
      // Validate required fields
      const hasValidMessage = responsePayload.message && typeof responsePayload.message === 'string';
      const hasValidActions = Array.isArray(responsePayload.actions);
      
      console.log('=== VALIDATION CHECK ===');
      console.log('Valid message:', hasValidMessage);
      console.log('Valid actions:', hasValidActions);
      
      if (!hasValidMessage || !hasValidActions) {
        console.error('=== VALIDATION FAILED ===');
        console.error('Message exists:', !!responsePayload.message);
        console.error('Message type:', typeof responsePayload.message);
        console.error('Actions exists:', !!responsePayload.actions);
        console.error('Actions is array:', Array.isArray(responsePayload.actions));
        console.error('Actions value:', responsePayload.actions);
        throw new Error('Invalid ResponsePayload structure');
      }
      
      // Ensure timestamp is set
      if (!responsePayload.timestamp) {
        responsePayload.timestamp = new Date().toISOString();
      }
      
      console.log('=== VALIDATION PASSED ===');
      console.log('Actions count:', responsePayload.actions.length);
      
      if (responsePayload.actions.length > 0) {
        console.log('=== ACTIONS FOUND ===');
        responsePayload.actions.forEach((action, index) => {
          console.log(`Action ${index + 1}:`, {
            label: action.label,
            instruction: action.instruction?.substring(0, 50) + '...'
          });
        });
      }
      
    } catch (parseError) {
      console.error('=== JSON PARSE ERROR ===');
      console.error('Parse error:', parseError.message);
      console.error('Raw text length:', generatedText.length);
      console.error('Raw text preview:', generatedText.substring(0, 200) + '...');
      console.error('Request ID:', requestEnvelope.session_id);
      
      if (isDev) {
        console.error('=== DEV MODE: HARD FAILURE FOR JSON PARSE ERROR ===');
        console.error('Full raw response:', generatedText);
        return new Response(JSON.stringify({
          error: 'LLM_JSON_PARSE_ERROR',
          message: 'Failed to parse LLM response as JSON in DEV mode',
          details: {
            parseError: parseError.message,
            responsePreview: generatedText.substring(0, 500),
            responseLength: generatedText.length,
            requestId: requestEnvelope.session_id,
            provider: provider,
            troubleshooting: 'LLM returned invalid JSON format - check master prompt instructions'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 422
        });
      }
      
      // Fallback response for production
      responsePayload = {
        message: generatedText || "I'm sorry, I couldn't process your request properly.",
        actions: [],
        timestamp: new Date().toISOString(),
        dev_notes: `Parse error: ${parseError.message}. Raw response length: ${generatedText.length}`
      };
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in chat-completion function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      details: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});