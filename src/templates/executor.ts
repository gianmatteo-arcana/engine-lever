import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { TaskTemplate, TemplateParser } from './parser';
import { TaskContext, AgentRole } from '../agents';

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  WAITING_APPROVAL = 'waiting_approval',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface ExecutionContext {
  executionId: string;
  templateId: string;
  taskContext: TaskContext;
  status: ExecutionStatus;
  currentStep: string | null;
  completedSteps: string[];
  variables: Map<string, any>;
  startTime: Date;
  endTime?: Date;
  errors: any[];
}

export class TemplateExecutor extends EventEmitter {
  private executions: Map<string, ExecutionContext> = new Map();
  private parser: TemplateParser;

  constructor(templateDir?: string) {
    super();
    this.parser = new TemplateParser(templateDir);
  }

  async initialize(): Promise<void> {
    await this.parser.loadAllTemplates();
    logger.info('Template Executor initialized', {
      templateCount: this.parser.getAllTemplates().length
    });
  }

  async executeTemplate(templateId: string, taskContext: TaskContext): Promise<string> {
    const template = await this.parser.loadTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const execution: ExecutionContext = {
      executionId,
      templateId,
      taskContext,
      status: ExecutionStatus.PENDING,
      currentStep: null,
      completedSteps: [],
      variables: new Map(),
      startTime: new Date(),
      errors: []
    };

    this.executions.set(executionId, execution);

    logger.info('Starting template execution', {
      executionId,
      templateId,
      taskId: taskContext.taskId
    });

    // Start execution asynchronously
    this.executeSteps(execution, template).catch(error => {
      logger.error('Template execution failed', {
        executionId,
        error
      });
      execution.status = ExecutionStatus.FAILED;
      execution.errors.push(error);
      this.emit('executionFailed', { executionId, error });
    });

    return executionId;
  }

