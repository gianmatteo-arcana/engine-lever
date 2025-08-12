/**
 * Entity Compliance Agent
 * EXACTLY matches PRD lines 521-600
 * 
 * Specialized agent that determines regulatory requirements and generates
 * actionable compliance calendars based on business profile data
 */

import { Agent } from './base/Agent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest 
} from '../types/engine-types';

interface BusinessProfile {
  name: string;
  entityType: 'LLC' | 'Corporation' | 'Partnership' | 'Sole Proprietorship';
  state: string;
  industry?: string;
  formationDate?: string;
  employeeCount?: number;
  website?: string;
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
export class ComplianceAnalyzer extends Agent {
  constructor() {
    super('entity_compliance_agent.yaml');
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
      const complianceRequirements = await this.analyzeComplianceRequirements(businessProfile);
      
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
      entry.operation === 'business_found'
    );

    const profileData = profileEntry?.data?.business || {};

    return {
      name: profileData.name || business.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      entityType: profileData.entityType || business.entityType || 'Sole Proprietorship',
      state: profileData.state || business.state || 'CA',
      industry: profileData.industry || business.industry,
      formationDate: profileData.formationDate || business.formationDate,
      employeeCount: business.employeeCount || 1,
      website: profileData.website || business.website
    };
  }

  /**
   * Analyze compliance requirements based on business profile
   */
  private async analyzeComplianceRequirements(profile: BusinessProfile): Promise<ComplianceRequirement[]> {
    const requirements: ComplianceRequirement[] = [];

    // Entity-specific requirements
    requirements.push(...this.getEntityTypeRequirements(profile));
    
    // State-specific requirements
    requirements.push(...this.getStateRequirements(profile));
    
    // Industry-specific requirements
    if (profile.industry) {
      requirements.push(...this.getIndustryRequirements(profile));
    }
    
    // Federal tax requirements
    requirements.push(...this.getFederalTaxRequirements(profile));
    
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
   */
  private getEntityTypeRequirements(profile: BusinessProfile): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    switch (profile.entityType) {
      case 'LLC':
        requirements.push({
          id: 'llc_operating_agreement',
          name: 'LLC Operating Agreement',
          description: 'Create and maintain operating agreement defining member rights and responsibilities',
          category: 'governance',
          priority: 'high',
          deadline: this.addDays(new Date(), 30),
          frequency: 'once',
          estimatedCost: 500,
          consequences: 'Default state rules apply, potential member disputes',
          forms: ['Operating Agreement Template']
        });
        break;

      case 'Corporation':
        requirements.push(
          {
            id: 'corp_bylaws',
            name: 'Corporate Bylaws',
            description: 'Adopt corporate bylaws governing board and shareholder procedures',
            category: 'governance',
            priority: 'critical',
            deadline: this.addDays(new Date(), 15),
            frequency: 'once',
            estimatedCost: 750,
            consequences: 'Corporate veil piercing risk, governance disputes',
            forms: ['Corporate Bylaws', 'Board Resolutions']
          },
          {
            id: 'annual_board_meeting',
            name: 'Annual Board Meeting',
            description: 'Hold annual board meeting and document with minutes',
            category: 'governance',
            priority: 'high',
            deadline: this.addDays(new Date(), 365),
            frequency: 'annual',
            estimatedCost: 200,
            consequences: 'Loss of corporate protections, compliance violations'
          }
        );
        break;

      case 'Partnership':
        requirements.push({
          id: 'partnership_agreement',
          name: 'Partnership Agreement',
          description: 'Draft partnership agreement defining partner roles and profit sharing',
          category: 'governance',
          priority: 'high',
          deadline: this.addDays(new Date(), 45),
          frequency: 'once',
          estimatedCost: 600,
          consequences: 'Default partnership rules apply, potential disputes'
        });
        break;

      case 'Sole Proprietorship':
        if (profile.name !== profile.name.split(' ')[0]) { // If business name differs from personal name
          requirements.push({
            id: 'dba_filing',
            name: 'DBA (Doing Business As) Filing',
            description: 'File fictitious business name with county clerk',
            category: 'filing',
            priority: 'critical',
            deadline: this.addDays(new Date(), 30),
            frequency: 'once',
            estimatedCost: 75,
            consequences: 'Cannot legally operate under business name, banking issues'
          });
        }
        break;
    }

    return requirements;
  }

  /**
   * Get state-specific requirements
   */
  private getStateRequirements(profile: BusinessProfile): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // Get next annual report deadline based on state
    const annualReportDeadline = this.calculateAnnualReportDeadline(profile.state, profile.formationDate);
    
