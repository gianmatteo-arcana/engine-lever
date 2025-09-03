/**
 * UX Optimization Agent
 * 
 * Responsible for optimizing UIRequests to minimize user friction and cognitive load.
 * This agent merges overlapping fields, reorders questions for progressive disclosure,
 * and creates the most user-friendly experience possible.
 */

import { BaseAgent } from './base/BaseAgent';
import { logger, createTaskLogger } from '../utils/logger';
import type { 
  BaseAgentRequest, 
  BaseAgentResponse 
} from '../types/base-agent-types';
import type { UIRequest, UIRequestField } from '../types/ui-types';
import type { AgentCapability } from '../services/agent-discovery';

export class UXOptimizationAgent extends BaseAgent {
  constructor(tenantId?: string, userId?: string) {
    super('ux_optimization_agent', tenantId || 'system', userId);
    logger.info('🎨 UX Optimization Agent initialized', { tenantId, userId });
  }

  /**
   * Process UIRequest optimization requests
   */
  public async process(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    const taskLogger = createTaskLogger(request.taskContext?.contextId || 'unknown');
    
    taskLogger.info('🎨 UX Optimization Agent processing request', {
      operation: request.operation,
      parameters: request.parameters
    });

    try {
      // Extract UIRequests from input data
      const uiRequests = request.parameters?.uiRequests as UIRequest[];
      const sourceAgents = request.parameters?.sourceAgents as string[];
      
      if (!uiRequests || uiRequests.length === 0) {
        return this.createResponse('completed', {
          optimizedUIRequests: []
        }, 'No UIRequests to optimize');
      }

      taskLogger.info('📊 Analyzing UIRequests for optimization', {
        requestCount: uiRequests.length,
        sourceAgents,
        totalFields: uiRequests.reduce((sum, req) => sum + (req.fields?.length || 0), 0)
      });

      // Perform intelligent UIRequest optimization
      const optimizedRequests = await this.optimizeUIRequests(
        uiRequests, 
        sourceAgents,
        request.taskContext?.contextId
      );

      taskLogger.info('✅ UIRequests optimized successfully', {
        originalCount: uiRequests.length,
        optimizedCount: optimizedRequests.length,
        fieldsReduced: this.calculateFieldReduction(uiRequests, optimizedRequests)
      });

      return this.createResponse('completed', {
        optimizedUIRequests: optimizedRequests,
        optimization_metrics: {
          original_request_count: uiRequests.length,
          optimized_request_count: optimizedRequests.length,
          duplicate_fields_removed: this.calculateDuplicatesRemoved(uiRequests, optimizedRequests),
          cognitive_load_reduction: this.estimateCognitiveLoadReduction(uiRequests, optimizedRequests)
        }
      }, 'UIRequests optimized for better user experience');

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
   * Optimize UIRequests by merging duplicates and improving flow
   */
  private async optimizeUIRequests(
    requests: UIRequest[], 
    sourceAgents: string[],
    contextId?: string
  ): Promise<UIRequest[]> {
    const taskLogger = createTaskLogger(contextId || 'unknown');
    
    // Step 1: Extract all fields from all requests
    const allFields: Array<{ field: UIRequestField; source: string }> = [];
    
    for (const request of requests) {
      if (request.fields) {
        for (const field of request.fields) {
          allFields.push({
            field,
            source: (request.metadata as any)?.sourceAgent || 'unknown'
          });
        }
      }
    }

    taskLogger.debug('📋 Extracted fields from all UIRequests', {
      totalFields: allFields.length,
      fieldIds: allFields.map(f => f.field.id)
    });

    // Step 2: Identify and merge duplicate/similar fields
    const mergedFields = this.mergeEquivalentFields(allFields);
    
    // Step 3: Reorder fields for optimal user flow
    const orderedFields = await this.reorderFieldsForFlow(mergedFields, contextId);
    
    // Step 4: Group fields into logical sections
    const groupedRequests = this.groupFieldsIntoRequests(orderedFields, sourceAgents);
    
    taskLogger.info('📦 Created optimized UIRequest structure', {
      originalFieldCount: allFields.length,
      mergedFieldCount: orderedFields.length,
      requestCount: groupedRequests.length
    });

    return groupedRequests;
  }

  /**
   * Merge fields that are semantically equivalent
   */
  private mergeEquivalentFields(
    fields: Array<{ field: UIRequestField; source: string }>
  ): UIRequestField[] {
    const merged: Map<string, UIRequestField> = new Map();
    const equivalenceMap = this.getFieldEquivalenceMap();
    
    for (const { field } of fields) {
      // Check if this field or an equivalent already exists
      let mergedKey = field.id;
      
      // Check for equivalents
      for (const [key, equivalents] of equivalenceMap.entries()) {
        if (equivalents.includes(field.id)) {
          // Check if we already have this equivalent
          for (const eq of [key, ...equivalents]) {
            if (merged.has(eq)) {
              mergedKey = eq;
              break;
            }
          }
          break;
        }
      }
      
      if (merged.has(mergedKey)) {
        // Merge field properties (take most specific/complete)
        const existing = merged.get(mergedKey)!;
        this.mergeFieldProperties(existing, field);
      } else {
        // Add new field
        merged.set(field.id, { ...field });
      }
    }
    
    return Array.from(merged.values());
  }

  /**
   * Define semantic field equivalences
   */
  private getFieldEquivalenceMap(): Map<string, string[]> {
    return new Map([
      ['business_name', ['legal_business_name', 'company_name', 'business_legal_name', 'entity_name']],
      ['business_email', ['user_email', 'contact_email', 'primary_email', 'email']],
      ['entity_type', ['entity_type_preliminary', 'business_type', 'business_entity_type', 'organization_type']],
      ['phone', ['phone_number', 'business_phone', 'contact_phone', 'primary_phone']],
      ['address', ['business_address', 'mailing_address', 'primary_address']],
      ['city', ['business_city', 'mailing_city']],
      ['state', ['business_state', 'mailing_state']],
      ['zip', ['zip_code', 'postal_code', 'business_zip']]
    ]);
  }

  /**
   * Merge properties from two equivalent fields
   */
  private mergeFieldProperties(existing: UIRequestField, incoming: UIRequestField): void {
    // Use more descriptive label
    if (incoming.label && incoming.label.length > existing.label.length) {
      existing.label = incoming.label;
    }
    
    // Merge placeholder
    if (!existing.placeholder && incoming.placeholder) {
      existing.placeholder = incoming.placeholder;
    }
    
    // Use stricter validation
    if (!existing.required && incoming.required) {
      existing.required = true;
    }
    
    // Merge help text
    if (!existing.help && incoming.help) {
      existing.help = incoming.help;
    } else if (existing.help && incoming.help && existing.help !== incoming.help) {
      existing.help = `${existing.help}. ${incoming.help}`;
    }
    
    // For select fields, merge options
    if (existing.type === 'select' && incoming.type === 'select') {
      const existingValues = new Set((existing.options || []).map(o => o.value));
      const newOptions = (incoming.options || []).filter(o => !existingValues.has(o.value));
      if (newOptions.length > 0) {
        existing.options = [...(existing.options || []), ...newOptions];
      }
    }
  }

  /**
   * Reorder fields for optimal user flow using LLM
   */
  private async reorderFieldsForFlow(
    fields: UIRequestField[],
    contextId?: string
  ): Promise<UIRequestField[]> {
    const taskLogger = createTaskLogger(contextId || 'unknown');
    
    try {
      // Use LLM to intelligently order fields
      const reorderPrompt = `
        You are a UX expert optimizing a business form. Reorder these fields to:
        1. Start with basic identifying information (business name, type)
        2. Group related fields together (all address fields, all contact fields)
        3. Put optional fields at the end
        4. Minimize cognitive load by logical progression
        
        Fields to reorder:
        ${JSON.stringify(fields.map(f => ({ id: f.id, label: f.label, required: f.required })))}
        
        Return ONLY a JSON array of field IDs in the optimal order.
        Example: ["business_name", "entity_type", "business_email", ...]
      `;
      
      const response = await this.llmProvider.complete({
        prompt: reorderPrompt,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        systemPrompt: 'You are a UX optimization expert focused on form design and user flow.'
      });
      
      const orderedIds = JSON.parse(response.content) as string[];
      
      // Reorder fields based on LLM recommendation
      const orderedFields: UIRequestField[] = [];
      const fieldMap = new Map(fields.map(f => [f.id, f]));
      
      for (const id of orderedIds) {
        const field = fieldMap.get(id);
        if (field) {
          orderedFields.push(field);
          fieldMap.delete(id);
        }
      }
      
      // Add any fields not included in the ordering
      orderedFields.push(...fieldMap.values());
      
      taskLogger.debug('✅ Fields reordered for optimal flow', {
        originalOrder: fields.map(f => f.id),
        optimizedOrder: orderedFields.map(f => f.id)
      });
      
      return orderedFields;
      
    } catch (error) {
      taskLogger.warn('⚠️ Failed to reorder fields with LLM, using default order', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback: Simple ordering by required status and type
      return fields.sort((a, b) => {
        // Required fields first
        if (a.required && !b.required) return -1;
        if (!a.required && b.required) return 1;
        
        // Then by type priority
        const typePriority: Record<string, number> = {
          'text': 1,
          'select': 2,
          'email': 3,
          'tel': 4,
          'textarea': 5
        };
        
        return (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
      });
    }
  }

  /**
   * Group fields into logical UIRequest sections
   */
  private groupFieldsIntoRequests(
    fields: UIRequestField[],
    sourceAgents: string[]
  ): UIRequest[] {
    // For now, create a single optimized request
    // In future, could split into multiple requests for wizard-style flow
    
    const optimizedRequest: UIRequest = {
      requestId: `optimized_${Date.now()}`,
      title: 'Complete Your Business Information',
      instructions: 'Please provide the following information to continue with your business setup. We\'ve streamlined this form to collect everything we need in one place.',
      templateType: 'form' as const,
      fields: fields,
      metadata: {
        optimized: true,
        sourceAgents: sourceAgents,
        optimizedAt: new Date().toISOString()
      },
      semanticData: {
        sections: this.identifyLogicalSections(fields)
      }
    };
    
    return [optimizedRequest];
  }

  /**
   * Identify logical sections within fields for better UX
   */
  private identifyLogicalSections(fields: UIRequestField[]): any[] {
    const sections: any[] = [];
    const businessFields: UIRequestField[] = [];
    const contactFields: UIRequestField[] = [];
    const addressFields: UIRequestField[] = [];
    const otherFields: UIRequestField[] = [];
    
    // Categorize fields
    for (const field of fields) {
      if (['business_name', 'legal_business_name', 'entity_type', 'business_type'].some(id => field.id.includes(id))) {
        businessFields.push(field);
      } else if (['email', 'phone', 'contact'].some(id => field.id.includes(id))) {
        contactFields.push(field);
      } else if (['address', 'city', 'state', 'zip'].some(id => field.id.includes(id))) {
        addressFields.push(field);
      } else {
        otherFields.push(field);
      }
    }
    
    // Create sections
    if (businessFields.length > 0) {
      sections.push({
        title: 'Business Information',
        fields: businessFields.map(f => f.id)
      });
    }
    
    if (contactFields.length > 0) {
      sections.push({
        title: 'Contact Details',
        fields: contactFields.map(f => f.id)
      });
    }
    
    if (addressFields.length > 0) {
      sections.push({
        title: 'Business Address',
        fields: addressFields.map(f => f.id)
      });
    }
    
    if (otherFields.length > 0) {
      sections.push({
        title: 'Additional Information',
        fields: otherFields.map(f => f.id)
      });
    }
    
    return sections;
  }

  /**
   * Calculate field reduction metrics
   */
  private calculateFieldReduction(original: UIRequest[], optimized: UIRequest[]): number {
    const originalCount = original.reduce((sum, req) => sum + (req.fields?.length || 0), 0);
    const optimizedCount = optimized.reduce((sum, req) => sum + (req.fields?.length || 0), 0);
    return originalCount - optimizedCount;
  }

  /**
   * Calculate duplicates removed
   */
  private calculateDuplicatesRemoved(original: UIRequest[], optimized: UIRequest[]): number {
    const originalFields = new Set<string>();
    const optimizedFields = new Set<string>();
    
    for (const req of original) {
      req.fields?.forEach(f => originalFields.add(f.id));
    }
    
    for (const req of optimized) {
      req.fields?.forEach(f => optimizedFields.add(f.id));
    }
    
    return originalFields.size - optimizedFields.size;
  }

  /**
   * Estimate cognitive load reduction (percentage)
   */
  private estimateCognitiveLoadReduction(original: UIRequest[], optimized: UIRequest[]): number {
    // Simple heuristic: Each duplicate field adds 20% cognitive load
    // Each additional request adds 30% cognitive load
    const originalScore = original.length * 30 + 
      original.reduce((sum, req) => sum + (req.fields?.length || 0), 0) * 10;
    
    const optimizedScore = optimized.length * 30 + 
      optimized.reduce((sum, req) => sum + (req.fields?.length || 0), 0) * 10;
    
    const reduction = ((originalScore - optimizedScore) / originalScore) * 100;
    return Math.round(Math.max(0, Math.min(100, reduction)));
  }

  /**
   * Create standardized response
   */
  private createResponse(
    status: 'completed' | 'error',
    data: any,
    reasoning: string
  ): BaseAgentResponse {
    return {
      status,
      contextUpdate: {
        entryId: `ui-opt-${Date.now()}`,
        sequenceNumber: 0,
        timestamp: new Date().toISOString(),
        actor: {
          type: 'agent' as const,
          id: 'ux_optimization_agent',
          version: '1.0.0'
        },
        operation: 'ui_optimization_completed',
        data,
        reasoning,
        confidence: status === 'completed' ? 0.9 : 0.5,
        trigger: {
          type: 'orchestrator_request',
          source: 'orchestrator_agent',
          details: {}
        }
      },
      confidence: status === 'completed' ? 0.9 : 0.5
    };
  }

  /**
   * Get agent capabilities
   */
  public getCapabilities(): AgentCapability {
    return {
      agentId: 'ux_optimization_agent',
      name: 'UX Optimization Agent',
      role: 'ux_optimization_specialist',
      version: '1.0.0',
      protocolVersion: '1.0.0',
      communicationMode: 'async' as const,
      skills: [
        'ui_request_optimization',
        'field_deduplication',
        'cognitive_load_reduction',
        'progressive_disclosure',
        'form_flow_optimization'
      ],
      availability: 'available' as const,
      canReceiveFrom: ['orchestrator_agent'],
      canSendTo: ['orchestrator_agent']
    };
  }
}