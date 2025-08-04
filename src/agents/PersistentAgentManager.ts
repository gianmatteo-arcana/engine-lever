import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { AgentRole, AgentMessage, TaskContext, TaskPriority } from './base/types';
import { BaseAgent } from './base/BaseAgent';
import { OrchestratorAgent } from './orchestrator';
import { LegalComplianceAgent } from './legal-compliance';
import { DataCollectionAgent } from './data-collection';
import { PaymentAgent } from './payment';
import { AgencyInteractionAgent } from './agency-interaction';
import { MonitoringAgent } from './monitoring';
import { CommunicationAgent } from './communication';
import { dbService, TaskRecord, TaskExecutionRecord } from '../services/database';

export interface CreateTaskOptions {
  userId: string;
  businessId: string;
  templateId?: string;
  priority?: string;
  deadline?: Date;
  metadata?: Record<string, any>;
}

export interface PauseTaskOptions {
  taskId: string;
  executionId: string;
  reason: string;
  pauseType: 'user_approval' | 'payment' | 'external_wait' | 'error';
  requiredAction?: string;
  requiredData?: any;
  expiresIn?: number; // milliseconds
}

export interface ResumeTaskOptions {
  resumeToken: string;
  resumeData?: any;
  userId?: string;
}

export class PersistentAgentManager extends EventEmitter {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private isInitialized = false;
  private messageProcessingInterval: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('PersistentAgentManager already initialized');
      return;
    }

    logger.info('Initializing Persistent Agent Manager');

    try {
      // Initialize database service
      dbService.initialize();

      // Initialize all agents
      this.agents.set(AgentRole.ORCHESTRATOR, new OrchestratorAgent());
      this.agents.set(AgentRole.LEGAL_COMPLIANCE, new LegalComplianceAgent());
      this.agents.set(AgentRole.DATA_COLLECTION, new DataCollectionAgent());
      this.agents.set(AgentRole.PAYMENT, new PaymentAgent());
      this.agents.set(AgentRole.AGENCY_INTERACTION, new AgencyInteractionAgent());
      this.agents.set(AgentRole.MONITORING, new MonitoringAgent());
      this.agents.set(AgentRole.COMMUNICATION, new CommunicationAgent());

      // Set up inter-agent communication
      this.agents.forEach(agent => {
        agent.on('sendMessage', async (message: AgentMessage) => {
          await this.routeMessage(message);
        });

        agent.on('taskCompleted', async (result: any) => {
          await this.handleTaskCompleted(result);
        });

        agent.on('agentError', async (error: any) => {
          await this.handleAgentError(error);
        });
      });

      // Start message processing loop
      this.startMessageProcessing();

      // Resume any paused executions
      await this.resumePausedExecutions();

      this.isInitialized = true;
      logger.info('Persistent Agent Manager initialized successfully', {
        agentCount: this.agents.size
      });
    } catch (error) {
      logger.error('Failed to initialize Persistent Agent Manager', error);
      throw error;
    }
  }

  private async routeMessage(message: AgentMessage): Promise<void> {
    try {
      // Save message to database
      const task = await this.findTaskForMessage(message);
      await dbService.saveMessage(message, task?.id, task?.executionId);

      // Route to target agent
      const targetAgent = this.agents.get(message.to);
      if (!targetAgent) {
        logger.error('Target agent not found', {
          to: message.to,
          from: message.from
        });
        return;
      }

      // Process message
      await targetAgent.processMessage(message);

      // Mark message as processed
      await dbService.markMessageProcessed(message.id);
    } catch (error) {
      logger.error('Error routing message', { message, error });
    }
  }

  private async handleTaskCompleted(result: any): Promise<void> {
    try {
      const { taskId, executionId } = result;

      // Update task status in database
      await dbService.updateTask(taskId, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });

      // Update execution status
      if (executionId) {
        await dbService.updateExecution(executionId, {
          status: 'completed',
          ended_at: new Date().toISOString()
        });
      }

      // Add audit entry
      await dbService.addAuditEntry(
        taskId,
        'task_completed',
        result,
        AgentRole.ORCHESTRATOR
      );

      this.emit('taskCompleted', result);
    } catch (error) {
      logger.error('Error handling task completion', { result, error });
    }
  }

  private async handleAgentError(error: any): Promise<void> {
    logger.error('Agent error detected', error);

    try {
      // Save error to database
      if (error.taskId) {
        await dbService.addAuditEntry(
          error.taskId,
          'agent_error',
          error,
          error.agent
        );

        // Update task status if critical
        if (error.critical) {
          await dbService.updateTask(error.taskId, {
            status: 'completed'
          });
        }
      }

      // Notify monitoring agent
      const monitoringAgent = this.agents.get(AgentRole.MONITORING);
      if (monitoringAgent) {
        const errorMessage: AgentMessage = {
          id: `error-${Date.now()}`,
          from: AgentRole.ORCHESTRATOR,
          to: AgentRole.MONITORING,
          type: 'error',
          timestamp: new Date(),
          payload: error,
          priority: TaskPriority.HIGH
        };
        await monitoringAgent.processMessage(errorMessage);
      }
    } catch (dbError) {
      logger.error('Failed to handle agent error', dbError);
    }
  }

  public async createTask(options: CreateTaskOptions): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('PersistentAgentManager not initialized');
    }

    try {
      // Create task in database
      const taskRecord = await dbService.createTask({
        user_id: options.userId,
        title: options.metadata?.title || 'Task from Agent',
        task_type: options.templateId || 'agent_task',
        business_id: options.businessId,
        template_id: options.templateId || '',
        status: 'pending',
        priority: (options.priority || 'medium') as any,
        deadline: options.deadline?.toISOString(),
        metadata: options.metadata || {}
      });

      // Create execution record
      const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await dbService.createExecution({
        task_id: taskRecord.id,
        execution_id: executionId,
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        status: 'pending',
        is_paused: false,
        started_at: new Date().toISOString()
      });

      // Create task context
      const taskContext: TaskContext = {
        taskId: taskRecord.id,
        userId: options.userId,
        businessId: options.businessId,
        templateId: options.templateId,
        priority: this.mapPriority(taskRecord.priority),
        deadline: options.deadline,
        metadata: options.metadata || {},
        auditTrail: []
      };

      logger.info('Creating new task', {
        taskId: taskRecord.id,
        executionId,
        templateId: options.templateId
      });

      // Add audit entry
      await dbService.addAuditEntry(
        taskRecord.id,
        'task_created',
        { executionId, options },
        AgentRole.ORCHESTRATOR,
        options.userId
      );

      // Send task to orchestrator
      const orchestrator = this.agents.get(AgentRole.ORCHESTRATOR);
      if (!orchestrator) {
        throw new Error('Orchestrator agent not available');
      }

      const initMessage: AgentMessage = {
        id: `init-${Date.now()}`,
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.ORCHESTRATOR,
        type: 'request',
        timestamp: new Date(),
        payload: {
          action: 'new_task',
          context: taskContext,
          executionId
        },
        priority: taskContext.priority
      };

      await orchestrator.processMessage(initMessage);

      // Update task status to in_progress
      await dbService.updateTask(taskRecord.id, { status: 'in_progress' });
      await dbService.updateExecution(executionId, { status: 'running' });

      return taskRecord.id;
    } catch (error) {
      logger.error('Failed to create task', error);
      throw error;
    }
  }

  public async pauseTask(options: PauseTaskOptions): Promise<string> {
    try {
      // Update execution status
      await dbService.updateExecution(options.executionId, {
        is_paused: true,
        paused_at: new Date().toISOString(),
        pause_reason: options.reason,
        resume_data: options.requiredData
      });

      // Update task status - mark as in_progress (paused state tracked in execution)
      await dbService.updateTask(options.taskId, { status: 'in_progress' });

      // Create pause point
      const expiresAt = options.expiresIn 
        ? new Date(Date.now() + options.expiresIn).toISOString()
        : undefined;

      const resumeToken = await dbService.createPausePoint({
        task_id: options.taskId,
        execution_id: options.executionId,
        pause_type: options.pauseType,
        pause_reason: options.reason,
        required_action: options.requiredAction,
        required_data: options.requiredData,
        expires_at: expiresAt,
        resumed: false
      });

      // Add audit entry
      await dbService.addAuditEntry(
        options.taskId,
        'task_paused',
        { reason: options.reason, pauseType: options.pauseType, resumeToken },
        AgentRole.ORCHESTRATOR
      );

      logger.info('Task paused', {
        taskId: options.taskId,
        executionId: options.executionId,
        resumeToken
      });

      return resumeToken;
    } catch (error) {
      logger.error('Failed to pause task', error);
      throw error;
    }
  }

  public async resumeTask(options: ResumeTaskOptions): Promise<boolean> {
    try {
      // Resume from pause point
      const pausePoint = await dbService.resumeFromPausePoint(
        options.resumeToken,
        options.resumeData
      );

      if (!pausePoint) {
        logger.warn('Invalid or expired resume token', { token: options.resumeToken });
        return false;
      }

      // Get execution details
      const execution = await dbService.getExecution(pausePoint.execution_id!);
      if (!execution) {
        logger.error('Execution not found for pause point', pausePoint);
        return false;
      }

      // Update execution status
      await dbService.updateExecution(execution.execution_id, {
        is_paused: false,
        paused_at: undefined,
        pause_reason: undefined,
        resume_data: undefined
      });

      // Update task status
      await dbService.updateTask(pausePoint.task_id, { status: 'in_progress' });

      // Add audit entry
      await dbService.addAuditEntry(
        pausePoint.task_id,
        'task_resumed',
        { resumeToken: options.resumeToken, resumeData: options.resumeData },
        AgentRole.ORCHESTRATOR,
        options.userId
      );

      // Reconstruct task context and continue execution
      const task = await dbService.getTask(pausePoint.task_id);
      if (task) {
        await this.continueExecution(task, execution, pausePoint.resume_result);
      }

      logger.info('Task resumed', {
        taskId: pausePoint.task_id,
        executionId: execution.execution_id
      });

      return true;
    } catch (error) {
      logger.error('Failed to resume task', error);
      throw error;
    }
  }

  private async continueExecution(
    task: TaskRecord, 
    execution: TaskExecutionRecord,
    resumeData: any
  ): Promise<void> {
    // Reconstruct task context
    const taskContext: TaskContext = {
      taskId: task.id,
      userId: task.user_id,
      businessId: task.business_id,
      templateId: task.template_id,
      priority: this.mapPriority(task.priority),
      deadline: task.deadline ? new Date(task.deadline) : undefined,
      metadata: task.metadata,
      auditTrail: []
    };

    // Send resume message to orchestrator
    const orchestrator = this.agents.get(AgentRole.ORCHESTRATOR);
    if (orchestrator) {
      const resumeMessage: AgentMessage = {
        id: `resume-${Date.now()}`,
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.ORCHESTRATOR,
        type: 'request',
        timestamp: new Date(),
        payload: {
          action: 'resume_task',
          context: taskContext,
          executionId: execution.execution_id,
          currentStep: execution.current_step,
          completedSteps: execution.completed_steps,
          variables: execution.variables,
          resumeData
        },
        priority: taskContext.priority
      };

      await orchestrator.processMessage(resumeMessage);
    }
  }

  private async resumePausedExecutions(): Promise<void> {
    try {
      const pausedExecutions = await dbService.getPausedExecutions();
      
      logger.info(`Found ${pausedExecutions.length} paused executions to check`);

      for (const execution of pausedExecutions) {
        const task = await dbService.getTask(execution.task_id);
        // Check if execution is paused rather than task status
        if (task && execution.is_paused) {
          // Check if there's an active pause point
          const pausePoints = await dbService.getActivePausePoints(task.id);
          
          if (pausePoints.length === 0) {
            // No active pause points, auto-resume
            logger.info('Auto-resuming paused execution without pause point', {
              taskId: task.id,
              executionId: execution.execution_id
            });
            
            await this.continueExecution(task, execution, null);
          }
        }
      }
    } catch (error) {
      logger.error('Error resuming paused executions', error);
    }
  }

  private startMessageProcessing(): void {
    // Process unprocessed messages every 5 seconds
    this.messageProcessingInterval = setInterval(async () => {
      try {
        const messages = await dbService.getUnprocessedMessages(10);
        
        for (const message of messages) {
          const agentMessage: AgentMessage = {
            id: message.message_id,
            from: message.from_agent as AgentRole,
            to: message.to_agent as AgentRole,
            type: message.message_type,
            timestamp: new Date(message.created_at),
            payload: message.payload,
            correlationId: message.correlation_id,
            priority: this.mapPriority(message.priority)
          };

          const targetAgent = this.agents.get(agentMessage.to);
          if (targetAgent) {
            await targetAgent.processMessage(agentMessage);
            await dbService.markMessageProcessed(message.message_id);
          }
        }
      } catch (error) {
        logger.error('Error processing messages', error);
      }
    }, 5000);
  }

  public async getTaskStatus(taskId: string): Promise<any> {
    try {
      const task = await dbService.getTask(taskId);
      if (!task) {
        return { status: 'not_found' };
      }

      const executions = await dbService.getExecution(taskId);
      const pausePoints = await dbService.getActivePausePoints(taskId);

      return {
        taskId,
        status: task.status,
        priority: task.priority,
        createdAt: task.created_at,
        currentStep: executions?.current_step,
        completedSteps: executions?.completed_steps || [],
        isPaused: executions?.is_paused || false,
        pauseReason: executions?.pause_reason,
        activePausePoints: pausePoints.length,
        message: this.getStatusMessage(task.status)
      };
    } catch (error) {
      logger.error('Error getting task status', error);
      return { status: 'error', message: 'Failed to get task status' };
    }
  }

  private getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      pending: 'Task is pending execution',
      active: 'Task is being processed',
      paused: 'Task is paused and waiting for action',
      completed: 'Task completed successfully',
      failed: 'Task failed during execution',
      cancelled: 'Task was cancelled'
    };
    return messages[status] || 'Unknown status';
  }

  private async findTaskForMessage(_message: AgentMessage): Promise<any> {
    // TODO: Implement logic to find associated task
    // This could be based on correlation ID or payload content
    return null;
  }

  private mapPriority(priority: string): TaskPriority {
    const mapping: Record<string, TaskPriority> = {
      'critical': TaskPriority.CRITICAL,
      'high': TaskPriority.HIGH,
      'medium': TaskPriority.MEDIUM,
      'low': TaskPriority.LOW
    };
    return mapping[priority] || TaskPriority.MEDIUM;
  }

  public getAgentStatus(role: AgentRole): any {
    const agent = this.agents.get(role);
    if (!agent) {
      return { status: 'not_found' };
    }

    return {
      role,
      status: agent.getStatus(),
      metrics: agent.getMetrics()
    };
  }

  public getAllAgentsStatus(): any[] {
    return Array.from(this.agents.entries()).map(([role, agent]) => ({
      role,
      status: agent.getStatus(),
      metrics: agent.getMetrics()
    }));
  }

  public getAgentCount(): number {
    return this.agents.size;
  }

  public isHealthy(): boolean {
    if (!this.isInitialized) return false;
    
    const criticalAgents = [
      AgentRole.ORCHESTRATOR,
      AgentRole.LEGAL_COMPLIANCE,
      AgentRole.DATA_COLLECTION
    ];

    return criticalAgents.every(role => {
      const agent = this.agents.get(role);
      return agent && agent.getStatus() !== 'error';
    });
  }

  public async stop(): Promise<void> {
    logger.info('Stopping Persistent Agent Manager');

    // Stop message processing
    if (this.messageProcessingInterval) {
      clearInterval(this.messageProcessingInterval);
      this.messageProcessingInterval = null;
    }

    // Shutdown all agents
    const shutdownPromises = Array.from(this.agents.values()).map(agent => 
      agent.shutdown().catch(error => {
        logger.error('Error shutting down agent', error);
      })
    );

    await Promise.all(shutdownPromises);

    this.agents.clear();
    this.isInitialized = false;
    this.removeAllListeners();

    logger.info('Persistent Agent Manager stopped');
  }
}

// Export singleton instance
export const persistentAgentManager = new PersistentAgentManager();