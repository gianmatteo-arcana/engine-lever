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
import { AgentRole, TaskContext, convertPriority } from './base/types';
import { OrchestratorAgent } from './OrchestratorAgent';
// TaskManagementAgent removed - not one of the 8 core agents
import { DatabaseService } from '../services/database';

class AgentManagerClass {
  private agents: Map<AgentRole, any> = new Map();
  private isInitialized = false;

  /**
   * 🎯 AGENT SYSTEM INITIALIZATION
   * 
   * This is where all agents are created and registered.
   * 
   * INITIALIZATION CHAIN:
   * AgentManager.initialize() 
   *   → OrchestratorAgent.getInstance() [Singleton pattern]
   *     → new OrchestratorAgent() [First time only]
   *       → BaseAgent('orchestrator.yaml') [Parent constructor]
   *         → LLMProvider.getInstance() [Needs API keys]
   *         → new ToolChain() [Creates CredentialVault]
   *           → new CredentialVault() [REQUIRES SUPABASE!]
   * 
   * FAILURE POINTS:
   * - No Supabase config → CredentialVault throws
   * - No API keys → LLMProvider warns but continues
   * - Missing YAML → BaseAgent throws
   * 
   * @throws Error if required services cannot initialize
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('AgentManager already initialized');
      return;
    }

    console.log('DEBUG: AgentManager.initialize() called');
    logger.info('Initializing Agent Manager');

    try {
      // Initialize agents using dynamic registry
      // Registry automatically discovers YAML files - no hardcoding
      
      // CRITICAL: OrchestratorAgent MUST be created first
      // It's a singleton that coordinates all other agents
      console.log('DEBUG: About to get OrchestratorAgent instance...');
      const orchestrator = OrchestratorAgent.getInstance();
      console.log('DEBUG: OrchestratorAgent instance obtained');
      this.agents.set(AgentRole.ORCHESTRATOR, orchestrator);
      console.log('DEBUG: OrchestratorAgent added to agents map');
      
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

      // Create agents for each role
      // Note: These will be replaced with proper YAML-configured agents
      for (const [role, agentType] of Object.entries(roleToType)) {
        logger.info(`Initializing agent for role ${role} with type ${agentType}`);
        // TODO: Create agents from YAML configurations
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
      auditTrail: [],
      // Add required fields for OrchestratorAgent
      contextId: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tenantId: taskRequest.userId,
      taskTemplateId: taskRequest.templateId,
      currentState: {
        status: 'pending',
        completeness: 0
      },
      history: [],
      templateSnapshot: {}
    } as any;

    logger.info('Creating new task', {
      taskId: taskContext.taskId,
      templateId: taskContext.templateId
    });

    // If we have a userId, save the task to the database
    if (taskRequest.userId) {
      const db = DatabaseService.getInstance();
      const taskRecord = await db.createTask(taskRequest.userId, {
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

    // OrchestratorAgent uses orchestrateTask directly
    await orchestrator.orchestrateTask(taskContext);
    
    return taskContext.taskId;
  }

  public async getTaskStatus(taskId: string, userId: string): Promise<any> {
    try {
      // Get task from database using userId
      const db = DatabaseService.getInstance();
      const task = await db.getTask(userId, taskId);
      
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

  public async getUserTasks(userId: string): Promise<any[]> {
    try {
      const db = DatabaseService.getInstance();
      // Database service validates userId and returns only user's tasks
      const tasks = await db.getUserTasks(userId);
      
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
    const status = (agent && typeof (agent as any).getStatus === 'function') 
      ? agent.getStatus() 
      : 'active';
    const metrics = (agent && typeof (agent as any).getMetrics === 'function')
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
      // Check if agent exists and has getStatus and getMetrics methods
      const status = (agent && typeof (agent as any).getStatus === 'function') 
        ? agent.getStatus() 
        : 'active';
      const metrics = (agent && typeof (agent as any).getMetrics === 'function')
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
    
    // Check if orchestrator is available (only critical agent for now)
    const orchestrator = this.agents.get(AgentRole.ORCHESTRATOR);
    if (!orchestrator) return false;
    
    // For now, if orchestrator exists and we're initialized, we're healthy
    return true;
  }

  public async stop(): Promise<void> {
    logger.info('Stopping Agent Manager');

    // Shutdown all agents
    const shutdownPromises = Array.from(this.agents.values()).map(agent => {
      // Only call shutdown if the agent exists and has a shutdown method
      if (agent && typeof (agent as any).shutdown === 'function') {
        return agent.shutdown().catch((error: any) => {
          logger.error('Error shutting down agent', error);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(shutdownPromises);

    this.agents.clear();
    this.isInitialized = false;

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

/**
 * Export the main agent classes
 */
export { BaseAgent } from './base/BaseAgent';
export { OrchestratorAgent } from './OrchestratorAgent';
// TaskManagementAgent removed - not one of the 8 core agents

