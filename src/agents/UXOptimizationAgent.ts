/**
 * UXOptimizationAgent - Human-Centered Version
 * 
 * Core Purpose: Act as a trusted translator and mediator between bureaucracy and humans
 * 
 * This agent:
 * 1. Takes multiple UIRequests and produces ONE streamlined, human-friendly UIRequest
 * 2. Translates bureaucrat-speak into language that makes sense
 * 3. Adapts tone and terminology to the user's context and business type
 * 4. Uses psychological principles to reduce anxiety and build trust
 * 5. Acts as a helpful guide, not a form collector
 * 
 * Key Principles:
 * - Speak like a helpful human, not a government form
 * - Use the user's language and industry terms
 * - Provide context and explanation, not just demands for data
 * - Reduce cognitive load through smart grouping and flow
 * - Build confidence through clear, encouraging communication
 */

import { BaseAgent } from './base/BaseAgent';
import { UIRequest, UITemplateType } from '../types/task-engine.types';
import { BaseAgentRequest, BaseAgentResponse } from '../types/base-agent-types';
import { createTaskLogger } from '../utils/logger';
import { ToolChain } from '../services/tool-chain';
import { BusinessKnowledge } from '../tools/business-memory';
import { DatabaseService } from '../services/database';

export class UXOptimizationAgent extends BaseAgent {
  private taskId: string;
  private taskHistory: any[] = [];
  private taskMetadata: any = null;
  private businessMemory: any = null;

  constructor(taskId: string, tenantId?: string, userId?: string) {
    super('ux_optimization_agent.yaml', tenantId || 'system', userId);
    this.toolChain = new ToolChain();
    this.taskId = taskId;
  }

  /**
   * Override executeInternal to handle UIRequest optimization
   * This is the standard pattern for extending BaseAgent
   */
  async executeInternal(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    const taskLogger = createTaskLogger(request.taskContext?.contextId || 'unknown');
    
    taskLogger.info('🎨 UX Optimization Agent - Streamlining UIRequests', {
      operation: request.operation,
      taskId: request.taskContext?.contextId
    });

    try {
      const uiRequests = request.parameters?.uiRequests as UIRequest[];
      
      if (!uiRequests || uiRequests.length === 0) {
        // Use BaseAgent's enforceStandardSchema for consistent responses
        return {
          status: 'completed',
          contextUpdate: {
            entryId: `ux_opt_${Date.now()}`,
            timestamp: new Date().toISOString(),
            sequenceNumber: 0,
            actor: {
              type: 'agent',
              id: this.specializedTemplate.agent.id,
              version: this.specializedTemplate.agent.version
            },
            operation: 'ux_optimization',
            data: {
              optimizedUIRequest: null,
              status: 'success',
              message: 'No UIRequests to optimize'
            },
            reasoning: 'No UIRequests provided for optimization',
            confidence: 0.9,
            trigger: {
              type: 'orchestrator_request',
              source: 'orchestrator_agent',
              details: {}
            }
          },
          confidence: 0.9
        };
      }

      if (uiRequests.length === 1) {
        // Single request - return as is
        return {
          status: 'completed',
          contextUpdate: {
            entryId: `ux_opt_${Date.now()}`,
            timestamp: new Date().toISOString(),
            sequenceNumber: 0,
            actor: {
              type: 'agent',
              id: this.specializedTemplate.agent.id,
              version: this.specializedTemplate.agent.version
            },
            operation: 'ux_optimization',
            data: {
              optimizedUIRequest: uiRequests[0],
              status: 'success',
              message: 'Single UIRequest - no optimization needed'
            },
            reasoning: 'Single UIRequest passed through without modification',
            confidence: 1.0,
            trigger: {
              type: 'orchestrator_request',
              source: 'orchestrator_agent',
              details: {}
            }
          },
          confidence: 1.0,
          uiRequests: [uiRequests[0]]
        };
      }

      // Multiple requests - use LLM to create ONE streamlined request
      // Extract user context from request parameters or task context
      const userContext = request.parameters?.userContext || request.taskContext?.user || {};
      const optimizedRequest = await this.createStreamlinedUIRequest(uiRequests, userContext);

      taskLogger.info('✅ Created streamlined UIRequest', {
        originalCount: uiRequests.length,
        totalFieldsBefore: this.countTotalFields(uiRequests),
        totalFieldsAfter: this.countFields(optimizedRequest)
      });

      return {
        status: 'completed',
        contextUpdate: {
          entryId: `ux_opt_${Date.now()}`,
          timestamp: new Date().toISOString(),
          sequenceNumber: 0,
          actor: {
            type: 'agent',
            id: this.specializedTemplate.agent.id,
            version: this.specializedTemplate.agent.version
          },
          operation: 'ux_optimization',
          data: {
            optimizedUIRequest: optimizedRequest,
            metrics: {
              requests_consolidated: uiRequests.length,
              cognitive_load_reduction: this.calculateCognitiveReduction(uiRequests, optimizedRequest)
            },
            status: 'success',
            message: 'Successfully created streamlined UIRequest'
          },
          reasoning: 'Consolidated multiple UIRequests into streamlined human-friendly form',
          confidence: 0.9,
          trigger: {
            type: 'orchestrator_request',
            source: 'orchestrator_agent',
            details: {}
          }
        },
        confidence: 0.9,
        uiRequests: [optimizedRequest]
      };

    } catch (error) {
      taskLogger.error('❌ Error optimizing UIRequests', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'error',
        contextUpdate: {
          entryId: `ux_opt_${Date.now()}`,
          timestamp: new Date().toISOString(),
          sequenceNumber: 0,
          actor: {
            type: 'agent',
            id: this.specializedTemplate.agent.id,
            version: this.specializedTemplate.agent.version
          },
          operation: 'ux_optimization',
          data: {
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'error'
          },
          reasoning: 'Failed to optimize UIRequests',
          confidence: 0.0,
          trigger: {
            type: 'orchestrator_request',
            source: 'orchestrator_agent',
            details: {}
          }
        },
        confidence: 0.0,
        error: {
          type: 'permanent',
          message: 'Failed to optimize UIRequests',
          technical_details: error instanceof Error ? error.message : 'Unknown error',
          recovery_strategy: 'Retry with valid UIRequests',
          can_retry: true,
          user_action_required: false
        }
      };
    }
  }

