/**
 * DataEnrichmentAgent - Migrated from IntelligentDataEnrichmentService
 * Intelligent data enrichment specialist for business discovery and information gathering
 */

import { BaseAgent } from './base/UnifiedBaseAgent';
import { AgentTaskContext as TaskContext } from '../types/unified-agent-types';
import { logger } from '../utils/logger';

// Enhanced interfaces for A2A protocol
interface OAuthData {
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  [key: string]: string | boolean | undefined;
}

interface EnrichedUserData {
  userInfo: {
    firstName?: string;
    lastName?: string;
    email?: string;
    profilePicture?: string;
  };
  domainInfo: {
    domain: string | null;
    isPersonalEmail: boolean;
    suggestedBusinessName: string | null;
  };
  confidence: number;
}

interface BusinessInference {
  businessType: 'tech_startup' | 'local_business' | 'professional_services' | 'enterprise' | 'unknown';
  probableStructure: string | null;
  probableState: string | null;
  reasoning: string;
  confidence: number;
}

interface PublicRecordsResult {
  found: boolean;
  business?: {
    name: string;
    entityNumber?: string;
    state?: string;
    status?: string;
    formationDate?: string;
    registeredAgent?: {
      name: string;
      address: string;
    };
  };
  confidence: number;
  sources: string[];
}

export class DataEnrichmentAgent extends BaseAgent {
  constructor() {
    super('src/agents/configs/data-enrichment-agent.yaml');
  }

  /**
   * Helper method to set the last operation in the context
   */
  private setLastOperation(context: TaskContext, operation: string): void {
    if (!context.agentContexts[this.agentId]) {
      context.agentContexts[this.agentId] = {
        state: {},
        requirements: [],
        findings: [],
        nextActions: []
      };
    }
    context.agentContexts[this.agentId].state.lastOperation = operation;
  }

