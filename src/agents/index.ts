/**
 * Agent Manager - Simplified architecture with dynamic YAML discovery
 * 
 * Following the principle: "YAML defines WHAT agents do, DefaultAgent implements HOW"
 * 
 * Only 3 actual classes needed:
 * 1. BaseAgent - Abstract base for all agents
 * 2. DefaultAgent - Concrete implementation for YAML-configured agents
 * 3. OrchestratorAgent & TaskManagementAgent - Special cases only
 */

import { logger } from '../utils/logger';
import { AgentRole, AgentMessage, TaskContext, TaskPriority, convertPriority } from './base/types';
import { BaseAgent } from './base/BaseAgent';
import { DefaultAgent } from './DefaultAgent';
import { OrchestratorAgent } from './OrchestratorAgent';
import { TaskManagementAgent } from './TaskManagementAgent';
import { dynamicAgentRegistry } from './DynamicAgentRegistry';
import { DatabaseService } from '../services/database';

class AgentManagerClass {
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
      // Initialize agents using dynamic registry
      // Registry automatically discovers YAML files - no hardcoding
      const defaultBusinessId = 'default_business';
      const defaultUserId = 'default_user';
      
      // OrchestratorAgent is a special case with its own class
      this.agents.set(AgentRole.ORCHESTRATOR, OrchestratorAgent.getInstance());
      
      // Map AgentRoles to discovered YAML configurations
      // The registry will find the appropriate YAML file
      const roleToType: Record<string, string> = {
        [AgentRole.LEGAL_COMPLIANCE]: 'backend-api',
        [AgentRole.DATA_COLLECTION]: 'data-enrichment',
        [AgentRole.PAYMENT]: 'backend-api',
        [AgentRole.AGENCY_INTERACTION]: 'backend-api',
        [AgentRole.MONITORING]: 'events',
        [AgentRole.COMMUNICATION]: 'events'
      };

      // Create agents dynamically based on discovered YAMLs
      for (const [role, agentType] of Object.entries(roleToType)) {
        if (dynamicAgentRegistry.isAgentAvailable(agentType)) {
          const agent = dynamicAgentRegistry.createAgent(agentType, defaultBusinessId, defaultUserId);
          this.agents.set(role as AgentRole, agent);
        } else {
          logger.warn(`Agent type ${agentType} not found for role ${role}`);
        }
      }

      // Agents now communicate through direct method calls
      // No EventEmitter needed - simpler and more direct

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
      // Check if agent has processMessage method
      if (typeof (targetAgent as any).processMessage === 'function') {
        targetAgent.processMessage(message).catch(error => {
          logger.error('Error processing message', {
            message,
            error
          });
        });
      } else {
        logger.warn('Agent does not support processMessage', {
          role: message.to,
          agentType: targetAgent.constructor.name
        });
      }
    });
  }

  private handleAgentError(error: any): void {
    logger.error('Agent error detected', error);
    
    // Notify monitoring agent
    const monitoringAgent = this.agents.get(AgentRole.MONITORING);
    if (monitoringAgent && typeof (monitoringAgent as any).processMessage === 'function') {
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

    // Check if agent has getStatus and getMetrics methods
    const status = typeof (agent as any).getStatus === 'function' 
      ? agent.getStatus() 
      : 'active';
    const metrics = typeof (agent as any).getMetrics === 'function'
      ? agent.getMetrics()
      : {};

    return {
      role,
      status,
      metrics
    };
  }

  public getAllAgentsStatus(): any[] {
    return Array.from(this.agents.entries()).map(([role, agent]) => {
      // Check if agent has getStatus and getMetrics methods
      const status = typeof (agent as any).getStatus === 'function' 
        ? agent.getStatus() 
        : 'active';
      const metrics = typeof (agent as any).getMetrics === 'function'
        ? agent.getMetrics()
        : {};
        
      return {
        role,
        status,
        metrics
      };
    });
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
      if (!agent) return false;
      
      // Check if agent has getStatus method
      const status = typeof (agent as any).getStatus === 'function' 
        ? agent.getStatus() 
        : 'active';
      
      return status !== 'error';
    });
  }

  public async stop(): Promise<void> {
    logger.info('Stopping Agent Manager');

    // Shutdown all agents
    const shutdownPromises = Array.from(this.agents.values()).map(agent => {
      // Only call shutdown if the agent has a shutdown method
      if (typeof (agent as any).shutdown === 'function') {
        return agent.shutdown().catch(error => {
          logger.error('Error shutting down agent', error);
        });
      }
      return Promise.resolve();
    });

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

/**
 * =============================================================================
 * DYNAMIC AGENT ARCHITECTURE
 * =============================================================================
 * Agents are dynamically discovered from YAML files - no hardcoding
 */

// Re-export the dynamic agent registry and helper functions
export { dynamicAgentRegistry } from './DynamicAgentRegistry';
export { createAgent } from './DynamicAgentRegistry';

/**
 * Export the main agent classes
 */
export { BaseAgent } from './base/BaseAgent';
export { DefaultAgent } from './DefaultAgent';
export { OrchestratorAgent } from './OrchestratorAgent';
export { TaskManagementAgent } from './TaskManagementAgent';

/**
 * Get agent capabilities dynamically from discovered YAML files
 * No hardcoding - capabilities are defined in YAML configurations
 */
export function getAgentCapabilities(agentType: string): string[] {
  try {
    const agent = dynamicAgentRegistry.createAgent(agentType, 'temp', 'temp');
    if (agent && typeof (agent as any).getConfiguration === 'function') {
      const config = (agent as any).getConfiguration();
      return config.capabilities || [];
    }
  } catch (error) {
    logger.warn(`Could not get capabilities for agent type: ${agentType}`);
  }
  return [];
}