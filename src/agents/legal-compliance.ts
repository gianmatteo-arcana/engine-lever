import { BaseAgent } from './base/BaseAgent';
import {
  AgentRole,
  AgentMessage,
  TaskContext,
  AgentDecision
} from './base/types';
import { logger } from '../utils/logger';

interface SOIRequirements {
  isRequired: boolean;
  dueDate?: Date;
  filingPeriod: string;
  fee: number;
  requiredDocuments: string[];
  formNumber: string;
}

export class LegalComplianceAgent extends BaseAgent {
  constructor() {
    super(
      {
        role: AgentRole.LEGAL_COMPLIANCE,
        name: 'Legal Compliance Specialist',
        description: 'Paralegal with Regulatory Expertise',
        expertise: [
          'California business compliance',
          'Form interpretation and completion',
          'Deadline tracking and management',
          'Regulatory requirement analysis',
          'Document preparation'
        ],
        responsibilities: [
          'Validate compliance requirements',
          'Interpret government forms',
          'Track filing deadlines',
          'Ensure form accuracy',
          'Maintain compliance calendar',
          'Advise on regulatory changes'
        ],
        limitations: [
          'Cannot provide legal advice',
          'Cannot sign documents on behalf of business',
          'Cannot make business decisions'
        ]
      },
      {
        canInitiateTasks: false,
        canDelegateTasks: false,
        requiredTools: ['ca-sos-lookup', 'form-parser', 'deadline-calculator'],
        maxConcurrentTasks: 5,
        supportedMessageTypes: ['request', 'response', 'notification']
      }
    );
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    logger.info('Legal Compliance Agent received message', {
      from: message.from,
      action: message.payload.action
    });

    const { action, context } = message.payload;

    switch (action) {
      case 'validate_soi_requirements':
        await this.validateSOIRequirements(context);
        break;
      case 'analyze_task':
        await this.analyzeComplianceTask(context);
        break;
      case 'check_deadline':
        await this.checkFilingDeadline(context);
        break;
      case 'prepare_form':
        await this.prepareComplianceForm(context);
        break;
      default:
        logger.warn('Unknown action for Legal Compliance Agent', { action });
    }
  }

  protected async handleTask(context: TaskContext): Promise<void> {
    const decision = await this.makeDecision(context);
    const result = await this.executeAction(decision, context);
    
    // Send result back to orchestrator
    this.sendMessage(AgentRole.ORCHESTRATOR, {
      taskId: context.taskId,
      status: 'completed',
      result
    }, 'response');
  }

  protected async makeDecision(context: TaskContext): Promise<AgentDecision> {
    // Analyze the compliance requirement
    const requirements = await this.analyzeRequirements(context);
    
    return {
      action: 'validate_and_prepare',
      reasoning: `Business requires ${requirements.formNumber} filing by ${requirements.dueDate}`,
      confidence: 0.9,
      requiredResources: requirements.requiredDocuments,
      estimatedDuration: 1800000 // 30 minutes
    };
  }

  protected async executeAction(decision: AgentDecision, context: TaskContext): Promise<any> {
    if (decision.action === 'validate_and_prepare') {
      return await this.prepareSOIFiling(context);
    }
    
    throw new Error(`Unknown action: ${decision.action}`);
  }

  private async validateSOIRequirements(context: TaskContext): Promise<void> {
    logger.info('Validating SOI requirements', { taskId: context.taskId });
    
    try {
      const requirements = await this.getSOIRequirements(context);
      
      // Store requirements in memory
      this.updateMemory(`soi_requirements_${context.taskId}`, requirements);
      
      // Send validation result to orchestrator
      this.sendMessage(AgentRole.ORCHESTRATOR, {
        taskId: context.taskId,
        status: 'completed',
        result: {
          valid: requirements.isRequired,
          requirements,
          fee: requirements.fee,
          dueDate: requirements.dueDate
        }
      }, 'response');
      
      // If deadline is approaching, notify
      if (requirements.dueDate && this.isDeadlineApproaching(requirements.dueDate)) {
        this.sendMessage(AgentRole.COMMUNICATION, {
          action: 'urgent_notification',
          message: `SOI filing due on ${requirements.dueDate.toISOString()}`,
          context
        }, 'notification');
      }
    } catch (error) {
      logger.error('Failed to validate SOI requirements', error);
      this.sendMessage(AgentRole.ORCHESTRATOR, {
        taskId: context.taskId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }, 'response');
    }
  }