  /**
   * Create a single streamlined UIRequest from multiple requests
   * Uses LLM to intelligently merge and optimize
   * Now also queries business memory to pre-fill known data
   */
  private async createStreamlinedUIRequest(requests: UIRequest[], userContext?: any): Promise<UIRequest> {
    const taskLogger = createTaskLogger('ux-optimization');

    try {
      // First, check business memory for known data if businessId is available
      let knownData: BusinessKnowledge | null = null;
      if (userContext?.businessId) {
        knownData = await this.queryBusinessMemory(userContext.businessId);
        taskLogger.info('📚 Business memory queried', {
          businessId: userContext.businessId,
          factCount: knownData?.metadata?.factCount || 0,
          avgConfidence: knownData?.metadata?.averageConfidence || 0
        });
      }

      // Build prompt for LLM to understand and merge the requests
      const prompt = this.buildOptimizationPrompt(requests, userContext, knownData);
      
      // Use BaseAgent's llmProvider instead of custom callLLM
      const optimizationPlan = await this.llmProvider.complete({
        prompt,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 2000
      });
      
      // Parse LLM response to create streamlined UIRequest
      let streamlinedRequest = this.parseOptimizationPlan(optimizationPlan, requests);
      
      // Apply intelligent pre-filling based on known data
      if (knownData) {
        streamlinedRequest = await this.applyIntelligentPrefilling(streamlinedRequest, knownData);
      }
      
      taskLogger.info('📋 Streamlined UIRequest created', {
        template: streamlinedRequest.templateType,
        fieldCount: this.countFields(streamlinedRequest),
        method: 'llm-optimized',
        hasPrefilledData: knownData !== null
      });

      return streamlinedRequest;
    } catch (error) {
      // If LLM fails (no API key, network error, etc.), use fallback merge
      taskLogger.warn('⚠️ LLM optimization failed, using fallback merge', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      const fallbackRequest = await this.fallbackMergeWithMemory(requests, userContext);
      
      taskLogger.info('📋 Fallback UIRequest created', {
        template: fallbackRequest.templateType,
        fieldCount: this.countFields(fallbackRequest),
        method: 'fallback-merge'
      });
      
      return fallbackRequest;
    }
  }

  /**
   * Build prompt for LLM to optimize UIRequests using YAML-defined protocol
   */
  private buildOptimizationPrompt(requests: UIRequest[], userContext?: any, knownData?: BusinessKnowledge | null): string {
    const requestSummaries = requests.map((req, idx) => ({
      index: idx + 1,
      template: req.templateType,
      fields: Object.keys(req.semanticData || {}),
      purpose: req.semanticData?.title || req.semanticData?.description || 'Data collection'
    }));

    // Extract user/business context
    const businessType = userContext?.businessType || 'small business';
    const userExperience = userContext?.experienceLevel || 'first-time';
    const industry = userContext?.industry || 'general';
    
    // Build known data summary for the prompt
    const hasKnownData = knownData && knownData.metadata?.factCount > 0;
    const knownDataContext = hasKnownData ? 
      `\n\nNote: We have ${knownData.metadata.factCount} known facts about this business that will be pre-filled where applicable.` : '';

    // Get the protocol from the specialized template (loaded by BaseAgent)
    const protocol = this.specializedTemplate?.operations?.optimize_form_experience?.protocol;
    
    if (protocol) {
      // Use the YAML-defined prompts with variable substitution
      const systemPrompt = protocol.system_prompt
        ?.replace('{userExperience}', userExperience)
        ?.replace('{businessType}', businessType)
        ?.replace('{industry}', industry);
      
      const userPrompt = protocol.user_prompt
        ?.replace('{industry}', industry)
        ?.replace('{requestSummaries}', JSON.stringify(requestSummaries, null, 2))
        ?.replace('{rawRequests}', requests.map((req, idx) => `
Request ${idx + 1} (${req.templateType}):
${JSON.stringify(req.semanticData, null, 2)}
`).join('\n'));

      // Combine system and user prompts with known data context
      return `${systemPrompt}\n\n${userPrompt}${knownDataContext}`;
    }

    // Fallback if YAML protocol not loaded (shouldn't happen in production)
    return this.getFallbackPrompt(requests, userContext) + knownDataContext;
  }

  /**
   * Fallback prompt if YAML not loaded (for development/testing)
   */
  private getFallbackPrompt(requests: UIRequest[], _userContext?: any): string {
    return `Transform these ${requests.length} bureaucratic UIRequests into ONE human-friendly form.
    
Current requests:
${JSON.stringify(requests, null, 2)}

Create a SteppedWizard template with:
- Friendly, encouraging title and description
- Plain language field labels (no bureaucrat-speak)
- Helpful context explaining WHY each field is needed
- Smart field ordering to unlock tool usage

Return as JSON with fields organized into logical sections.`;
  }

  /**
   * Parse LLM optimization plan into a UIRequest
   */
  private parseOptimizationPlan(llmResponse: any, originalRequests: UIRequest[]): UIRequest {
    try {
      // Parse LLM response (it should return JSON)
      const plan = typeof llmResponse === 'string' ? JSON.parse(llmResponse) : llmResponse;
      
      // Create streamlined UIRequest
      const streamlinedRequest: UIRequest = {
        requestId: `optimized_${Date.now()}`,
        templateType: plan.templateType || UITemplateType.SteppedWizard,
        semanticData: {
          title: plan.title || 'Complete Your Information',
          description: plan.description || 'Please provide the following information to continue',
          fields: plan.fields || this.extractAllFields(originalRequests),
          sections: plan.sections,
          submitLabel: 'Continue',
          allowSkip: false
        },
        context: {
          optimized: true,
          originalRequestCount: originalRequests.length,
          optimization_reasoning: plan.reasoning
        }
      };

      return streamlinedRequest;
    } catch (error) {
      // Fallback: Simple merge if LLM parsing fails
      return this.fallbackMerge(originalRequests);
    }
  }

  /**
   * Fallback merge strategy if LLM optimization fails
   */
  private fallbackMerge(requests: UIRequest[]): UIRequest {
    const allFields: any[] = [];
    const seenFields = new Set<string>();

    for (const request of requests) {
      const fields = request.semanticData?.fields || 
                    Object.entries(request.semanticData || {}).map(([key, value]) => ({
                      name: key,
                      value,
                      label: this.humanizeFieldName(key)
                    }));
      
      for (const field of fields) {
        if (!seenFields.has(field.name)) {
          seenFields.add(field.name);
          allFields.push(field);
        }
      }
    }

    return {
      requestId: `merged_${Date.now()}`,
      templateType: UITemplateType.SteppedWizard,
      semanticData: {
        title: 'Complete Required Information',
        description: 'Please provide the following information to continue with your request',
        fields: allFields,
        submitLabel: 'Submit',
        allowSkip: false
      },
      context: {
        optimized: true,
        fallback: true,
        originalRequestCount: requests.length
      }
    };
  }

  /**
   * Helper: Extract all unique fields from requests
   */
  private extractAllFields(requests: UIRequest[]): any[] {
    const fields: any[] = [];
    const seen = new Set<string>();

    for (const request of requests) {
      const reqFields = request.semanticData?.fields || [];
      for (const field of reqFields) {
        if (!seen.has(field.name)) {
          seen.add(field.name);
          fields.push(field);
        }
      }
    }

    return fields;
  }

  /**
   * Helper: Count total fields across all requests
   */
  private countTotalFields(requests: UIRequest[]): number {
    return requests.reduce((sum, req) => {
      const fields = req.semanticData?.fields?.length || 
                    Object.keys(req.semanticData || {}).length;
      return sum + fields;
    }, 0);
  }

  /**
   * Helper: Count fields in a single request
   */
  private countFields(request: UIRequest): number {
    return request.semanticData?.fields?.length || 
           Object.keys(request.semanticData || {}).length;
  }

  /**
   * Helper: Calculate cognitive load reduction
   */
  private calculateCognitiveReduction(original: UIRequest[], optimized: UIRequest): number {
    const originalComplexity = original.length * 10 + this.countTotalFields(original);
    const optimizedComplexity = 10 + this.countFields(optimized);
    const reduction = ((originalComplexity - optimizedComplexity) / originalComplexity) * 100;
    return Math.round(Math.max(0, reduction));
  }

  /**
   * Helper: Convert field name to human-readable label
   */
  private humanizeFieldName(fieldName: string): string {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Query business memory for known data
   */
  private async queryBusinessMemory(businessId: string): Promise<BusinessKnowledge | null> {
    try {
      // Use BusinessMemoryTool directly since ToolChain doesn't expose searchBusinessMemory
      const { BusinessMemoryTool } = await import('../tools/business-memory');
      const businessMemoryTool = new BusinessMemoryTool();
      const memory = await businessMemoryTool.searchMemory({
        businessId,
        minConfidence: 0.3 // Get all data, we'll decide based on confidence
      });
      return memory;
    } catch (error) {
      const taskLogger = createTaskLogger('ux-optimization');
      taskLogger.warn('Could not query business memory', {
        businessId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Apply intelligent pre-filling based on confidence levels
   */
  private async applyIntelligentPrefilling(
    request: UIRequest, 
    knownData: BusinessKnowledge
  ): Promise<UIRequest> {
    const taskLogger = createTaskLogger('ux-optimization');
    
    // Analyze each field in the request
    const fields = request.semanticData.fields || [];
    const enhancedFields = [];
    
    for (const field of fields) {
      const fieldName = field.name || field.id;
      const knownValue = this.findKnownValue(fieldName, knownData);
      
      if (knownValue) {
        const confidence = knownValue.confidence || 0.5;
        
        if (confidence >= 0.9) {
          // High confidence: Pre-fill as value
          enhancedFields.push({
            ...field,
            value: knownValue.value,
            placeholder: knownValue.value,
            help: `We've filled this based on your profile (${knownValue.source || 'saved data'})`
          });
        } else if (confidence >= 0.6) {
          // Medium confidence: Pre-fill but ask for confirmation
          enhancedFields.push({
            ...field,
            value: knownValue.value,
            placeholder: knownValue.value,
            help: `Please confirm: ${field.help || ''} (pre-filled from ${knownValue.source || 'previous data'})`,
            label: `${field.label} (please verify)`
          });
        } else {
          // Low confidence: Show as suggestion in placeholder
          enhancedFields.push({
            ...field,
            placeholder: knownValue.value ? `e.g., ${knownValue.value}` : field.placeholder,
            help: `${field.help || ''} (we have a suggestion based on your profile)`
          });
        }
        
        taskLogger.debug('Field enhanced with known data', {
          field: fieldName,
          confidence,
          method: confidence >= 0.9 ? 'prefilled' : confidence >= 0.6 ? 'validation' : 'suggestion'
        });
      } else {
        // No known value, keep field as is
        enhancedFields.push(field);
      }
    }
    
    // Create validation-focused UIRequest if we have medium confidence data
    const hasValidationNeeds = enhancedFields.some(f => 
      f.value && f.label?.includes('verify')
    );
    
    if (hasValidationNeeds) {
      request.semanticData.title = `Please verify your information`;
      request.semanticData.description = `We've pre-filled some information based on your profile. Please review and confirm it's correct.`;
    }
    
    request.semanticData.fields = enhancedFields;
    return request;
  }

  /**
   * Find known value for a field from business memory
   */
  private findKnownValue(fieldName: string, knownData: BusinessKnowledge): any {
    // Map common field names to business memory paths
    const fieldMappings: Record<string, string[]> = {
      'business_email': ['facts.primary_email', 'facts.contact_email', 'facts.email'],
      'contact_email': ['facts.primary_email', 'facts.contact_email', 'facts.email'],
      'email': ['facts.primary_email', 'facts.contact_email', 'facts.email'],
      'business_phone': ['facts.primary_phone', 'facts.contact_phone', 'facts.phone'],
      'contact_phone': ['facts.primary_phone', 'facts.contact_phone', 'facts.phone'],
      'phone': ['facts.primary_phone', 'facts.contact_phone', 'facts.phone'],
      'business_name': ['facts.legal_name', 'facts.business_name', 'facts.name'],
      'legal_business_name': ['facts.legal_name', 'facts.business_name'],
      'owner_name': ['facts.owner_name', 'facts.primary_contact'],
      'preferred_contact_method': ['preferences.contact_method', 'preferences.communication_preference']
    };
    
    const paths = fieldMappings[fieldName.toLowerCase()] || [`facts.${fieldName}`, `preferences.${fieldName}`];
    
    for (const path of paths) {
      const value = this.getNestedValue(knownData, path);
      if (value !== undefined && value !== null) {
        // Try to get confidence for this specific field
        const confidence = this.getFieldConfidence(fieldName, knownData);
        const source = this.getFieldSource(fieldName, knownData);
        return { value, confidence, source };
      }
    }
    
    return null;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Get confidence level for a specific field
   */
  private getFieldConfidence(_fieldName: string, knownData: BusinessKnowledge): number {
    // Use average confidence as baseline
    // In production, this would query field-specific confidence
    return knownData.metadata?.averageConfidence || 0.7;
  }

  /**
   * Get source information for a field
   */
  private getFieldSource(_fieldName: string, _knownData: BusinessKnowledge): string {
    // In production, this would track where each piece of data came from
    return 'your business profile';
  }

  /**
   * Fallback merge with business memory integration
   */
  private async fallbackMergeWithMemory(requests: UIRequest[], userContext?: any): Promise<UIRequest> {
    let mergedRequest = this.fallbackMerge(requests);
    
    if (userContext?.businessId) {
      const knownData = await this.queryBusinessMemory(userContext.businessId);
      if (knownData) {
        mergedRequest = await this.applyIntelligentPrefilling(mergedRequest, knownData);
      }
    }
    
    return mergedRequest;
  }

  /**
   * Handle unstructured user messages (FluidUI)
   * Extracts data from natural language and maps to pending UIRequest fields
   * Handles persistence and broadcasting internally
   * 
   * @param message - The user's unstructured message
   * @param taskContext - Current task context
   * @returns BaseAgentResponse with extracted data
   */
  async handleUserMessage(message: string, taskContext?: any): Promise<BaseAgentResponse> {
    const taskLogger = createTaskLogger(taskContext?.contextId || 'unknown');
    
    // Validate input
    if (message === null || message === undefined || typeof message !== 'string') {
      return {
        status: 'error',
        contextUpdate: {
          entryId: `ux_msg_error_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          timestamp: new Date().toISOString(),
          sequenceNumber: 0,
          actor: {
            type: 'agent',
            id: this.specializedTemplate.agent.id,
            version: this.specializedTemplate.agent.version
          },
          operation: 'message_error',
          data: {
            error: 'Invalid message input',
            originalMessage: String(message)
          },
          reasoning: 'Failed to process invalid message input',
          confidence: 0.1,
          trigger: {
            type: 'user_request',
            source: 'user',
            details: { error: 'Invalid input' }
          }
        },
        confidence: 0.1
      };
    }
    
    taskLogger.info('💬 Processing user message', {
      messageLength: message.length,
      taskId: taskContext?.contextId
    });

    try {
      // Get pending UIRequests to understand what data is needed
      const pendingUIRequests = await this.getPendingUIRequests(taskContext);
      
      // Build extraction prompt
      const extractionPrompt = this.buildExtractionPrompt(message, pendingUIRequests);
      
      // Use LLM to extract data
      const extractedData = await this.extractDataFromMessage(extractionPrompt);
      
      // Validate and clean extracted data
      const validatedData = this.validateExtractedData(extractedData, pendingUIRequests);
      
      // Check if we need clarification
      const clarificationNeeded = this.checkClarificationNeeded(validatedData, pendingUIRequests);
      
      if (clarificationNeeded) {
        // Return a UIRequest for clarification
        return {
          status: 'needs_input',
          contextUpdate: {
            entryId: `ux_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            timestamp: new Date().toISOString(),
            sequenceNumber: 0,
            actor: {
              type: 'agent',
              id: this.specializedTemplate.agent.id,
              version: this.specializedTemplate.agent.version
            },
            operation: 'message_clarification',
            data: {
              originalMessage: message,
              extractedData: validatedData,
              uiRequest: clarificationNeeded,
              status: 'needs_clarification'
            },
            reasoning: `Need clarification on: ${clarificationNeeded.semanticData?.instructions}`,
            confidence: 0.6,
            trigger: {
              type: 'user_request',
              source: 'user',
              details: { message }
            }
          },
          confidence: 0.6,
          uiRequests: [clarificationNeeded]
        };
      }
      
      // Determine if this interaction should be persisted
      const shouldPersist = this.shouldPersistInteraction(message, validatedData, !!clarificationNeeded);
      
      // Generate conversational response if no data was extracted
      let conversationalResponse = '';
      if (Object.keys(validatedData).length === 0 && !clarificationNeeded) {
        conversationalResponse = await this.generateConversationalResponse(message, taskContext);
      }
      
      // Build response with proper structure
      const contextUpdate = {
        entryId: `ux_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        actor: {
          type: 'agent' as const,
          id: this.specializedTemplate.agent.id,
          version: this.specializedTemplate.agent.version
        },
        operation: 'message_extraction',
        data: shouldPersist ? {
          originalMessage: message,
          extractedData: validatedData,
          status: 'success',
          message: conversationalResponse || 'Successfully extracted data from user message'
        } : {
          status: 'ephemeral',
          message: conversationalResponse || 'I can help you with your business registration. What specific information would you like to provide or know about?'
        },
        reasoning: shouldPersist ? 
          `Extracted ${Object.keys(validatedData).length} data fields from user message` :
          'Ephemeral response - no substantial data to persist',
        confidence: 0.85,
        trigger: {
          type: 'user_request' as const,
          source: 'user',
          details: { message }
        }
      };
      
      // Handle persistence and broadcasting
      let persistedEvent = null;
      
      if (shouldPersist && this.userId) {
        try {
          // Get services
          const dbService = DatabaseService.getInstance();
          const { A2AEventBus } = await import('../services/a2a-event-bus');
          const a2aEventBus = A2AEventBus.getInstance();
          
          // Prepare event data
          const eventData = {
            contextId: this.taskId,
            actorType: 'agent' as const,
            actorId: 'ux_optimization_agent',
            operation: 'USER_MESSAGE_PROCESSED',
            data: {
              originalMessage: message,
              extractedData: validatedData,
              timestamp: new Date().toISOString(),
              message: conversationalResponse || contextUpdate.data.message
            },
            reasoning: contextUpdate.reasoning,
            trigger: {
              type: 'user_message' as const,
              source: 'conversation',
              message
            }
          };
          
          // Persist the event
          persistedEvent = await dbService.createTaskContextEvent(
            this.userId,
            this.taskId,
            eventData
          );
          
          taskLogger.info('User message processed and persisted', {
            eventId: persistedEvent.id,
            taskId: this.taskId,
            extractedFields: Object.keys(validatedData)
          });
          
          // Broadcast for real-time updates
          await a2aEventBus.broadcast({
            type: 'TASK_CONTEXT_UPDATE',
            taskId: this.taskId,
            agentId: 'ux_optimization_agent',
            operation: 'USER_MESSAGE_PROCESSED',
            data: {
              ...eventData.data,
              eventId: persistedEvent.id
            },
            reasoning: eventData.reasoning,
            timestamp: new Date().toISOString(),
            metadata: {
              userId: this.userId,
              businessId: this.businessId
            }
          });
        } catch (error) {
          taskLogger.error('Failed to persist message event', error);
          // Continue without persistence
        }
      } else {
        taskLogger.info('User message processed (ephemeral)', {
          taskId: this.taskId,
          messageType: 'ephemeral',
          hasExtractedData: Object.keys(validatedData).length > 0
        });
      }
      
      // Add event ID to context update if persisted
      if (persistedEvent) {
        contextUpdate.entryId = persistedEvent.id;
      }
      
      const response: BaseAgentResponse = {
        status: 'completed',
        contextUpdate,
        confidence: 0.85
      };
      
      // Mark as ephemeral if not persisting
      if (!shouldPersist) {
        (response as any).ephemeral = true;
      }
      
      // Add UIRequest if clarification needed
      if (clarificationNeeded) {
        response.uiRequests = [clarificationNeeded];
      }
      
      return response;
      
    } catch (error) {
      taskLogger.error('Failed to process user message', { error });
      
      return {
        status: 'error',
        contextUpdate: {
          entryId: `ux_msg_error_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          timestamp: new Date().toISOString(),
          sequenceNumber: 0,
          actor: {
            type: 'agent',
            id: this.specializedTemplate.agent.id,
            version: this.specializedTemplate.agent.version
          },
          operation: 'message_error',
          data: {
            error: error instanceof Error ? error.message : 'Unknown error',
            originalMessage: message
          },
          reasoning: 'Failed to process user message',
          confidence: 0.1,
          trigger: {
            type: 'user_request',
            source: 'user',
            details: { message, error: String(error) }
          }
        },
        confidence: 0.1
      };
    }
  }

  /**
   * Get pending UIRequests from the current task context
   */
  private async getPendingUIRequests(_taskContext?: any): Promise<UIRequest[]> {
    // TODO: Query A2A event bus or task context for pending UIRequests
    // For now, return empty array
    return [];
  }

  /**
   * Build prompt for LLM to extract data from user message
   */
  private buildExtractionPrompt(message: string, pendingRequests: UIRequest[]): string {
    const fields = pendingRequests.flatMap(r => 
      r.semanticData?.fields || []
    );
    
    return `Extract data from this user message that matches these needed fields:
    
Fields needed:
${fields.map(f => `- ${f.name} (${f.type}): ${f.label || f.name}`).join('\n')}

User message: "${message}"

Extract any matching data. Use exact field names as keys.
If a value seems to match but is slightly wrong format (like missing dashes in EIN), correct it.
Return as JSON object with field names as keys.`;
  }

  /**
   * Extract data from message using LLM
   */
  private async extractDataFromMessage(prompt: string): Promise<any> {
    const taskLogger = createTaskLogger('message_extraction');
    
    try {
      // Use the LLM provider to extract data
      const response = await this.llmProvider.complete({
        prompt,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 500
      });
      
      // Parse the JSON response
      try {
        const parsed = JSON.parse(response.content);
        taskLogger.debug('Extracted data from message', { extractedFields: Object.keys(parsed) });
        return parsed;
      } catch (parseError) {
        taskLogger.debug('LLM response was not valid JSON, returning empty object');
        return {};
      }
    } catch (error) {
      taskLogger.error('Failed to extract data from message', error);
      return {};
    }
  }

  /**
   * Validate extracted data against UIRequest requirements
   */
  private validateExtractedData(data: any, pendingRequests: UIRequest[]): any {
    const validated: any = {};
    const fields = pendingRequests.flatMap(r => r.semanticData?.fields || []);
    
    for (const field of fields) {
      if (data[field.name]) {
        // Basic validation - can be enhanced
        validated[field.name] = data[field.name];
      }
    }
    
    return validated;
  }

  /**
   * Check if clarification is needed
   */
  private checkClarificationNeeded(validatedData: any, pendingRequests: UIRequest[]): UIRequest | null {
    const requiredFields = pendingRequests.flatMap(r => 
      (r.semanticData?.fields || []).filter((f: any) => f.required)
    );
    
    const missingRequired = requiredFields.filter((f: any) => !validatedData[f.name]);
    
    if (missingRequired.length > 0) {
      // Create a clarification UIRequest
      return {
        requestId: `clarify_${Date.now()}`,
        templateType: 'form' as UITemplateType,
        semanticData: {
          title: "Just need a bit more information",
          instructions: "I understood most of what you said, but need clarification on a few things:",
          fields: missingRequired
        }
      };
    }
    
    return null;
  }

  /**
   * Generate a conversational response for user questions
   */
  private async generateConversationalResponse(message: string, taskContext?: any): Promise<string> {
    const taskLogger = createTaskLogger(taskContext?.contextId || 'conversation');
    
    try {
      // Use TaskIntrospectionTool for deep understanding
      let introspection = null;
      if (this.userId && this.taskId) {
        try {
          const { TaskIntrospectionTool } = await import('../tools/task-introspection');
          const introspectionTool = new TaskIntrospectionTool();
          introspection = await introspectionTool.introspect({
            taskId: this.taskId,
            userId: this.userId,
            aspectToInspect: 'all'
          });
        } catch (introError) {
          taskLogger.warn('Failed to introspect task', introError);
        }
      }

      // Build rich context from introspection
      let contextSummary = 'No previous activity';
      let currentFocus = 'Getting started';
      let dataStatus = 'No data collected yet';
      let recommendations = '';

      if (introspection) {
        if (introspection.progress) {
          contextSummary = `Task is ${introspection.progress.completeness}% complete (${introspection.progress.lastActivity})`;
          currentFocus = introspection.progress.currentStep;
        }
        
        if (introspection.collectedData) {
          const fieldCount = Object.keys(introspection.collectedData.fields).length;
          const missingCount = introspection.collectedData.missingRequired.length;
          dataStatus = `${fieldCount} fields collected${missingCount > 0 ? `, ${missingCount} required fields missing` : ''}`;
        }

        if (introspection.insights?.recommendations && introspection.insights.recommendations.length > 0) {
          recommendations = introspection.insights.recommendations[0];
        }
      }
      
      const prompt = `You are a helpful business registration assistant. The user is working on a task.
      
Current task context:
- Task: ${introspection?.template?.name || this.taskMetadata?.title || 'business registration'}
- ${contextSummary}
- Current focus: ${currentFocus}
- ${dataStatus}
${introspection?.objectives?.primaryGoal ? `- Goal: ${introspection.objectives.primaryGoal}` : ''}
${recommendations ? `- Next step: ${recommendations}` : ''}

User message: "${message}"

${message.toLowerCase().includes('what') && message.toLowerCase().includes('task') 
  ? 'The user is asking about the current task. Explain what the task is about, the current progress, and what information has been collected so far. Be specific using the context above.'
  : 'Provide a helpful, concise response based on the task context.'}

If they're asking what they can do, suggest specific next actions based on the task progress.

Keep the response conversational and under 2-3 sentences.`;

      const response = await this.llmProvider.complete({
        prompt,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 200
      });
      
      taskLogger.debug('Generated conversational response');
      return response.content;
    } catch (error) {
      taskLogger.error('Failed to generate conversational response', error);
      return 'I can help you with your business registration. You can provide information like your business name, address, EIN, or ask me any questions about the registration process.';
    }
  }

  /**
   * Process a message and return API-ready response
   * Encapsulates all processing, persistence, and response formatting
   * 
   * @param message - User's message
   * @returns API-ready response object
   */
  async processMessageForAPI(message: string): Promise<{
    success: boolean;
    contextId: string;
    eventId: string | null;
    extractedData: any;
    uiRequest: any;
    message: string;
    ephemeral: boolean;
  }> {
    try {
      // Process the message with full context
      const response = await this.handleUserMessage(message, {
        contextId: this.taskId,
        taskId: this.taskId,
        userId: this.userId
      });
      
      // Extract response data
      const isEphemeral = (response as any).ephemeral === true;
      const extractedData = response.contextUpdate?.data?.extractedData || {};
      const eventId = response.contextUpdate?.entryId || null;
      const responseMessage = response.contextUpdate?.data?.message || 'Message processed successfully';
      
      return {
        success: true,
        contextId: this.taskId,
        eventId,
        extractedData,
        uiRequest: response.uiRequests?.[0] || null,
        message: responseMessage,
        ephemeral: isEphemeral
      };
    } catch (error) {
      const taskLogger = createTaskLogger(this.taskId);
      taskLogger.error('Failed to process message for API', error);
      throw error;
    }
  }

  /**
   * Initialize agent for a specific task (called by DI container)
   * Loads full context history to enable intelligent conversation
   */
  async initializeForTask(taskId: string): Promise<void> {
    const taskLogger = createTaskLogger(taskId);
    taskLogger.info('🔄 Initializing UXOptimizationAgent for task', { taskId });
    
    // Load full task context
    await this.loadContext();
    
    // Subscribe to task events for real-time updates
    await this.subscribeToTaskEvents(taskId, async (event) => {
      taskLogger.debug('UXOptimizationAgent received task event', { 
        taskId, 
        eventType: event.type 
      });
    });
  }

  /**
   * Load full task context and history
   * Called when agent is "awakened" for conversation
   */
  async loadContext(): Promise<void> {
    const taskLogger = createTaskLogger(this.taskId || 'unknown');
    
    try {
      taskLogger.info('📚 Loading full task context for conversation', {
        taskId: this.taskId,
        businessId: this.businessId
      });
      
      // Get database service
      const dbService = DatabaseService.getInstance();
      
      // Load task context history
      // Don't use 'system' as a UUID - it's not valid
      const taskHistory = this.userId 
        ? await dbService.getContextHistory(this.userId, this.taskId, 100)
        : [];
      
      // Load business memory using BusinessMemoryTool (only if we have a valid business ID)
      let businessMemory = null;
      if (this.businessId && this.businessId !== 'system') {
        try {
          const { BusinessMemoryTool } = await import('../tools/business-memory');
          const businessMemoryTool = new BusinessMemoryTool();
          businessMemory = await businessMemoryTool.searchMemory({
            businessId: this.businessId
          });
        } catch (memoryError) {
          taskLogger.warn('Failed to load business memory', { 
            error: memoryError instanceof Error ? memoryError.message : String(memoryError),
            businessId: this.businessId 
          });
        }
      }
      
      // Load task metadata
      const task = this.userId 
        ? await dbService.getTask(this.userId, this.taskId)
        : null;
      
      // Store in agent instance for reference during conversation
      this.taskHistory = taskHistory;
      this.businessMemory = businessMemory;
      this.taskMetadata = task;
      this.taskContext = {
        history: taskHistory,
        businessMemory,
        taskMetadata: task,
        lastUpdated: new Date().toISOString()
      };
      
      taskLogger.info('✅ Context loaded successfully', {
        historyCount: taskHistory?.length || 0,
        businessFactCount: businessMemory?.metadata?.factCount || 0,
        taskStatus: task?.status
      });
      
    } catch (error) {
      taskLogger.error('Failed to load context', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue anyway - agent can still function with limited context
    }
  }

  /**
   * Determine if an interaction should be persisted as TaskContextUpdate
   */
  private shouldPersistInteraction(message: string, extractedData: any, hasUIRequest: boolean): boolean {
    // Persist if:
    // 1. New data was extracted
    const hasExtractedData = extractedData && Object.keys(extractedData).length > 0;
    
    // 2. User is providing substantial information (not just asking questions)
    const isSubstantialInput = message.length > 50 && 
      !message.toLowerCase().match(/^(what|when|where|why|how|is|are|can|could|should)/);
    
    // 3. Response includes a UIRequest (form to fill)
    
    return hasExtractedData || isSubstantialInput || hasUIRequest;
  }
}