  protected async executeTaskLogic(
    taskId: string, 
    context: TaskContext, 
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const operation = parameters.operation as string;
    
    try {
      switch (operation) {
        case 'domainAnalysis':
          this.setLastOperation(context, 'domainAnalysis');
          return await this.performDomainAnalysis(taskId, context, parameters);
        case 'publicRecordsSearch':
          this.setLastOperation(context, 'publicRecordsSearch');
          return await this.performPublicRecordsSearch(taskId, context, parameters);
        case 'businessInference':
          this.setLastOperation(context, 'businessInference');
          return await this.performBusinessInference(taskId, context, parameters);
        case 'oauthProcessing':
          this.setLastOperation(context, 'oauthProcessing');
          return await this.processOAuthData(taskId, context, parameters);
        case 'fullEnrichment':
          this.setLastOperation(context, 'fullEnrichment');
          return await this.performFullEnrichment(taskId, context, parameters);
        default:
          this.setLastOperation(context, operation);
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      logger.error('DataEnrichmentAgent: Task execution failed', {
        taskId,
        operation,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Update context with error information
      context.agentContexts[this.agentId] = {
        ...context.agentContexts[this.agentId],
        state: {
          ...context.agentContexts[this.agentId]?.state,
          error: error instanceof Error ? error.message : String(error),
          lastOperation: operation,
          failedAt: new Date().toISOString()
        }
      };
      
      return context;
    }
  }

  private async performDomainAnalysis(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const email = parameters.email as string;
    
    if (!email) {
      throw new Error('Email is required for domain analysis');
    }

    const domain = this.extractDomain(email);
    const isPersonalEmail = this.isPersonalEmailDomain(domain);
    const suggestedBusinessName = isPersonalEmail ? null : this.inferBusinessNameFromDomain(domain);
    
    const domainAnalysis = {
      domain,
      isPersonalEmail,
      suggestedBusinessName,
      confidence: isPersonalEmail ? 0.9 : (suggestedBusinessName ? 0.7 : 0.3)
    };

    // Update context with domain analysis results
    context.agentContexts[this.agentId] = {
      ...context.agentContexts[this.agentId],
      state: {
        ...context.agentContexts[this.agentId]?.state,
        domainAnalysis
      },
      findings: [
        ...(context.agentContexts[this.agentId]?.findings || []),
        {
          type: 'domain_analysis',
          data: domainAnalysis,
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('DataEnrichmentAgent: Domain analysis completed', {
      taskId,
      domain,
      isPersonalEmail,
      confidence: domainAnalysis.confidence
    });

    return context;
  }

  private async performPublicRecordsSearch(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const businessName = parameters.businessName as string;
    const state = parameters.state as string || 'CA';
    
    if (!businessName) {
      throw new Error('Business name is required for public records search');
    }

    // Use ca_sos_search tool for California Secretary of State search
    const searchResults = await this.toolChain.executeTool('ca_sos_search', {
      businessName,
      state
    });

    const publicRecordsResult: PublicRecordsResult = {
      found: searchResults.success && searchResults.data?.found,
      business: searchResults.success ? searchResults.data?.business : undefined,
      confidence: searchResults.success ? 0.8 : 0.0,
      sources: ['california_secretary_of_state']
    };

    // Update context with public records results
    context.agentContexts[this.agentId] = {
      ...context.agentContexts[this.agentId],
      state: {
        ...context.agentContexts[this.agentId]?.state,
        publicRecordsResult
      },
      findings: [
        ...(context.agentContexts[this.agentId]?.findings || []),
        {
          type: 'public_records_search',
          data: publicRecordsResult,
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('DataEnrichmentAgent: Public records search completed', {
      taskId,
      businessName,
      found: publicRecordsResult.found,
      confidence: publicRecordsResult.confidence
    });

    return context;
  }

  private async performBusinessInference(
    taskId: string,
    context: TaskContext,
    _parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const domainAnalysis = context.agentContexts[this.agentId]?.state?.domainAnalysis;
    const publicRecordsResult = context.agentContexts[this.agentId]?.state?.publicRecordsResult;
    
    const businessInference: BusinessInference = {
      businessType: this.inferBusinessType(domainAnalysis, publicRecordsResult),
      probableStructure: this.inferEntityStructure(domainAnalysis, publicRecordsResult),
      probableState: this.inferBusinessState(domainAnalysis, publicRecordsResult),
      reasoning: this.generateInferenceReasoning(domainAnalysis, publicRecordsResult),
      confidence: this.calculateInferenceConfidence(domainAnalysis, publicRecordsResult)
    };

    // Update context with business inference
    context.agentContexts[this.agentId] = {
      ...context.agentContexts[this.agentId],
      state: {
        ...context.agentContexts[this.agentId]?.state,
        businessInference
      },
      findings: [
        ...(context.agentContexts[this.agentId]?.findings || []),
        {
          type: 'business_inference',
          data: businessInference,
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('DataEnrichmentAgent: Business inference completed', {
      taskId,
      businessType: businessInference.businessType,
      confidence: businessInference.confidence
    });

    return context;
  }

  private async processOAuthData(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const oauthData = parameters.oauthData as OAuthData;
    
    if (!oauthData) {
      throw new Error('OAuth data is required for processing');
    }

    const enrichedUserData: EnrichedUserData = {
      userInfo: {
        firstName: this.extractFirstName(oauthData.name),
        lastName: this.extractLastName(oauthData.name),
        email: oauthData.email,
        profilePicture: oauthData.picture
      },
      domainInfo: {
        domain: oauthData.email ? this.extractDomain(oauthData.email) : null,
        isPersonalEmail: oauthData.email ? this.isPersonalEmailDomain(this.extractDomain(oauthData.email)) : true,
        suggestedBusinessName: null
      },
      confidence: oauthData.email_verified ? 0.9 : 0.6
    };

    if (enrichedUserData.domainInfo.domain && !enrichedUserData.domainInfo.isPersonalEmail) {
      enrichedUserData.domainInfo.suggestedBusinessName = 
        this.inferBusinessNameFromDomain(enrichedUserData.domainInfo.domain);
    }

    // Update context with OAuth processing results
    context.agentContexts[this.agentId] = {
      ...context.agentContexts[this.agentId],
      state: {
        ...context.agentContexts[this.agentId]?.state,
        enrichedUserData
      },
      findings: [
        ...(context.agentContexts[this.agentId]?.findings || []),
        {
          type: 'oauth_processing',
          data: enrichedUserData,
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('DataEnrichmentAgent: OAuth data processing completed', {
      taskId,
      hasEmail: !!enrichedUserData.userInfo.email,
      isPersonalEmail: enrichedUserData.domainInfo.isPersonalEmail,
      confidence: enrichedUserData.confidence
    });

    return context;
  }

  private async performFullEnrichment(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    // Sequential execution of all enrichment workflows
    
    // 1. Process OAuth data if available
    if (parameters.oauthData) {
      context = await this.processOAuthData(taskId, context, parameters);
    }

    // 2. Perform domain analysis
    const enrichedUserData = context.agentContexts[this.agentId]?.state?.enrichedUserData;
    if (enrichedUserData?.userInfo.email) {
      context = await this.performDomainAnalysis(taskId, context, {
        email: enrichedUserData.userInfo.email
      });
    }

    // 3. Search public records if we have a business name
    const domainAnalysis = context.agentContexts[this.agentId]?.state?.domainAnalysis;
    if (domainAnalysis?.suggestedBusinessName) {
      context = await this.performPublicRecordsSearch(taskId, context, {
        businessName: domainAnalysis.suggestedBusinessName
      });
    }

    // 4. Perform business inference
    context = await this.performBusinessInference(taskId, context, parameters);

    // 5. Generate UI augmentation request if needed
    const businessInference = context.agentContexts[this.agentId]?.state?.businessInference;
    if (businessInference && businessInference.confidence < 0.7) {
      context = await this.generateConfirmationUI(taskId, context);
    }

    logger.info('DataEnrichmentAgent: Full enrichment completed', {
      taskId,
      hasUserData: !!enrichedUserData,
      hasDomainAnalysis: !!domainAnalysis,
      hasPublicRecords: !!context.agentContexts[this.agentId]?.state?.publicRecordsResult,
      hasBusinessInference: !!businessInference
    });

    return context;
  }

  private async generateConfirmationUI(
    taskId: string,
    context: TaskContext
  ): Promise<TaskContext> {
    const agentState = context.agentContexts[this.agentId]?.state;
    const businessInference = agentState?.businessInference;
    const domainAnalysis = agentState?.domainAnalysis;

    if (!businessInference) {
      return context;
    }

    // Generate UI augmentation request for user confirmation
    const uiRequest = {
      agentRole: this.agentId,
      requestId: `enrichment_confirmation_${taskId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      metadata: {
        purpose: 'Confirm discovered business information',
        urgency: 'normal' as const,
        category: 'identity',
        allowSkip: false,
        skipConsequence: 'Will need to collect business information manually'
      },
      requirementLevel: {
        minimumRequired: ['businessName'],
        recommended: ['entityType', 'state'],
        optional: ['formationDate']
      },
      dataNeeded: [
        {
          id: 'businessName',
          fieldName: 'businessName',
          dataType: 'string' as const,
          semanticType: 'business_name',
          constraints: {
            required: true,
            maxLength: 200
          },
          metadata: {
            reason: 'Legal business name for compliance tracking',
            defaultValue: domainAnalysis?.suggestedBusinessName || '',
            examples: ['Acme Corporation', 'Smith & Associates LLC']
          }
        },
        {
          id: 'entityType',
          fieldName: 'entityType',
          dataType: 'enum' as const,
          semanticType: 'entity_type',
          constraints: {
            required: false,
            enumValues: [
              { value: 'LLC', label: 'Limited Liability Company (LLC)' },
              { value: 'Corporation', label: 'Corporation' },
              { value: 'Partnership', label: 'Partnership' },
              { value: 'SoleProprietorship', label: 'Sole Proprietorship' }
            ]
          },
          metadata: {
            reason: 'Business structure affects compliance requirements',
            defaultValue: businessInference.probableStructure || 'LLC'
          }
        }
      ],
      quickActions: [
        {
          id: 'confirm_discovered',
          label: 'This looks correct',
          semanticAction: 'confirm_enrichment_data',
          payload: {
            confirmed: true,
            source: 'data_enrichment'
          }
        },
        {
          id: 'need_correction',
          label: 'Let me correct this',
          semanticAction: 'request_manual_input',
          payload: {
            requestManualEntry: true
          }
        }
      ],
      context: {
        taskPhase: 'identity_confirmation',
        dataCompleteness: Math.round(businessInference.confidence * 100),
        estimatedFields: 2,
        reason: 'We found some information about your business and want to confirm it\'s correct',
        consequences: 'Incorrect business information could affect compliance tracking and legal requirements'
      },
      responseHandling: {
        targetContextPath: 'sharedContext.business',
        validationRules: [
          {
            field: 'businessName',
            rule: 'required|string|min:2|max:200',
            message: 'Business name must be between 2 and 200 characters',
            severity: 'error'
          }
        ],
        acceptPartialData: false,
        followupStrategy: 'queue'
      }
    };

    // Add UI request to context
    context.activeUIRequests[this.agentId] = uiRequest;
    context.pendingInputRequests.push({
      id: uiRequest.requestId,
      requestingAgent: this.agentId,
      priority: 'required',
      promptType: 'text',
      prompt: {
        title: 'Confirm Your Business Information',
        description: 'We found some information about your business. Please confirm or correct it.',
        fieldName: 'businessName',
        validation: {
          required: true,
          minLength: 2,
          maxLength: 200
        },
        defaultValue: domainAnalysis?.suggestedBusinessName || '',
        helpText: 'Enter the exact legal name of your business'
      },
      context: {
        phase: 'identity_confirmation',
        reason: 'Confirm discovered business information',
        impact: 'blocking'
      },
      targetPath: 'sharedContext.business.name'
    });

    logger.info('DataEnrichmentAgent: UI confirmation request generated', {
      taskId,
      requestId: uiRequest.requestId,
      confidence: businessInference.confidence
    });

    return context;
  }

  // Helper methods
  private extractDomain(email: string): string {
    return email.split('@')[1]?.toLowerCase() || '';
  }

  private isPersonalEmailDomain(domain: string): boolean {
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'aol.com', 'icloud.com', 'protonmail.com', 'live.com'
    ];
    return personalDomains.includes(domain);
  }

  private inferBusinessNameFromDomain(domain: string): string | null {
    if (!domain || this.isPersonalEmailDomain(domain)) {
      return null;
    }

    // Remove common TLDs and convert to business name format
    const name = domain
      .replace(/\.(com|org|net|io|co|biz|info)$/, '')
      .replace(/[.-]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return name;
  }

  private extractFirstName(fullName?: string): string | undefined {
    return fullName?.split(' ')[0];
  }

  private extractLastName(fullName?: string): string | undefined {
    const parts = fullName?.split(' ') || [];
    return parts.length > 1 ? parts[parts.length - 1] : undefined;
  }

  private inferBusinessType(domainAnalysis: any, publicRecordsResult: any): BusinessInference['businessType'] {
    if (publicRecordsResult?.found) {
      return 'local_business';
    }
    
    if (domainAnalysis?.domain?.endsWith('.io') || domainAnalysis?.domain?.includes('tech')) {
      return 'tech_startup';
    }
    
    return 'unknown';
  }

  private inferEntityStructure(domainAnalysis: any, publicRecordsResult: any): string | null {
    if (publicRecordsResult?.business?.entityType) {
      return publicRecordsResult.business.entityType;
    }
    
    // Default suggestion based on business type
    const businessType = this.inferBusinessType(domainAnalysis, publicRecordsResult);
    return businessType === 'tech_startup' ? 'C-Corporation' : 'LLC';
  }

  private inferBusinessState(domainAnalysis: any, publicRecordsResult: any): string | null {
    if (publicRecordsResult?.business?.state) {
      return publicRecordsResult.business.state;
    }
    
    return 'CA'; // Default to California
  }

  private generateInferenceReasoning(domainAnalysis: any, publicRecordsResult: any): string {
    const reasons = [];
    
    if (domainAnalysis?.isPersonalEmail) {
      reasons.push('Personal email domain detected');
    } else if (domainAnalysis?.suggestedBusinessName) {
      reasons.push(`Business domain suggests company name: ${domainAnalysis.suggestedBusinessName}`);
    }
    
    if (publicRecordsResult?.found) {
      reasons.push('Found in public business registries');
    }
    
    return reasons.join('; ') || 'Limited information available for inference';
  }

  private calculateInferenceConfidence(domainAnalysis: any, publicRecordsResult: any): number {
    let confidence = 0.3; // Base confidence
    
    if (publicRecordsResult?.found) {
      confidence += 0.5; // High confidence from public records
    }
    
    if (domainAnalysis && !domainAnalysis.isPersonalEmail) {
      confidence += 0.3; // Business domain adds confidence
    }
    
    return Math.min(confidence, 1.0);
  }
}