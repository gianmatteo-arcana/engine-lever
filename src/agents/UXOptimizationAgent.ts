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

export class UXOptimizationAgent extends BaseAgent {
  protected toolChain: ToolChain;

  constructor(taskId: string, tenantId?: string, userId?: string) {
    super('ux_optimization_agent.yaml', tenantId || 'system', userId);
    this.toolChain = new ToolChain();
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
        model: 'claude-3-sonnet',
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
      const memory = await this.toolChain.searchBusinessMemory(
        businessId,
        ['identity', 'contact_info', 'structure', 'operations'],
        0.3 // Get all data, we'll decide based on confidence
      );
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
}