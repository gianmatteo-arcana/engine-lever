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
import { DefaultAgent } from './DefaultAgent';
// TaskManagementAgent removed - not one of the 8 core agents
import { DatabaseService } from '../services/database';
import { agentDiscovery, type AgentCapability } from '../services/agent-discovery';

class AgentManagerClass {
  private agents: Map<AgentRole, any> = new Map();
  private agentCapabilities: Map<string, AgentCapability> = new Map();
  private agentInstances: Map<string, DefaultAgent> = new Map();
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

    logger.info('🚀 Initializing Agent Manager with A2A Protocol Discovery');

    try {
      // STEP 1: Discover all agents from YAML configurations
      logger.info('🔍 Discovering agents from YAML configurations...');
      this.agentCapabilities = await agentDiscovery.discoverAgents();
      
      // Log discovered capabilities
      logger.info('📊 Agent Capabilities Discovered:', {
        count: this.agentCapabilities.size,
        agents: Array.from(this.agentCapabilities.keys())
      });
      
      // Print capability report for debugging
      const capabilityReport = agentDiscovery.generateCapabilityReport();
      logger.info('\n' + capabilityReport);
      
      // STEP 2: Create OrchestratorAgent (special case - singleton)
      logger.info('🎯 Creating OrchestratorAgent (singleton)...');
      const orchestrator = OrchestratorAgent.getInstance();
      this.agents.set(AgentRole.ORCHESTRATOR, orchestrator);
      
      // STEP 3: Map discovered agents to AgentRoles and instantiate
      const agentIdToRole: Record<string, AgentRole> = {
        'legal_compliance_agent': AgentRole.LEGAL_COMPLIANCE,
        'data_collection_agent': AgentRole.DATA_COLLECTION,
        'payment_agent': AgentRole.PAYMENT,
        'agency_interaction_agent': AgentRole.AGENCY_INTERACTION,
        'monitoring_agent': AgentRole.MONITORING,
        'communication_agent': AgentRole.COMMUNICATION,
        'profile_collection_agent': AgentRole.DATA_COLLECTION, // Maps to same role
        'entity_compliance_agent': AgentRole.LEGAL_COMPLIANCE,  // Maps to same role
        'celebration_agent': AgentRole.COMMUNICATION,           // Maps to communication
        'ux_optimization_agent': AgentRole.COMMUNICATION        // Maps to communication
      };
      
      // STEP 4: Instantiate DefaultAgent for each discovered agent
      for (const [agentId, capability] of this.agentCapabilities.entries()) {
        // Skip orchestrator (already created)
        if (agentId.includes('orchestrator')) {
          continue;
        }
        
        try {
          logger.info(`🤖 Instantiating agent: ${agentId}`, {
            role: capability.role,
            skills: capability.skills.length
          });
          
          // Create DefaultAgent instance
          const agent = await agentDiscovery.instantiateAgent(agentId, 'system');
          this.agentInstances.set(agentId, agent);
          
          // Map to AgentRole if defined
          const role = agentIdToRole[agentId];
          if (role && !this.agents.has(role)) {
            this.agents.set(role, agent);
            logger.info(`   ✅ Mapped ${agentId} to role: ${role}`);
          }
          
        } catch (error) {
          logger.error(`   ❌ Failed to instantiate agent: ${agentId}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // STEP 5: Update OrchestratorAgent's registry with discovered agents
      // The orchestrator needs to know about available agents for task delegation
      this.updateOrchestratorRegistry(orchestrator);

      // Agents now communicate through A2A protocol
      // Routing is defined in YAML configurations

      this.isInitialized = true;
      logger.info('✅ Agent Manager initialized successfully', {
        agentCount: this.agents.size,
        discoveredAgents: this.agentInstances.size,
        capabilities: this.agentCapabilities.size
      });
    } catch (error) {
      logger.error('💥 Failed to initialize Agent Manager', error);
      throw error;
    }
  }
  
  /**
   * Update OrchestratorAgent's internal registry with discovered agents
   */
  private updateOrchestratorRegistry(_orchestrator: OrchestratorAgent): void {
    // The orchestrator needs to know about available agents
    // This would update its internal agentRegistry Map
    // For now, we'll log what would be updated
    logger.info('📋 Updating OrchestratorAgent registry with discovered agents:', {
      agents: Array.from(this.agentInstances.keys())
    });
    
    // TODO: Add method to OrchestratorAgent to accept discovered agents
    // orchestrator.updateAgentRegistry(this.agentCapabilities);
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
  
  /**
   * Get all discovered agent capabilities (A2A Protocol)
   */
  public getDiscoveredCapabilities(): AgentCapability[] {
    return agentDiscovery.getCapabilities();
  }
  
  /**
   * Find agents by skill
   */
  public findAgentsBySkill(skill: string): AgentCapability[] {
    return agentDiscovery.findAgentsBySkill(skill);
  }
  
  /**
   * Find agents by role
   */
  public findAgentsByRole(role: string): AgentCapability[] {
    return agentDiscovery.findAgentsByRole(role);
  }
  
  /**
   * Get routing information for an agent
   */
  public getAgentRouting(agentId: string): { canReceiveFrom: string[], canSendTo: string[] } | undefined {
    const capability = agentDiscovery.getAgentCapability(agentId);
    if (capability) {
      return {
        canReceiveFrom: capability.canReceiveFrom,
        canSendTo: capability.canSendTo
      };
    }
    return undefined;
  }
  
  /**
   * Check if two agents can communicate
   */
  public canAgentsCommunicate(fromAgent: string, toAgent: string): boolean {
    return agentDiscovery.canCommunicate(fromAgent, toAgent);
  }
  
  /**
   * Get capability report (formatted string)
   */
  public getCapabilityReport(): string {
    return agentDiscovery.generateCapabilityReport();
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

