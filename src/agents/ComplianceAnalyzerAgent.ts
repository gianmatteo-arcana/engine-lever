/**
 * Entity Compliance Agent
 * EXACTLY matches PRD lines 521-600
 * 
 * Specialized agent that determines regulatory requirements and generates
 * actionable compliance calendars based on business profile data
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
// import { FluidUIActions } from '../types/compatibility-layer';

interface BusinessProfile {
  name: string;
  entityType: string; // Generic - Task Templates define valid types
  location?: string; // Generic location - Task Templates define format
  industry?: string;
  formationDate?: string;
  employeeCount?: number;
  website?: string;
  attributes?: Record<string, any>; // Task Template specific attributes
}

interface ComplianceRequirement {
  id: string;
  name: string;
  description: string;
  category: 'filing' | 'license' | 'tax' | 'governance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline: string; // ISO date
  frequency: 'once' | 'annual' | 'quarterly' | 'monthly';
  estimatedCost: number;
  consequences: string;
  forms?: string[];
  dependencies?: string[];
}

interface ComplianceCalendar {
  businessId: string;
  generatedAt: string;
  requirements: ComplianceRequirement[];
  summary: {
    criticalCount: number;
    highCount: number;
    totalEstimatedCost: number;
    nextDeadline: string;
  };
}

interface RiskAssessment {
  overallRisk: 'high' | 'medium' | 'low';
  criticalIssues: string[];
  mediumIssues: string[];
  recommendations: string[];
}

/**
 * Compliance Analyzer - Determines regulatory requirements
 */
