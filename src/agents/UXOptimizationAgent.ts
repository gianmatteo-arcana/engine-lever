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
import type { 
  UIRequest, 
  TaskContext, 
  ContextEntry
} from '../types/task-engine.types';
import { UITemplateType } from '../types/task-engine.types';
import type { AgentCapability } from '../services/agent-discovery';
import { DatabaseService } from '../services/database';
import { EventEmitter } from 'events';

export class UXOptimizationAgent extends BaseAgent {
  private eventListener: EventEmitter | null = null;
  private dbService: DatabaseService;
  private taskId: string | null = null;
  private uiRequestBuffer: UIRequest[] = [];
  private isMonitoring: boolean = false;
  
  constructor(taskId: string, tenantId?: string, userId?: string) {
    super('ux_optimization_agent', tenantId || 'system', userId);
    this.dbService = DatabaseService.getInstance();
    this.taskId = taskId;
    logger.info('🎨 UX Optimization Agent initialized for task', { taskId, tenantId, userId });
  }

  /**
   * Start monitoring UIRequest events for this specific task
   */
  public async startMonitoring(context: TaskContext): Promise<void> {
    if (this.isMonitoring) return;
    
    logger.info('🎧 Starting UIRequest monitoring for task', { taskId: this.taskId });
    this.isMonitoring = true;
    
    // Read existing UIRequests from context history
    const existingRequests = await this.readUIRequestsFromHistory(context);
    if (existingRequests.length > 0) {
      this.uiRequestBuffer.push(...existingRequests);
      this.checkAndOptimizeIfNeeded(context);
    }
    
    // Set up SSE listener for new UIRequests
    this.setupSSEListener(context);
  }

  /**
   * Called when new UIRequests are detected for this task
   */
  public notifyUIRequestsDetected(requests: UIRequest[], context: TaskContext): void {
    if (!this.isMonitoring) {
      this.startMonitoring(context);
    }
    
    logger.debug('📥 UIRequests detected for task', {
      taskId: this.taskId,
      count: requests.length
    });

    // Add to buffer
    this.uiRequestBuffer.push(...requests);

    // Check if optimization is needed
    this.checkAndOptimizeIfNeeded(context);
  }

  /**
   * Check if optimization is needed and perform it
   */
  private async checkAndOptimizeIfNeeded(context: TaskContext): Promise<void> {
    if (this.uiRequestBuffer.length > 1) {
      logger.info('🎯 Multiple UIRequests detected, optimizing', {
        taskId: this.taskId,
        requestCount: this.uiRequestBuffer.length
      });
      
      await this.processAndOptimizeUIRequests(context, this.uiRequestBuffer);
      
      // Clear buffer after optimization
      this.uiRequestBuffer = [];
    }
  }

