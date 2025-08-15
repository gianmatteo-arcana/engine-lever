/**
 * Communication Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * AGENT MISSION: Manage user communications, approval workflows, and status updates
 * throughout task processes. Use clear language, provide timely updates, and 
 * build user confidence.
 * 
 * This agent is GENERAL PURPOSE - it handles all user communication needs including
 * notifications, approvals, status updates, and support responses. Communication
 * strategy and content are driven by message type and urgency level.
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

interface NotificationMessage {
  messageType: string;
  subject: string;
  content: string;
  channel: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  responseRequired: boolean;
  templateUsed?: string;
  deliveryStatus: 'sent' | 'pending' | 'failed';
}

interface ApprovalRequest {
  approvalType: string;
  subject: string;
  content: string;
  details: any;
  channel: string;
  responseRequired: boolean;
  timeout: string;
  escalationPlan: string[];
}

interface CommunicationResult {
  messageId: string;
  deliveryStatus: 'sent' | 'pending' | 'failed';
  channel: string;
  sentAt: string;
  responseRequired: boolean;
  escalationScheduled?: boolean;
}

interface UserPersona {
  type: 'first_timer' | 'power_user' | 'struggling';
  tone: string;
  explanationLevel: string;
  checkInFrequency: string;
}

/**
 * Communication Agent - Consolidated BaseAgent Implementation
 */
