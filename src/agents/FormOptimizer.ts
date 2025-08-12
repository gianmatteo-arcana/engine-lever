/**
 * UX Optimization Agent
 * EXACTLY matches PRD lines 601-680
 * 
 * Specialized agent that optimizes user experience through intelligent
 * form design, progressive disclosure, and mobile optimization
 */

import { Agent } from './base/Agent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest 
} from '../types/engine-types';

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  defaultValue?: any;
  validation?: string;
  helpText?: string;
  showCondition?: string;
  mobileOptimized?: boolean;
}

interface OptimizedForm {
  fields: FormField[];
  layout: 'single' | 'multi' | 'progressive';
  sections: FormSection[];
  quickActions: QuickAction[];
  progressIndicator: ProgressIndicator;
  estimatedTime: number; // seconds
  mobileLayout?: MobileLayout;
}

interface FormSection {
  id: string;
  title: string;
  fields: string[];
  collapsed?: boolean;
  showCondition?: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  action: string;
  prefilledData: Record<string, any>;
}

interface ProgressIndicator {
  type: 'steps' | 'percentage' | 'checklist';
  current: number;
  total: number;
  label?: string;
  showTimeRemaining?: boolean;
}

interface MobileLayout {
  columns: number;
  stackOrder: string[];
  touchTargetSize: number;
  keyboardOptimizations: Record<string, string>;
}

interface OptimizationMetrics {
  originalFieldCount: number;
  optimizedFieldCount: number;
  reductionPercentage: number;
  estimatedCompletionTime: number;
  cognitiveLoadScore: number;
  mobileReadyScore: number;
}

/**
 * Form Optimizer - Optimizes user experience through intelligent form design
 */
export class FormOptimizer extends Agent {
  constructor() {
    super('ux_optimization_agent.yaml');
  }

  /**
   * Main processing method - optimizes forms for maximum completion
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `uxo_${Date.now()}`;
    
    try {
      // Extract form data from previous agents
      const formData = this.extractFormData(context);
      const deviceInfo = this.detectDevice(request);
      
      // Record optimization initiation
      await this.recordContextEntry(context, {
        operation: 'ux_optimization_initiated',
        data: { 
          originalFieldCount: formData.length,
          deviceType: deviceInfo.type,
          requestId 
        },
        reasoning: 'Starting UX optimization to reduce cognitive load and improve completion rates'
      });

      // Analyze cognitive load
      const cognitiveAnalysis = this.analyzeCognitiveLoad(formData);
      
      // Optimize form structure
      const optimizedForm = this.optimizeForm(formData, deviceInfo, cognitiveAnalysis);
      
      // Calculate optimization metrics
      const metrics = this.calculateMetrics(formData, optimizedForm);
      
      // Record optimization results
      await this.recordContextEntry(context, {
        operation: 'form_optimization_completed',
        data: {
          metrics,
          layoutType: optimizedForm.layout,
          quickActionsCount: optimizedForm.quickActions.length,
          estimatedTime: optimizedForm.estimatedTime
        },
        reasoning: `Reduced fields by ${metrics.reductionPercentage}% and optimized for ${deviceInfo.type} with estimated ${optimizedForm.estimatedTime}s completion time`
      });

      // Generate optimized UI request
      const uiRequest = this.generateOptimizedFormUI(optimizedForm, metrics, deviceInfo);
      
      return {
        status: 'needs_input',
        data: {
          optimizedForm,
          metrics,
          deviceInfo
        },
        uiRequests: [uiRequest],
        reasoning: 'Generated UX-optimized form with progressive disclosure and mobile optimization',
        nextAgent: 'celebration_agent'
      };

    } catch (error: any) {
      // Try to record error, but handle case where context might be corrupted
      try {
        await this.recordContextEntry(context, {
          operation: 'ux_optimization_error',
          data: { error: error.message, requestId },
          reasoning: 'UX optimization failed due to technical error'
        });
      } catch (recordError) {
        // Context is too corrupted to record, continue with error response
        console.error('[FormOptimizer] Failed to record error context:', recordError);
      }

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during UX optimization'
      };
    }
  }

  /**
   * Extract form data from context
   */
  private extractFormData(context: TaskContext): FormField[] {
    const profileCollectionEntry = context.history.find(entry => 
      entry.operation === 'profile_collection_initiated'
    );
    
    const complianceEntry = context.history.find(entry =>
      entry.operation === 'compliance_requirements_identified'
    );

    const fields: FormField[] = [];

    // Get fields from profile collection
    if (profileCollectionEntry?.data?.formDefinition) {
      fields.push(...profileCollectionEntry.data.formDefinition);
    }

    // Add required compliance fields
    if (complianceEntry?.data?.requiredFields) {
      fields.push(...complianceEntry.data.requiredFields);
    }

    // Default fields if nothing found
    if (fields.length === 0) {
      fields.push(
        {
          id: 'businessName',
          type: 'text',
          label: 'Business Name',
          required: true
        },
        {
          id: 'entityType',
          type: 'select',
          label: 'Entity Type',
          required: true
        },
        {
          id: 'state',
          type: 'select',
          label: 'State',
          required: true
        }
      );
    }

    return fields;
  }

