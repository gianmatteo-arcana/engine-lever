/**
 * Legal Compliance Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * AGENT MISSION: Analyze regulatory requirements and translate complex 
 * regulations into actionable steps. Identify deadlines, assess risks, and provide 
 * clear guidance for regulatory obligations.
 * 
 * This agent is GENERAL PURPOSE - it provides legal analysis capabilities
 * while Task Templates define the specific workflow logic. The agent handles
 * the technical aspects of requirement analysis and risk assessment.
 */

import { BaseAgent } from './base/BaseAgent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest,
  UITemplateType
} from '../types/engine-types';
import { DatabaseService } from '../services/database';

interface FilingRequirements {
  isRequired: boolean;
  dueDate?: Date;
  filingPeriod: string;
  fee: number;
  requiredDocuments: string[];
  formIdentifier: string;
  filingType: string;
}

interface RequirementItem {
  type: string;
  deadline: string;
  status: 'due' | 'overdue' | 'completed' | 'upcoming';
  priority: 'critical' | 'high' | 'medium' | 'low';
  fee?: number;
  forms?: string[];
  description?: string;
}

interface RiskAssessment {
  level: 'high' | 'medium' | 'low';
  factors: string[];
  consequences: string[];
  mitigationSteps: string[];
}

/**
 * Legal Compliance Agent - Consolidated BaseAgent Implementation
 */
