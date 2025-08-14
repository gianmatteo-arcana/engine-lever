/**
 * Agency Interaction Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * AGENT MISSION: Navigate government portals and submit compliance forms accurately.
 * Monitor submission status, handle agency responses, and retrieve confirmation documents.
 * 
 * This agent is GENERAL PURPOSE - it provides government portal interaction capabilities
 * while working with Task Templates for specific form submission workflows. The agent handles
 * the technical aspects of portal navigation and form submission across multiple agencies.
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

interface SubmissionResult {
  submissionId: string;
  confirmationNumber: string;
  formType: string;
  agency: string;
  status: 'submitted' | 'processing' | 'completed' | 'rejected' | 'error';
  submissionDate: string;
  estimatedCompletion?: string;
  receiptUrl?: string;
}

interface FormData {
  entityName: string;
  entityNumber?: string;
  entityType: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  officers?: Array<{
    name: string;
    title: string;
    address?: string;
  }>;
  members?: Array<{
    name: string;
    percentage: number;
    address?: string;
  }>;
  paymentInfo?: {
    amount: number;
    method: string;
    transactionId?: string;
  };
}

interface StatusCheckResult {
  submissionId: string;
  currentStatus: string;
  statusDate: string;
  processingStage: string;
  documentsAvailable: string[];
  nextAction?: string;
  estimatedCompletion?: string;
}

interface PortalError {
  type: 'validation' | 'authentication' | 'portal_timeout' | 'payment_failure' | 'system_error';
  message: string;
  field?: string;
  recoveryStrategy: string;
  retryable: boolean;
  userActionRequired: boolean;
}

/**
 * Agency Interaction Agent - Consolidated BaseAgent Implementation
 */
export class AgencyInteractionAgent extends BaseAgent {
  private readonly supportedAgencies = ['ca_sos', 'irs', 'ftb', 'local_licensing'];

