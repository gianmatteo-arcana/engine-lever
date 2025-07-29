import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

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
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured in Supabase secrets');
    }

    const { requestEnvelope, masterPrompt } = await req.json();

    if (!requestEnvelope || !requestEnvelope.user_message) {
      throw new Error('RequestEnvelope with user_message is required');
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

    console.log('Calling OpenAI with assembled prompt');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      if (isDev) {
        console.log('Raw AI response:', generatedText);
        console.log('Parsed payload:', JSON.stringify(responsePayload, null, 2));
      }
      
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