  /**
   * Stop monitoring and clean up
   */
  public stopMonitoring(): void {
    logger.info('🛑 Stopping UIRequest monitoring for task', { taskId: this.taskId });
    this.isMonitoring = false;
    this.uiRequestBuffer = [];
    // TODO: Unsubscribe from SSE events
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
      // Handle different operations
      if (request.operation === 'start_listening') {
        // Start listening for UIRequests in background
        return await this.startListening(request.taskContext!, request.parameters?.mode);
      }
      
      // Legacy operation - optimize provided UIRequests
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
        totalData: uiRequests.reduce((sum, req) => sum + Object.keys(req.semanticData || {}).length, 0)
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
   * Start listening for UIRequest events
   */
  private async startListening(
    context: TaskContext,
    mode: string = 'background'
  ): Promise<BaseAgentResponse> {
    const taskId = context.contextId; // contextId IS the taskId in this architecture
    const contextId = context.contextId;
    const taskLogger = createTaskLogger(contextId);
    
    try {
      // Task is being monitored
      this.isMonitoring = true;
      
      // Step 1: Read existing UIRequests from context history
      const existingUIRequests = await this.readUIRequestsFromHistory(context);
      
      taskLogger.info('📚 Read existing UIRequests from context history', {
        contextId,
        requestCount: existingUIRequests.length
      });
      
      // Step 2: Optimize existing requests if any
      if (existingUIRequests.length > 1) {
        await this.processAndOptimizeUIRequests(context, existingUIRequests);
      }
      
      // Step 3: Set up SSE listener for new UIRequests
      this.setupSSEListener(context);
      
      taskLogger.info('✅ UXOptimizationAgent listening for UIRequests', {
        taskId,
        contextId,
        mode,
        existingRequests: existingUIRequests.length
      });
      
      return this.createResponse('completed', {
        status: 'listening',
        taskId,
        contextId,
        mode,
        processedRequests: existingUIRequests.length
      }, 'UXOptimizationAgent started listening for UIRequests');
      
    } catch (error) {
      taskLogger.error('❌ Failed to start listening', {
        taskId,
        contextId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return this.createResponse('error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to start listening for UIRequests');
    }
  }
  
  /**
   * Read UIRequests from context history
   */
  private async readUIRequestsFromHistory(context: TaskContext): Promise<UIRequest[]> {
    const uiRequests: UIRequest[] = [];
    
    // Scan context history for UI_REQUEST_CREATED events
    for (const entry of context.history) {
      if (entry.operation === 'UI_REQUEST_CREATED' && entry.data?.uiRequest) {
        uiRequests.push(entry.data.uiRequest);
      }
    }
    
    return uiRequests;
  }
  
  /**
   * Set up SSE listener for new UIRequest events
   */
  private setupSSEListener(context: TaskContext): void {
    const taskLogger = createTaskLogger(context.contextId);
    
    // Subscribe to task events for this specific task
    // This would integrate with the UnifiedEventBus
    const taskId = context.contextId; // contextId IS the taskId in this architecture
    const contextId = context.contextId;
    
    taskLogger.info('🎧 Setting up SSE listener for task', { taskId, contextId });
    
    // TODO: Integrate with actual SSE/EventBus infrastructure
    // For now, this is a placeholder showing the intended pattern
    // The actual implementation would:
    // 1. Subscribe to the UnifiedEventBus for this context
    // 2. Listen for UI_REQUEST_CREATED events
    // 3. Call processAndOptimizeUIRequests when multiple requests accumulate
  }
  
  /**
   * Process and optimize UIRequests
   */
  private async processAndOptimizeUIRequests(
    context: TaskContext,
    uiRequests: UIRequest[]
  ): Promise<void> {
    const taskLogger = createTaskLogger(context.contextId);
    
    try {
      // Extract source agents from UIRequest metadata
      const sourceAgents = [...new Set(
        uiRequests
          .map(r => r.semanticData?.sourceAgent)
          .filter(Boolean)
      )];
      
      // Optimize the UIRequests
      const optimizedRequests = await this.optimizeUIRequests(
        uiRequests,
        sourceAgents,
        context.contextId
      );
      
      // Create a new UI_REQUEST_CREATED event with the optimized request
      // This replaces the original multiple requests
      await this.emitOptimizedUIRequest(context, optimizedRequests);
      
      taskLogger.info('✅ UIRequests optimized and emitted', {
        contextId: context.contextId,
        originalCount: uiRequests.length,
        optimizedCount: optimizedRequests.length
      });
      
    } catch (error) {
      taskLogger.error('❌ Failed to optimize UIRequests', {
        contextId: context.contextId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Emit optimized UIRequest event
   */
  private async emitOptimizedUIRequest(
    context: TaskContext,
    optimizedRequests: UIRequest[]
  ): Promise<void> {
    // Create context entry for the optimized UIRequest
    const contextEntry: ContextEntry = {
      entryId: `ux_opt_${Date.now()}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length,
      actor: {
        type: 'agent',
        id: 'ux_optimization_agent',
        version: '1.0.0'
      },
      operation: 'UI_REQUEST_OPTIMIZED',
      data: {
        optimizedUIRequests: optimizedRequests,
        optimization_metrics: {
          original_count: context.history.filter(e => e.operation === 'UI_REQUEST_CREATED').length,
          optimized_count: optimizedRequests.length
        }
      },
      reasoning: 'UIRequests optimized for better user experience'
    };
    
    // Add to context via database
    await this.dbService.addContextEvent({
      context_id: context.contextId,
      actor_type: 'agent',
      actor_id: 'ux_optimization_agent',
      operation: 'UI_REQUEST_OPTIMIZED',
      data: contextEntry.data,
      reasoning: contextEntry.reasoning
    });
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
    
    // Step 1: Extract semantic data from all requests
    const allSemanticData: Array<{ data: Record<string, any>; source: string; template: UITemplateType }> = [];
    
    for (const request of requests) {
      allSemanticData.push({
        data: request.semanticData || {},
        source: request.semanticData?.sourceAgent || 'unknown',
        template: request.templateType
      });
    }

    taskLogger.debug('📋 Extracted semantic data from all UIRequests', {
      totalRequests: allSemanticData.length,
      templates: allSemanticData.map(d => d.template)
    });

    // Step 2: Identify and merge duplicate/similar data
    const mergedData = this.mergeEquivalentData(allSemanticData);
    
    // Step 3: Reorder data for optimal user flow
    const optimizedData = await this.optimizeDataFlow(mergedData, contextId);
    
    // Step 4: Create optimized UIRequest(s)
    const groupedRequests = this.createOptimizedRequests(optimizedData, sourceAgents);
    
    taskLogger.info('📦 Created optimized UIRequest structure', {
      originalCount: requests.length,
      optimizedCount: groupedRequests.length
    });

    return groupedRequests;
  }

  /**
   * Merge semantically equivalent data
   */
  private mergeEquivalentData(
    dataArray: Array<{ data: Record<string, any>; source: string; template: UITemplateType }>
  ): Record<string, any> {
    const merged: Record<string, any> = {};
    const equivalenceMap = this.getFieldEquivalenceMap();
    
    // Merge all data, handling equivalences
    for (const { data } of dataArray) {
      for (const [key, value] of Object.entries(data)) {
        // Check if this key has an equivalent already in merged
        let targetKey = key;
        
        // Check for equivalents
        for (const [primaryKey, equivalents] of equivalenceMap.entries()) {
          if (equivalents.includes(key)) {
            // Check if we already have this equivalent
            if (merged[primaryKey]) {
              targetKey = primaryKey;
              break;
            }
            for (const eq of equivalents) {
              if (merged[eq]) {
                targetKey = eq;
                break;
              }
            }
            break;
          }
        }
        
        // Merge the value
        if (merged[targetKey]) {
          // If both are objects, merge deeply
          if (typeof merged[targetKey] === 'object' && typeof value === 'object') {
            merged[targetKey] = { ...merged[targetKey], ...value };
          }
          // Otherwise keep the more complete value
          else if (!merged[targetKey] && value) {
            merged[targetKey] = value;
          }
        } else {
          merged[targetKey] = value;
        }
      }
    }
    
    return merged;
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
   * Optimize data flow for better UX
   */
  private async optimizeDataFlow(
    mergedData: Record<string, any>,
    contextId?: string
  ): Promise<Record<string, any>> {
    const taskLogger = createTaskLogger(contextId || 'unknown');
    
    try {
      // Use LLM to intelligently optimize data presentation order
      const optimizationPrompt = `
        You are a UX expert optimizing a business form. Reorder these data fields to:
        1. Start with basic identifying information (business name, type)
        2. Group related fields together (all address fields, all contact fields)
        3. Put optional fields at the end
        4. Minimize cognitive load by logical progression
        
        Data fields to optimize:
        ${JSON.stringify(Object.keys(mergedData))}
        
        Return ONLY a JSON array of field names in the optimal order.
        Example: ["business_name", "entity_type", "business_email", ...]
      `;
      
      const response = await this.llmProvider.complete({
        prompt: optimizationPrompt,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        systemPrompt: 'You are a UX optimization expert focused on form design and user flow.'
      });
      
      const orderedKeys = JSON.parse(response.content) as string[];
      
      // Reorder the data based on LLM recommendation
      const optimizedData: Record<string, any> = {};
      for (const key of orderedKeys) {
        if (mergedData[key] !== undefined) {
          optimizedData[key] = mergedData[key];
        }
      }
      
      // Add any fields not included in the ordering
      for (const [key, value] of Object.entries(mergedData)) {
        if (optimizedData[key] === undefined) {
          optimizedData[key] = value;
        }
      }
      
      taskLogger.debug('✅ Data optimized for flow', {
        originalOrder: Object.keys(mergedData),
        optimizedOrder: Object.keys(optimizedData)
      });
      
      return optimizedData;
      
    } catch (error) {
      taskLogger.warn('⚠️ Failed to optimize data flow with LLM, using original order', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback: Return data as-is
      return mergedData;
    }
  }

  /**
   * Create optimized UIRequests from merged data
   */
  private createOptimizedRequests(
    optimizedData: Record<string, any>,
    sourceAgents: string[]
  ): UIRequest[] {
    // Determine the best template type based on data
    const templateType = this.determineOptimalTemplate(optimizedData);
    
    // Create an optimized UIRequest with merged data
    const optimizedRequest: UIRequest = {
      requestId: `optimized_${Date.now()}`,
      templateType,
      semanticData: {
        ...optimizedData,
        optimized: true,
        sourceAgents,
        optimizedAt: new Date().toISOString(),
        sections: this.identifyLogicalSections(optimizedData)
      },
      context: {
        urgency: 'medium' as const,
        userProgress: 50
      },
      priority: 'high' as const
    };
    
    return [optimizedRequest];
  }

  /**
   * Determine the optimal template type for the data
   */
  private determineOptimalTemplate(data: Record<string, any>): UITemplateType {
    // Analyze the data to determine the best template
    const dataKeys = Object.keys(data);
    
    // If we have many fields, use SmartTextInput for form collection
    if (dataKeys.length > 5) {
      return UITemplateType.SmartTextInput;
    }
    
    // If we have business info, use FoundYouCard
    if (data.business_name || data.businessInfo) {
      return UITemplateType.FoundYouCard;
    }
    
    // Default to SmartTextInput for general data collection
    return UITemplateType.SmartTextInput;
  }
  
  /**
   * Identify logical sections within data for better UX
   */
  private identifyLogicalSections(data: Record<string, any>): any[] {
    const sections: any[] = [];
    const businessKeys: string[] = [];
    const contactKeys: string[] = [];
    const addressKeys: string[] = [];
    const otherKeys: string[] = [];
    
    // Categorize data keys
    for (const key of Object.keys(data)) {
      if (['business_name', 'legal_business_name', 'entity_type', 'business_type'].some(id => key.includes(id))) {
        businessKeys.push(key);
      } else if (['email', 'phone', 'contact'].some(id => key.includes(id))) {
        contactKeys.push(key);
      } else if (['address', 'city', 'state', 'zip'].some(id => key.includes(id))) {
        addressKeys.push(key);
      } else {
        otherKeys.push(key);
      }
    }
    
    // Create sections
    if (businessKeys.length > 0) {
      sections.push({
        title: 'Business Information',
        fields: businessKeys
      });
    }
    
    if (contactKeys.length > 0) {
      sections.push({
        title: 'Contact Details',
        fields: contactKeys
      });
    }
    
    if (addressKeys.length > 0) {
      sections.push({
        title: 'Business Address',
        fields: addressKeys
      });
    }
    
    if (otherKeys.length > 0) {
      sections.push({
        title: 'Additional Information',
        fields: otherKeys
      });
    }
    
    return sections;
  }

  /**
   * Calculate field reduction metrics
   */
  private calculateFieldReduction(original: UIRequest[], optimized: UIRequest[]): number {
    // Count semantic data keys as proxy for fields
    const originalCount = original.reduce((sum, req) => 
      sum + Object.keys(req.semanticData || {}).length, 0);
    const optimizedCount = optimized.reduce((sum, req) => 
      sum + Object.keys(req.semanticData || {}).length, 0);
    return originalCount - optimizedCount;
  }

  /**
   * Calculate duplicates removed
   */
  private calculateDuplicatesRemoved(original: UIRequest[], optimized: UIRequest[]): number {
    const originalKeys = new Set<string>();
    const optimizedKeys = new Set<string>();
    
    for (const req of original) {
      Object.keys(req.semanticData || {}).forEach(k => originalKeys.add(k));
    }
    
    for (const req of optimized) {
      Object.keys(req.semanticData || {}).forEach(k => optimizedKeys.add(k));
    }
    
    return originalKeys.size - optimizedKeys.size;
  }

  /**
   * Estimate cognitive load reduction (percentage)
   */
  private estimateCognitiveLoadReduction(original: UIRequest[], optimized: UIRequest[]): number {
    // Simple heuristic: Each duplicate field adds 20% cognitive load
    // Each additional request adds 30% cognitive load
    const originalScore = original.length * 30 + 
      original.reduce((sum, req) => sum + Object.keys(req.semanticData || {}).length, 0) * 10;
    
    const optimizedScore = optimized.length * 30 + 
      optimized.reduce((sum, req) => sum + Object.keys(req.semanticData || {}).length, 0) * 10;
    
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
   * Clean up completed task
   */
  public markTaskCompleted(taskId: string): void {
    if (this.taskId === taskId && this.isMonitoring) {
      logger.info('🧹 Cleaning up UXOptimizationAgent for completed task', { taskId });
      this.stopMonitoring();
    }
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