  private async executeSteps(execution: ExecutionContext, template: TaskTemplate): Promise<void> {
    execution.status = ExecutionStatus.RUNNING;
    this.emit('executionStarted', { executionId: execution.executionId });

    for (const step of template.steps) {
      // Re-check execution status in case it was cancelled externally
      const currentExecution = this.executions.get(execution.executionId);
      if (currentExecution && currentExecution.status === ExecutionStatus.CANCELLED) {
        logger.info('Execution cancelled', { executionId: execution.executionId });
        break;
      }

      try {
        // Check pre-conditions
        if (step.conditions?.pre) {
          const conditionsMet = await this.checkConditions(step.conditions.pre, execution);
          if (!conditionsMet) {
            logger.warn('Pre-conditions not met for step', {
              stepId: step.id,
              conditions: step.conditions.pre
            });
            continue;
          }
        }

        execution.currentStep = step.id;
        logger.info('Executing step', {
          executionId: execution.executionId,
          stepId: step.id,
          stepName: step.name
        });

        // Prepare inputs with variable substitution
        const inputs = this.substituteVariables(step.inputs || {}, execution.variables);

        // Execute the step through the appropriate agent
        const result = await this.executeStep(step, inputs, execution.taskContext);

        // Store outputs as variables
        if (step.outputs) {
          for (const output of step.outputs) {
            execution.variables.set(output, result[output]);
          }
        }

        execution.completedSteps.push(step.id);
        
        // Check post-conditions
        if (step.conditions?.post) {
          const conditionsMet = await this.checkConditions(step.conditions.post, execution);
          if (!conditionsMet) {
            throw new Error(`Post-conditions not met for step ${step.id}`);
          }
        }

        this.emit('stepCompleted', {
          executionId: execution.executionId,
          stepId: step.id,
          result
        });

      } catch (error) {
        logger.error('Step execution failed', {
          executionId: execution.executionId,
          stepId: step.id,
          error
        });

        // Handle error based on configuration
        if (step.errorHandling) {
          const handled = await this.handleStepError(step, error as Error, execution);
          if (!handled) {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    execution.status = ExecutionStatus.COMPLETED;
    execution.endTime = new Date();
    
    this.emit('executionCompleted', {
      executionId: execution.executionId,
      duration: execution.endTime.getTime() - execution.startTime.getTime()
    });

    logger.info('Template execution completed', {
      executionId: execution.executionId,
      duration: execution.endTime.getTime() - execution.startTime.getTime()
    });
  }

  private async executeStep(step: any, inputs: any, _taskContext: TaskContext): Promise<any> {
    // Map step agent to AgentRole enum
    const agentRole = this.mapAgentRole(step.agent);
    
    // Send task to agent through pure A2A protocol via OrchestratorAgent
    // For now, we'll simulate the execution
    // TODO: Implement actual A2A agent communication
    
    logger.info('Sending step to agent via A2A protocol', {
      agent: agentRole,
      action: step.action,
      inputs
    });

    // Simulate async execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return mock result based on step
    return this.getMockStepResult(step);
  }

  private mapAgentRole(agent: string): AgentRole {
    const mapping: Record<string, AgentRole> = {
      'orchestrator': AgentRole.ORCHESTRATOR,
      'legal_compliance': AgentRole.LEGAL_COMPLIANCE,
      'data_collection': AgentRole.DATA_COLLECTION,
      'payment': AgentRole.PAYMENT,
      'agency_interaction': AgentRole.AGENCY_INTERACTION,
      'monitoring': AgentRole.MONITORING,
      'communication': AgentRole.COMMUNICATION
    };
    
    return mapping[agent] || AgentRole.ORCHESTRATOR;
  }

  private getMockStepResult(step: any): any {
    // TODO: Remove this mock implementation when agents are fully integrated
    const mockResults: Record<string, any> = {
      'validate_requirements': {
        isRequired: true,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        fee: 25,
        formNumber: 'SI-200'
      },
      'collect_business_data': {
        businessData: {
          business_name: 'Example Corp',
          file_number: 'C1234567',
          business_address: {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            zip: '94102'
          }
        },
        dataValidated: true
      },
      'prepare_form': {
        preparedForm: { /* form data */ },
        validationResult: { valid: true }
      },
      'user_approval': {
        approved: true,
        corrections: []
      },
      'process_payment': {
        paymentConfirmation: 'PAY-123456',
        transactionId: 'TXN-789012'
      },
      'submit_form': {
        submissionId: 'SUB-345678',
        confirmationNumber: 'CONF-901234',
        receiptUrl: 'https://example.com/receipt'
      },
      'track_status': {
        finalStatus: 'processed',
        processingTime: 48
      },
      'notify_completion': {
        notificationSent: true
      }
    };

    return mockResults[step.id] || { success: true };
  }

  private async checkConditions(conditions: string[], execution: ExecutionContext): Promise<boolean> {
    // TODO: Implement actual condition checking logic
    // For now, check if required steps are completed
    for (const condition of conditions) {
      if (condition.endsWith('_validated') || condition.endsWith('_completed')) {
        const stepName = condition.replace(/_validated|_completed/, '');
        if (!execution.completedSteps.includes(stepName)) {
          return false;
        }
      }
    }
    return true;
  }

  private substituteVariables(inputs: any, variables: Map<string, any>): any {
    if (typeof inputs === 'string' && inputs.startsWith('${') && inputs.endsWith('}')) {
      const varName = inputs.slice(2, -1);
      return variables.get(varName) || inputs;
    }
    
    if (typeof inputs === 'object' && inputs !== null) {
      const result: any = Array.isArray(inputs) ? [] : {};
      for (const key in inputs) {
        result[key] = this.substituteVariables(inputs[key], variables);
      }
      return result;
    }
    
    return inputs;
  }

  private async handleStepError(step: any, _error: Error, _execution: ExecutionContext): Promise<boolean> {
    const errorHandling = step.errorHandling;
    
    if (errorHandling.retryCount > 0) {
      logger.info('Retrying failed step', {
        stepId: step.id,
        retryCount: errorHandling.retryCount
      });
      
      // TODO: Implement retry logic
      return false;
    }
    
    if (errorHandling.fallbackAction) {
      logger.info('Executing fallback action', {
        stepId: step.id,
        fallbackAction: errorHandling.fallbackAction
      });
      
      // TODO: Implement fallback action
      return true;
    }
    
    if (errorHandling.escalationAgent) {
      logger.info('Escalating to agent', {
        stepId: step.id,
        escalationAgent: errorHandling.escalationAgent
      });
      
      // TODO: Implement escalation
      return false;
    }
    
    return false;
  }

  public getExecution(executionId: string): ExecutionContext | undefined {
    return this.executions.get(executionId);
  }

  public getAllExecutions(): ExecutionContext[] {
    return Array.from(this.executions.values());
  }

  public async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }
    
    execution.status = ExecutionStatus.CANCELLED;
    execution.endTime = new Date();
    
    this.emit('executionCancelled', { executionId });
    
    logger.info('Execution cancelled', { executionId });
  }
}