    requirements.push({
      id: 'annual_report',
      name: `${profile.state} Annual Report`,
      description: `File annual report with ${profile.state} Secretary of State`,
      category: 'filing',
      priority: 'critical',
      deadline: annualReportDeadline,
      frequency: 'annual',
      estimatedCost: this.getStateFilingFee(profile.state),
      consequences: 'Administrative dissolution, loss of good standing',
      forms: ['Annual Report Form', 'Statement of Information']
    });

    // Registered agent requirement
    if (profile.entityType !== 'Sole Proprietorship') {
      requirements.push({
        id: 'registered_agent',
        name: 'Registered Agent Maintenance',
        description: 'Maintain registered agent for service of process',
        category: 'governance',
        priority: 'critical',
        deadline: this.addDays(new Date(), 365),
        frequency: 'annual',
        estimatedCost: 150,
        consequences: 'Administrative dissolution, legal service issues'
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
   * Get federal tax requirements
   */
  private getFederalTaxRequirements(profile: BusinessProfile): ComplianceRequirement[] {
    const requirements: ComplianceRequirement[] = [];

    // EIN application if not sole proprietorship
    if (profile.entityType !== 'Sole Proprietorship') {
      requirements.push({
        id: 'federal_ein',
        name: 'Federal EIN Application',
        description: 'Apply for Employer Identification Number with IRS',
        category: 'tax',
        priority: 'critical',
        deadline: this.addDays(new Date(), 15),
        frequency: 'once',
        estimatedCost: 0,
        consequences: 'Cannot open business bank account, payroll issues'
      });
    }

    // Annual tax return
    const taxDeadline = this.calculateTaxDeadline(profile.entityType);
    requirements.push({
      id: 'annual_tax_return',
      name: 'Annual Tax Return',
      description: `File ${this.getTaxFormForEntity(profile.entityType)} with IRS`,
      category: 'tax',
      priority: 'critical',
      deadline: taxDeadline,
      frequency: 'annual',
      estimatedCost: 500,
      consequences: 'Penalties, interest, potential audit',
      forms: [this.getTaxFormForEntity(profile.entityType)]
    });

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
    };
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
    };
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
      id: `compliance_roadmap_${Date.now()}`,
      agentRole: 'entity_compliance_agent',
      suggestedTemplates: ['compliance_roadmap'],
      dataNeeded: ['priority_confirmation', 'deadline_adjustments'],
      context: {
        userProgress: 65,
        deviceType: 'mobile',
        urgency: riskAssessment.overallRisk === 'high' ? 'high' : 'medium'
      },
      title: 'Your Compliance Roadmap',
      description: `We've identified ${calendar.requirements.length} requirements for your ${profile.entityType} in ${profile.state}. Let's prioritize what's most important.`,
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
        accept: () => ({ action: 'accept_roadmap', calendar }),
        customize: () => ({ action: 'customize_priorities' }),
        help: () => ({ action: 'explain_requirements' })
      },
      progressIndicator: {
        current: 3,
        total: 4,
        label: 'Compliance Planning'
      }
    };
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

  private calculateAnnualReportDeadline(state: string, _formationDate?: string): string {
    const now = new Date();
    let deadline = new Date();

    switch (state) {
      case 'CA':
        // California varies by entity type and formation date
        deadline.setMonth(11, 31); // December 31st default
        break;
      case 'DE':
        deadline = new Date(now.getFullYear(), 2, 1); // March 1st
        break;
      case 'NY':
        deadline = new Date(now.getFullYear(), 4, 15); // May 15th
        break;
      default:
        deadline = new Date(now.getFullYear(), 11, 31); // December 31st default
    }

    // If deadline has passed, move to next year
    if (deadline < now) {
      deadline.setFullYear(deadline.getFullYear() + 1);
    }

    return deadline.toISOString();
  }

  private getStateFilingFee(state: string): number {
    const fees: Record<string, number> = {
      'CA': 20,
      'DE': 300,
      'NY': 25,
      'TX': 50,
      'FL': 61.25
    };
    return fees[state] || 50; // Default $50
  }

  private calculateTaxDeadline(entityType: string): string {
    const now = new Date();
    let deadline = new Date();

    switch (entityType) {
      case 'Corporation':
        deadline = new Date(now.getFullYear(), 2, 15); // March 15th
        break;
      default:
        deadline = new Date(now.getFullYear(), 3, 15); // April 15th
    }

    if (deadline < now) {
      deadline.setFullYear(deadline.getFullYear() + 1);
    }

    return deadline.toISOString();
  }

  private getTaxFormForEntity(entityType: string): string {
    switch (entityType) {
      case 'Corporation': return 'Form 1120';
      case 'LLC': return 'Form 1065 or 1040 Schedule C';
      case 'Partnership': return 'Form 1065';
      default: return 'Form 1040 Schedule C';
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
        id: 'compliance_analyzer',
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