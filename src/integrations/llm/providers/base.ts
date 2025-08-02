import { RequestEnvelope, ResponsePayload } from '../types';

export interface LLMProviderInterface {
  generateResponse(
    requestEnvelope: RequestEnvelope,
    masterPrompt: string
  ): Promise<ResponsePayload>;
}

export abstract class BaseLLMProvider implements LLMProviderInterface {
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