  /**
   * Detect device type and capabilities
   */
  private detectDevice(request: AgentRequest): any {
    const deviceType = request.context?.deviceType || 'desktop';
    const isMobile = deviceType === 'mobile';
    const isTablet = deviceType === 'tablet';
    
    return {
      type: deviceType,
      isMobile,
      isTablet,
      screenWidth: isMobile ? 375 : isTablet ? 768 : 1440,
      hasTouchScreen: isMobile || isTablet,
      supportsHover: !isMobile && !isTablet
    };
  }

  /**
   * Analyze cognitive load of form
   */
  private analyzeCognitiveLoad(fields: FormField[]): any {
    const requiredCount = fields.filter(f => f.required).length;
    const totalCount = fields.length;
    const hasConditionalLogic = fields.some(f => f.showCondition);
    
    // Calculate cognitive load score (0-100, lower is better)
    let score = 0;
    score += requiredCount * 10; // Each required field adds load
    score += (totalCount - requiredCount) * 5; // Optional fields add less load
    score += hasConditionalLogic ? 20 : 0; // Conditional logic adds complexity
    
    return {
      score: Math.min(100, score),
      requiredFields: requiredCount,
      totalFields: totalCount,
      hasConditionalLogic,
      estimatedDecisions: Math.ceil(totalCount / 3), // Assume 3 fields per decision
      recommendation: score > 50 ? 'high_optimization_needed' : 'moderate_optimization'
    };
  }

  /**
   * Optimize form structure
   */
  private optimizeForm(
    fields: FormField[], 
    deviceInfo: any, 
    cognitiveAnalysis: any
  ): OptimizedForm {
    // Group related fields
    const sections = this.groupFieldsIntoSections(fields);
    
    // Apply progressive disclosure
    const progressiveSections = this.applyProgressiveDisclosure(sections, cognitiveAnalysis);
    
    // Filter unnecessary fields
    const optimizedFields = this.filterUnnecessaryFields(fields);
    
    // Generate quick actions for common scenarios
    const quickActions = this.generateQuickActions(fields);
    
    // Create progress indicator
    const progressIndicator = this.createProgressIndicator(progressiveSections);
    
    // Optimize for mobile if needed
    const mobileLayout = deviceInfo.isMobile ? this.createMobileLayout(optimizedFields) : undefined;
    
    // Calculate estimated completion time
    const estimatedTime = this.calculateCompletionTime(optimizedFields, quickActions.length > 0);
    
    return {
      fields: optimizedFields,
      layout: deviceInfo.isMobile ? 'single' : cognitiveAnalysis.score > 50 ? 'progressive' : 'multi',
      sections: progressiveSections,
      quickActions,
      progressIndicator,
      estimatedTime,
      mobileLayout
    };
  }

