/**
 * Legal Compliance Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * AGENT MISSION: Analyze business compliance requirements and translate complex 
 * regulations into actionable steps. Identify deadlines, assess risks, and provide 
 * clear guidance for regulatory obligations.
 * 
 * This agent is GENERAL PURPOSE - it works with Task Templates for specific
 * compliance tasks (SOI, tax filings, etc.). The agent provides legal analysis
 * capabilities while Task Templates define the specific workflow logic.
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
  formNumber: string;
  filingType: string;
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

      // Route based on instruction - GENERAL COMPLIANCE OPERATIONS
      switch (request.instruction) {
        case 'validate_filing_requirements':
          return await this.validateFilingRequirements(request, context, businessEntity);
        
        case 'analyze_entity_compliance':
          return await this.analyzeEntityCompliance(request, context, businessEntity);
        
        case 'assess_compliance_risk':
          return await this.assessComplianceRisk(request, context, businessEntity);
        
        case 'prepare_compliance_guidance':
          return await this.prepareComplianceGuidance(request, context, businessEntity);
        
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
   * Validate filing requirements for any compliance task type
   * Task Templates provide the specific filing type logic
   */
  private async validateFilingRequirements(
    request: AgentRequest, 
    context: TaskContext, 
    businessEntity: any
  ): Promise<AgentResponse> {
    
    // Get filing type from request (provided by Task Template)
    const filingType = request.data?.filingType || 'general';
    
    // General filing requirements analysis - specific logic comes from Task Templates
    const filingRequirements: FilingRequirements = {
      isRequired: this.isFilingRequired(businessEntity, filingType),
      dueDate: this.calculateFilingDueDate(businessEntity, filingType),
      filingPeriod: this.getFilingPeriod(businessEntity, filingType),
      fee: this.getFilingFee(businessEntity, filingType),
      requiredDocuments: this.getRequiredDocuments(businessEntity, filingType),
      formNumber: this.getFormNumber(businessEntity, filingType),
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
      reasoning: `Filing requirements analysis completed for ${filingType} filing. Entity: ${businessEntity.entityType} in ${businessEntity.jurisdiction}. Required: ${filingRequirements.isRequired}, Due: ${filingRequirements.dueDate}`
    });

    // Generate compliance guidance UI
    const uiRequest = this.createFilingGuidanceUI(filingRequirements, businessEntity);

    return {
      status: 'needs_input',
      data: { 
        filingRequirements,
        entityAnalysis: businessEntity,
        guidance: {
          isRequired: filingRequirements.isRequired,
          nextSteps: filingRequirements.isRequired 
            ? ['Gather required information', `Complete ${filingType} filing`, 'Submit with required fee']
            : [`No ${filingType} filing required for this entity type`]
        }
      },
      uiRequests: [uiRequest],
      reasoning: `${filingType} filing requirements validated, providing compliance guidance to user`,
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
   * Prepare compliance guidance for any filing type
   * Task Templates specify the exact form requirements
   */
  private async prepareComplianceGuidance(
    request: AgentRequest, 
    context: TaskContext, 
    businessEntity: any
  ): Promise<AgentResponse> {
    
    const filingType = request.data?.filingType || 'general';
    const guidanceTemplate = this.getGuidanceTemplate(filingType, businessEntity);
    const prefilledData = this.generatePrefilledData(businessEntity, filingType);

    await this.recordContextEntry(context, {
      operation: 'compliance_guidance_prepared',
      data: { 
        filingType,
        entityType: businessEntity.entityType,
        prefilledFields: Object.keys(prefilledData).length
      },
      reasoning: `Prepared ${filingType} compliance guidance with ${Object.keys(prefilledData).length} pre-filled fields`
    });

    return {
      status: 'completed',
      data: {
        guidanceTemplate,
        prefilledData,
        instructions: this.getFilingInstructions(filingType),
        submissionGuidance: this.getSubmissionGuidance(filingType, businessEntity)
      },
      reasoning: `${filingType} compliance guidance prepared with pre-filled data and submission instructions`
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

  private isFilingRequired(entity: any, filingType: string): boolean {
    // General filing requirement logic - specific rules come from Task Templates
    // This is a fallback implementation
    
    switch (filingType) {
      case 'soi':
        const soiRequiredTypes = ['Corporation', 'LLC', 'Limited Partnership'];
        return entity.jurisdiction === 'CA' && soiRequiredTypes.includes(entity.entityType);
      
      case 'franchise_tax':
        return entity.jurisdiction === 'CA' && ['Corporation', 'LLC'].includes(entity.entityType);
      
      default:
        // Conservative approach: assume filing is required unless proven otherwise
        return true;
    }
  }

  private calculateFilingDueDate(entity: any, filingType: string): Date | undefined {
    if (!this.isFilingRequired(entity, filingType) || !entity.formationDate) return undefined;
    
    const formationDate = new Date(entity.formationDate);
    const dueDate = new Date(formationDate);
    
    switch (filingType) {
      case 'soi':
        if (entity.entityType === 'Corporation' || entity.entityType === 'LLC') {
          // Initial due 90 days after formation, then biennial
          dueDate.setDate(dueDate.getDate() + 90);
        }
        break;
      
      case 'franchise_tax':
        // Franchise tax due on 15th day of 4th month after year end
        const nextYear = new Date(formationDate.getFullYear() + 1, 3, 15); // April 15
        return nextYear;
      
      default:
        // Default: assume 90 days for new filings
        dueDate.setDate(dueDate.getDate() + 90);
    }
    
    return dueDate;
  }

  private getFilingPeriod(entity: any, filingType: string): string {
    switch (filingType) {
      case 'soi':
        if (entity.entityType === 'Corporation' || entity.entityType === 'LLC') return 'Biennial';
        break;
      case 'franchise_tax':
        return 'Annual';
      default:
        return 'As Required';
    }
    return 'N/A';
  }

  private getFilingFee(entity: any, filingType: string): number {
    switch (filingType) {
      case 'soi':
        if (entity.entityType === 'Corporation') return 25;
        if (entity.entityType === 'LLC') return 20;
        break;
      case 'franchise_tax':
        return 800; // CA minimum franchise tax
      default:
        return 0;
    }
    return 0;
  }

  private getRequiredDocuments(entity: any, filingType: string): string[] {
    switch (filingType) {
      case 'soi':
        const docs = ['Business entity information', 'Current business address'];
        if (entity.entityType === 'Corporation') {
          docs.push('Officer and director information', 'Stock information');
        } else if (entity.entityType === 'LLC') {
          docs.push('Member and manager information');
        }
        return docs;
      case 'franchise_tax':
        return ['Financial statements', 'Tax calculation worksheets'];
      default:
        return ['Business entity information'];
    }
  }

  private getFormNumber(entity: any, filingType: string): string {
    switch (filingType) {
      case 'soi':
        if (entity.entityType === 'Corporation' || entity.entityType === 'LLC') return 'SI-550';
        break;
      case 'franchise_tax':
        return '100';
      default:
        return 'TBD';
    }
    return 'N/A';
  }

  private identifyComplianceRequirements(entity: any): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // SOI requirement (if applicable)
    if (this.isFilingRequired(entity, 'soi')) {
      requirements.push({
        type: 'Statement of Information',
        deadline: this.calculateFilingDueDate(entity, 'soi')?.toISOString() || '',
        status: 'due',
        priority: 'high',
        fee: this.getFilingFee(entity, 'soi'),
        forms: [this.getFormNumber(entity, 'soi')],
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

  private createFilingGuidanceUI(requirements: FilingRequirements, entity: any): UIRequest {
    return {
      requestId: `filing_guidance_${Date.now()}`,
      templateType: UITemplateType.InstructionPanel,
      semanticData: {
        agentRole: 'legal_compliance_agent',
        title: `${requirements.filingType.toUpperCase()} Filing Requirements`,
        description: requirements.isRequired 
          ? `Your ${entity.entityType} requires ${requirements.filingType} filing by ${requirements.dueDate?.toLocaleDateString()}`
          : `No ${requirements.filingType} filing required for your ${entity.entityType}`,
        requirements,
        entity,
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

  private getGuidanceTemplate(filingType: string, entity: any): any {
    // Return guidance template structure - specific forms come from Task Templates
    return {
      filingType,
      sections: ['Business Information', 'Contact Details', 'Filing Information'],
      fields: this.getRequiredFields(filingType, entity)
    };
  }

  private getRequiredFields(filingType: string, _entity: any): any[] {
    switch (filingType) {
      case 'soi':
        return [
          { id: 'businessName', label: 'Business Name', type: 'text', required: true },
          { id: 'entityType', label: 'Entity Type', type: 'select', required: true },
          { id: 'businessAddress', label: 'Business Address', type: 'address', required: true },
          { id: 'mailingAddress', label: 'Mailing Address', type: 'address', required: true }
        ];
      case 'franchise_tax':
        return [
          { id: 'businessName', label: 'Business Name', type: 'text', required: true },
          { id: 'taxYear', label: 'Tax Year', type: 'number', required: true },
          { id: 'totalIncome', label: 'Total Income', type: 'currency', required: true }
        ];
      default:
        return [
          { id: 'businessName', label: 'Business Name', type: 'text', required: true },
          { id: 'entityType', label: 'Entity Type', type: 'select', required: true }
        ];
    }
  }

  private generatePrefilledData(entity: any, filingType: string): any {
    const baseData = {
      businessName: entity.name,
      entityType: entity.entityType,
      jurisdiction: entity.jurisdiction,
      formationDate: entity.formationDate
    };

    // Add filing-specific data
    switch (filingType) {
      case 'franchise_tax':
        return {
          ...baseData,
          taxYear: new Date().getFullYear() - 1
        };
      default:
        return baseData;
    }
  }

  private getFilingInstructions(filingType: string): string[] {
    switch (filingType) {
      case 'soi':
        return [
          'Complete all required fields accurately',
          'Ensure business address is current',
          'Include all required attachments',
          'Submit with appropriate filing fee'
        ];
      case 'franchise_tax':
        return [
          'Review financial statements for accuracy',
          'Calculate minimum tax or income-based tax',
          'Submit by April 15th deadline',
          'Pay minimum $800 franchise tax'
        ];
      default:
        return [
          'Review all information for accuracy',
          'Submit by required deadline',
          'Include all required documentation'
        ];
    }
  }

  private getSubmissionGuidance(filingType: string, entity: any): any {
    switch (filingType) {
      case 'soi':
        return {
          method: 'online',
          url: 'https://bizfileonline.sos.ca.gov',
          fee: this.getFilingFee(entity, filingType),
          processingTime: '1-2 business days',
          confirmationMethod: 'email'
        };
      case 'franchise_tax':
        return {
          method: 'online',
          url: 'https://www.ftb.ca.gov',
          fee: this.getFilingFee(entity, filingType),
          processingTime: '3-5 business days',
          confirmationMethod: 'mail and email'
        };
      default:
        return {
          method: 'varies',
          url: 'Contact agency directly',
          fee: this.getFilingFee(entity, filingType),
          processingTime: 'varies',
          confirmationMethod: 'varies'
        };
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