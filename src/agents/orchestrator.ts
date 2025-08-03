import { BaseAgent } from './base/BaseAgent';
import {
  AgentRole,
  AgentMessage,
  TaskContext,
  AgentDecision,
  TaskPriority
} from './base/types';
import { logger } from '../utils/logger';

export class OrchestratorAgent extends BaseAgent {
  private taskQueue: Map<string, TaskContext> = new Map();
  private agentAssignments: Map<string, AgentRole> = new Map();

  constructor() {
    super(
      {
        role: AgentRole.ORCHESTRATOR,
        name: 'Master Orchestrator',
        description: 'Executive Assistant with Strategic Planning capabilities',
        expertise: [
          'Task decomposition',
          'Resource allocation',
          'Workflow coordination',
          'Priority management',
          'Agent delegation'
        ],
        responsibilities: [
          'Receive and analyze user requests',
          'Break down complex tasks into subtasks',
          'Assign tasks to appropriate specialist agents',
          'Monitor task progress across all agents',
          'Coordinate multi-agent workflows',
          'Handle task prioritization and scheduling'
        ],
        limitations: [
          'Cannot directly interact with external systems',
          'Relies on specialist agents for domain expertise',
          'Cannot override specialist agent decisions'
        ]
      },
      {
        canInitiateTasks: true,
        canDelegateTasks: true,
        requiredTools: [],
        maxConcurrentTasks: 10,
        supportedMessageTypes: ['request', 'response', 'notification', 'error']
      }
    );
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    logger.info('Orchestrator received message', {
      from: message.from,
      type: message.type,
      messageId: message.id
    });

    switch (message.type) {
      case 'request':
        await this.handleRequest(message);
        break;
      case 'response':
        await this.handleResponse(message);
        break;
      case 'notification':
        await this.handleNotification(message);
        break;
      case 'error':
        await this.handleAgentError(message);
        break;
    }
  }

  private async handleRequest(message: AgentMessage): Promise<void> {
    const { action, context } = message.payload;

    if (action === 'new_task') {
      await this.orchestrateTask(context);
    } else if (action === 'task_status') {
      this.sendTaskStatus(message.from, context.taskId);
    }
  }

  private async handleResponse(message: AgentMessage): Promise<void> {
    const { taskId, status, result } = message.payload;
    
    this.updateMemory(`task_${taskId}_status`, {
      agent: message.from,
      status,
      result,
      timestamp: new Date()
    });

    if (status === 'completed') {
      await this.handleAgentTaskCompletion(taskId, message.from, result);
    }
  }

  private async handleNotification(message: AgentMessage): Promise<void> {
    logger.info('Orchestrator received notification', {
      from: message.from,
      notification: message.payload
    });

    // Forward critical notifications to communication agent
    if (message.payload.priority === TaskPriority.CRITICAL) {
      this.sendMessage(AgentRole.COMMUNICATION, {
        action: 'notify_user',
        notification: message.payload
      }, 'notification');
    }
  }

  private async handleAgentError(message: AgentMessage): Promise<void> {
    const { taskId, error } = message.payload;
    
    logger.error('Agent reported error', {
      agent: message.from,
      taskId,
      error
    });

    // TODO: Product Designer - Define error recovery strategy
    // For now, log error and notify monitoring agent
    this.sendMessage(AgentRole.MONITORING, {
      action: 'log_error',
      agent: message.from,
      taskId,
      error
    }, 'notification');
  }

  protected async handleTask(context: TaskContext): Promise<void> {
    try {
      const decision = await this.makeDecision(context);
      await this.executeAction(decision, context);
    } catch (error) {
      logger.error('Failed to handle task', {
        taskId: context.taskId,
        error
      });
      throw error;
    }
  }

  protected async makeDecision(context: TaskContext): Promise<AgentDecision> {
    // Analyze task to determine which agents are needed
    const taskAnalysis = this.analyzeTask(context);
    
    return {
      action: 'orchestrate_workflow',
      reasoning: `Task requires ${taskAnalysis.requiredAgents.join(', ')} agents`,
      confidence: taskAnalysis.confidence,
      requiredResources: taskAnalysis.requiredAgents,
      estimatedDuration: taskAnalysis.estimatedDuration
    };
  }

  private analyzeTask(context: TaskContext): any {
    // TODO: Product Designer - Define task analysis logic based on template
    // For SOI filing, we need specific agents
    if (context.templateId === 'soi-filing') {
      return {
        requiredAgents: [
          AgentRole.LEGAL_COMPLIANCE,
          AgentRole.DATA_COLLECTION,
          AgentRole.PAYMENT,
          AgentRole.AGENCY_INTERACTION
        ],
        confidence: 0.95,
        estimatedDuration: 3600000 // 1 hour in ms
      };
    }

    // Default analysis for unknown tasks
    return {
      requiredAgents: [AgentRole.LEGAL_COMPLIANCE],
      confidence: 0.5,
      estimatedDuration: 7200000 // 2 hours
    };
  }

