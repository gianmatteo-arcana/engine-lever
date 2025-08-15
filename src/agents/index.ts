/**
 * Simplified Agent Registry - 8 Agents from 8 YAML Configurations
 * 
 * Following the principle: "YAML defines WHAT agents do, BaseAgent implements HOW"
 * 
 * Only 3 actual classes needed:
 * 1. BaseAgent - Standard agent behavior (used by most agents)
 * 2. OrchestratorAgent - Special orchestration logic
 * 3. TaskManagementAgent - Direct database access
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { AgentRole, AgentMessage, TaskContext, TaskPriority, convertPriority } from './base/types';
import { BaseAgent } from './base/BaseAgent';
import { OrchestratorAgent } from './OrchestratorAgent';
import { TaskManagementAgent } from './TaskManagementAgent';
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
      // Initialize agents using simplified architecture
      // Most agents are now BaseAgent instances configured by YAML
      const defaultBusinessId = 'default_business';
      const defaultUserId = 'default_user';
      
      // OrchestratorAgent is a special case with its own class
      this.agents.set(AgentRole.ORCHESTRATOR, OrchestratorAgent.getInstance());
      
      // Other agents are BaseAgent instances with YAML configuration
      // Using the simplified registry to create them
      this.agents.set(AgentRole.LEGAL_COMPLIANCE, simplifiedAgentRegistry.createAgent('backend-api', defaultBusinessId, defaultUserId));
      this.agents.set(AgentRole.DATA_COLLECTION, simplifiedAgentRegistry.createAgent('data-enrichment', defaultBusinessId, defaultUserId));
      this.agents.set(AgentRole.PAYMENT, simplifiedAgentRegistry.createAgent('backend-api', defaultBusinessId, defaultUserId));
      this.agents.set(AgentRole.AGENCY_INTERACTION, simplifiedAgentRegistry.createAgent('backend-api', defaultBusinessId, defaultUserId));
      this.agents.set(AgentRole.MONITORING, simplifiedAgentRegistry.createAgent('events', defaultBusinessId, defaultUserId));
      this.agents.set(AgentRole.COMMUNICATION, simplifiedAgentRegistry.createAgent('events', defaultBusinessId, defaultUserId));

      // Set up inter-agent communication for EventEmitter-based agents only
      this.agents.forEach((agent, _role) => {
        // Only set up event listeners for agents that support EventEmitter
        // The new consolidated BaseAgent agents don't use EventEmitter
        if (typeof (agent as any).on === 'function') {
          agent.on('sendMessage', (message: AgentMessage) => {
            this.routeMessage(message);
          });

          agent.on('taskCompleted', (result: any) => {
            this.emit('taskCompleted', result);
          });

          agent.on('agentError', (error: any) => {
            this.handleAgentError(error);
          });
        }
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
 * NEW SIMPLIFIED AGENT ARCHITECTURE
 * =============================================================================
 * 8 Agents from 8 YAML configurations, not 15 separate classes
 */

/**
 * Agent types matching our 8 YAML configuration files
 */
export type YamlAgentType = 
  | 'backend-api'
  | 'backend-orchestrator'
  | 'data-enrichment'
  | 'events'
  | 'profile-builder'
  | 'task-management'
  | 'task-orchestrator'
  | 'task-replay';

/**
 * Agent configuration mapping
 */
const AGENT_CONFIGS: Record<YamlAgentType, string> = {
  'backend-api': 'backend-api-agent.yaml',
  'backend-orchestrator': 'backend-orchestrator-agent.yaml',
  'data-enrichment': 'data-enrichment-agent.yaml',
  'events': 'events-agent.yaml',
  'profile-builder': 'profile-builder-agent.yaml',
  'task-management': 'task-management-agent.yaml',
  'task-orchestrator': 'task-orchestrator-agent.yaml',
  'task-replay': 'task-replay-agent.yaml'
};

/**
 * Simplified Agent Registry
 * Creates agents from YAML configurations
 */
export class SimplifiedAgentRegistry {
  private static instance: SimplifiedAgentRegistry;
  private agents = new Map<string, BaseAgent>();

  private constructor() {}

  static getInstance(): SimplifiedAgentRegistry {
    if (!SimplifiedAgentRegistry.instance) {
      SimplifiedAgentRegistry.instance = new SimplifiedAgentRegistry();
    }
    return SimplifiedAgentRegistry.instance;
  }

  /**
   * Create or get an agent instance
   * Most agents are just BaseAgent + YAML configuration
   */
  createAgent(
    agentType: YamlAgentType,
    businessId: string,
    userId?: string
  ): BaseAgent {
    const cacheKey = `${agentType}-${businessId}-${userId || 'system'}`;
    
    // Return cached instance if exists
    const cached = this.agents.get(cacheKey);
    if (cached) {
      return cached;
    }

    const configPath = `configs/${AGENT_CONFIGS[agentType]}`;
    let agent: BaseAgent;

    // Only special cases get their own class
    switch (agentType) {
      case 'backend-orchestrator':
      case 'task-orchestrator':
        // OrchestratorAgent has special orchestration logic
        agent = new OrchestratorAgent(configPath, businessId, userId);
        break;
      
      case 'task-management':
        // TaskManagementAgent needs direct database access
        agent = TaskManagementAgent.getInstance();
        break;
      
      default:
        // Most agents are just BaseAgent with YAML configuration
        // This includes: backend-api, data-enrichment, events, 
        // profile-builder, task-replay
        agent = new BaseAgent(configPath, businessId, userId) as BaseAgent;
    }

    this.agents.set(cacheKey, agent);
    return agent;
  }

  /**
   * Get all available agent types
   */
  getAvailableAgentTypes(): YamlAgentType[] {
    return Object.keys(AGENT_CONFIGS) as YamlAgentType[];
  }

  /**
   * Clear the agent cache (useful for testing)
   */
  clear(): void {
    this.agents.clear();
  }
}

// Export simplified registry singleton
export const simplifiedAgentRegistry = SimplifiedAgentRegistry.getInstance();

/**
 * Helper function to create agents using simplified architecture
 */
export function createSimplifiedAgent(
  agentType: YamlAgentType,
  businessId: string,
  userId?: string
): BaseAgent {
  return simplifiedAgentRegistry.createAgent(agentType, businessId, userId);
}

/**
 * Export the main agent classes
 */
export { BaseAgent } from './base/BaseAgent';
export { OrchestratorAgent } from './OrchestratorAgent';
export { TaskManagementAgent } from './TaskManagementAgent';

/**
 * Agent capability definitions (from YAML)
 */
export const AGENT_CAPABILITIES = {
  'backend-api': ['api_integration', 'webhook_handling', 'external_service_calls'],
  'backend-orchestrator': ['workflow_management', 'agent_coordination', 'task_sequencing'],
  'data-enrichment': ['data_gathering', 'information_synthesis', 'profile_enrichment'],
  'events': ['event_handling', 'notification_dispatch', 'real_time_updates'],
  'profile-builder': ['profile_assembly', 'data_validation', 'completeness_tracking'],
  'task-management': ['task_crud', 'status_tracking', 'database_operations'],
  'task-orchestrator': ['task_coordination', 'phase_management', 'agent_assignment'],
  'task-replay': ['task_replay', 'history_reconstruction', 'audit_logging']
};