export class ComplianceAnalyzerAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('entity_compliance_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - analyzes compliance requirements
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `eca_${Date.now()}`;
    
    try {
      // Extract business profile from context
      const businessProfile = this.extractBusinessProfile(context);
      
      // Record analysis initiation
      await this.recordContextEntry(context, {
        operation: 'compliance_analysis_initiated',
        data: { 
          businessProfile,
          requestId 
        },
        reasoning: 'Starting comprehensive compliance analysis based on business profile and entity characteristics'
      });

      // Perform regulatory analysis
      const complianceRequirements = await this.analyzeComplianceRequirements(businessProfile, context);
      
      // Generate compliance calendar
      const complianceCalendar = this.generateComplianceCalendar(businessProfile, complianceRequirements);
      
      // Assess compliance risks
      const riskAssessment = this.assessComplianceRisks(complianceRequirements, businessProfile);
      
      // Record analysis results
      await this.recordContextEntry(context, {
        operation: 'compliance_requirements_identified',
        data: {
          requirementsCount: complianceRequirements.length,
          criticalCount: complianceCalendar.summary.criticalCount,
          totalCost: complianceCalendar.summary.totalEstimatedCost,
          nextDeadline: complianceCalendar.summary.nextDeadline,
          riskLevel: riskAssessment.overallRisk
        },
        reasoning: `Identified ${complianceRequirements.length} compliance requirements with ${complianceCalendar.summary.criticalCount} critical items and ${riskAssessment.overallRisk} overall risk`
      });

      // Generate compliance roadmap UI
      const uiRequest = this.generateComplianceRoadmapUI(
        complianceCalendar,
        riskAssessment,
        businessProfile
      );
      
      return {
        status: 'needs_input',
        data: {
          requirements: complianceCalendar.requirements || [],
          complianceCalendar,
          riskAssessment,
          businessProfile
        },
        uiRequests: [uiRequest],
        reasoning: 'Generated comprehensive compliance roadmap requiring user review and prioritization',
        nextAgent: 'ux_optimization_agent'
      };

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'compliance_analysis_error',
        data: { error: error.message, requestId },
        reasoning: 'Compliance analysis failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during compliance analysis'
      };
    }
  }

  /**
   * Extract business profile from task context
   */
  private extractBusinessProfile(context: TaskContext): BusinessProfile {
    const currentData = context.currentState.data;
    const business = currentData.business || {};
    const user = currentData.user || {};

    // Look for profile collection results
    const profileEntry = context.history.find(entry => 
      entry.operation === 'profile_collection_initiated' || 
      entry.operation === 'entity_discovered'
    );

    const profileData = profileEntry?.data?.entity || profileEntry?.data?.business || {};

    // Build profile from available data - Task Templates define defaults
    const profile: BusinessProfile = {
      name: profileData.name || business.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      entityType: profileData.entityType || business.entityType || context.metadata?.defaultEntityType || 'unspecified',
      location: profileData.location || profileData.state || business.location || business.state || user.location || context.metadata?.defaultLocation,
      industry: profileData.industry || business.industry,
      formationDate: profileData.formationDate || business.formationDate,
      employeeCount: business.employeeCount,
      website: profileData.website || business.website,
      attributes: { ...profileData.attributes, ...business.attributes }
    };

    return profile;
  }

  /**
   * Analyze compliance requirements based on business profile
   */
  private async analyzeComplianceRequirements(profile: BusinessProfile, context: TaskContext): Promise<ComplianceRequirement[]> {
    const requirements: ComplianceRequirement[] = [];

    // Entity-specific requirements
    requirements.push(...this.getEntityTypeRequirements(profile, context));
    
    // State-specific requirements
    requirements.push(...this.getStateRequirements(profile, context));
    
    // Industry-specific requirements
    if (profile.industry) {
      requirements.push(...this.getIndustryRequirements(profile));
    }
    
    // Federal tax requirements
    requirements.push(...this.getFederalTaxRequirements(profile, context));
    
    // Calculate deadlines for all requirements
    this.calculateDeadlines(requirements, profile);
    
    // Sort by priority and deadline
    return requirements.sort((a, b) => {
      const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
  }

  /**
   * Get entity type specific requirements
   * Generic implementation - Task Templates provide entity-specific rules
   */
  private getEntityTypeRequirements(profile: BusinessProfile, context: TaskContext): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // Get entity rules from Task Template metadata  
    const entityRules = context.metadata?.entityRules?.[profile.entityType] || {};
    
    // Generate requirements based on Task Template configuration
    if (entityRules.governanceRequirements) {
      entityRules.governanceRequirements.forEach((req: any) => {
        requirements.push({
          id: req.id || `governance_${Date.now()}`,
          name: req.name || 'Governance Requirement',
          description: req.description || 'Entity governance requirement',
          category: 'governance',
          priority: req.priority || 'medium',
          deadline: this.addDays(new Date(), req.daysToComplete || 30),
          frequency: req.frequency || 'once',
          estimatedCost: req.estimatedCost || 0,
          consequences: req.consequences || 'Regulatory compliance risk',
          forms: req.forms || []
        });
      });
    }

    // Check for name registration requirements
    if (entityRules.requiresNameRegistration) {
      const needsRegistration = this.checkNameRegistrationRequired(profile, context);
      if (needsRegistration) {
        requirements.push({
          id: 'name_registration',
          name: 'Business Name Registration',
          description: 'Register business name with appropriate authority',
          category: 'filing',
          priority: 'critical',
          deadline: this.addDays(new Date(), 30),
          frequency: 'once',
          estimatedCost: entityRules.nameRegistrationCost || 100,
          consequences: 'Cannot legally operate under business name',
          forms: ['Name Registration Form']
        });
      }
    }

    // Add any custom requirements from Task Template
    const customRequirements = context.metadata?.customRequirements || [];
    customRequirements.forEach((req: any) => {
      if (this.evaluateRequirementCondition(req.condition, profile)) {
        requirements.push(this.createRequirementFromTemplate(req, profile));
      }
    });

    return requirements;
  }

  /**
   * Get location-specific requirements
   * Generic implementation - Task Templates provide jurisdiction rules
   */
  private getStateRequirements(profile: BusinessProfile, context: TaskContext): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // Get jurisdiction rules from Task Template
    const jurisdictionRules = context.metadata?.jurisdictionRules || {};
    const location = profile.location || 'default';
    const locationRules = jurisdictionRules[location] || jurisdictionRules.default || {};

    // Annual reporting requirements
    if (locationRules.annualReporting) {
      const annualReportDeadline = this.calculateAnnualReportDeadline(
        location, 
        profile.formationDate,
        context
      );
      
      requirements.push({
        id: 'annual_report',
        name: locationRules.annualReportName || 'Annual Report',
        description: locationRules.annualReportDescription || 'File annual report with regulatory authority',
        category: 'filing',
        priority: locationRules.annualReportPriority || 'critical',
        deadline: annualReportDeadline,
        frequency: 'annual',
        estimatedCost: locationRules.annualReportFee || 50,
        consequences: locationRules.annualReportConsequences || 'Loss of good standing',
        forms: locationRules.annualReportForms || ['Annual Report Form']
      });
    }

    // Agent/representative requirements
    if (locationRules.requiresRegisteredAgent) {
      const agentRequired = this.evaluateAgentRequirement(profile, locationRules);
      if (agentRequired) {
        requirements.push({
          id: 'registered_agent',
          name: locationRules.agentName || 'Registered Representative',
          description: locationRules.agentDescription || 'Maintain registered representative for official communications',
          category: 'governance',
          priority: 'critical',
          deadline: this.addDays(new Date(), 365),
          frequency: 'annual',
          estimatedCost: locationRules.agentCost || 150,
          consequences: locationRules.agentConsequences || 'Legal service issues'
        });
      }
    }

    // Additional jurisdiction-specific requirements
    if (locationRules.additionalRequirements) {
      locationRules.additionalRequirements.forEach((req: any) => {
        requirements.push(this.createRequirementFromTemplate(req, profile));
      });
    }

    return requirements;
  }

  /**
   * Get industry-specific requirements
   */
  private getIndustryRequirements(profile: BusinessProfile): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    switch (profile.industry) {
      case 'Food & Beverage':
        requirements.push({
          id: 'food_service_license',
          name: 'Food Service License',
          description: 'Obtain food service permit from local health department',
          category: 'license',
          priority: 'critical',
          deadline: this.addDays(new Date(), 45),
          frequency: 'annual',
          estimatedCost: 300,
          consequences: 'Cannot legally serve food, health department shutdown'
        });
        break;

      case 'Professional Services':
        requirements.push({
          id: 'professional_license',
          name: 'Professional License Renewal',
          description: 'Renew professional license with state licensing board',
          category: 'license',
          priority: 'critical',
          deadline: this.addDays(new Date(), 90),
          frequency: 'annual',
          estimatedCost: 250,
          consequences: 'Cannot legally practice, professional sanctions'
        });
        break;

      case 'Retail':
        requirements.push({
          id: 'sales_tax_permit',
          name: 'Sales Tax Permit',
          description: 'Register for sales tax permit with state revenue department',
          category: 'tax',
          priority: 'critical',
          deadline: this.addDays(new Date(), 30),
          frequency: 'once',
          estimatedCost: 0,
          consequences: 'Cannot legally collect sales tax, penalties and interest'
        });
        break;
    }

    return requirements;
  }

  /**
   * Get tax requirements
   * Generic implementation - Task Templates provide tax rules
   */
  private getFederalTaxRequirements(profile: BusinessProfile, context: TaskContext): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // Get tax rules from Task Template
    const taxConfig = context.metadata?.taxRequirements || {};
    
    // Tax identification requirements
    if (taxConfig.requiresTaxId) {
      const needsTaxId = this.evaluateTaxIdRequirement(profile, taxConfig);
      if (needsTaxId) {
        requirements.push({
          id: 'tax_identification',
          name: taxConfig.taxIdName || 'Tax Identification Application',
          description: taxConfig.taxIdDescription || 'Apply for tax identification number',
          category: 'tax',
          priority: 'critical',
          deadline: this.addDays(new Date(), taxConfig.taxIdDeadlineDays || 15),
          frequency: 'once',
          estimatedCost: taxConfig.taxIdCost || 0,
          consequences: taxConfig.taxIdConsequences || 'Cannot conduct business operations'
        });
      }
    }

    // Annual tax filing requirements
    if (taxConfig.annualFiling !== false) {
      const taxDeadline = this.calculateTaxDeadline(profile.entityType, context);
      const taxForm = this.getTaxFormForEntity(profile.entityType, context);
      
      requirements.push({
        id: 'annual_tax_return',
        name: taxConfig.annualFilingName || 'Annual Tax Return',
        description: taxConfig.annualFilingDescription || `File ${taxForm} with tax authority`,
        category: 'tax',
        priority: 'critical',
        deadline: taxDeadline,
        frequency: 'annual',
        estimatedCost: taxConfig.annualFilingCost || 500,
        consequences: taxConfig.annualFilingConsequences || 'Penalties and interest',
        forms: [taxForm]
      });
    }

    // Additional tax requirements from Task Template
    if (taxConfig.additionalRequirements) {
      taxConfig.additionalRequirements.forEach((req: any) => {
        if (this.evaluateRequirementCondition(req.condition, profile)) {
          requirements.push(this.createRequirementFromTemplate(req, profile));
        }
      });
    }

    return requirements;
  }

  /**
   * Generate compliance calendar
   */
  private generateComplianceCalendar(profile: BusinessProfile, requirements: ComplianceRequirement[]): ComplianceCalendar {
    const criticalCount = requirements.filter(r => r.priority === 'critical').length;
    const highCount = requirements.filter(r => r.priority === 'high').length;
    const totalCost = requirements.reduce((sum, r) => sum + r.estimatedCost, 0);
    const nextDeadline = requirements.length > 0 ? requirements[0].deadline : '';

    return {
      businessId: `biz_${profile.name.replace(/\s+/g, '_').toLowerCase()}`,
      generatedAt: new Date().toISOString(),
      requirements,
      summary: {
        criticalCount,
        highCount,
        totalEstimatedCost: totalCost,
        nextDeadline
      }
    } as any;
  }

  /**
   * Assess compliance risks
   */
  private assessComplianceRisks(requirements: ComplianceRequirement[], profile: BusinessProfile): RiskAssessment {
    const criticalIssues: string[] = [];
    const mediumIssues: string[] = [];
    const recommendations: string[] = [];

    // Check for high-risk situations
    const criticalRequirements = requirements.filter(r => r.priority === 'critical');
    const overdueSoon = requirements.filter(r => 
      new Date(r.deadline).getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000 // 30 days
    );

    if (criticalRequirements.length > 3) {
      criticalIssues.push('Multiple critical compliance requirements pending');
    }

    if (overdueSoon.length > 0) {
      criticalIssues.push(`${overdueSoon.length} requirements due within 30 days`);
    }

    // Entity-specific risks
    if (profile.entityType === 'Corporation' && !requirements.find(r => r.id === 'corp_bylaws')) {
      criticalIssues.push('Corporation operating without bylaws - high liability risk');
    }

    // Generate recommendations
    if (criticalRequirements.length > 0) {
      recommendations.push('Focus on critical requirements first to avoid penalties');
    }

    if (requirements.filter(r => r.category === 'tax').length > 2) {
      recommendations.push('Consider consulting with tax professional for complex obligations');
    }

    const overallRisk = criticalIssues.length > 0 ? 'high' : 
                       mediumIssues.length > 0 ? 'medium' : 'low';

    return {
      overallRisk,
      criticalIssues,
      mediumIssues,
      recommendations
    } as any;
  }

  /**
   * Generate compliance roadmap UI request
   */
  private generateComplianceRoadmapUI(
    calendar: ComplianceCalendar,
    riskAssessment: RiskAssessment,
    profile: BusinessProfile
  ): UIRequest {
    return {
      requestId: `compliance_roadmap_${Date.now()}`,
      templateType: UITemplateType.ComplianceRoadmap,
      semanticData: {
        agentRole: 'entity_compliance_agent',
        suggestedTemplates: ['compliance_roadmap'],
        dataNeeded: ['priority_confirmation', 'deadline_adjustments'],
        title: 'Your Compliance Roadmap',
        description: `We've identified ${calendar.requirements.length} requirements for your ${profile.entityType} in ${profile.location || 'your jurisdiction'}. Let's prioritize what's most important.`,
        complianceCalendar: calendar,
        riskAssessment,
        businessProfile: profile,
        sections: [
          {
            id: 'critical_requirements',
            title: 'Critical Requirements',
            items: calendar.requirements.filter(r => r.priority === 'critical'),
            urgency: 'high'
          },
          {
            id: 'upcoming_deadlines',
            title: 'Next 90 Days',
            items: calendar.requirements.filter(r => 
              new Date(r.deadline).getTime() - new Date().getTime() < 90 * 24 * 60 * 60 * 1000
            ),
            urgency: 'medium'
          },
          {
            id: 'annual_planning',
            title: 'Annual Planning',
            items: calendar.requirements.filter(r => r.frequency === 'annual'),
            urgency: 'low'
          }
        ],
        actions: {
          accept: {
            type: 'submit',
            label: 'Accept',
            primary: true,
            handler: () => ({ action: 'accept_roadmap', calendar })
          },
          customize: {
            type: 'custom',
            label: 'Customize',
            handler: () => ({ action: 'customize_priorities' })
          },
          help: {
            type: 'custom',
            label: 'Help',
            handler: () => ({ action: 'explain_requirements' })
          }
        },
        progressIndicator: {
          current: 3,
          total: 4,
          label: 'Compliance Planning'
        }
      },
      context: {
        userProgress: 65,
        deviceType: 'mobile',
        urgency: riskAssessment.overallRisk === 'high' ? 'high' : 'medium'
      }
    } as any;
  }

  // Helper methods
  private addDays(date: Date, days: number): string {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString();
  }

  private calculateDeadlines(requirements: ComplianceRequirement[], _profile: BusinessProfile): void {
    // This would typically integrate with real calendar systems
    // For now, using business logic for common deadlines
    requirements.forEach(req => {
      if (!req.deadline) {
        req.deadline = this.addDays(new Date(), 90); // Default 90 days
      }
    });
  }

  private calculateAnnualReportDeadline(location: string, formationDate?: string, context?: TaskContext): string {
    const now = new Date();
    let deadline = new Date();

    // Get deadline rules from Task Template
    const deadlineRules = context?.metadata?.deadlineRules?.[location] || 
                         context?.metadata?.deadlineRules?.default || {};

    if (deadlineRules.annualReportDeadline) {
      // Use Task Template defined deadline logic
      const { month, day } = deadlineRules.annualReportDeadline;
      deadline = new Date(now.getFullYear(), month - 1, day);
    } else if (formationDate && deadlineRules.useFormationDate) {
      // Calculate based on formation date if specified
      const formation = new Date(formationDate);
      deadline = new Date(now.getFullYear(), formation.getMonth(), formation.getDate());
    } else {
      // Default to end of year
      deadline = new Date(now.getFullYear(), 11, 31);
    }

    // If deadline has passed, move to next period
    if (deadline < now) {
      deadline.setFullYear(deadline.getFullYear() + 1);
    }

    return deadline.toISOString();
  }

  private getStateFilingFee(location: string, context?: TaskContext): number {
    // Get fee structure from Task Template
    const feeStructure = context?.metadata?.feeStructure || {};
    return feeStructure[location]?.annualReportFee || 
           feeStructure.default?.annualReportFee || 
           50; // Default if not specified
  }

  private calculateTaxDeadline(entityType: string, context?: TaskContext): string {
    const now = new Date();
    let deadline = new Date();

    // Get tax deadline rules from Task Template
    const taxRules = context?.metadata?.taxRules || {};
    const entityTaxRule = taxRules[entityType] || taxRules.default || {};

    if (entityTaxRule.taxDeadline) {
      const { month, day } = entityTaxRule.taxDeadline;
      deadline = new Date(now.getFullYear(), month - 1, day);
    } else {
      // Default tax deadline
      deadline = new Date(now.getFullYear(), 3, 15); // April 15th default
    }

    if (deadline < now) {
      deadline.setFullYear(deadline.getFullYear() + 1);
    }

    return deadline.toISOString();
  }

  private getTaxFormForEntity(entityType: string, context?: TaskContext): string {
    // Get tax form mapping from Task Template
    const taxForms = context?.metadata?.taxForms || {};
    return taxForms[entityType] || 
           taxForms.default || 
           'Tax Return Form'; // Generic default
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
        id: 'compliance_analyzer',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Compliance analysis action',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'compliance_analyzer',
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

  /**
   * Helper method to check if name registration is required
   */
  private checkNameRegistrationRequired(profile: BusinessProfile, context?: TaskContext): boolean {
    // Task Templates define when name registration is needed
    const nameRules = context?.metadata?.nameRegistrationRules || {};
    
    // Generic check - if business name differs from personal name
    if (nameRules.checkPersonalName && profile.name) {
      const nameParts = profile.name.split(' ');
      if (nameParts.length > 1 && profile.name !== nameParts[0]) {
        return true;
      }
    }
    
    // Check custom rules from Task Template
    if (nameRules.customCheck) {
      return this.evaluateRequirementCondition(nameRules.customCheck, profile);
    }
    
    return false;
  }

  /**
   * Evaluate if a requirement condition is met
   */
  private evaluateRequirementCondition(condition: any, profile: BusinessProfile): boolean {
    if (!condition) return true;
    
    // Task Templates define condition evaluation logic
    if (typeof condition === 'boolean') return condition;
    
    if (typeof condition === 'object') {
      // Evaluate based on profile attributes
      for (const [key, value] of Object.entries(condition)) {
        const profileValue = (profile as any)[key] || profile.attributes?.[key];
        if (profileValue !== value) return false;
      }
      return true;
    }
    
    return true;
  }

  /**
   * Create requirement from Task Template definition
   */
  private createRequirementFromTemplate(template: any, _profile: BusinessProfile): ComplianceRequirement {
    return {
      id: template.id || `req_${Date.now()}`,
      name: template.name || 'Compliance Requirement',
      description: template.description || 'Required for compliance',
      category: template.category || 'filing',
      priority: template.priority || 'medium',
      deadline: this.addDays(new Date(), template.daysToComplete || 30),
      frequency: template.frequency || 'once',
      estimatedCost: template.estimatedCost || 0,
      consequences: template.consequences || 'Compliance risk',
      forms: template.forms || [],
      dependencies: template.dependencies
    };
  }

  /**
   * Evaluate if agent/representative is required
   */
  private evaluateAgentRequirement(profile: BusinessProfile, locationRules: any): boolean {
    if (!locationRules.agentConditions) return true;
    
    // Task Templates define when agents are required
    const conditions = locationRules.agentConditions;
    
    // Check entity type conditions
    if (conditions.excludedEntityTypes) {
      if (conditions.excludedEntityTypes.includes(profile.entityType)) {
        return false;
      }
    }
    
    if (conditions.requiredEntityTypes) {
      return conditions.requiredEntityTypes.includes(profile.entityType);
    }
    
    // Default to required unless explicitly excluded
    return true;
  }

  /**
   * Evaluate if tax ID is required
   */
  private evaluateTaxIdRequirement(profile: BusinessProfile, taxConfig: any): boolean {
    if (!taxConfig.taxIdConditions) return true;
    
    const conditions = taxConfig.taxIdConditions;
    
    // Check entity type conditions
    if (conditions.excludedEntityTypes) {
      if (conditions.excludedEntityTypes.includes(profile.entityType)) {
        return false;
      }
    }
    
    // Check other conditions from Task Template
    if (conditions.customCheck) {
      return this.evaluateRequirementCondition(conditions.customCheck, profile);
    }
    
    return true;
  }

  /**
   * Evaluate risk conditions
   */
  private evaluateRiskCondition(
    risk: any, 
    requirements: ComplianceRequirement[], 
    profile: BusinessProfile
  ): boolean {
    if (!risk.condition) return true;
    
    // Check if specific requirement is missing
    if (risk.condition.missingRequirement) {
      return !requirements.find(r => r.id === risk.condition.missingRequirement);
    }
    
    // Check profile conditions
    if (risk.condition.profileCheck) {
      return this.evaluateRequirementCondition(risk.condition.profileCheck, profile);
    }
    
    return false;
  }
}