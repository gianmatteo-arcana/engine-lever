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
import { DatabaseService, TaskRecord } from '../services/database';

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
}

export interface ResumeTaskOptions {
  resumeToken: string;
  resumeData?: any;
}

export class PersistentAgentManager extends EventEmitter {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private isInitialized = false;
  private messageProcessingInterval: ReturnType<typeof setInterval> | null = null;
  private dbService: DatabaseService;

  constructor() {
    super();
    this.dbService = DatabaseService.getInstance();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('PersistentAgentManager already initialized');
      return;
    }

    logger.info('Initializing Persistent Agent Manager');

    try {
      // Database service is already a singleton, no need to initialize

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
      // Save message to database (using system operations)
      const task = await this.findTaskForMessage(message);
      await this.dbService.saveSystemMessage(message, task?.id, task?.executionId);

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

      // Mark message as processed - this method doesn't exist in new API
      // We'll need to implement this or track differently
      logger.debug('Message processed', { messageId: message.id });
    } catch (error) {
      logger.error('Error routing message', { message, error });
    }
  }

  private async handleTaskCompleted(result: any): Promise<void> {
    try {
      const { taskId, executionId, userToken } = result;

      // Update task status in database (need user token for user operations)
      if (userToken) {
        await this.dbService.updateTask(userToken, taskId, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });
      }

      // Update execution status (system operation)
      if (executionId) {
        await this.dbService.updateSystemExecution(executionId, {
          status: 'completed',
          ended_at: new Date().toISOString()
        });
      }

      // Add audit entry
      await this.dbService.createSystemAuditEntry({
        task_id: taskId,
        action: 'task_completed',
        details: result,
        agent_role: 'orchestrator'
      });

      this.emit('taskCompleted', result);
    } catch (error) {
      logger.error('Error handling task completion', { result, error });
    }
  }

  private async handleAgentError(error: any): Promise<void> {
    logger.error('Agent error detected', error);

    try {
      // Add audit entry for error
      if (error.taskId) {
        await this.dbService.createSystemAuditEntry({
          task_id: error.taskId,
          action: 'agent_error',
          details: error,
          agent_role: error.agentRole || 'unknown'
        });

        // Update task status if critical error
        if (error.severity === 'critical' && error.userToken) {
          await this.dbService.updateTask(error.userToken, error.taskId, {
            status: 'completed', // Maps to 'failed' in backend
            metadata: { error: error.message }
          });
        }
      }
    } catch (dbError) {
      logger.error('Failed to record agent error in database', dbError);
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

    this.emit('agentError', error);
  }

  public async createTask(options: CreateTaskOptions & { userToken: string }): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('PersistentAgentManager not initialized');
    }

    try {
      const { userToken, ...taskOptions } = options;
      
      // Create task record in database
      const taskRecord = await this.dbService.createTask(userToken, {
        user_id: taskOptions.userId,
        title: `${taskOptions.templateId || 'Manual'} Task`,
        description: `Task for business ${taskOptions.businessId}`,
        task_type: taskOptions.templateId || 'manual',
        business_id: taskOptions.businessId,
        template_id: taskOptions.templateId || '',
        status: 'pending',
        priority: (taskOptions.priority || 'medium') as TaskRecord['priority'],
        deadline: taskOptions.deadline?.toISOString(),
        metadata: taskOptions.metadata || {}
      });

      // Create execution record
      await this.dbService.createSystemExecution({
        task_id: taskRecord.id,
        execution_id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        current_step: 'initialization',
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        status: 'running',
        is_paused: false,
        started_at: new Date().toISOString()
      });

      // Create task context
      const taskContext: TaskContext = {
        taskId: taskRecord.id,
        userId: taskOptions.userId,
        userToken,
        businessId: taskOptions.businessId,
        templateId: taskOptions.templateId,
        priority: this.mapPriority(taskOptions.priority || 'medium'),
        deadline: taskOptions.deadline,
        metadata: taskOptions.metadata || {},
        auditTrail: []
      };

      // Send to orchestrator
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
          context: taskContext
        },
        priority: taskContext.priority
      };

      await orchestrator.processMessage(initMessage);

      return taskRecord.id;
    } catch (error) {
      logger.error('Failed to create task', error);
      throw error;
    }
  }

  public async pauseTask(options: PauseTaskOptions): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('PersistentAgentManager not initialized');
    }

    try {
      // Create pause point in database
      const pausePoint = {
        task_id: options.taskId,
        execution_id: options.executionId,
        pause_type: options.pauseType,
        pause_reason: options.reason,
        required_action: options.requiredAction,
        required_data: options.requiredData,
        resume_token: `resume-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resumed: false
      };

      // Note: createPausePoint doesn't exist in new API, we'll need to implement this
      // For now, just log and return token
      logger.info('Task paused', pausePoint);

      // Update execution status
      await this.dbService.updateSystemExecution(options.executionId, {
        status: 'paused',
        is_paused: true,
        paused_at: new Date().toISOString(),
        pause_reason: options.reason
      });

      return pausePoint.resume_token;
    } catch (error) {
      logger.error('Failed to pause task', error);
      throw error;
    }
  }

  public async resumeTask(options: ResumeTaskOptions): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('PersistentAgentManager not initialized');
    }

    try {
      // Note: resumeFromPausePoint doesn't exist in new API
      // For now, just log
      logger.info('Resuming task', options);

      // Send resume message to orchestrator
      const orchestrator = this.agents.get(AgentRole.ORCHESTRATOR);
      if (!orchestrator) {
        throw new Error('Orchestrator agent not available');
      }

      const resumeMessage: AgentMessage = {
        id: `resume-${Date.now()}`,
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.ORCHESTRATOR,
        type: 'request',
        timestamp: new Date(),
        payload: {
          action: 'resume_task',
          resumeToken: options.resumeToken,
          resumeData: options.resumeData
        },
        priority: TaskPriority.HIGH
      };

      await orchestrator.processMessage(resumeMessage);
    } catch (error) {
      logger.error('Failed to resume task', error);
      throw error;
    }
  }

  private async resumePausedExecutions(): Promise<void> {
    try {
      // Note: getPausedExecutions doesn't exist in new API
      // For now, skip this functionality
      logger.info('Checking for paused executions to resume');
    } catch (error) {
      logger.error('Failed to resume paused executions', error);
    }
  }

  private startMessageProcessing(): void {
    // Process unprocessed messages every 5 seconds
    this.messageProcessingInterval = setInterval(async () => {
      try {
        // Note: getUnprocessedMessages doesn't exist in new API
        // For now, skip this functionality
      } catch (error) {
        logger.error('Error processing messages', error);
      }
    }, 5000);
  }

  private async findTaskForMessage(message: AgentMessage): Promise<{ id: string; executionId?: string } | null> {
    // Extract task context from message payload
    if (message.payload?.taskId) {
      return {
        id: message.payload.taskId,
        executionId: message.payload.executionId
      };
    }
    return null;
  }

  private mapPriority(priority: string): TaskPriority {
    switch (priority.toLowerCase()) {
      case 'critical':
        return TaskPriority.CRITICAL;
      case 'high':
        return TaskPriority.HIGH;
      case 'medium':
        return TaskPriority.MEDIUM;
      case 'low':
        return TaskPriority.LOW;
      default:
        return TaskPriority.MEDIUM;
    }
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

  public isHealthy(): boolean {
    if (!this.isInitialized) return false;

    // Check if all critical agents are available
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