export class CommunicationAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('communication_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - handles all communication operations
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `ca_${Date.now()}`;
    
    try {
      // Record communication operation initiation
      await this.recordContextEntry(context, {
        operation: 'communication_operation_initiated',
        data: { 
          operationType: request.instruction,
          requestId 
        },
        reasoning: 'Starting user communication operation'
      });

      // Route based on instruction - GENERAL COMMUNICATION OPERATIONS
      switch (request.instruction) {
        case 'send_notification':
          return await this.sendNotification(request, context);
        
        case 'request_approval':
          return await this.requestApproval(request, context);
        
        case 'send_status_update':
          return await this.sendStatusUpdate(request, context);
        
        case 'provide_support':
          return await this.provideSupport(request, context);
        
        case 'escalate_communication':
          return await this.escalateCommunication(request, context);
        
        default:
          await this.recordContextEntry(context, {
            operation: 'unknown_communication_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for communication operation'
          });

          return {
            status: 'error',
            data: { error: `Unknown communication instruction: ${request.instruction}` },
            reasoning: 'Communication agent cannot process unrecognized instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'communication_operation_error',
        data: { error: error.message, requestId },
        reasoning: 'Communication operation failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during communication operation'
      };
    }
  }

  /**
   * Send notification to user
   */
  private async sendNotification(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { messageType, content, urgency = 'medium' } = request.data || {};
    
    if (!messageType || !content) {
      return {
        status: 'error',
        data: { error: 'Message type and content are required for notifications' },
        reasoning: 'Cannot send notification without message type and content'
      };
    }

    // Generate personalized notification
    const userPersona = this.determineUserPersona(context);
    const notification = this.generateNotification(messageType, content, urgency, userPersona);
    const channel = this.selectChannel(urgency, messageType);
    
    // Mock notification sending
    const result = await this.mockSendNotification(notification, channel);
    
    await this.recordContextEntry(context, {
      operation: 'notification_sent',
      data: { 
        notification,
        channel,
        result,
        messageType,
        urgency
      },
      reasoning: `${urgency} urgency notification sent via ${channel}. Message type: ${messageType}`
    });

    // Generate communication UI (if needed)
    const uiRequest = this.createNotificationUI(notification, result);

    return {
      status: result.deliveryStatus === 'sent' ? 'completed' : 'needs_input',
      data: { 
        notification,
        result,
        communicationStrategy: {
          channel,
          urgency,
          personalization: userPersona,
          followUp: result.responseRequired ? 'awaiting_response' : 'none'
        }
      },
      uiRequests: uiRequest ? [uiRequest] : undefined,
      reasoning: `Notification ${result.deliveryStatus} via ${channel}. ${result.responseRequired ? 'User response expected.' : 'No response required.'}`,
      nextAgent: result.responseRequired ? 'communication' : undefined
    };
  }

  /**
   * Request user approval
   */
  private async requestApproval(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { approvalType, details } = request.data || {};
    
    if (!approvalType || !details) {
      return {
        status: 'error',
        data: { error: 'Approval type and details are required' },
        reasoning: 'Cannot request approval without type and details'
      };
    }

    // Generate approval request
    const approvalRequest = this.generateApprovalRequest(approvalType, details);
    const result = await this.mockSendApprovalRequest(approvalRequest);
    
    await this.recordContextEntry(context, {
      operation: 'approval_requested',
      data: { 
        approvalRequest,
        result,
        approvalType,
        details
      },
      reasoning: `Approval request sent for ${approvalType}. Timeout: ${approvalRequest.timeout}, escalation planned.`
    });

    // Generate approval UI
    const uiRequest = this.createApprovalUI(approvalRequest, details);

    return {
      status: 'needs_input',
      data: { 
        approvalRequest,
        result,
        timeout: approvalRequest.timeout,
        escalationPlan: approvalRequest.escalationPlan
      },
      uiRequests: [uiRequest],
      reasoning: `Approval request sent via ${approvalRequest.channel}. Awaiting user response with ${approvalRequest.timeout} timeout.`,
      nextAgent: 'communication'  // Stay with communication agent for response handling
    };
  }

  /**
   * Send status update
   */
  private async sendStatusUpdate(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { milestone, taskType, progress, nextStep } = request.data || {};
    
    // Generate status update notification
    const statusContent = {
      milestone,
      taskType,
      progress: progress || 'unknown',
      nextStep
    };
    
    const userPersona = this.determineUserPersona(context);
    const notification = this.generateStatusUpdate(statusContent, userPersona);
    const result = await this.mockSendNotification(notification, 'email');
    
    await this.recordContextEntry(context, {
      operation: 'status_update_sent',
      data: { 
        notification,
        statusContent,
        result,
        milestone,
        progress
      },
      reasoning: `Status update sent for ${taskType} milestone: ${milestone}. Progress: ${progress}%`
    });

    return {
      status: 'completed',
      data: { 
        notification,
        result,
        milestone,
        progress
      },
      reasoning: `Status update delivered via email for ${taskType} progress.`
    };
  }

  /**
   * Provide support response
   */
  private async provideSupport(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { supportType, userQuery, context: supportContext } = request.data || {};
    
    // Generate support response
    const supportResponse = this.generateSupportResponse(supportType, userQuery, supportContext);
    const result = await this.mockSendNotification(supportResponse, 'in_app');
    
    await this.recordContextEntry(context, {
      operation: 'support_provided',
      data: { 
        supportResponse,
        supportType,
        userQuery,
        result
      },
      reasoning: `Support response provided for ${supportType} query via in-app messaging.`
    });

    return {
      status: 'completed',
      data: { 
        supportResponse,
        result,
        supportType
      },
      reasoning: `Support response delivered for ${supportType} inquiry.`
    };
  }

  /**
   * Escalate communication
   */
  private async escalateCommunication(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { originalMessageId, escalationReason, urgencyLevel } = request.data || {};
    
    // Generate escalation message
    const escalationMessage = this.generateEscalationMessage(originalMessageId, escalationReason, urgencyLevel);
    const channel = this.selectEscalationChannel(urgencyLevel);
    const result = await this.mockSendNotification(escalationMessage, channel);
    
    await this.recordContextEntry(context, {
      operation: 'communication_escalated',
      data: { 
        escalationMessage,
        channel,
        result,
        originalMessageId,
        escalationReason
      },
      reasoning: `Communication escalated to ${channel} due to ${escalationReason}. Urgency: ${urgencyLevel}`
    });

    return {
      status: 'completed',
      data: { 
        escalationMessage,
        result,
        channel,
        escalationReason
      },
      reasoning: `Communication successfully escalated via ${channel} for urgent attention.`
    };
  }

  // Helper methods for communication operations
  private determineUserPersona(context: TaskContext): UserPersona {
    const _userData = context.currentState.data.user || {};
    const taskHistory = context.history?.length || 0;
    
    // Simple persona determination logic
    // Account for the fact that this agent may have already added an entry at the start
    const effectiveHistory = taskHistory <= 1 ? 0 : taskHistory;
    
    if (effectiveHistory === 0) {
      return {
        type: 'first_timer',
        tone: 'encouraging_and_detailed',
        explanationLevel: 'comprehensive',
        checkInFrequency: 'frequent'
      };
    } else if (effectiveHistory > 10) {
      return {
        type: 'power_user',
        tone: 'efficient_and_brief',
        explanationLevel: 'summary',
        checkInFrequency: 'milestone_only'
      };
    } else {
      return {
        type: 'struggling',
        tone: 'supportive_and_patient',
        explanationLevel: 'step_by_step',
        checkInFrequency: 'proactive'
      };
    }
  }

  private generateNotification(messageType: string, content: any, urgency: string, persona: UserPersona): NotificationMessage {
    const templates = this.getMessageTemplates(messageType, persona);
    
    return {
      messageType,
      subject: this.populateTemplate(templates.subject, content),
      content: this.populateTemplate(templates.content, content),
      channel: this.selectChannel(urgency, messageType),
      urgency: urgency as any,
      responseRequired: this.requiresResponse(messageType),
      templateUsed: templates.templateId,
      deliveryStatus: 'pending'
    };
  }

  private generateApprovalRequest(approvalType: string, details: any): ApprovalRequest {
    const templates = this.getApprovalTemplates(approvalType);
    
    return {
      approvalType,
      subject: this.populateTemplate(templates.subject, details),
      content: this.populateTemplate(templates.content, details),
      details,
      channel: 'email',
      responseRequired: true,
      timeout: '24_hours',
      escalationPlan: ['email_reminder', 'sms_alert', 'human_support']
    };
  }

  private generateStatusUpdate(content: any, persona: UserPersona): NotificationMessage {
    const template = persona.type === 'power_user' ? 'brief_status' : 'detailed_status';
    
    return {
      messageType: 'status_update',
      subject: `Progress update: ${content.milestone} completed`,
      content: `Good news! We've completed ${content.milestone} for your ${content.taskType}. ${content.nextStep ? `Next up: ${content.nextStep}` : 'Continuing with next steps.'}`,
      channel: 'email',
      urgency: 'medium',
      responseRequired: false,
      templateUsed: template,
      deliveryStatus: 'pending'
    };
  }

  private generateSupportResponse(supportType: string, userQuery: string, _supportContext: any): NotificationMessage {
    return {
      messageType: 'support_response',
      subject: `Re: ${supportType} - We're here to help`,
      content: `Thank you for reaching out about ${supportType}. Based on your question "${userQuery}", here's how we can help...`,
      channel: 'in_app',
      urgency: 'medium',
      responseRequired: false,
      deliveryStatus: 'pending'
    };
  }

  private generateEscalationMessage(originalMessageId: string, reason: string, urgency: string): NotificationMessage {
    return {
      messageType: 'escalation',
      subject: 'Urgent: Action required for your task',
      content: `We need your immediate attention regarding your task. Original message: ${originalMessageId}. Reason: ${reason}`,
      channel: this.selectEscalationChannel(urgency),
      urgency: 'urgent',
      responseRequired: true,
      deliveryStatus: 'pending'
    };
  }

  private selectChannel(urgency: string, messageType?: string): string {
    switch (urgency) {
      case 'urgent':
        return 'sms';
      case 'high':
        return 'push_notification';
      case 'medium':
        return messageType === 'approval_request' ? 'email' : 'email';
      case 'low':
      default:
        return 'in_app';
    }
  }

  private selectEscalationChannel(urgencyLevel: string): string {
    switch (urgencyLevel) {
      case 'critical':
        return 'phone_call';
      case 'high':
        return 'sms';
      default:
        return 'email';
    }
  }

  private getMessageTemplates(messageType: string, persona: UserPersona): any {
    // Simplified template selection
    return {
      templateId: `${messageType}_${persona.type}`,
      subject: `{{task_type}} update - {{milestone}}`,
      content: persona.explanationLevel === 'comprehensive' 
        ? `Detailed update: {{content}} with next steps and timeline.`
        : `Brief update: {{content}}.`
    };
  }

  private getApprovalTemplates(_approvalType: string): any {
    return {
      subject: `Approval required: {{approvalType}}`,
      content: `We need your approval to proceed with {{approvalType}}. Details: {{details}}`
    };
  }

  private populateTemplate(template: string, data: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  private requiresResponse(messageType: string): boolean {
    return ['approval_request', 'form_review', 'payment_authorization'].includes(messageType);
  }

  private async mockSendNotification(notification: NotificationMessage, channel: string): Promise<CommunicationResult> {
    // Mock notification sending
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In test environment, always succeed for deterministic results
    const success = process.env.NODE_ENV === 'test' ? true : Math.random() > 0.05;
    
    return {
      messageId: `msg_${Date.now()}`,
      deliveryStatus: success ? 'sent' : 'failed',
      channel,
      sentAt: new Date().toISOString(),
      responseRequired: notification.responseRequired,
      escalationScheduled: notification.responseRequired
    };
  }

  private async mockSendApprovalRequest(approvalRequest: ApprovalRequest): Promise<CommunicationResult> {
    // Mock approval request sending
    await new Promise(resolve => setTimeout(resolve, 150));
    
    return {
      messageId: `approval_${Date.now()}`,
      deliveryStatus: 'sent',
      channel: approvalRequest.channel,
      sentAt: new Date().toISOString(),
      responseRequired: true,
      escalationScheduled: true
    };
  }

  private createNotificationUI(notification: NotificationMessage, result: CommunicationResult): UIRequest | null {
    if (!result.responseRequired) return null;
    
    return {
      requestId: `notification_ui_${Date.now()}`,
      templateType: UITemplateType.InstructionPanel,
      semanticData: {
        agentRole: 'communication_agent',
        title: notification.subject,
        description: notification.content,
        messageType: notification.messageType,
        urgency: notification.urgency,
        actions: {
          acknowledge: {
            type: 'submit',
            label: 'Got it',
            primary: true,
            handler: () => ({ action: 'acknowledge_notification', messageId: result.messageId })
          }
        }
      },
      context: {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: notification.urgency === 'urgent' ? 'high' : 'medium'
      }
    } as any;
  }

  private createApprovalUI(approvalRequest: ApprovalRequest, details: any): UIRequest {
    return {
      requestId: `approval_ui_${Date.now()}`,
      templateType: 'ApprovalRequest' as any,
      semanticData: {
        agentRole: 'communication_agent',
        title: approvalRequest.subject,
        description: approvalRequest.content,
        approvalType: approvalRequest.approvalType,
        details,
        timeout: approvalRequest.timeout,
        actions: {
          approve: {
            type: 'submit',
            label: 'Approve',
            primary: true,
            handler: () => ({ action: 'approve_request', approvalType: approvalRequest.approvalType, details })
          },
          reject: {
            type: 'cancel',
            label: 'Decline',
            handler: () => ({ action: 'reject_request', approvalType: approvalRequest.approvalType })
          },
          request_info: {
            type: 'custom',
            label: 'Need More Info',
            handler: () => ({ action: 'request_more_info', approvalType: approvalRequest.approvalType })
          }
        }
      },
      context: {
        userProgress: 75,
        deviceType: 'desktop',
        urgency: 'high'
      }
    } as any;
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
        id: 'communication_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Communication operation',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'communication',
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