  /**
   * Group fields into logical sections
   */
  private groupFieldsIntoSections(fields: FormField[]): FormSection[] {
    const sections: FormSection[] = [];
    
    // Basic info section
    const basicFields = fields.filter(f => 
      ['businessName', 'entityType', 'state', 'email'].includes(f.id)
    );
    if (basicFields.length > 0) {
      sections.push({
        id: 'basic_info',
        title: 'Basic Information',
        fields: basicFields.map(f => f.id),
        collapsed: false
      });
    }

    // Compliance section
    const complianceFields = fields.filter(f => 
      f.id.includes('license') || f.id.includes('permit') || f.id.includes('ein')
    );
    if (complianceFields.length > 0) {
      sections.push({
        id: 'compliance',
        title: 'Compliance Requirements',
        fields: complianceFields.map(f => f.id),
        collapsed: true,
        showCondition: 'entityType !== "Sole Proprietorship"'
      });
    }

    // Additional details section
    const additionalFields = fields.filter(f => 
      !basicFields.includes(f) && !complianceFields.includes(f)
    );
    if (additionalFields.length > 0) {
      sections.push({
        id: 'additional',
        title: 'Additional Details',
        fields: additionalFields.map(f => f.id),
        collapsed: true
      });
    }

    return sections;
  }

  /**
   * Apply progressive disclosure rules
   */
  private applyProgressiveDisclosure(sections: FormSection[], cognitiveAnalysis: any): FormSection[] {
    if (cognitiveAnalysis.score <= 30) {
      // Low cognitive load - show all sections
      return sections.map(s => ({ ...s, collapsed: false }));
    }

    // High cognitive load - progressive disclosure
    return sections.map((section, index) => ({
      ...section,
      collapsed: index > 0, // Only first section expanded
      showCondition: index === 0 ? undefined : `section_${index - 1}_complete`
    }));
  }

  /**
   * Filter out unnecessary fields
   */
  private filterUnnecessaryFields(fields: FormField[]): FormField[] {
    return fields.filter(field => {
      // Keep all required fields
      if (field.required) return true;
      
      // Remove fields that can be inferred
      if (field.id === 'timezone') return false; // Can infer from location
      if (field.id === 'country' && !field.required) return false; // Default to US
      
      // Keep fields with high value - but EIN can be collected later
      if (field.id.includes('license')) return true;
      
      // Remove low-value optional fields based on field priority to achieve significant optimization
      const lowPriorityFields = ['phone', 'address', 'website', 'ein', 'industry'];
      return !lowPriorityFields.includes(field.id);
    });
  }

  /**
   * Generate quick actions for common scenarios
   */
  private generateQuickActions(fields: FormField[]): QuickAction[] {
    const actions: QuickAction[] = [];

    // Single-member LLC quick action
    actions.push({
      id: 'single_llc',
      label: 'Single-member LLC',
      icon: '👤',
      action: 'prefill_single_llc',
      prefilledData: {
        entityType: 'LLC',
        memberCount: 1,
        operatingAgreement: false
      }
    });

    // Tech startup quick action
    if (fields.some(f => f.id === 'industry')) {
      actions.push({
        id: 'tech_startup',
        label: 'Tech Startup',
        icon: '💻',
        action: 'prefill_tech_startup',
        prefilledData: {
          entityType: 'Corporation',
          state: 'DE',
          industry: 'Technology'
        }
      });
    }

    // Restaurant quick action
    actions.push({
      id: 'restaurant',
      label: 'Restaurant',
      icon: '🍕',
      action: 'prefill_restaurant',
      prefilledData: {
        entityType: 'LLC',
        industry: 'Food & Beverage',
        needsHealthPermit: true
      }
    });

    return actions;
  }

  /**
   * Create progress indicator
   */
  private createProgressIndicator(sections: FormSection[]): ProgressIndicator {
    return {
      type: sections.length <= 3 ? 'steps' : 'percentage',
      current: 0,
      total: sections.length,
      label: 'Getting Started',
      showTimeRemaining: true
    };
  }