  private async getSOIRequirements(context: TaskContext): Promise<SOIRequirements> {
    // TODO: Product Designer - Define exact SOI requirements logic
    // For now, return mock requirements for CA LLC/Corp
    
    const businessType = context.metadata.businessType || 'LLC';
    const incorporationDate = new Date(context.metadata.incorporationDate || Date.now());
    
    // Calculate filing period based on incorporation date
    const currentYear = new Date().getFullYear();
    const incorporationMonth = incorporationDate.getMonth();
    
    // CA SOI is due during incorporation month
    const dueDate = new Date(currentYear, incorporationMonth + 1, 0); // Last day of month
    
    return {
      isRequired: true,
      dueDate,
      filingPeriod: `${currentYear}`,
      fee: businessType === 'LLC' ? 20 : 25, // LLC vs Corp fee
      requiredDocuments: [
        'Current business address',
        'Officer/Member information',
        'Agent for service of process',
        'Business activity description'
      ],
      formNumber: businessType === 'LLC' ? 'LLC-12' : 'SI-200'
    };
  }

  private isDeadlineApproaching(dueDate: Date): boolean {
    const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 30; // Alert if within 30 days
  }

  private async analyzeComplianceTask(context: TaskContext): Promise<void> {
    logger.info('Analyzing compliance task', { taskId: context.taskId });
    
    // TODO: Product Designer - Define compliance analysis for other tasks
    const analysis = {
      taskType: 'unknown',
      requirements: [],
      estimatedComplexity: 'medium',
      suggestedAgents: [AgentRole.DATA_COLLECTION]
    };
    
    this.sendMessage(AgentRole.ORCHESTRATOR, {
      taskId: context.taskId,
      status: 'completed',
      result: analysis
    }, 'response');
  }

  private async checkFilingDeadline(context: TaskContext): Promise<void> {
    const requirements = this.getMemory(`soi_requirements_${context.taskId}`) || 
                        await this.getSOIRequirements(context);
    
    this.sendMessage(AgentRole.ORCHESTRATOR, {
      taskId: context.taskId,
      status: 'completed',
      result: {
        dueDate: requirements.dueDate,
        daysRemaining: Math.floor((requirements.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        isUrgent: this.isDeadlineApproaching(requirements.dueDate)
      }
    }, 'response');
  }

  private async prepareComplianceForm(context: TaskContext): Promise<void> {
    logger.info('Preparing compliance form', { taskId: context.taskId });
    
    const requirements = await this.getSOIRequirements(context);
    
    // Create form template
    const formTemplate = this.createSOIFormTemplate(requirements.formNumber);
    
    this.sendMessage(AgentRole.ORCHESTRATOR, {
      taskId: context.taskId,
      status: 'completed',
      result: {
        formTemplate,
        requiredFields: this.getRequiredFields(requirements.formNumber),
        instructions: this.getFilingInstructions(requirements.formNumber)
      }
    }, 'response');
  }

  private async prepareSOIFiling(context: TaskContext): Promise<any> {
    const requirements = await this.getSOIRequirements(context);
    const formTemplate = this.createSOIFormTemplate(requirements.formNumber);
    
    return {
      formNumber: requirements.formNumber,
      formTemplate,
      requiredFields: this.getRequiredFields(requirements.formNumber),
      fee: requirements.fee,
      dueDate: requirements.dueDate,
      filingMethod: 'online',
      portalUrl: 'https://bizfileonline.sos.ca.gov/'
    };
  }

  private createSOIFormTemplate(formNumber: string): any {
    // TODO: Product Designer - Define exact form templates
    if (formNumber === 'LLC-12') {
      return {
        formType: 'LLC Statement of Information',
        sections: {
          businessInfo: {
            name: '',
            fileNumber: '',
            jurisdiction: 'California'
          },
          principalAddress: {
            street: '',
            city: '',
            state: 'CA',
            zip: ''
          },
          mailingAddress: {
            sameAsPrincipal: false,
            street: '',
            city: '',
            state: '',
            zip: ''
          },
          agentForService: {
            name: '',
            address: {
              street: '',
              city: '',
              state: 'CA',
              zip: ''
            }
          },
          members: [],
          managers: []
        }
      };
    }
    
    // Default corporation template
    return {
      formType: 'Corporation Statement of Information',
      sections: {
        businessInfo: {},
        principalAddress: {},
        mailingAddress: {},
        agentForService: {},
        officers: []
      }
    };
  }

  private getRequiredFields(formNumber: string): string[] {
    // TODO: Product Designer - Define exact required fields per form
    const baseFields = [
      'business_name',
      'file_number',
      'principal_address',
      'agent_name',
      'agent_address'
    ];
    
    if (formNumber === 'LLC-12') {
      return [...baseFields, 'member_information', 'manager_information'];
    }
    
    return [...baseFields, 'officer_information'];
  }

  private getFilingInstructions(_formNumber: string): string[] {
    return [
      'Log in to California Business Search',
      'Locate your business entity',
      'Select "File Statement of Information"',
      'Complete all required fields',
      'Review for accuracy',
      'Submit payment',
      'Save confirmation number'
    ];
  }

  private async analyzeRequirements(context: TaskContext): Promise<SOIRequirements> {
    // Check if we already have requirements in memory
    const cached = this.getMemory(`soi_requirements_${context.taskId}`);
    if (cached) {
      return cached;
    }
    
    return await this.getSOIRequirements(context);
  }
}