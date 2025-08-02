import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Provider interface
interface LLMProviderInterface {
  generateResponse(
    requestEnvelope: RequestEnvelope,
    masterPrompt: string
  ): Promise<ResponsePayload>;
}

// Base provider class with common functionality
abstract class BaseLLMProvider implements LLMProviderInterface {
  protected getFormattedSection(data: any, sectionName: string): string {
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

  protected assemblePrompt(requestEnvelope: RequestEnvelope, masterPrompt: string): string {
    const promptSections = [];
    
    // Follow the EXACT Prompt-Assembly Protocol
    promptSections.push(`### SYSTEM_PROMPT`);
    promptSections.push(masterPrompt || "NONE");
    
    promptSections.push(`### TASK_PROMPT`);
    promptSections.push(this.getFormattedSection(requestEnvelope.task_prompt, "TASK_PROMPT"));
    
    promptSections.push(`### TASK`);
    promptSections.push(this.getFormattedSection(requestEnvelope.task, "TASK"));
    
    promptSections.push(`### MEMORY_CONTEXT`);
    promptSections.push(this.getFormattedSection(requestEnvelope.memory_context, "MEMORY_CONTEXT"));
    
    promptSections.push(`### BUSINESS_PROFILE`);
    promptSections.push(this.getFormattedSection(requestEnvelope.business_profile, "BUSINESS_PROFILE"));
    
    promptSections.push(`### PSYCH_STATE`);
    promptSections.push(this.getFormattedSection(requestEnvelope.psych_state, "PSYCH_STATE"));
    
    promptSections.push(`### USER_MESSAGE`);
    promptSections.push(this.getFormattedSection(requestEnvelope.user_message, "USER_MESSAGE"));
    
    return promptSections.join('\n');
  }

  protected logDevMode(requestEnvelope: RequestEnvelope, assembledPrompt: string): void {
    if (requestEnvelope.env === 'dev') {
      console.log('\n🔧 === DEV MODE: PROMPT ASSEMBLY PROTOCOL COMPLIANCE ===');
      console.log('📋 Section order validation:');
      console.log('1. ✅ SYSTEM_PROMPT');
      console.log('2. ✅ TASK_PROMPT');
      console.log('3. ✅ TASK');
      console.log('4. ✅ MEMORY_CONTEXT');
      console.log('5. ✅ BUSINESS_PROFILE');
      console.log('6. ✅ PSYCH_STATE');
      console.log('7. ✅ USER_MESSAGE');
      
      console.log('\n🎯 FULL ASSEMBLED PROMPT:');
      console.log('==========================================');
      console.log(assembledPrompt);
      console.log('==========================================');
      console.log('Total prompt length:', assembledPrompt.length);
    }
  }

  protected parseAndValidateResponse(
    generatedText: string,
    requestEnvelope: RequestEnvelope,
    providerName: string
  ): ResponsePayload {
    const isDev = requestEnvelope.env === 'dev';

    // Validate response format before parsing
    if (!generatedText.trim().startsWith('{')) {
      console.error('=== INVALID RESPONSE FORMAT ===');
      console.error('Request ID:', requestEnvelope.session_id);
      console.error('Response does not start with JSON - starts with:', generatedText.substring(0, 50));
      
      if (isDev) {
        throw new Error(`LLM_PARSE_ERROR: ${providerName} returned prose instead of JSON in DEV mode`);
      }
      
      // Fallback for production
      return {
        message: generatedText || "I'm sorry, I couldn't process your request properly.",
        actions: [],
        timestamp: new Date().toISOString(),
        dev_notes: `Parse error: Non-JSON response from ${providerName}`
      };
    }

    try {
      const responsePayload = JSON.parse(generatedText);
      
      // Validate required fields
      const hasValidMessage = responsePayload.message && typeof responsePayload.message === 'string';
      const hasValidActions = Array.isArray(responsePayload.actions);
      
      if (!hasValidMessage || !hasValidActions) {
        throw new Error('Invalid ResponsePayload structure');
      }
      
      // Ensure timestamp is set
      if (!responsePayload.timestamp) {
        responsePayload.timestamp = new Date().toISOString();
      }
      
      if (isDev) {
        console.log('=== PARSED PAYLOAD STRUCTURE ===');
        console.log('Message length:', responsePayload.message?.length || 0);
        console.log('Actions count:', responsePayload.actions?.length || 0);
      }
      
      return responsePayload;
      
    } catch (parseError) {
      console.error('=== JSON PARSE ERROR ===');
      console.error('Parse error:', parseError.message);
      console.error('Request ID:', requestEnvelope.session_id);
      
      if (isDev) {
        throw new Error(`LLM_JSON_PARSE_ERROR: Failed to parse ${providerName} response as JSON in DEV mode`);
      }
      
      // Fallback response for production
      return {
        message: generatedText || "I'm sorry, I couldn't process your request properly.",
        actions: [],
        timestamp: new Date().toISOString(),
        dev_notes: `Parse error: ${parseError.message}. Raw response length: ${generatedText.length}`
      };
    }
  }

  abstract generateResponse(
    requestEnvelope: RequestEnvelope,
    masterPrompt: string
  ): Promise<ResponsePayload>;
}

// OpenAI Provider
class OpenAIProvider extends BaseLLMProvider {
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
    console.log('=== CALLING OPENAI API ===');
    console.log('Request ID:', requestEnvelope.session_id);
    console.log('Prompt length:', assembledPrompt.length);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
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

