import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { AgentRole, AgentMessage, TaskContext, TaskPriority, convertPriority } from './base/types';
import { BaseAgent } from './base/BaseAgent';
import { OrchestratorAgent } from './orchestrator';
import { LegalComplianceAgent } from './legal-compliance';
import { DataCollectionAgent } from './data-collection';
import { PaymentAgent } from './payment';
import { AgencyInteractionAgent } from './agency-interaction';
import { MonitoringAgent } from './monitoring';
import { CommunicationAgent } from './communication';
import { DatabaseService } from '../services/database';

class AgentManagerClass extends EventEmitter {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private messageQueue: AgentMessage[] = [];
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('AgentManager already initialized');
      return;
    }

    logger.info('Initializing Agent Manager');

    try {
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
        agent.on('sendMessage', (message: AgentMessage) => {
          this.routeMessage(message);
        });

        agent.on('taskCompleted', (result: any) => {
          this.emit('taskCompleted', result);
        });

        agent.on('agentError', (error: any) => {
          this.handleAgentError(error);
        });
      });

      this.isInitialized = true;
      logger.info('Agent Manager initialized successfully', {
        agentCount: this.agents.size
      });
    } catch (error) {
      logger.error('Failed to initialize Agent Manager', error);
      throw error;
    }
  }

  private routeMessage(message: AgentMessage): void {
    const targetAgent = this.agents.get(message.to);
    
    if (!targetAgent) {
      logger.error('Target agent not found', {
        to: message.to,
        from: message.from
      });
      return;
    }

    // Add to message queue for processing
    this.messageQueue.push(message);
    
    // Process message asynchronously
    setImmediate(() => {
      targetAgent.processMessage(message).catch(error => {
        logger.error('Error processing message', {
          message,
          error
        });
      });
    });
  }

  private handleAgentError(error: any): void {
    logger.error('Agent error detected', error);
    
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
      monitoringAgent.processMessage(errorMessage);
    }
  }

  public async createTask(taskRequest: any): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('AgentManager not initialized');
    }

    const taskContext: TaskContext = {
      taskId: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: taskRequest.userId,
      businessId: taskRequest.businessId,
      templateId: taskRequest.templateId,
      priority: convertPriority(taskRequest.priority || 'medium'),
      deadline: taskRequest.deadline,
      metadata: taskRequest.metadata || {},
      auditTrail: []
    };

    logger.info('Creating new task', {
      taskId: taskContext.taskId,
      templateId: taskContext.templateId
    });

    // If we have a user token, save the task to the database using RLS
    if (taskRequest.userToken) {
      const db = DatabaseService.getInstance();
      const taskRecord = await db.createTask(taskRequest.userToken, {
        id: taskContext.taskId,
        user_id: taskRequest.userId,
        title: `${taskRequest.templateId} Task`,
        description: `Task for ${taskRequest.businessId}`,
        task_type: taskRequest.templateId || 'general',
        business_id: taskRequest.businessId,
        template_id: taskRequest.templateId,
        status: 'pending',
        priority: taskRequest.priority || 'medium',
        deadline: taskRequest.deadline,
        metadata: taskRequest.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      logger.info('Task saved to database with RLS', { taskId: taskRecord.id });
    }

    // Send task to orchestrator
    const orchestrator = this.agents.get(AgentRole.ORCHESTRATOR);
    if (!orchestrator) {
      throw new Error('Orchestrator agent not available');
    }

    const initMessage: AgentMessage = {
      id: `init-${Date.now()}`,
      from: AgentRole.ORCHESTRATOR, // Self-message to start
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
    
    return taskContext.taskId;
  }

  public async getTaskStatus(taskId: string, userToken: string): Promise<any> {
    try {
      // Get task from database using user token (RLS handles authorization)
      const db = DatabaseService.getInstance();
      const task = await db.getTask(userToken, taskId);
      
      if (!task) {
        // Task not found or user doesn't have access
        return null;
      }

      return {
        taskId: task.id,
        userId: task.user_id,
        status: task.status,
        priority: task.priority,
        businessId: task.business_id,
        templateId: task.template_id,
        metadata: task.metadata,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at
      };
    } catch (error) {
      logger.error('Failed to get task status', { taskId, error });
      return null;
    }
  }

  public async getUserTasks(userToken: string): Promise<any[]> {
    try {
      const db = DatabaseService.getInstance();
      // RLS automatically filters to only the user's tasks
      const tasks = await db.getUserTasks(userToken);
      
      return tasks.map(task => ({
        taskId: task.id,
        userId: task.user_id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        businessId: task.business_id,
        templateId: task.template_id,
        metadata: task.metadata,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at
      }));
    } catch (error) {
      logger.error('Failed to get user tasks', error);
      return [];
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

  public getAgentCount(): number {
    return this.agents.size;
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
    logger.info('Stopping Agent Manager');

    // Shutdown all agents
    const shutdownPromises = Array.from(this.agents.values()).map(agent => 
      agent.shutdown().catch(error => {
        logger.error('Error shutting down agent', error);
      })
    );

    await Promise.all(shutdownPromises);

    this.agents.clear();
    this.messageQueue = [];
    this.isInitialized = false;
    this.removeAllListeners();

    logger.info('Agent Manager stopped');
  }
}

// Export singleton instance
export const AgentManager = new AgentManagerClass();

// Export types
export * from './base/types';