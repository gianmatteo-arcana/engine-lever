import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestEnvelope {
  user_message: string;
  task?: any;
  business_profile?: any;
  memory_context?: string[];
  psych_state?: any;
  session_id?: string;
}

interface ResponsePayload {
  message: string;
  task_id?: string;
  actions: Array<{ label: string; instruction: string; }>;
  timestamp: string;
  dev_notes?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured in Supabase secrets');
    }

    const { requestEnvelope, masterPrompt } = await req.json();

    if (!requestEnvelope || !requestEnvelope.user_message) {
      throw new Error('RequestEnvelope with user_message is required');
    }

    // Assemble prompt according to Prompt-Assembly Protocol
    const promptSections = [];
    
    // Add master prompt
    if (masterPrompt) {
      promptSections.push(`### MASTER_PROMPT\n${masterPrompt}`);
    }
    
    // Add business profile if available
    if (requestEnvelope.business_profile) {
      promptSections.push(`### BUSINESS_PROFILE\n${JSON.stringify(requestEnvelope.business_profile, null, 2)}`);
    }
    
    // Add task context if available
    if (requestEnvelope.task) {
      promptSections.push(`### TASK_CONTEXT\n${JSON.stringify(requestEnvelope.task, null, 2)}`);
    }
    
    // Add memory context if available
    if (requestEnvelope.memory_context && requestEnvelope.memory_context.length > 0) {
      promptSections.push(`### MEMORY_CONTEXT\n${requestEnvelope.memory_context.join('\n')}`);
    }
    
    // Add psychological state if available
    if (requestEnvelope.psych_state) {
      promptSections.push(`### PSYCH_STATE\n${JSON.stringify(requestEnvelope.psych_state, null, 2)}`);
    }
    
    // Add user message
    promptSections.push(`### USER_MESSAGE\n${requestEnvelope.user_message}`);
    
    // Add response format instruction
    promptSections.push(`### RESPONSE_FORMAT\nRespond with a valid JSON object matching the ResponsePayload structure with message, actions array, and timestamp.`);
    
    const assembledPrompt = promptSections.join('\n\n');

    console.log('Calling OpenAI with assembled prompt');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'user', content: assembledPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI request failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content?.trim() ?? '';

    console.log('OpenAI response generated successfully');

    // Parse and validate ResponsePayload
    let responsePayload: ResponsePayload;
    try {
      responsePayload = JSON.parse(generatedText);
      
      console.log('=== PARSING AI RESPONSE ===');
      console.log('Raw AI response:', generatedText);
      console.log('Parsed payload:', JSON.stringify(responsePayload, null, 2));
      
      // Validate required fields
      if (!responsePayload.message || !Array.isArray(responsePayload.actions)) {
        console.error('=== VALIDATION FAILED ===');
        console.error('Message exists:', !!responsePayload.message);
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
      
    } catch (parseError) {
      console.error('Failed to parse ResponsePayload:', parseError);
      console.error('Raw response that failed to parse:', generatedText);
      // Fallback response
      responsePayload = {
        message: generatedText || "I'm sorry, I couldn't process your request properly.",
        actions: [],
        timestamp: new Date().toISOString(),
        dev_notes: `Parse error: ${parseError.message}`
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