    const llmDuration = Date.now() - llmStartTime;
    console.log('=== OPENAI API RESPONSE ===');
    console.log('Duration:', `${llmDuration}ms`);
    console.log('Status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('=== OPENAI API ERROR ===');
      console.error('Status:', response.status);
      console.error('Error data:', errorData);
      throw new Error(`OpenAI request failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content?.trim() ?? '';

    console.log('=== RAW OPENAI RESPONSE ===');
    console.log('Response length:', generatedText.length);
    console.log('Usage tokens:', data.usage);

    if (requestEnvelope.env === 'dev') {
      console.log('=== FULL RAW RESPONSE ===');
      console.log(generatedText);
      console.log('=== END RAW RESPONSE ===');
    }

    return this.parseAndValidateResponse(generatedText, requestEnvelope, 'OpenAI');
  }
}

// Claude Provider
class ClaudeProvider extends BaseLLMProvider {
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

// Claude MCP Provider
class ClaudeMCPProvider extends BaseLLMProvider {
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

// Provider Factory
interface ProviderConfig {
  openAIApiKey?: string;
  anthropicApiKey?: string;
  mcpServerUrl?: string;
  mcpAuthToken?: string;
}

class LLMProviderFactory {
  static create(provider: string, config: ProviderConfig): LLMProviderInterface {
    switch (provider) {
      case 'openai':
        if (!config.openAIApiKey) {
          throw new Error('OpenAI API key not configured in Supabase secrets');
        }
        return new OpenAIProvider(config.openAIApiKey);
        
      case 'claude':
        if (!config.anthropicApiKey) {
          throw new Error('Anthropic API key not configured in Supabase secrets');
        }
        return new ClaudeProvider(config.anthropicApiKey);
        
      case 'claude-mcp':
        if (!config.mcpServerUrl) {
          throw new Error('MCP Server URL not configured in Supabase secrets');
        }
        if (!config.mcpAuthToken) {
          throw new Error('MCP Auth Token not configured in Supabase secrets');
        }
        return new ClaudeMCPProvider(config.mcpServerUrl, config.mcpAuthToken);
        
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
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

    console.log(`=== ROUTING TO ${provider.toUpperCase()} PROVIDER ===`);
    console.log('Request ID:', requestEnvelope.session_id);

    // Get environment variables
    const config: ProviderConfig = {
      openAIApiKey: Deno.env.get('OPENAI_API_KEY'),
      anthropicApiKey: Deno.env.get('ANTHROPIC_API_KEY'),
      mcpServerUrl: Deno.env.get('MCP_SERVER_URL'),
      mcpAuthToken: Deno.env.get('MCP_AUTH_TOKEN')
    };

    // Create provider instance using factory
    const providerInstance = LLMProviderFactory.create(provider, config);

    // Generate response using the provider
    const responsePayload = await providerInstance.generateResponse(requestEnvelope, masterPrompt);

    console.log(`=== ${provider.toUpperCase()} PROVIDER COMPLETED ===`);
    console.log('Actions count:', responsePayload.actions?.length || 0);

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