/**
 * Resilient Orchestrator Agent
 * 
 * ARCHITECTURAL MANDATE:
 * This orchestrator implements a resilient fallback pattern where:
 * 1. At the LIMIT OF AUTOMATION: Every lookup we cannot perform autonomously 
 *    requires asking the user, becoming a "guide" for the user to fill out 
 *    all required fields and provide all information.
 * 2. At the OTHER LIMIT: We can figure out everything in the backend and 
 *    only require the user for "final approval".
 * 3. DYNAMIC MIX: Most real-world scenarios fall in between these limits.
 * 
 * CORE PRINCIPLE: No matter what capabilities are available, EVERY task 
 * can be achieved. The question is to what degree we can remove burden 
 * from the user through our smarts.
 */

import { BaseAgent } from './base/BaseAgent';
import {
  AgentRole,
  AgentMessage,
  TaskContext,
  AgentDecision,
  TaskPriority,
  AgentRequest,
  AgentResponse
} from './base/types';
import { logger } from '../utils/logger';

interface AutomationCapability {
  service: string;
  available: boolean;
  fallbackStrategy: 'ask_user' | 'provide_guidance' | 'defer';
  userGuidance?: string;
}

interface UserRequest {
  type: 'data_needed' | 'approval_needed' | 'choice_needed' | 'document_needed';
  field: string;
  description: string;
  guidance: string[];
  examples?: string[];
  acceptableFormats?: string[];
  urgency: 'immediate' | 'can_defer' | 'optional';
}

export class NotYetImplementedException extends Error {
  constructor(service: string, fallbackGuidance: string) {
    super(`Service "${service}" not yet implemented. ${fallbackGuidance}`);
    this.name = 'NotYetImplementedException';
  }
}

export class ResilientOrchestrator extends BaseAgent {
  private automationCapabilities: Map<string, AutomationCapability> = new Map();
  private pendingUserRequests: Map<string, UserRequest[]> = new Map();
  private taskAutomationLevel: Map<string, number> = new Map(); // 0-100% automation

  constructor() {
    super(
      {
        role: AgentRole.ORCHESTRATOR,
        name: 'Resilient Master Orchestrator',
        description: `
          RESILIENT ORCHESTRATOR with graceful degradation from full automation to guided assistance.
          
          PRIMARY DIRECTIVE: Every task MUST be achievable regardless of available automation.
          
          OPERATIONAL MODES:
          1. FULL AUTOMATION (100%): All data sources available, minimal user interaction
          2. HYBRID AUTOMATION (20-80%): Mix of automated lookups and user-provided data
          3. GUIDED ASSISTANCE (0-20%): Step-by-step guidance for user to complete all tasks
          
          FALLBACK HIERARCHY:
          1. Try automated API/service
          2. If unavailable, request specific data from user with clear guidance
          3. If user unsure, provide document upload options (e.g., "attach tax returns")
          4. If still blocked, provide manual instructions with external links
          
          USER INTERACTION PRINCIPLES:
          - ALWAYS explain WHY information is needed
          - ALWAYS provide multiple ways to provide information
          - BATCH related requests to minimize interruptions
          - LEARN from user inputs to reduce future requests
        `,
        expertise: [
          'Resilient task orchestration',
          'Graceful service degradation',
          'User guidance generation',
          'Document extraction strategies',
          'Progressive information gathering',
          'Intelligent batching of user requests'
        ],
        responsibilities: [
          'Assess available automation capabilities',
          'Determine optimal automation/manual mix',
          'Generate clear user guidance for manual steps',
          'Batch user requests intelligently',
          'Extract information from uploaded documents',
          'Track automation level for reporting',
          'Learn from user interactions to improve'
        ],
        limitations: [
          'Cannot force automation where APIs unavailable',
          'Must respect user preferences for manual control',
          'Cannot bypass legal requirements for user approval'
        ]
      },
      {
        canInitiateTasks: true,
        canDelegateTasks: true,
        requiredTools: [],
        maxConcurrentTasks: 10,
        supportedMessageTypes: ['request', 'response', 'notification', 'error', 'user_input']
      }
    );

    this.initializeCapabilities();
  }

  private initializeCapabilities(): void {
    // Define which services are available and their fallback strategies
    this.automationCapabilities.set('business_registry_lookup', {
      service: 'CA Secretary of State API',
      available: false, // Not yet implemented
      fallbackStrategy: 'ask_user',
      userGuidance: 'Please provide your business registration details. You can find this on your Articles of Incorporation or previous Statement of Information filing.'
    });

    this.automationCapabilities.set('tax_data_extraction', {
      service: 'IRS Data API',
      available: false, // Not yet implemented
      fallbackStrategy: 'provide_guidance',
      userGuidance: 'Upload your last year\'s tax returns (Form 1120 or 1065). We can extract revenue, equipment depreciation, and other key metrics automatically.'
    });

    this.automationCapabilities.set('bank_account_verification', {
      service: 'Plaid API',
      available: false, // Not yet implemented
      fallbackStrategy: 'ask_user',
      userGuidance: 'Please provide your business bank account details or connect your bank account for automatic verification.'
    });
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    logger.info('Resilient Orchestrator processing message', {
      from: message.from,
      type: message.type,
      messageId: message.id
    });

    if (message.type === 'request') {
      await this.handleResilientRequest(message);
    }
  }

