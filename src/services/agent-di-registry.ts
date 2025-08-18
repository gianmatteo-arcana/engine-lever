/**
 * Agent Dependency Injection Registry
 * 
 * Integrates agent discovery with the DI container to enable
 * task-scoped agent instantiation with proper SSE subscriptions.
 * 
 * Based on PR feedback:
 * - Agents are created per-task using DI
 * - Agents subscribe to task-centered message buses
 * - No singleton agent instances
 * - Loose coupling via SSE events
 */

import { DIContainer, ServiceLifecycle } from './dependency-injection';
import { agentDiscovery, AgentCapability } from './agent-discovery';
import { DefaultAgent } from '../agents/DefaultAgent';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { logger } from '../utils/logger';

/**
 * Agent factory function type
 */
type AgentFactory = (taskId: string) => Promise<any>;

/**
 * Agent DI Registry
 * 
 * Registers discovered agents with the DI container using
 * task-scoped lifecycle to ensure proper isolation and
 * SSE subscription management.
 */
export class AgentDIRegistry {
  private static agentTokens = new Map<string, string>();
  private static initialized = false;

  /**
   * Initialize agent registration with DI container
   * Discovers agents from YAML and registers them as transient services
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Agent DI Registry already initialized');
      return;
    }

    logger.info('🎯 Initializing Agent DI Registry');

    try {
      // Discover all agents from YAML configurations
      const capabilities = await agentDiscovery.discoverAgents();
      
      // Register each discovered agent with DI container
      for (const [agentId, capability] of capabilities) {
        await this.registerAgent(agentId, capability);
      }

      // Register OrchestratorAgent separately (special case)
      this.registerOrchestratorAgent();

      this.initialized = true;
      
      logger.info(`✅ Agent DI Registry initialized`, {
        registeredAgents: this.agentTokens.size,
        agents: Array.from(this.agentTokens.keys())
      });

    } catch (error) {
      logger.error('Failed to initialize Agent DI Registry', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Register an agent with the DI container
   * Uses TRANSIENT lifecycle for per-task instantiation
   */
  private static async registerAgent(agentId: string, capability: AgentCapability): Promise<void> {
    const token = `Agent:${agentId}`;
    this.agentTokens.set(agentId, token);

    // Create factory function for this agent
    const factory: AgentFactory = async (taskId: string) => {
      logger.info(`🤖 Creating agent instance for task`, { agentId, taskId });
      
      // Create agent instance
      const agent = new DefaultAgent(`${agentId}.yaml`, 'system', taskId);
      
      // Subscribe to task-centered message bus
      await agent.subscribeToTaskEvents(taskId, async (event) => {
        logger.info(`📨 Agent received task event`, { 
          agentId, 
          taskId, 
          eventType: event.type 
        });
        
        // Handle events relevant to this agent
        if (this.shouldAgentHandleEvent(agentId, event)) {
          await agent.handleTaskEvent(event);
        }
      });

      // Announce agent readiness
      await agent.broadcastTaskEvent(taskId, {
        type: 'AGENT_READY',
        agentId,
        capabilities: capability.skills,
        timestamp: new Date().toISOString()
      });

      return agent;
    };

    // Register with DI container as TRANSIENT (new instance per resolution)
    DIContainer.register(
      token,
      () => factory,  // Return the factory function
      ServiceLifecycle.TRANSIENT
    );

    logger.info(`📦 Registered agent with DI container`, { 
      agentId, 
      token,
      lifecycle: 'TRANSIENT' 
    });
  }

  /**
   * Register OrchestratorAgent with special handling
   * Uses SINGLETON lifecycle as it manages other agents
   */
  private static registerOrchestratorAgent(): void {
    const agentToken = 'Agent:orchestrator_agent';
    this.agentTokens.set('orchestrator_agent', agentToken);

    DIContainer.register(
      agentToken,
      () => OrchestratorAgent.getInstance(),
      ServiceLifecycle.SINGLETON  // Orchestrator is singleton
    );

    logger.info(`📦 Registered OrchestratorAgent with DI container`, { 
      token: agentToken,
      lifecycle: 'SINGLETON' 
    });
  }