  constructor(businessId: string, userId?: string) {
    super('agency_interaction_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - handles all agency interaction operations
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `aia_${Date.now()}`;
    
    try {
      // Record agency interaction initiation
      await this.recordContextEntry(context, {
        operation: 'agency_interaction_initiated',
        data: { 
          operationType: request.instruction,
          requestId,
          targetAgency: request.data?.agency
        },
        reasoning: 'Starting government portal interaction and form submission process'
      });

      // Route based on instruction - GENERAL AGENCY OPERATIONS
      switch (request.instruction) {
        case 'submit_form':
          return await this.submitForm(request, context);
        
        case 'check_submission_status':
          return await this.checkSubmissionStatus(request, context);
        
        case 'retrieve_documents':
          return await this.retrieveDocuments(request, context);
        
        case 'handle_portal_error':
          return await this.handlePortalError(request, context);
        
        case 'validate_form_data':
          return await this.validateFormData(request, context);
        
        default:
          await this.recordContextEntry(context, {
            operation: 'unknown_agency_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for agency interaction'
          });

          return {
            status: 'error',
            data: { error: `Unknown agency interaction instruction: ${request.instruction}` },
            reasoning: 'Agency interaction agent cannot process unrecognized instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'agency_interaction_error',
        data: { error: error.message, requestId },
        reasoning: 'Agency interaction failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during agency interaction'
      };
    }
  }

  /**
   * Submit form to government agency portal
   */
  private async submitForm(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { agency, formData, attachments = [] } = request.data || {};
    
    if (!agency || !formData) {
      return {
        status: 'error',
        data: { error: 'Agency and form data are required for submission' },
        reasoning: 'Cannot submit form without agency and form data'
      };
    }

    if (!this.supportedAgencies.includes(agency)) {
      return {
        status: 'error',
        data: { error: `Unsupported agency: ${agency}. Supported agencies: ${this.supportedAgencies.join(', ')}` },
        reasoning: 'Specified agency is not supported by this agent'
      };
    }

    // Validate form data before submission
    const validationResult = this.validateFormForAgency(formData, agency);
    if (!validationResult.valid) {
      return {
        status: 'error',
        data: { 
          error: 'Form validation failed',
          validationErrors: validationResult.errors 
        },
        reasoning: 'Form data does not meet agency requirements'
      };
    }

    // Perform form submission
    const submissionResult = await this.performFormSubmission(agency, formData, attachments);
    
    await this.recordContextEntry(context, {
      operation: 'form_submitted',
      data: { 
        agency,
        submissionResult,
        formType: this.getFormType(agency),
        attachmentCount: attachments.length
      },
      reasoning: `Form successfully submitted to ${agency}. Confirmation: ${submissionResult.confirmationNumber}`
    });

    // Generate submission confirmation UI
    const uiRequest = this.createSubmissionConfirmationUI(submissionResult, agency);

    return {
      status: submissionResult.status === 'error' ? 'error' : 'needs_input',
      data: { 
        submissionResult,
        agency,
        trackingInfo: {
          submissionId: submissionResult.submissionId,
          confirmationNumber: submissionResult.confirmationNumber,
          expectedProcessingTime: this.getProcessingTime(agency)
        }
      },
      uiRequests: [uiRequest],
      reasoning: `Form submitted to ${agency} with confirmation ${submissionResult.confirmationNumber}. Status: ${submissionResult.status}`,
      nextAgent: submissionResult.status === 'submitted' ? 'monitoring' : 'communication'
    };
  }

  /**
   * Check submission status with government agency
   */
  private async checkSubmissionStatus(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { confirmationNumber, agency } = request.data || {};
    
    if (!confirmationNumber || !agency) {
      return {
        status: 'error',
        data: { error: 'Confirmation number and agency are required for status check' },
        reasoning: 'Cannot check status without confirmation number and agency'
      };
    }

    // Check submission status
    const statusResult = await this.performStatusCheck(confirmationNumber, agency);
    
    await this.recordContextEntry(context, {
      operation: 'status_checked',
      data: { 
        confirmationNumber,
        agency,
        statusResult,
        currentStatus: statusResult.currentStatus
      },
      reasoning: `Status check completed for ${agency} submission ${confirmationNumber}. Status: ${statusResult.currentStatus}`
    });

    // Generate status update UI if processing is incomplete
    const needsFollowUp = !['completed', 'rejected'].includes(statusResult.currentStatus);
    const uiRequest = needsFollowUp ? this.createStatusTrackingUI(statusResult, agency) : undefined;

    return {
      status: statusResult.currentStatus === 'completed' ? 'completed' : 'needs_input',
      data: { 
        statusResult,
        trackingDetails: {
          submissionId: statusResult.submissionId,
          currentStage: statusResult.processingStage,
          documentsReady: statusResult.documentsAvailable.length > 0
        }
      },
      uiRequests: uiRequest ? [uiRequest] : undefined,
      reasoning: `Status check completed. Current status: ${statusResult.currentStatus}, Stage: ${statusResult.processingStage}`,
      nextAgent: statusResult.documentsAvailable.length > 0 ? 'document_management' : undefined
    };
  }

  /**
   * Retrieve documents from government agency
   */
  private async retrieveDocuments(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { confirmationNumber, agency, documentTypes } = request.data || {};
    
    // Retrieve available documents
    const retrievalResult = await this.performDocumentRetrieval(confirmationNumber, agency, documentTypes);
    
    await this.recordContextEntry(context, {
      operation: 'documents_retrieved',
      data: { 
        confirmationNumber,
        agency,
        retrievedDocuments: retrievalResult.documents,
        documentCount: retrievalResult.documents.length
      },
      reasoning: `Retrieved ${retrievalResult.documents.length} documents from ${agency} for submission ${confirmationNumber}`
    });

    return {
      status: 'completed',
      data: { 
        retrievalResult,
        documentSummary: {
          totalDocuments: retrievalResult.documents.length,
          documentTypes: retrievalResult.documents.map((doc: any) => doc.type),
          downloadUrls: retrievalResult.documents.map((doc: any) => doc.downloadUrl)
        }
      },
      reasoning: `Successfully retrieved ${retrievalResult.documents.length} documents from ${agency}`
    };
  }

  /**
   * Handle portal errors and recovery
   */
  private async handlePortalError(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { errorType, errorMessage, submissionContext } = request.data || {};
    
    const portalError = this.analyzePortalError(errorType, errorMessage);
    const recoveryPlan = this.generateRecoveryPlan(portalError, submissionContext);
    
    await this.recordContextEntry(context, {
      operation: 'portal_error_handled',
      data: { 
        errorType: portalError.type,
        recoveryStrategy: portalError.recoveryStrategy,
        retryable: portalError.retryable
      },
      reasoning: `Portal error handled: ${portalError.message}. Recovery: ${portalError.recoveryStrategy}`
    });

    // Generate error resolution UI
    const uiRequest = this.createErrorResolutionUI(portalError, recoveryPlan);

    return {
      status: portalError.retryable ? 'needs_input' : 'error',
      data: { 
        portalError,
        recoveryPlan,
        retryOptions: portalError.retryable ? this.getRetryOptions(portalError) : []
      },
      uiRequests: [uiRequest],
      reasoning: `Portal error analysis completed. ${portalError.retryable ? 'Recovery possible' : 'Manual intervention required'}`,
      nextAgent: portalError.userActionRequired ? 'communication' : 'agency_interaction'
    };
  }

  /**
   * Validate form data before submission
   */
  private async validateFormData(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { formData, agency } = request.data || {};
    
    const validationResult = this.validateFormForAgency(formData, agency);
    
    await this.recordContextEntry(context, {
      operation: 'form_validated',
      data: { 
        agency,
        validationPassed: validationResult.valid,
        errorCount: validationResult.errors.length
      },
      reasoning: `Form validation ${validationResult.valid ? 'passed' : 'failed'} for ${agency}`
    });

    return {
      status: validationResult.valid ? 'completed' : 'needs_input',
      data: { 
        validationResult,
        formQuality: this.assessFormQuality(formData),
        recommendations: validationResult.valid ? [] : this.generateValidationRecommendations(validationResult.errors)
      },
      reasoning: `Form validation completed. ${validationResult.valid ? 'Ready for submission' : 'Corrections needed'}`
    };
  }

  // Helper methods for agency interactions
  private validateFormForAgency(formData: FormData, agency: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Universal validation
    if (!formData.entityName) {
      errors.push('Entity name is required');
    }

    if (!formData.address || !formData.address.street || !formData.address.city) {
      errors.push('Complete address is required');
    }

    // Agency-specific validation
    switch (agency) {
      case 'ca_sos':
        if (!formData.entityNumber || !/^\d{12}$/.test(formData.entityNumber)) {
          errors.push('CA SOS requires 12-digit entity number');
        }
        if (formData.entityType === 'LLC' && (!formData.members || formData.members.length === 0)) {
          errors.push('LLC requires at least one member');
        }
        if (formData.entityType === 'Corporation' && (!formData.officers || formData.officers.length === 0)) {
          errors.push('Corporation requires at least one officer');
        }
        break;

      case 'irs':
        if (!formData.entityNumber || !/^\d{2}-\d{7}$/.test(formData.entityNumber)) {
          errors.push('IRS requires valid EIN format (XX-XXXXXXX)');
        }
        break;

      case 'ftb':
        if (!formData.entityNumber) {
          errors.push('FTB requires entity identification number');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async performFormSubmission(agency: string, _formData: FormData, _attachments: any[]): Promise<SubmissionResult> {
    // Mock form submission implementation
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const success = Math.random() > 0.1; // 90% success rate
    const submissionId = `SUB_${agency.toUpperCase()}_${Date.now()}`;
    const confirmationNumber = this.generateConfirmationNumber(agency);

    if (!success) {
      return {
        submissionId,
        confirmationNumber: '',
        formType: this.getFormType(agency),
        agency: agency.toUpperCase(),
        status: 'error',
        submissionDate: new Date().toISOString()
      };
    }

    return {
      submissionId,
      confirmationNumber,
      formType: this.getFormType(agency),
      agency: agency.toUpperCase(),
      status: 'submitted',
      submissionDate: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + this.getProcessingTimeMs(agency)).toISOString(),
      receiptUrl: `https://${agency}.gov/receipt/${confirmationNumber}`
    };
  }

  private async performStatusCheck(confirmationNumber: string, agency: string): Promise<StatusCheckResult> {
    // Mock status check implementation
    await new Promise(resolve => setTimeout(resolve, 500));

    const statuses = ['submitted', 'processing', 'under_review', 'completed'];
    const currentStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const documentsReady = currentStatus === 'completed' ? ['confirmation_letter.pdf', 'filing_receipt.pdf'] : [];

    return {
      submissionId: `SUB_${agency.toUpperCase()}_${Date.now()}`,
      currentStatus,
      statusDate: new Date().toISOString(),
      processingStage: this.getProcessingStage(currentStatus),
      documentsAvailable: documentsReady,
      nextAction: currentStatus === 'completed' ? 'retrieve_documents' : 'check_again_later',
      estimatedCompletion: currentStatus !== 'completed' ? 
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined
    };
  }

  private async performDocumentRetrieval(confirmationNumber: string, agency: string, _documentTypes?: string[]): Promise<any> {
    // Mock document retrieval implementation
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      confirmationNumber,
      agency,
      documents: [
        {
          type: 'confirmation_letter',
          filename: 'confirmation_letter.pdf',
          size: '145KB',
          downloadUrl: `https://${agency}.gov/documents/${confirmationNumber}_confirmation.pdf`,
          generatedAt: new Date().toISOString()
        },
        {
          type: 'filing_receipt',
          filename: 'filing_receipt.pdf',
          size: '89KB',
          downloadUrl: `https://${agency}.gov/documents/${confirmationNumber}_receipt.pdf`,
          generatedAt: new Date().toISOString()
        }
      ],
      retrievalDate: new Date().toISOString()
    };
  }

  private analyzePortalError(errorType: string, errorMessage: string): PortalError {
    switch (errorType) {
      case 'validation_error':
        return {
          type: 'validation',
          message: errorMessage || 'Form data validation failed',
          recoveryStrategy: 'Correct form data and resubmit',
          retryable: true,
          userActionRequired: true
        };

      case 'authentication_failed':
        return {
          type: 'authentication',
          message: 'Portal authentication failed',
          recoveryStrategy: 'Verify credentials and retry login',
          retryable: true,
          userActionRequired: true
        };

      case 'portal_timeout':
        return {
          type: 'portal_timeout',
          message: 'Portal request timed out',
          recoveryStrategy: 'Wait and retry submission',
          retryable: true,
          userActionRequired: false
        };

      case 'payment_failed':
        return {
          type: 'payment_failure',
          message: 'Payment processing failed',
          recoveryStrategy: 'Update payment method and retry',
          retryable: true,
          userActionRequired: true
        };

      default:
        return {
          type: 'system_error',
          message: errorMessage || 'Unknown system error',
          recoveryStrategy: 'Contact support for assistance',
          retryable: false,
          userActionRequired: true
        };
    }
  }

  private generateRecoveryPlan(error: PortalError, _context: any): any {
    return {
      steps: [
        `1. ${error.recoveryStrategy}`,
        error.retryable ? '2. Retry submission automatically' : '2. Contact support team',
        '3. Monitor status for updates'
      ],
      estimatedTime: error.retryable ? '15 minutes' : '1-2 business days',
      userActions: error.userActionRequired ? ['Review and correct form data'] : []
    };
  }

  private getRetryOptions(error: PortalError): string[] {
    switch (error.type) {
      case 'validation':
        return ['correct_data_retry', 'manual_review'];
      case 'authentication':
        return ['update_credentials', 'alternative_login'];
      case 'portal_timeout':
        return ['immediate_retry', 'scheduled_retry'];
      default:
        return ['contact_support'];
    }
  }

  private generateConfirmationNumber(agency: string): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${agency.toUpperCase()}-${timestamp}-${random}`;
  }

  private getFormType(agency: string): string {
    switch (agency) {
      case 'ca_sos': return 'SI-550';
      case 'irs': return '1120';
      case 'ftb': return '100';
      default: return 'FORM';
    }
  }

  private getProcessingTime(agency: string): string {
    switch (agency) {
      case 'ca_sos': return '1-3 business days';
      case 'irs': return '4-6 weeks';
      case 'ftb': return '2-4 weeks';
      default: return '1-2 weeks';
    }
  }

  private getProcessingTimeMs(agency: string): number {
    switch (agency) {
      case 'ca_sos': return 3 * 24 * 60 * 60 * 1000; // 3 days
      case 'irs': return 42 * 24 * 60 * 60 * 1000; // 6 weeks
      case 'ftb': return 28 * 24 * 60 * 60 * 1000; // 4 weeks
      default: return 14 * 24 * 60 * 60 * 1000; // 2 weeks
    }
  }

  private getProcessingStage(status: string): string {
    switch (status) {
      case 'submitted': return 'Initial Review';
      case 'processing': return 'Document Processing';
      case 'under_review': return 'Legal Review';
      case 'completed': return 'Filing Complete';
      default: return 'Processing';
    }
  }

  private assessFormQuality(formData: FormData): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 100;

    // Check completeness
    if (!formData.entityNumber) {
      issues.push('Missing entity number');
      score -= 20;
    }

    if (!formData.address?.zipCode) {
      issues.push('Missing zip code');
      score -= 10;
    }

    if (formData.entityType === 'LLC' && (!formData.members || formData.members.length === 0)) {
      issues.push('LLC missing member information');
      score -= 15;
    }

    return { score: Math.max(0, score), issues };
  }

  private generateValidationRecommendations(errors: string[]): string[] {
    return errors.map(error => {
      if (error.includes('entity number')) {
        return 'Verify entity number from official records';
      }
      if (error.includes('address')) {
        return 'Provide complete business address';
      }
      if (error.includes('member')) {
        return 'Add required member information';
      }
      if (error.includes('officer')) {
        return 'Add required officer information';
      }
      return 'Review and correct form data';
    });
  }

  // UI Creation methods
  private createSubmissionConfirmationUI(result: SubmissionResult, agency: string): UIRequest {
    return {
      requestId: `submission_confirmation_${Date.now()}`,
      templateType: UITemplateType.SuccessScreen,
      semanticData: {
        agentRole: 'agency_interaction_agent',
        title: 'Form Submitted Successfully',
        description: `Your ${result.formType} form has been submitted to ${agency.toUpperCase()}`,
        submissionResult: result,
        confirmationNumber: result.confirmationNumber,
        estimatedProcessing: this.getProcessingTime(agency),
        actions: {
          track_status: {
            type: 'custom',
            label: 'Track Status',
            handler: () => ({ action: 'check_submission_status', confirmationNumber: result.confirmationNumber, agency })
          },
          download_receipt: result.receiptUrl ? {
            type: 'custom',
            label: 'Download Receipt',
            handler: () => ({ action: 'download_document', url: result.receiptUrl })
          } : undefined,
          continue: {
            type: 'submit',
            label: 'Continue',
            primary: true,
            handler: () => ({ action: 'continue_workflow' })
          }
        }
      },
      context: {
        userProgress: 90,
        deviceType: 'desktop',
        urgency: 'medium'
      }
    } as any;
  }

  private createStatusTrackingUI(status: StatusCheckResult, agency: string): UIRequest {
    return {
      requestId: `status_tracking_${Date.now()}`,
      templateType: UITemplateType.ProgressIndicator,
      semanticData: {
        agentRole: 'agency_interaction_agent',
        title: `Submission Status - ${agency.toUpperCase()}`,
        description: `Current status: ${status.currentStatus} - ${status.processingStage}`,
        statusResult: status,
        currentStage: status.processingStage,
        progressPercentage: this.calculateProgressPercentage(status.currentStatus),
        actions: {
          refresh_status: {
            type: 'custom',
            label: 'Refresh Status',
            handler: () => ({ action: 'check_submission_status', submissionId: status.submissionId })
          },
          view_documents: status.documentsAvailable.length > 0 ? {
            type: 'custom',
            label: 'View Documents',
            handler: () => ({ action: 'retrieve_documents', submissionId: status.submissionId })
          } : undefined
        }
      },
      context: {
        userProgress: this.calculateProgressPercentage(status.currentStatus),
        deviceType: 'desktop',
        urgency: 'low'
      }
    } as any;
  }

  private createErrorResolutionUI(error: PortalError, recoveryPlan: any): UIRequest {
    return {
      requestId: `error_resolution_${Date.now()}`,
      templateType: UITemplateType.ErrorDisplay,
      semanticData: {
        agentRole: 'agency_interaction_agent',
        title: 'Submission Error',
        description: error.message,
        portalError: error,
        recoveryPlan,
        errorType: error.type,
        actions: {
          retry: error.retryable ? {
            type: 'submit',
            label: 'Retry Submission',
            primary: true,
            handler: () => ({ action: 'retry_submission', recoveryPlan })
          } : undefined,
          correct_data: error.userActionRequired ? {
            type: 'custom',
            label: 'Correct Data',
            handler: () => ({ action: 'correct_form_data', error })
          } : undefined,
          contact_support: {
            type: 'custom',
            label: 'Contact Support',
            handler: () => ({ action: 'contact_support', errorDetails: error })
          }
        }
      },
      context: {
        userProgress: 0,
        deviceType: 'desktop',
        urgency: 'high'
      }
    } as any;
  }

  private calculateProgressPercentage(status: string): number {
    switch (status) {
      case 'submitted': return 25;
      case 'processing': return 50;
      case 'under_review': return 75;
      case 'completed': return 100;
      default: return 0;
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
        id: 'agency_interaction_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Agency interaction operation',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'agency_interaction',
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