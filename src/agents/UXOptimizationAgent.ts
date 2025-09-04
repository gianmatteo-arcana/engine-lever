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
import { logger, createTaskLogger } from '../utils/logger';

export class UXOptimizationAgent extends BaseAgent {
  private fullYamlConfig: any;
  
  constructor(taskId: string, tenantId?: string, userId?: string) {
    super('ux_optimization_agent.yaml', tenantId || 'system', userId);
    // Load the full YAML configuration for this agent
    this.loadFullYamlConfig();
  }
  
  /**
   * Load the full YAML configuration including operations
   */
  private loadFullYamlConfig(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const yaml = require('yaml');
      
      const configPath = path.join(process.cwd(), 'config', 'agents', 'ux_optimization_agent.yaml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      this.fullYamlConfig = yaml.parse(configContent);
      
      logger.debug('Loaded UXOptimizationAgent YAML configuration', {
        hasOperations: !!this.fullYamlConfig?.operations,
        hasProtocol: !!this.fullYamlConfig?.operations?.optimize_form_experience?.protocol
      });
    } catch (error) {
      logger.warn('Failed to load full YAML config for UXOptimizationAgent', { error });
      this.fullYamlConfig = null;
    }
  }

  /**
   * Helper method to create a BaseAgentResponse
   */
  private createResponse(
    status: 'completed' | 'needs_input' | 'delegated' | 'error',
    data: any,
    message?: string
  ): BaseAgentResponse {
    return {
      status,
      contextUpdate: {
        entryId: `ux_opt_${Date.now()}`,
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        actor: {
          type: 'agent',
          id: 'ux_optimization_agent',
          version: '1.0.0'
        },
        operation: 'ux_optimization',
        data: {
          ...data,
          status: status === 'completed' ? 'success' : status,
          message
        },
        reasoning: message || 'UIRequest optimization performed',
        confidence: status === 'completed' ? 0.9 : 0.5,
        trigger: {
          type: 'orchestrator_request',
          source: 'orchestrator_agent',
          details: {}
        }
      },
      confidence: status === 'completed' ? 0.9 : 0.5,
      uiRequests: data.optimizedUIRequest ? [data.optimizedUIRequest] : undefined
    };
  }

  /**
   * Main processing method - receives multiple UIRequests, returns ONE optimized UIRequest
   */
  public async process(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    const taskLogger = createTaskLogger(request.taskContext?.contextId || 'unknown');
    
    taskLogger.info('🎨 UX Optimization Agent - Streamlining UIRequests', {
      operation: request.operation,
      taskId: request.taskContext?.contextId
    });

    try {
      const uiRequests = request.parameters?.uiRequests as UIRequest[];
      
      if (!uiRequests || uiRequests.length === 0) {
        return this.createResponse('completed', {
          optimizedUIRequest: null
        }, 'No UIRequests to optimize');
      }

      if (uiRequests.length === 1) {
        // Single request - return as is
        return this.createResponse('completed', {
          optimizedUIRequest: uiRequests[0]
        }, 'Single UIRequest - no optimization needed');
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

      return this.createResponse('completed', {
        optimizedUIRequest: optimizedRequest,
        metrics: {
          requests_consolidated: uiRequests.length,
          cognitive_load_reduction: this.calculateCognitiveReduction(uiRequests, optimizedRequest)
        }
      }, 'Successfully created streamlined UIRequest');

    } catch (error) {
      taskLogger.error('❌ Error optimizing UIRequests', {
        error: error instanceof Error ? error.message : String(error)
      });

      return this.createResponse('error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to optimize UIRequests');
    }
  }

  /**
   * Create a single streamlined UIRequest from multiple requests
   * Uses LLM to intelligently merge and optimize
   */
  private async createStreamlinedUIRequest(requests: UIRequest[], userContext?: any): Promise<UIRequest> {
    const taskLogger = createTaskLogger('ux-optimization');

    // Build prompt for LLM to understand and merge the requests
    const prompt = this.buildOptimizationPrompt(requests, userContext);
    
    // Call LLM to get optimization strategy
    const optimizationPlan = await this.callLLM(prompt);
    
    // Parse LLM response to create streamlined UIRequest
    const streamlinedRequest = this.parseOptimizationPlan(optimizationPlan, requests);
    
    taskLogger.info('📋 Streamlined UIRequest created', {
      template: streamlinedRequest.templateType,
      fieldCount: this.countFields(streamlinedRequest)
    });

    return streamlinedRequest;
  }

  /**
   * Build prompt for LLM to optimize UIRequests using YAML-defined protocol
   */
  private buildOptimizationPrompt(requests: UIRequest[], userContext?: any): string {
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

    // Get the protocol from the full YAML configuration
    const protocol = this.fullYamlConfig?.operations?.optimize_form_experience?.protocol;
    
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

      // Combine system and user prompts
      return `${systemPrompt}\n\n${userPrompt}`;
    }

    // Fallback if YAML protocol not loaded (shouldn't happen in production)
    logger.warn('UXOptimizationAgent: Protocol not loaded from YAML, using fallback');
    return this.getFallbackPrompt(requests, userContext);
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
      logger.warn('Failed to parse LLM optimization, using fallback merge', { error });
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
   * Call LLM for optimization
   */
  private async callLLM(prompt: string): Promise<any> {
    // This would use the actual LLM service
    // For now, returning a mock response
    // In production, this would call: this.executeLLMCall(prompt)
    
    logger.debug('Would call LLM with optimization prompt', { 
      promptLength: prompt.length 
    });

    // Mock response for development
    return {
      templateType: UITemplateType.SteppedWizard,
      title: "Complete Your Business Information",
      description: "We need a few details to proceed with your request",
      fields: [],
      sections: ["Basic Information", "Contact Details", "Additional Information"],
      reasoning: "Consolidated multiple forms into a single wizard for better UX"
    };
  }
}