  private async handleResilientRequest(message: AgentMessage): Promise<void> {
    const context = message.payload.context as TaskContext;
    const automationAssessment = await this.assessAutomationLevel(context);
    
    logger.info('Automation assessment', {
      taskId: context.taskId,
      automationLevel: automationAssessment.percentage,
      availableServices: automationAssessment.available,
      requiredUserInputs: automationAssessment.userInputsNeeded
    });

    // Store automation level for reporting
    this.taskAutomationLevel.set(context.taskId, automationAssessment.percentage);

    if (automationAssessment.percentage === 100) {
      await this.executeFullyAutomatedWorkflow(context);
    } else if (automationAssessment.percentage > 20) {
      await this.executeHybridWorkflow(context, automationAssessment);
    } else {
      await this.executeGuidedWorkflow(context, automationAssessment);
    }
  }

  private async assessAutomationLevel(context: TaskContext): Promise<{
    percentage: number;
    available: string[];
    unavailable: string[];
    userInputsNeeded: UserRequest[];
  }> {
    const requiredServices = this.getRequiredServices(context.templateId);
    const available: string[] = [];
    const unavailable: string[] = [];
    const userInputsNeeded: UserRequest[] = [];

    for (const service of requiredServices) {
      const capability = this.automationCapabilities.get(service);
      if (capability?.available) {
        available.push(service);
      } else {
        unavailable.push(service);
        userInputsNeeded.push(...this.generateUserRequests(service, context));
      }
    }

    const percentage = (available.length / requiredServices.length) * 100;

    return { percentage, available, unavailable, userInputsNeeded };
  }

  private getRequiredServices(templateId: string): string[] {
    // Real implementation based on Arcana Dwell LLC requirements
    if (templateId === 'business-onboarding') {
      return [
        'business_registry_lookup',
        'tax_data_extraction',
        'bank_account_verification'
      ];
    }
    return ['business_registry_lookup']; // Default
  }

  private generateUserRequests(service: string, context: TaskContext): UserRequest[] {
    const requests: UserRequest[] = [];

    switch (service) {
      case 'business_registry_lookup':
        requests.push({
          type: 'data_needed',
          field: 'business_info',
          description: 'Business Registration Information',
          guidance: [
            'Enter your business name as registered with the state',
            'Provide your entity number (found on Articles of Incorporation)',
            'OR upload your Articles of Incorporation/Organization',
            'OR upload your last Statement of Information'
          ],
          examples: [
            'Business Name: Arcana Dwell LLC',
            'Entity Number: 202358814523',
            'Formed: December 2023 in California'
          ],
          urgency: 'immediate'
        });
        break;

      case 'tax_data_extraction':
        requests.push({
          type: 'document_needed',
          field: 'tax_returns',
          description: 'Business Tax Returns',
          guidance: [
            'Upload your most recent business tax return (Form 1120, 1120S, or 1065)',
            'We\'ll extract: Annual revenue, Equipment/depreciation, Tax obligations',
            'Alternative: Manually enter revenue and expense categories',
            'Files accepted: PDF, JPG, PNG of tax return pages'
          ],
          acceptableFormats: ['application/pdf', 'image/jpeg', 'image/png'],
          urgency: 'can_defer'
        });
        break;

      case 'bank_account_verification':
        requests.push({
          type: 'choice_needed',
          field: 'bank_connection',
          description: 'Business Banking Information',
          guidance: [
            'Option 1: Connect your bank account securely via Plaid',
            'Option 2: Upload 3 months of bank statements',
            'Option 3: Manually enter account details and average balance',
            'This helps verify business financial standing for compliance'
          ],
          urgency: 'can_defer'
        });
        break;
    }

    return requests;
  }

  private async executeFullyAutomatedWorkflow(context: TaskContext): Promise<void> {
    logger.info('Executing fully automated workflow', {
      taskId: context.taskId,
      automationLevel: '100%'
    });

    // All services available - minimal user interaction
    await this.sendMessage(AgentRole.COMMUNICATION, {
      action: 'notify_user',
      message: 'Great news! We can handle this completely automatically. You\'ll only need to review and approve at the end.',
      context
    }, 'notification');

    // Execute automated steps...
  }