  /**
   * Create mobile-optimized layout
   */
  private createMobileLayout(fields: FormField[]): MobileLayout {
    return {
      columns: 1,
      stackOrder: fields.map(f => f.id),
      touchTargetSize: 48,
      keyboardOptimizations: {
        email: 'email',
        phone: 'tel',
        ein: 'number',
        zipCode: 'number',
        website: 'url'
      }
    };
  }

  /**
   * Calculate estimated completion time
   */
  private calculateCompletionTime(fields: FormField[], hasQuickActions: boolean): number {
    const baseTimePerField = 15; // seconds
    const requiredFields = fields.filter(f => f.required).length;
    const optionalFields = fields.length - requiredFields;
    
    let totalTime = requiredFields * baseTimePerField;
    totalTime += optionalFields * (baseTimePerField / 2); // Optional fields are faster
    
    if (hasQuickActions) {
      totalTime *= 0.7; // 30% faster with quick actions
    }
    
    return Math.round(totalTime);
  }

  /**
   * Calculate optimization metrics
   */
  private calculateMetrics(original: FormField[], optimized: OptimizedForm): OptimizationMetrics {
    const originalCount = original.length;
    const optimizedCount = optimized.fields.length;
    const reduction = originalCount - optimizedCount;
    const reductionPercentage = Math.round((reduction / originalCount) * 100);
    
    return {
      originalFieldCount: originalCount,
      optimizedFieldCount: optimizedCount,
      reductionPercentage,
      estimatedCompletionTime: optimized.estimatedTime,
      cognitiveLoadScore: Math.max(0, 100 - (optimizedCount * 10)),
      mobileReadyScore: optimized.mobileLayout ? 100 : 50
    };
  }

  /**
   * Generate optimized form UI request
   */
  private generateOptimizedFormUI(
    form: OptimizedForm,
    metrics: OptimizationMetrics,
    deviceInfo: any
  ): UIRequest {
    return {
      id: `optimized_form_${Date.now()}`,
      agentRole: 'ux_optimization_agent',
      suggestedTemplates: ['optimized_profile_form'],
      dataNeeded: form.fields.map(f => f.id),
      context: {
        userProgress: 75,
        deviceType: deviceInfo.type,
        urgency: 'medium'
      },
      title: 'Almost There!',
      description: `Just ${form.fields.filter(f => f.required).length} quick questions to get you started`,
      form,
      metrics,
      quickActions: form.quickActions,
      progressIndicator: form.progressIndicator,
      timeEstimate: {
        seconds: form.estimatedTime,
        display: form.estimatedTime < 60 ? 
          `${form.estimatedTime} seconds` : 
          `${Math.ceil(form.estimatedTime / 60)} minutes`
      },
      motivationalMessage: this.getMotivationalMessage(metrics.reductionPercentage),
      actions: {
        submit: () => ({ action: 'submit_optimized_form' }),
        useQuickAction: (actionId: string) => ({ action: 'apply_quick_action', actionId }),
        skip: () => ({ action: 'skip_optional_fields' })
      },
      mobileOptimizations: deviceInfo.isMobile ? {
        layout: form.mobileLayout,
        enableSwipeNavigation: true,
        showFloatingProgress: true,
        autoFocusFirstField: true
      } : undefined
    };
  }

  /**
   * Get motivational message based on optimization
   */
  private getMotivationalMessage(reductionPercentage: number): string {
    if (reductionPercentage > 50) {
      return "We've simplified this form by over 50% - you'll be done in no time!";
    } else if (reductionPercentage > 30) {
      return "We've streamlined this process to save you time.";
    } else {
      return "Quick and easy - let's get you set up!";
    }
  }

  /**
   * Record context entry with proper reasoning
   */
  private async recordContextEntry(context: TaskContext, entry: Partial<ContextEntry>): Promise<void> {
    const contextEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: (context.history?.length || 0) + 1,
      actor: {
        type: 'agent',
        id: 'ux_optimization_agent',
        version: this.config.version
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning
    };

    if (!context.history) {
      context.history = [];
    }
    context.history.push(contextEntry);
  }
}