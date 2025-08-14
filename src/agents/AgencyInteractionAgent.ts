/**
 * External Portal Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * AGENT MISSION: Navigate external portals and submit forms accurately.
 * Monitor submission status, handle portal responses, and retrieve confirmation documents.
 * 
 * This agent is GENERAL PURPOSE - it provides external portal interaction capabilities
 * while working with Task Templates for specific submission workflows. The agent handles
 * the technical aspects of portal navigation and form submission across multiple systems.
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
  portalId: string;
  status: 'submitted' | 'processing' | 'completed' | 'rejected' | 'error';
  submissionDate: string;
  estimatedCompletion?: string;
  receiptUrl?: string;
}

interface FormData {
  [key: string]: any; // Generic form data structure - specific fields defined by Task Templates
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
 * (Renamed but now general-purpose for any external portal interaction)
 */
export class AgencyInteractionAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('agency_interaction_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - handles all portal interaction operations
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `epa_${Date.now()}`;
    
    try {
      // Record portal interaction initiation
      await this.recordContextEntry(context, {
        operation: 'portal_interaction_initiated',
        data: { 
          operationType: request.instruction,
          requestId,
          targetPortal: request.data?.portalId
        },
        reasoning: 'Starting external portal interaction and form submission process'
      });

      // Route based on instruction - GENERAL PORTAL OPERATIONS
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
            operation: 'unknown_portal_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for portal interaction'
          });

          return {
            status: 'error',
            data: { error: `Unknown portal interaction instruction: ${request.instruction}` },
            reasoning: 'Portal interaction agent cannot process unrecognized instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'portal_interaction_error',
        data: { error: error.message, requestId },
        reasoning: 'Portal interaction failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during portal interaction'
      };
    }
  }

  /**
   * Submit form to external portal
   */
  private async submitForm(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { portalId, formData, attachments = [] } = request.data || {};
    
    if (!portalId || !formData) {
      return {
        status: 'error',
        data: { error: 'Portal ID and form data are required for submission' },
        reasoning: 'Cannot submit form without portal ID and form data'
      };
    }

    // Validate form data before submission
    const validationResult = this.validateFormForPortal(formData, portalId);
    if (!validationResult.valid) {
      return {
        status: 'error',
        data: { 
          error: 'Form validation failed',
          validationErrors: validationResult.errors 
        },
        reasoning: 'Form data does not meet portal requirements'
      };
    }

    // Perform form submission
    const submissionResult = await this.performFormSubmission(portalId, formData, attachments);
    
    await this.recordContextEntry(context, {
      operation: 'form_submitted',
      data: { 
        portalId,
        submissionResult,
        formType: request.data?.formType || 'standard',
        attachmentCount: attachments.length
      },
      reasoning: `Form successfully submitted to ${portalId}. Confirmation: ${submissionResult.confirmationNumber}`
    });

    // Generate submission confirmation UI
    const uiRequest = this.createSubmissionConfirmationUI(submissionResult, portalId);

    return {
      status: submissionResult.status === 'error' ? 'error' : 'needs_input',
      data: { 
        submissionResult,
        portalId,
        trackingInfo: {
          submissionId: submissionResult.submissionId,
          confirmationNumber: submissionResult.confirmationNumber,
          expectedProcessingTime: this.getProcessingTime(portalId)
        }
      },
      uiRequests: [uiRequest],
      reasoning: `Form submitted to ${portalId} with confirmation ${submissionResult.confirmationNumber}. Status: ${submissionResult.status}`,
      nextAgent: submissionResult.status === 'submitted' ? 'monitoring' : 'communication'
    };
  }

  /**
   * Check submission status with external portal
   */
  private async checkSubmissionStatus(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { confirmationNumber, portalId } = request.data || {};
    
    if (!confirmationNumber || !portalId) {
      return {
        status: 'error',
        data: { error: 'Confirmation number and portal ID are required for status check' },
        reasoning: 'Cannot check status without confirmation number and portal ID'
      };
    }

    // Check submission status
    const statusResult = await this.performStatusCheck(confirmationNumber, portalId);
    
    await this.recordContextEntry(context, {
      operation: 'status_checked',
      data: { 
        confirmationNumber,
        portalId,
        statusResult,
        currentStatus: statusResult.currentStatus
      },
      reasoning: `Status check completed for ${portalId} submission ${confirmationNumber}. Status: ${statusResult.currentStatus}`
    });

    // Generate status update UI if processing is incomplete
    const needsFollowUp = !['completed', 'rejected'].includes(statusResult.currentStatus);
    const uiRequest = needsFollowUp ? this.createStatusTrackingUI(statusResult, portalId) : undefined;

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
   * Retrieve documents from external portal
   */
  private async retrieveDocuments(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { confirmationNumber, portalId, documentTypes } = request.data || {};
    
    // Retrieve available documents
    const retrievalResult = await this.performDocumentRetrieval(confirmationNumber, portalId, documentTypes);
    
    await this.recordContextEntry(context, {
      operation: 'documents_retrieved',
      data: { 
        confirmationNumber,
        portalId,
        retrievedDocuments: retrievalResult.documents,
        documentCount: retrievalResult.documents.length
      },
      reasoning: `Retrieved ${retrievalResult.documents.length} documents from ${portalId} for submission ${confirmationNumber}`
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
      reasoning: `Successfully retrieved ${retrievalResult.documents.length} documents from ${portalId}`
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
      nextAgent: portalError.userActionRequired ? 'communication' : 'external_portal'
    };
  }

  /**
   * Validate form data before submission
   */
  private async validateFormData(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { formData, portalId } = request.data || {};
    
    const validationResult = this.validateFormForPortal(formData, portalId);
    
    await this.recordContextEntry(context, {
      operation: 'form_validated',
      data: { 
        portalId,
        validationPassed: validationResult.valid,
        errorCount: validationResult.errors.length
      },
      reasoning: `Form validation ${validationResult.valid ? 'passed' : 'failed'} for ${portalId}`
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

  // Helper methods for portal interactions
  private validateFormForPortal(formData: FormData, _portalId: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Generic validation - Task Templates define specific requirements
    if (!formData || Object.keys(formData).length === 0) {
      errors.push('Form data is empty');
    }

    // Portal-specific validation is defined by Task Templates
    // This agent doesn't know about specific portals or their requirements

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private async performFormSubmission(portalId: string, _formData: FormData, _attachments: any[]): Promise<SubmissionResult> {
    // Mock form submission implementation
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const success = Math.random() > 0.1; // 90% success rate
    const submissionId = `SUB_${portalId.toUpperCase()}_${Date.now()}`;
    const confirmationNumber = this.generateConfirmationNumber(portalId);

    if (!success) {
      return {
        submissionId,
        confirmationNumber: '',
        formType: 'standard',
        portalId: portalId.toUpperCase(),
        status: 'error',
        submissionDate: new Date().toISOString()
      };
    }

    return {
      submissionId,
      confirmationNumber,
      formType: 'standard',
      portalId: portalId.toUpperCase(),
      status: 'submitted',
      submissionDate: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + this.getProcessingTimeMs(portalId)).toISOString(),
      receiptUrl: `https://portal.example.com/receipt/${confirmationNumber}`
    };
  }

  private async performStatusCheck(confirmationNumber: string, portalId: string): Promise<StatusCheckResult> {
    // Mock status check implementation
    await new Promise(resolve => setTimeout(resolve, 500));

    const statuses = ['submitted', 'processing', 'under_review', 'completed'];
    const currentStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const documentsReady = currentStatus === 'completed' ? ['confirmation_letter.pdf', 'receipt.pdf'] : [];

    return {
      submissionId: `SUB_${portalId.toUpperCase()}_${Date.now()}`,
      currentStatus,
      statusDate: new Date().toISOString(),
      processingStage: this.getProcessingStage(currentStatus),
      documentsAvailable: documentsReady,
      nextAction: currentStatus === 'completed' ? 'retrieve_documents' : 'check_again_later',
      estimatedCompletion: currentStatus !== 'completed' ? 
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined
    };
  }

  private async performDocumentRetrieval(confirmationNumber: string, portalId: string, _documentTypes?: string[]): Promise<any> {
    // Mock document retrieval implementation
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      confirmationNumber,
      portalId,
      documents: [
        {
          type: 'confirmation_letter',
          filename: 'confirmation_letter.pdf',
          size: '145KB',
          downloadUrl: `https://portal.example.com/documents/${confirmationNumber}_confirmation.pdf`,
          generatedAt: new Date().toISOString()
        },
        {
          type: 'receipt',
          filename: 'receipt.pdf',
          size: '89KB',
          downloadUrl: `https://portal.example.com/documents/${confirmationNumber}_receipt.pdf`,
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

  private generateConfirmationNumber(portalId: string): string {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `${portalId.toUpperCase()}-${timestamp}-${random}`;
  }

  private getProcessingTime(_portalId: string): string {
    // Generic processing times - specific times defined by Task Templates
    return '1-5 business days';
  }

  private getProcessingTimeMs(_portalId: string): number {
    // Generic processing time in milliseconds
    return 5 * 24 * 60 * 60 * 1000; // 5 days
  }

  private getProcessingStage(status: string): string {
    switch (status) {
      case 'submitted': return 'Initial Review';
      case 'processing': return 'Document Processing';
      case 'under_review': return 'Review';
      case 'completed': return 'Complete';
      default: return 'Processing';
    }
  }

  private assessFormQuality(formData: FormData): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 100;

    // Generic quality assessment - specific requirements from Task Templates
    if (!formData || Object.keys(formData).length === 0) {
      issues.push('Form data is empty');
      score = 0;
    }

    return { score: Math.max(0, score), issues };
  }

  private generateValidationRecommendations(errors: string[]): string[] {
    return errors.map(_error => {
      return 'Review and correct form data';
    });
  }

  // UI Creation methods
  private createSubmissionConfirmationUI(result: SubmissionResult, portalId: string): UIRequest {
    return {
      requestId: `submission_confirmation_${Date.now()}`,
      templateType: UITemplateType.SuccessScreen,
      semanticData: {
        agentRole: 'external_portal_agent',
        title: 'Form Submitted Successfully',
        description: `Your form has been submitted to ${portalId.toUpperCase()}`,
        submissionResult: result,
        confirmationNumber: result.confirmationNumber,
        estimatedProcessing: this.getProcessingTime(portalId),
        actions: {
          track_status: {
            type: 'custom',
            label: 'Track Status',
            handler: () => ({ action: 'check_submission_status', confirmationNumber: result.confirmationNumber, portalId })
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

  private createStatusTrackingUI(status: StatusCheckResult, portalId: string): UIRequest {
    return {
      requestId: `status_tracking_${Date.now()}`,
      templateType: UITemplateType.ProgressIndicator,
      semanticData: {
        agentRole: 'external_portal_agent',
        title: `Submission Status - ${portalId.toUpperCase()}`,
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
        agentRole: 'external_portal_agent',
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
        id: 'external_portal_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Portal interaction operation',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'external_portal',
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