export class LegalComplianceAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('legal_compliance_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - analyzes regulatory requirements
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `lca_${Date.now()}`;
    
    // TODO: Access ToolChain for legal research and analysis
    // const legalResearchEngine = await this.toolChain.getTool('legal_research_engine');
    // const regulatoryDatabase = await this.toolChain.getTool('regulatory_database');
    // const complianceCalendar = await this.toolChain.getTool('compliance_calendar_service');
    // const documentGenerator = await this.toolChain.getTool('legal_document_generator');
    // const riskAnalyzer = await this.toolChain.getTool('regulatory_risk_analyzer');
    
    try {
      // Extract entity data from context
      const entityData = this.extractEntityData(context);
      
      // Record analysis initiation
      await this.recordContextEntry(context, {
        operation: 'regulatory_analysis_initiated',
        data: { 
          entityData,
          analysisType: request.instruction,
          requestId 
        },
        reasoning: 'Starting comprehensive regulatory analysis for entity and filing requirements'
      });

      // Route based on instruction - GENERAL REGULATORY OPERATIONS
      switch (request.instruction) {
        case 'validate_filing_requirements':
          return await this.validateFilingRequirements(request, context, entityData);
        
        case 'analyze_entity_requirements':
          return await this.analyzeEntityRequirements(request, context, entityData);
        
        case 'assess_regulatory_risk':
          return await this.assessRegulatoryRisk(request, context, entityData);
        
        case 'prepare_regulatory_guidance':
          return await this.prepareRegulatoryGuidance(request, context, entityData);
        
        default:
          await this.recordContextEntry(context, {
            operation: 'unknown_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for regulatory analysis'
          });

          return {
            status: 'error',
            data: { error: `Unknown instruction: ${request.instruction}` },
            reasoning: 'Legal analysis agent cannot process unrecognized instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'regulatory_analysis_error',
        data: { error: error.message, requestId },
        reasoning: 'Regulatory analysis failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during regulatory analysis'
      };
    }
  }

  /**
   * Validate filing requirements for any regulatory task type
   * Task Templates provide the specific filing type logic
   */
  private async validateFilingRequirements(
    request: AgentRequest, 
    context: TaskContext, 
    entityData: any
  ): Promise<AgentResponse> {
    
    // Get filing type from request (provided by Task Template)
    const filingType = request.data?.filingType || 'general';
    const templateRequirements = request.data?.requirements || {};
    
    // General filing requirements analysis - specific logic comes from Task Templates
    const filingRequirements: FilingRequirements = {
      isRequired: this.evaluateFilingRequirement(entityData, templateRequirements),
      dueDate: this.calculateDueDate(entityData, templateRequirements),
      filingPeriod: templateRequirements.period || 'As Required',
      fee: templateRequirements.fee || 0,
      requiredDocuments: templateRequirements.documents || ['Entity information'],
      formIdentifier: templateRequirements.formId || 'TBD',
      filingType
    };

    await this.recordContextEntry(context, {
      operation: 'filing_requirements_validated',
      data: { 
        filingRequirements,
        filingType,
        isRequired: filingRequirements.isRequired,
        dueDate: filingRequirements.dueDate,
        fee: filingRequirements.fee
      },
      reasoning: `Filing requirements analysis completed for ${filingType} filing. Required: ${filingRequirements.isRequired}, Due: ${filingRequirements.dueDate}`
    });

    // Generate regulatory guidance UI
    const uiRequest = this.createFilingGuidanceUI(filingRequirements, entityData);

    return {
      status: 'needs_input',
      data: { 
        filingRequirements,
        entityAnalysis: entityData,
        guidance: {
          isRequired: filingRequirements.isRequired,
          nextSteps: filingRequirements.isRequired 
            ? ['Gather required information', `Complete ${filingType} filing`, 'Submit with required fee']
            : [`No ${filingType} filing required for this entity`]
        }
      },
      uiRequests: [uiRequest],
      reasoning: `${filingType} filing requirements validated, providing regulatory guidance to user`,
      nextAgent: 'data_collection'
    };
  }

  /**
   * Analyze entity regulatory requirements
   */
  private async analyzeEntityRequirements(
    request: AgentRequest, 
    context: TaskContext, 
    entityData: any
  ): Promise<AgentResponse> {
    
    // Comprehensive regulatory analysis based on Task Template data
    const requirements = this.identifyRequirements(entityData, request.data?.scope);
    const riskAssessment = this.performRiskAssessment(requirements, entityData);

    await this.recordContextEntry(context, {
      operation: 'requirements_identified',
      data: { 
        requirementsCount: requirements.length,
        highPriorityCount: requirements.filter(r => r.priority === 'high' || r.priority === 'critical').length,
        riskLevel: riskAssessment.level,
        entityType: entityData.type,
        jurisdiction: entityData.jurisdiction
      },
      reasoning: `Identified ${requirements.length} regulatory requirements with ${riskAssessment.level} risk level for entity`
    });

    // Generate regulatory roadmap UI
    const uiRequest = this.createRegulatoryRoadmapUI(requirements, riskAssessment, entityData);

    return {
      status: 'needs_input',
      data: {
        requirements,
        riskAssessment,
        entityAnalysis: entityData,
        summary: {
          totalRequirements: requirements.length,
          criticalCount: requirements.filter(r => r.priority === 'critical').length,
          upcomingDeadlines: requirements.filter(r => 
            new Date(r.deadline).getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000
          ).length
        }
      },
      uiRequests: [uiRequest],
      reasoning: 'Comprehensive regulatory analysis completed, providing roadmap for obligations',
      nextAgent: 'ux_optimization_agent'
    };
  }

  /**
   * Assess regulatory risks
   */
  private async assessRegulatoryRisk(
    request: AgentRequest, 
    context: TaskContext, 
    entityData: any
  ): Promise<AgentResponse> {
    
    const requirements = this.identifyRequirements(entityData, request.data?.scope);
    const riskAssessment = this.performRiskAssessment(requirements, entityData);

    await this.recordContextEntry(context, {
      operation: 'regulatory_risk_assessed',
      data: { 
        riskLevel: riskAssessment.level,
        riskFactors: riskAssessment.factors,
        mitigationSteps: riskAssessment.mitigationSteps
      },
      reasoning: `Risk assessment completed: ${riskAssessment.level} risk with ${riskAssessment.factors.length} identified risk factors`
    });

    return {
      status: 'completed',
      data: {
        riskAssessment,
        recommendations: riskAssessment.mitigationSteps,
        priorityActions: requirements
          .filter(r => r.priority === 'critical')
          .map(r => `${r.type}: ${r.deadline}`)
      },
      reasoning: 'Regulatory risk assessment completed with mitigation recommendations'
    };
  }

  /**
   * Prepare regulatory guidance for any filing type
   * Task Templates specify the exact form requirements
   */
  private async prepareRegulatoryGuidance(
    request: AgentRequest, 
    context: TaskContext, 
    entityData: any
  ): Promise<AgentResponse> {
    
    const filingType = request.data?.filingType || 'general';
    const guidanceTemplate = this.getGuidanceTemplate(filingType, request.data?.templateData);
    const prefilledData = this.generatePrefilledData(entityData, request.data?.templateData);

    await this.recordContextEntry(context, {
      operation: 'regulatory_guidance_prepared',
      data: { 
        filingType,
        entityType: entityData.type,
        prefilledFields: Object.keys(prefilledData).length
      },
      reasoning: `Prepared ${filingType} regulatory guidance with ${Object.keys(prefilledData).length} pre-filled fields`
    });

    return {
      status: 'completed',
      data: {
        guidanceTemplate,
        prefilledData,
        instructions: this.getFilingInstructions(request.data?.templateData),
        submissionGuidance: this.getSubmissionGuidance(request.data?.templateData)
      },
      reasoning: `${filingType} regulatory guidance prepared with pre-filled data and submission instructions`
    };
  }

  // Helper methods for regulatory analysis
  private extractEntityData(context: TaskContext): any {
    const businessData = context.currentState.data.business || {};
    const userData = context.currentState.data.user || {};
    
    return {
      name: businessData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      type: businessData.entityType || 'Entity',
      jurisdiction: businessData.state || 'Unknown',
      formationDate: businessData.formationDate,
      industry: businessData.industry,
      identifier: businessData.ein || businessData.entityNumber,
      address: businessData.address
    };
  }

  private evaluateFilingRequirement(_entityData: any, templateRequirements: any): boolean {
    // Generic filing requirement evaluation - Task Templates define specific rules
    if (templateRequirements?.required !== undefined) {
      return templateRequirements.required;
    }
    
    // Conservative approach: assume filing is required unless proven otherwise
    return true;
  }

  private calculateDueDate(_entityData: any, templateRequirements: any): Date | undefined {
    if (templateRequirements?.dueDate) {
      return new Date(templateRequirements.dueDate);
    }
    
    if (templateRequirements?.daysFromNow) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + templateRequirements.daysFromNow);
      return dueDate;
    }
    
    // Default: 90 days from now if not specified
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 90);
    return defaultDue;
  }

  private identifyRequirements(_entityData: any, scope: any): RequirementItem[] {
    const requirements: RequirementItem[] = [];

    // TODO: Use ToolChain for regulatory requirement research
    // const regulatoryResearch = await this.toolChain.getTool('regulatory_research_engine');
    // const requirements = await regulatoryResearch.identifyRequirements({
    //   entityType: entityData.type,
    //   jurisdiction: entityData.jurisdiction,
    //   industry: entityData.industry,
    //   scope: scope
    // });

    // Generic requirement identification - Task Templates define specific requirements
    if (scope?.requirements && Array.isArray(scope.requirements)) {
      scope.requirements.forEach((req: any) => {
        requirements.push({
          type: req.type || 'Regulatory Filing',
          deadline: req.deadline || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          status: req.status || 'upcoming',
          priority: req.priority || 'medium',
          fee: req.fee,
          forms: req.forms,
          description: req.description
        });
      });
    }

    // If no specific requirements from template, return generic placeholder
    if (requirements.length === 0) {
      requirements.push({
        type: 'Regulatory Review',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'upcoming',
        priority: 'medium',
        description: 'Review regulatory requirements for your entity'
      });
    }

    return requirements;
  }

  private performRiskAssessment(requirements: RequirementItem[], _entityData: any): RiskAssessment {
    const overdue = requirements.filter(r => r.status === 'overdue');
    const critical = requirements.filter(r => r.priority === 'critical');
    
    let level: 'high' | 'medium' | 'low' = 'low';
    const factors: string[] = [];
    const consequences: string[] = [];
    const mitigationSteps: string[] = [];

    if (overdue.length > 0) {
      level = 'high';
      factors.push('Overdue regulatory obligations');
      consequences.push('Penalties and interest charges', 'Loss of good standing');
      mitigationSteps.push('File overdue requirements immediately', 'Contact agencies to discuss resolution');
    } else if (critical.length > 2) {
      level = 'medium';
      factors.push('Multiple critical requirements pending');
      consequences.push('Potential regulatory violations');
      mitigationSteps.push('Prioritize critical requirements', 'Set up deadline reminders');
    } else {
      factors.push('Normal regulatory schedule');
      mitigationSteps.push('Maintain regular filing schedule', 'Monitor upcoming deadlines');
    }

    return { level, factors, consequences, mitigationSteps };
  }

  private createFilingGuidanceUI(requirements: FilingRequirements, entityData: any): UIRequest {
    return {
      requestId: `filing_guidance_${Date.now()}`,
      templateType: UITemplateType.InstructionPanel,
      semanticData: {
        agentRole: 'legal_analysis_agent',
        title: `${requirements.filingType.toUpperCase()} Filing Requirements`,
        description: requirements.isRequired 
          ? `Your entity requires ${requirements.filingType} filing by ${requirements.dueDate?.toLocaleDateString()}`
          : `No ${requirements.filingType} filing required for your entity`,
        requirements,
        entityData,
        actions: {
          proceed: {
            type: 'submit',
            label: `Start ${requirements.filingType.toUpperCase()} Filing`,
            primary: true,
            handler: () => ({ action: `start_${requirements.filingType}_filing`, requirements })
          },
          learn_more: {
            type: 'custom',
            label: 'Learn More',
            handler: () => ({ action: `show_${requirements.filingType}_details` })
          }
        }
      },
      context: {
        userProgress: 30,
        deviceType: 'desktop',
        urgency: requirements.isRequired ? 'high' : 'low'
      }
    } as any;
  }

  private createRegulatoryRoadmapUI(requirements: RequirementItem[], risk: RiskAssessment, _entityData: any): UIRequest {
    return {
      requestId: `regulatory_roadmap_${Date.now()}`,
      templateType: UITemplateType.ComplianceRoadmap,
      semanticData: {
        agentRole: 'legal_analysis_agent',
        title: 'Your Regulatory Roadmap',
        description: `${requirements.length} requirements identified for your entity`,
        requirements,
        riskAssessment: risk,
        summary: {
          totalRequirements: requirements.length,
          criticalCount: requirements.filter(r => r.priority === 'critical').length,
          totalEstimatedFees: requirements.reduce((sum, r) => sum + (r.fee || 0), 0)
        },
        actions: {
          start: {
            type: 'submit',
            label: 'Get Started',
            primary: true,
            handler: () => ({ action: 'start_regulatory_process', requirements })
          },
          customize: {
            type: 'custom',
            label: 'Customize Priorities',
            handler: () => ({ action: 'customize_roadmap' })
          }
        }
      },
      context: {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: risk.level === 'high' ? 'high' : 'medium'
      }
    } as any;
  }

  private getGuidanceTemplate(_filingType: string, templateData: any): any {
    // Return guidance template structure - specific forms come from Task Templates
    return {
      sections: templateData?.sections || ['Entity Information', 'Contact Details', 'Filing Information'],
      fields: templateData?.fields || []
    };
  }

  private generatePrefilledData(entityData: any, templateData: any): any {
    const baseData: any = {
      entityName: entityData.name,
      entityType: entityData.type,
      jurisdiction: entityData.jurisdiction,
      formationDate: entityData.formationDate
    };

    // Add template-specific data if provided
    if (templateData?.prefillMapping) {
      Object.keys(templateData.prefillMapping).forEach(key => {
        const sourceField = templateData.prefillMapping[key];
        if (entityData[sourceField]) {
          baseData[key] = entityData[sourceField];
        }
      });
    }

    return baseData;
  }

  private getFilingInstructions(templateData: any): string[] {
    if (templateData?.instructions && Array.isArray(templateData.instructions)) {
      return templateData.instructions;
    }

    // Generic instructions if not provided by template
    return [
      'Review all information for accuracy',
      'Submit by required deadline',
      'Include all required documentation',
      'Pay applicable fees'
    ];
  }

  private getSubmissionGuidance(templateData: any): any {
    if (templateData?.submission) {
      return templateData.submission;
    }

    // Generic submission guidance
    return {
      method: 'varies',
      url: 'Contact appropriate agency',
      fee: 0,
      processingTime: 'varies',
      confirmationMethod: 'varies'
    };
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
        id: 'legal_analysis_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Legal analysis action',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'legal_analysis',
        details: {}
      }
    };

    if (!context.history) {
      context.history = [];
    }
    context.history.push(contextEntry);

    // Also persist to database if context has an ID
    if (context.contextId) {
      try {
        const db = DatabaseService.getInstance();
        await db.createContextHistoryEntry(context.contextId, contextEntry);
      } catch (error) {
        console.error('Failed to persist context entry to database:', error);
        // Continue even if database write fails
      }
    }
  }
}