  private async executeHybridWorkflow(
    context: TaskContext,
    assessment: any
  ): Promise<void> {
    logger.info('Executing hybrid workflow', {
      taskId: context.taskId,
      automationLevel: `${assessment.percentage}%`,
      userInputsNeeded: assessment.userInputsNeeded.length
    });

    // Batch user requests intelligently
    const batchedRequests = this.batchUserRequests(assessment.userInputsNeeded);
    
    await this.sendMessage(AgentRole.COMMUNICATION, {
      action: 'request_user_input',
      message: `We can automate ${assessment.percentage}% of this task. We just need a few pieces of information from you.`,
      requests: batchedRequests,
      context
    }, 'request');

    // Store pending requests
    this.pendingUserRequests.set(context.taskId, assessment.userInputsNeeded);
  }

  private async executeGuidedWorkflow(
    context: TaskContext,
    assessment: any
  ): Promise<void> {
    logger.info('Executing guided workflow', {
      taskId: context.taskId,
      automationLevel: `${assessment.percentage}%`
    });

    await this.sendMessage(AgentRole.COMMUNICATION, {
      action: 'start_guided_flow',
      message: 'We\'ll guide you through this process step by step. Don\'t worry, we\'ll explain everything clearly and provide examples.',
      steps: this.generateGuidedSteps(context),
      context
    }, 'request');
  }

  private batchUserRequests(requests: UserRequest[]): UserRequest[][] {
    // Group related requests to minimize interruptions
    const batches: UserRequest[][] = [];
    const immediate = requests.filter(r => r.urgency === 'immediate');
    const canDefer = requests.filter(r => r.urgency === 'can_defer');
    const optional = requests.filter(r => r.urgency === 'optional');

    if (immediate.length > 0) batches.push(immediate);
    if (canDefer.length > 0) batches.push(canDefer);
    if (optional.length > 0) batches.push(optional);

    return batches;
  }

  private generateGuidedSteps(context: TaskContext): any[] {
    // Generate step-by-step guidance based on template
    return [
      {
        step: 1,
        title: 'Business Information',
        description: 'Let\'s start with your basic business details',
        fields: ['business_name', 'entity_type', 'formation_date', 'state'],
        guidance: 'This information is typically found on your Articles of Incorporation'
      },
      {
        step: 2,
        title: 'Business Address',
        description: 'Where is your business located?',
        fields: ['street_address', 'city', 'state', 'zip'],
        guidance: 'Use your principal place of business (e.g., 2512 Mission St, San Francisco, CA 94110)'
      },
      {
        step: 3,
        title: 'Ownership Information',
        description: 'Who owns the business?',
        fields: ['owner_names', 'ownership_percentages'],
        guidance: 'List all members/shareholders (e.g., Gianmatteo Costanza 50%, Farnaz Khorram 50%)'
      }
    ];
  }

  protected async handleTask(context: TaskContext): Promise<void> {
    const decision = await this.makeDecision(context);
    await this.executeAction(decision, context);
  }

  protected async makeDecision(context: TaskContext): Promise<AgentDecision> {
    const automationLevel = this.taskAutomationLevel.get(context.taskId) || 0;
    
    return {
      action: 'orchestrate_resilient_workflow',
      reasoning: `Task can be ${automationLevel}% automated. User guidance prepared for remaining ${100 - automationLevel}%.`,
      confidence: 0.95,
      requiredResources: this.determineRequiredAgents(context, automationLevel),
      estimatedDuration: this.estimateDuration(automationLevel)
    };
  }

  private determineRequiredAgents(context: TaskContext, automationLevel: number): AgentRole[] {
    const agents: AgentRole[] = [AgentRole.COMMUNICATION]; // Always need communication

    if (automationLevel > 50) {
      agents.push(AgentRole.DATA_COLLECTION, AgentRole.LEGAL_COMPLIANCE);
    }
    if (automationLevel > 75) {
      agents.push(AgentRole.AGENCY_INTERACTION);
    }

    return agents;
  }

  private estimateDuration(automationLevel: number): number {
    // More automation = less time
    const baseTime = 7200000; // 2 hours
    return baseTime * (1 - automationLevel / 100) + 600000; // Min 10 minutes
  }

  protected async executeAction(decision: AgentDecision, context: TaskContext): Promise<any> {
    logger.info('Executing resilient action', {
      action: decision.action,
      confidence: decision.confidence,
      reasoning: decision.reasoning
    });

    // Implementation continues with resilient execution...
    return { success: true, automationLevel: this.taskAutomationLevel.get(context.taskId) };
  }

  public async handleServiceFailure(service: string, context: TaskContext): Promise<void> {
    const capability = this.automationCapabilities.get(service);
    
    if (!capability) {
      throw new NotYetImplementedException(
        service,
        'This service is not yet available. Please provide the information manually.'
      );
    }

    // Generate fallback guidance
    const userRequests = this.generateUserRequests(service, context);
    
    await this.sendMessage(AgentRole.COMMUNICATION, {
      action: 'service_unavailable_fallback',
      service,
      fallbackGuidance: capability.userGuidance,
      userRequests,
      context
    }, 'request');
  }
}