  protected async executeAction(decision: AgentDecision, context: TaskContext): Promise<any> {
    if (decision.action === 'orchestrate_workflow') {
      await this.orchestrateTask(context);
    }
  }

  private async orchestrateTask(context: TaskContext): Promise<void> {
    logger.info('Orchestrating task', {
      taskId: context.taskId,
      templateId: context.templateId
    });

    // Store task in queue
    this.taskQueue.set(context.taskId, context);

    // Determine task workflow based on template
    if (context.templateId === 'soi-filing') {
      await this.orchestrateSOIWorkflow(context);
    } else {
      // Default workflow
      await this.orchestrateDefaultWorkflow(context);
    }
  }

  private async orchestrateSOIWorkflow(context: TaskContext): Promise<void> {
    // Step 1: Legal Compliance Agent validates requirements
    this.sendMessage(AgentRole.LEGAL_COMPLIANCE, {
      action: 'validate_soi_requirements',
      context
    }, 'request');
    this.agentAssignments.set(`${context.taskId}_validate`, AgentRole.LEGAL_COMPLIANCE);

    // Step 2: Data Collection Agent gathers business data
    this.sendMessage(AgentRole.DATA_COLLECTION, {
      action: 'collect_business_data',
      context,
      dataPoints: [
        'business_name',
        'business_address',
        'officer_information',
        'agent_for_service'
      ]
    }, 'request');
    this.agentAssignments.set(`${context.taskId}_collect`, AgentRole.DATA_COLLECTION);

    // These will be triggered after data collection completes
    this.updateMemory(`${context.taskId}_workflow`, {
      currentStep: 'validation',
      nextSteps: ['data_collection', 'payment', 'submission'],
      status: 'in_progress'
    });
  }

  private async orchestrateDefaultWorkflow(context: TaskContext): Promise<void> {
    // For unknown tasks, send to legal compliance for analysis
    this.sendMessage(AgentRole.LEGAL_COMPLIANCE, {
      action: 'analyze_task',
      context
    }, 'request');
    this.agentAssignments.set(context.taskId, AgentRole.LEGAL_COMPLIANCE);
  }

  private async handleAgentTaskCompletion(taskId: string, agent: AgentRole, result: any): Promise<void> {
    const workflow = this.getMemory(`${taskId}_workflow`);
    
    if (!workflow) {
      logger.warn('No workflow found for completed task', { taskId, agent });
      return;
    }

    // Update workflow status
    workflow.completedSteps = workflow.completedSteps || [];
    workflow.completedSteps.push(agent);

    // Determine next step in workflow
    if (agent === AgentRole.LEGAL_COMPLIANCE && workflow.nextSteps.includes('payment')) {
      // Move to payment step
      const context = this.taskQueue.get(taskId);
      if (context) {
        this.sendMessage(AgentRole.PAYMENT, {
          action: 'process_soi_payment',
          context,
          amount: result.fee || 25, // CA SOI fee
          paymentMethod: 'default'
        }, 'request');
      }
    } else if (agent === AgentRole.PAYMENT && workflow.nextSteps.includes('submission')) {
      // Move to submission step
      const context = this.taskQueue.get(taskId);
      if (context) {
        this.sendMessage(AgentRole.AGENCY_INTERACTION, {
          action: 'submit_soi_form',
          context,
          formData: result.formData,
          paymentConfirmation: result.paymentConfirmation
        }, 'request');
      }
    } else if (agent === AgentRole.AGENCY_INTERACTION) {
      // Workflow complete
      await this.completeTask(taskId, {
        status: 'completed',
        submissionId: result.submissionId,
        timestamp: new Date()
      });

      // Notify user
      this.sendMessage(AgentRole.COMMUNICATION, {
        action: 'notify_completion',
        taskId,
        result
      }, 'notification');
    }

    this.updateMemory(`${taskId}_workflow`, workflow);
  }

  private sendTaskStatus(to: AgentRole, taskId: string): void {
    const context = this.taskQueue.get(taskId);
    const workflow = this.getMemory(`${taskId}_workflow`);
    
    this.sendMessage(to, {
      taskId,
      status: context ? 'active' : 'not_found',
      workflow,
      assignedAgents: Array.from(this.agentAssignments.entries())
        .filter(([key]) => key.startsWith(taskId))
        .map(([, agent]) => agent)
    }, 'response');
  }

  public async shutdown(): Promise<void> {
    // Notify all agents about shutdown
    for (const agent of Object.values(AgentRole)) {
      if (agent !== AgentRole.ORCHESTRATOR) {
        this.sendMessage(agent as AgentRole, {
          action: 'prepare_shutdown'
        }, 'notification');
      }
    }

    await super.shutdown();
  }
}