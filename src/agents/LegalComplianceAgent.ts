/**
 * Legal Compliance Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * Specialized agent that analyzes business compliance requirements and translates
 * complex regulations into actionable steps with deadline tracking and risk assessment.
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

interface SOIRequirements {
  isRequired: boolean;
  dueDate?: Date;
  filingPeriod: string;
  fee: number;
  requiredDocuments: string[];
  formNumber: string;
}

interface ComplianceRequirement {
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
   * Main processing method - analyzes compliance requirements
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `lca_${Date.now()}`;
    
    try {
      // Extract business entity data from context
      const businessEntity = this.extractBusinessEntity(context);
      
      // Record analysis initiation
      await this.recordContextEntry(context, {
        operation: 'compliance_analysis_initiated',
        data: { 
          businessEntity,
          analysisType: request.instruction,
          requestId 
        },
        reasoning: 'Starting comprehensive compliance analysis for business entity and filing requirements'
      });

      // Route based on instruction
      switch (request.instruction) {
        case 'validate_soi_requirements':
          return await this.validateSOIRequirements(request, context, businessEntity);
        
        case 'analyze_entity_compliance':
          return await this.analyzeEntityCompliance(request, context, businessEntity);
        
        case 'assess_compliance_risk':
          return await this.assessComplianceRisk(request, context, businessEntity);
        
        case 'prepare_compliance_form':
          return await this.prepareComplianceForm(request, context, businessEntity);
        
        default:
          await this.recordContextEntry(context, {
            operation: 'unknown_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for legal compliance analysis'
          });

          return {
            status: 'error',
            data: { error: `Unknown instruction: ${request.instruction}` },
            reasoning: 'Legal compliance agent cannot process unrecognized instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'compliance_analysis_error',
        data: { error: error.message, requestId },
        reasoning: 'Legal compliance analysis failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during compliance analysis'
      };
    }
  }

  /**
   * Validate Statement of Information requirements
   */
  private async validateSOIRequirements(
    request: AgentRequest, 
    context: TaskContext, 
    businessEntity: any
  ): Promise<AgentResponse> {
    
    // SOI analysis logic
    const soiRequirements: SOIRequirements = {
      isRequired: this.isSOIRequired(businessEntity),
      dueDate: this.calculateSOIDueDate(businessEntity),
      filingPeriod: this.getSOIFilingPeriod(businessEntity),
      fee: this.getSOIFee(businessEntity),
      requiredDocuments: this.getSOIRequiredDocuments(businessEntity),
      formNumber: this.getSOIFormNumber(businessEntity)
    };

    await this.recordContextEntry(context, {
      operation: 'soi_requirements_validated',
      data: { 
        soiRequirements,
        isRequired: soiRequirements.isRequired,
        dueDate: soiRequirements.dueDate,
        fee: soiRequirements.fee
      },
      reasoning: `SOI analysis completed for ${businessEntity.entityType} in ${businessEntity.jurisdiction}. Required: ${soiRequirements.isRequired}, Due: ${soiRequirements.dueDate}`
    });

    // Generate compliance guidance UI
    const uiRequest = this.createSOIGuidanceUI(soiRequirements, businessEntity);

    return {
      status: 'needs_input',
      data: { 
        soiRequirements,
        entityAnalysis: businessEntity,
        guidance: {
          isRequired: soiRequirements.isRequired,
          nextSteps: soiRequirements.isRequired 
            ? ['Gather business information', 'Complete SOI form', 'Submit with fee']
            : ['No SOI filing required for this entity type']
        }
      },
      uiRequests: [uiRequest],
      reasoning: 'SOI requirements validated, providing compliance guidance to user',
      nextAgent: 'data_collection'
    };
  }

  /**
   * Analyze entity compliance requirements
   */
  private async analyzeEntityCompliance(
    request: AgentRequest, 
    context: TaskContext, 
    businessEntity: any
  ): Promise<AgentResponse> {
    
    // Comprehensive compliance analysis
    const complianceRequirements = this.identifyComplianceRequirements(businessEntity);
    const riskAssessment = this.performRiskAssessment(complianceRequirements, businessEntity);

    await this.recordContextEntry(context, {
      operation: 'compliance_requirements_identified',
      data: { 
        requirementsCount: complianceRequirements.length,
        highPriorityCount: complianceRequirements.filter(r => r.priority === 'high' || r.priority === 'critical').length,
        riskLevel: riskAssessment.level,
        entityType: businessEntity.entityType,
        jurisdiction: businessEntity.jurisdiction
      },
      reasoning: `Identified ${complianceRequirements.length} compliance requirements with ${riskAssessment.level} risk level for ${businessEntity.entityType} entity`
    });

    // Generate compliance roadmap UI
    const uiRequest = this.createComplianceRoadmapUI(complianceRequirements, riskAssessment, businessEntity);

    return {
      status: 'needs_input',
      data: {
        complianceRequirements,
        riskAssessment,
        entityAnalysis: businessEntity,
        summary: {
          totalRequirements: complianceRequirements.length,
          criticalCount: complianceRequirements.filter(r => r.priority === 'critical').length,
          upcomingDeadlines: complianceRequirements.filter(r => 
            new Date(r.deadline).getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000
          ).length
        }
      },
      uiRequests: [uiRequest],
      reasoning: 'Comprehensive compliance analysis completed, providing roadmap for regulatory obligations',
      nextAgent: 'ux_optimization_agent'
    };
  }

  /**
   * Assess compliance risks
   */
  private async assessComplianceRisk(
    request: AgentRequest, 
    context: TaskContext, 
    businessEntity: any
  ): Promise<AgentResponse> {
    
    const requirements = this.identifyComplianceRequirements(businessEntity);
    const riskAssessment = this.performRiskAssessment(requirements, businessEntity);

    await this.recordContextEntry(context, {
      operation: 'compliance_risk_assessed',
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
      reasoning: 'Compliance risk assessment completed with mitigation recommendations'
    };
  }

  /**
   * Prepare compliance forms
   */
  private async prepareComplianceForm(
    request: AgentRequest, 
    context: TaskContext, 
    businessEntity: any
  ): Promise<AgentResponse> {
    
    const formType = request.data?.formType || 'soi';
    const formTemplate = this.getFormTemplate(formType, businessEntity);
    const prefilledData = this.generatePrefilledData(businessEntity, formType);

    await this.recordContextEntry(context, {
      operation: 'compliance_form_prepared',
      data: { 
        formType,
        entityType: businessEntity.entityType,
        prefilledFields: Object.keys(prefilledData).length
      },
      reasoning: `Prepared ${formType} form template with ${Object.keys(prefilledData).length} pre-filled fields`
    });

    return {
      status: 'completed',
      data: {
        formTemplate,
        prefilledData,
        instructions: this.getFormInstructions(formType),
        submissionGuidance: this.getSubmissionGuidance(formType, businessEntity)
      },
      reasoning: 'Compliance form prepared with pre-filled data and submission guidance'
    };
  }

  // Helper methods for compliance analysis
  private extractBusinessEntity(context: TaskContext): any {
    const businessData = context.currentState.data.business || {};
    const userData = context.currentState.data.user || {};
    
    return {
      name: businessData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      entityType: businessData.entityType || 'LLC',
      jurisdiction: businessData.state || 'CA',
      formationDate: businessData.formationDate,
      industry: businessData.industry,
      ein: businessData.ein,
      address: businessData.address
    };
  }

  private isSOIRequired(entity: any): boolean {
    // SOI is required for most CA entity types
    const soiRequiredTypes = ['Corporation', 'LLC', 'Limited Partnership'];
    return entity.jurisdiction === 'CA' && soiRequiredTypes.includes(entity.entityType);
  }

  private calculateSOIDueDate(entity: any): Date | undefined {
    if (!this.isSOIRequired(entity) || !entity.formationDate) return undefined;
    
    const formationDate = new Date(entity.formationDate);
    const dueDate = new Date(formationDate);
    
    if (entity.entityType === 'Corporation') {
      // Corporations: 90 days after formation, then biennial
      dueDate.setDate(dueDate.getDate() + 90);
    } else if (entity.entityType === 'LLC') {
      // LLCs: Initial due 90 days after formation
      dueDate.setDate(dueDate.getDate() + 90);
    }
    
    return dueDate;
  }

  private getSOIFilingPeriod(entity: any): string {
    if (entity.entityType === 'Corporation') return 'Biennial';
    if (entity.entityType === 'LLC') return 'Biennial';
    return 'N/A';
  }

  private getSOIFee(entity: any): number {
    if (entity.entityType === 'Corporation') return 25;
    if (entity.entityType === 'LLC') return 20;
    return 0;
  }

  private getSOIRequiredDocuments(entity: any): string[] {
    const docs = ['Business entity information', 'Current business address'];
    if (entity.entityType === 'Corporation') {
      docs.push('Officer and director information', 'Stock information');
    } else if (entity.entityType === 'LLC') {
      docs.push('Member and manager information');
    }
    return docs;
  }

  private getSOIFormNumber(entity: any): string {
    if (entity.entityType === 'Corporation') return 'SI-550';
    if (entity.entityType === 'LLC') return 'SI-550';
    return 'N/A';
  }

  private identifyComplianceRequirements(entity: any): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // SOI requirement
    if (this.isSOIRequired(entity)) {
      requirements.push({
        type: 'Statement of Information',
        deadline: this.calculateSOIDueDate(entity)?.toISOString() || '',
        status: 'due',
        priority: 'high',
        fee: this.getSOIFee(entity),
        forms: [this.getSOIFormNumber(entity)],
        description: 'Required business information filing with CA Secretary of State'
      });
    }

    // Franchise Tax
    requirements.push({
      type: 'Franchise Tax Return',
      deadline: new Date(new Date().getFullYear(), 3, 15).toISOString(), // April 15
      status: 'upcoming',
      priority: 'critical',
      fee: 800, // CA minimum franchise tax
      description: 'Annual franchise tax payment to CA Franchise Tax Board'
    });

    return requirements;
  }

  private performRiskAssessment(requirements: ComplianceRequirement[], _entity: any): RiskAssessment {
    const overdue = requirements.filter(r => r.status === 'overdue');
    const critical = requirements.filter(r => r.priority === 'critical');
    
    let level: 'high' | 'medium' | 'low' = 'low';
    const factors: string[] = [];
    const consequences: string[] = [];
    const mitigationSteps: string[] = [];

    if (overdue.length > 0) {
      level = 'high';
      factors.push('Overdue compliance obligations');
      consequences.push('Penalties and interest charges', 'Loss of good standing');
      mitigationSteps.push('File overdue requirements immediately', 'Contact agencies to discuss payment plans');
    } else if (critical.length > 2) {
      level = 'medium';
      factors.push('Multiple critical requirements pending');
      consequences.push('Potential compliance violations');
      mitigationSteps.push('Prioritize critical requirements', 'Set up deadline reminders');
    } else {
      factors.push('Normal compliance schedule');
      mitigationSteps.push('Maintain regular filing schedule', 'Monitor upcoming deadlines');
    }

    return { level, factors, consequences, mitigationSteps };
  }

  private createSOIGuidanceUI(requirements: SOIRequirements, entity: any): UIRequest {
    return {
      requestId: `soi_guidance_${Date.now()}`,
      templateType: UITemplateType.InstructionPanel,
      semanticData: {
        agentRole: 'legal_compliance_agent',
        title: 'Statement of Information Requirements',
        description: requirements.isRequired 
          ? `Your ${entity.entityType} requires SOI filing by ${requirements.dueDate?.toLocaleDateString()}`
          : `No SOI filing required for your ${entity.entityType}`,
        requirements,
        entity,
        actions: {
          proceed: {
            type: 'submit',
            label: 'Start Filing Process',
            primary: true,
            handler: () => ({ action: 'start_soi_filing', requirements })
          },
          learn_more: {
            type: 'custom',
            label: 'Learn More',
            handler: () => ({ action: 'show_soi_details' })
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

  private createComplianceRoadmapUI(requirements: ComplianceRequirement[], risk: RiskAssessment, entity: any): UIRequest {
    return {
      requestId: `compliance_roadmap_${Date.now()}`,
      templateType: UITemplateType.ComplianceRoadmap,
      semanticData: {
        agentRole: 'legal_compliance_agent',
        title: 'Your Compliance Roadmap',
        description: `${requirements.length} requirements identified for your ${entity.entityType}`,
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
            handler: () => ({ action: 'start_compliance_process', requirements })
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

  private getFormTemplate(formType: string, entity: any): any {
    // Return form template structure
    return {
      formType,
      sections: ['Business Information', 'Contact Details', 'Filing Information'],
      fields: this.getFormFields(formType, entity)
    };
  }

  private getFormFields(formType: string, _entity: any): any[] {
    if (formType === 'soi') {
      return [
        { id: 'businessName', label: 'Business Name', type: 'text', required: true },
        { id: 'entityType', label: 'Entity Type', type: 'select', required: true },
        { id: 'businessAddress', label: 'Business Address', type: 'address', required: true },
        { id: 'mailingAddress', label: 'Mailing Address', type: 'address', required: true }
      ];
    }
    return [];
  }

  private generatePrefilledData(entity: any, _formType: string): any {
    return {
      businessName: entity.name,
      entityType: entity.entityType,
      jurisdiction: entity.jurisdiction,
      formationDate: entity.formationDate
    };
  }

  private getFormInstructions(formType: string): string[] {
    if (formType === 'soi') {
      return [
        'Complete all required fields accurately',
        'Ensure business address is current',
        'Include all required attachments',
        'Submit with appropriate filing fee'
      ];
    }
    return [];
  }

  private getSubmissionGuidance(formType: string, entity: any): any {
    return {
      method: 'online',
      url: 'https://bizfileonline.sos.ca.gov',
      fee: this.getSOIFee(entity),
      processingTime: '1-2 business days',
      confirmationMethod: 'email'
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
        id: 'legal_compliance_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Legal compliance action',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'legal_compliance',
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