  /**
   * Resolve an agent for a specific task
   * Creates new instance and configures SSE subscriptions
   */
  static async resolveAgentForTask(agentId: string, taskId: string): Promise<any> {
    const token = this.agentTokens.get(agentId);
    if (!token) {
      throw new Error(`Agent not registered: ${agentId}`);
    }

    // Resolve factory from DI container
    const factory = DIContainer.resolve<AgentFactory>(token);
    
    // Create agent instance for this task
    const agent = await factory(taskId);
    
    return agent;
  }

  /**
   * Check if an agent should handle a specific event
   * Based on event type and agent capabilities
   */
  private static shouldAgentHandleEvent(agentId: string, event: any): boolean {
    // Get agent capability
    const capability = agentDiscovery.getAgentCapability(agentId);
    if (!capability) {
      return false;
    }

    // Check if event is targeted to this agent
    if (event.targetAgent && event.targetAgent !== agentId) {
      return false;
    }

    // Check if event type matches agent operations
    if (event.operation && capability.operations) {
      return capability.operations.includes(event.operation);
    }

    // Check if event relates to agent's skills
    if (event.skill && capability.skills) {
      return capability.skills.some(skill => 
        skill.toLowerCase().includes(event.skill.toLowerCase())
      );
    }

    // Default: handle if not specifically excluded
    return true;
  }

  /**
   * Get all registered agent tokens
   */
  static getRegisteredAgents(): string[] {
    return Array.from(this.agentTokens.keys());
  }

  /**
   * Check if an agent is registered
   */
  static isAgentRegistered(agentId: string): boolean {
    return this.agentTokens.has(agentId);
  }

  /**
   * Clear all registrations (for testing)
   */
  static clear(): void {
    // Note: DIContainer doesn't have unregister, so we just clear our tracking
    // In tests, DIContainer.clear() should be called separately
    this.agentTokens.clear();
    this.initialized = false;
  }
}

/**
 * Helper method for DefaultAgent to handle task events
 * This extends DefaultAgent with event handling capability
 */
declare module '../agents/DefaultAgent' {
  interface DefaultAgent {
    handleTaskEvent(event: any): Promise<void>;
  }
}

// Add handleTaskEvent method to DefaultAgent prototype
(DefaultAgent.prototype as any).handleTaskEvent = async function(event: any): Promise<void> {
  logger.info(`🎯 Agent handling task event`, { 
    agentId: this.agentId,
    eventType: event.type 
  });

  // Process event based on type
  switch (event.type) {
    case 'EXECUTION_PLAN':
      // Agent receives execution plan and prepares for its phase
      await this.prepareForExecution(event.plan);
      break;

    case 'PHASE_START':
      // Agent activated for its phase
      if (event.agents?.includes(this.agentId)) {
        await this.executePhase(event.phase);
      }
      break;

    case 'DATA_REQUEST':
      // Another agent requesting data
      if (event.targetAgent === this.agentId) {
        await this.provideData(event.requestId, event.dataType);
      }
      break;

    case 'BLOCKAGE_ANNOUNCED':
      // Another agent is blocked
      await this.handlePeerBlockage(event.agentId, event.blockage);
      break;

    default:
      logger.debug(`Agent received unhandled event type: ${event.type}`);
  }
};

// Add helper methods to DefaultAgent prototype
(DefaultAgent.prototype as any).prepareForExecution = async function(_plan: any): Promise<void> {
  logger.info(`Agent preparing for execution`, { agentId: this.agentId });
  // Implementation would prepare agent for its role in the plan
};

(DefaultAgent.prototype as any).executePhase = async function(phase: any): Promise<void> {
  logger.info(`Agent executing phase`, { agentId: this.agentId, phase });
  // Implementation would execute agent's responsibilities for the phase
};

(DefaultAgent.prototype as any).provideData = async function(requestId: string, dataType: string): Promise<void> {
  logger.info(`Agent providing data`, { agentId: this.agentId, requestId, dataType });
  // Implementation would gather and broadcast requested data
};

(DefaultAgent.prototype as any).handlePeerBlockage = async function(peerId: string, _blockage: any): Promise<void> {
  logger.info(`Agent handling peer blockage`, { agentId: this.agentId, peerId });
  // Implementation would check if this agent can help resolve the blockage
};