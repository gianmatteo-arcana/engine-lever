/**
 * Dependency Injection Container
 * Manages service instances and their lifecycles
 * Replaces singleton pattern with proper DI
 */

import { DatabaseService } from './database';
import { TaskService } from './task-service';
import { StateComputer } from './state-computer';
import { ConfigurationManager } from './configuration-manager';
import { CredentialVault } from './credential-vault';
import { RequestContext, RequestContextService } from './request-context';
import { logger } from '../utils/logger';

/**
 * Service lifecycle types
 */
export enum ServiceLifecycle {
  SINGLETON = 'singleton',     // One instance for entire application (avoid for stateful services)
  REQUEST = 'request',         // New instance per request (recommended for tenant isolation)
  TRANSIENT = 'transient'      // New instance every time (for lightweight, stateless services)
}

/**
 * Service registration
 */
interface ServiceRegistration {
  factory: (context?: RequestContext) => any;
  lifecycle: ServiceLifecycle;
  instance?: any; // For singleton instances
}

/**
 * Dependency Injection Container
 * Manages service instances with proper lifecycles
 */
export class DIContainer {
  private static registrations = new Map<string, ServiceRegistration>();
  private static requestInstances = new WeakMap<RequestContext, Map<string, any>>();

  /**
   * Register a service
   */
  static register<T>(
    token: string,
    factory: (context?: RequestContext) => T,
    lifecycle: ServiceLifecycle = ServiceLifecycle.REQUEST
  ): void {
    this.registrations.set(token, { factory, lifecycle });
    
    logger.info(`Service registered: ${token} with lifecycle: ${lifecycle}`);
  }

  /**
   * Resolve a service instance
   */
  static resolve<T>(token: string): T {
    const registration = this.registrations.get(token);
    if (!registration) {
      throw new Error(`Service not registered: ${token}`);
    }

    switch (registration.lifecycle) {
      case ServiceLifecycle.SINGLETON:
        return this.resolveSingleton(registration);
      
      case ServiceLifecycle.REQUEST:
        return this.resolveRequest(token, registration);
      
      case ServiceLifecycle.TRANSIENT:
        return this.resolveTransient(registration);
      
      default:
        throw new Error(`Unknown lifecycle: ${registration.lifecycle}`);
    }
  }

  /**
   * Resolve singleton instance
   */
  private static resolveSingleton<T>(registration: ServiceRegistration): T {
    if (!registration.instance) {
      registration.instance = registration.factory();
    }
    return registration.instance;
  }

  /**
   * Resolve request-scoped instance
   */
  private static resolveRequest<T>(token: string, registration: ServiceRegistration): T {
    const context = RequestContextService.getContext();
    if (!context) {
      // Fallback to transient if no context
      logger.warn(`No request context for service: ${token}, creating transient instance`);
      return registration.factory(context);
    }

    // Get or create request instance map
    let requestMap = this.requestInstances.get(context);
    if (!requestMap) {
      requestMap = new Map<string, any>();
      this.requestInstances.set(context, requestMap);
    }

    // Get or create service instance for this request
    let instance = requestMap.get(token);
    if (!instance) {
      instance = registration.factory(context);
      requestMap.set(token, instance);
    }

    return instance;
  }

  /**
   * Resolve transient instance
   */
  private static resolveTransient<T>(registration: ServiceRegistration): T {
    const context = RequestContextService.getContext();
    return registration.factory(context);
  }

  /**
   * Clear all registrations (for testing)
   */
  static clear(): void {
    this.registrations.clear();
    this.requestInstances = new WeakMap();
  }

  /**
   * Check if a service is registered
   */
  static isRegistered(token: string): boolean {
    return this.registrations.has(token);
  }

  /**
   * Register an agent factory for task-scoped creation
   * Agents are created per-task with automatic SSE subscriptions
   * 
   * @param agentId - The agent identifier
   * @param factory - Factory function that creates agent instances
   */
  static registerAgent(agentId: string, factory: AgentFactory): void {
    const token = `Agent:${agentId}`;
    
    // Register as TRANSIENT - new instance every time
    this.register(
      token,
      () => factory,  // Return the factory function
      ServiceLifecycle.TRANSIENT
    );
    
    logger.info(`Agent registered with DI container`, { 
      agentId, 
      token,
      lifecycle: 'TRANSIENT' 
    });
  }

  /**
   * Resolve an agent for a specific task
   * Creates new instance and returns configured agent
   * 
   * @param agentId - The agent identifier
   * @param taskId - The task ID for this agent instance
   * @returns Promise resolving to the agent instance
   */
  static async resolveAgent(agentId: string, taskId: string): Promise<any> {
    const token = `Agent:${agentId}`;
    
    if (!this.isRegistered(token)) {
      throw new Error(`Agent not registered: ${agentId}`);
    }
    
    // Resolve factory from container
    const factory = this.resolve<AgentFactory>(token);
    
    // Create agent instance for this task
    const agent = await factory(taskId);
    
    logger.info(`Agent created for task`, { agentId, taskId });
    
    return agent;
  }

  /**
   * Check if an agent is registered
   */
  static isAgentRegistered(agentId: string): boolean {
    return this.isRegistered(`Agent:${agentId}`);
  }
}

/**
 * Service tokens for type-safe resolution
 */
export const ServiceTokens = {
  DATABASE: 'DatabaseService',
  TASK: 'TaskService',
  STATE_COMPUTER: 'StateComputer',
  CONFIG_MANAGER: 'ConfigurationManager',
  CREDENTIAL_VAULT: 'CredentialVault'
} as const;

/**
 * Agent factory function type for task-scoped agent creation
 */
export type AgentFactory = (taskId: string) => Promise<any>;

/**
 * Initialize default service registrations
 */
export function initializeServices(): void {
  // Database Service - Request scoped for tenant isolation
  DIContainer.register(
    ServiceTokens.DATABASE,
    (context) => {
      const service = new DatabaseService();
      // If we have a user token, use it for this instance
      if (context?.userToken) {
        // This instance will use the user's token for all operations
        (service as any).userToken = context.userToken;
      }
      return service;
    },
    ServiceLifecycle.REQUEST
  );

  // Task Service - Request scoped
  DIContainer.register(
    ServiceTokens.TASK,
    (_context) => new TaskService(),
    ServiceLifecycle.REQUEST
  );

  // State Computer - Transient (stateless)
  DIContainer.register(
    ServiceTokens.STATE_COMPUTER,
    () => new StateComputer(),
    ServiceLifecycle.TRANSIENT
  );

  // Configuration Manager - Singleton (read-only configs)
  DIContainer.register(
    ServiceTokens.CONFIG_MANAGER,
    () => new ConfigurationManager(),
    ServiceLifecycle.SINGLETON
  );

  // Credential Vault - Request scoped for tenant isolation
  DIContainer.register(
    ServiceTokens.CREDENTIAL_VAULT,
    () => new CredentialVault(),
    ServiceLifecycle.REQUEST
  );

  logger.info('All services initialized with proper lifecycles');
}

/**
 * Service resolver functions for convenience
 */
export function getDatabaseService(): DatabaseService {
  return DIContainer.resolve<DatabaseService>(ServiceTokens.DATABASE);
}

export function getTaskService(): TaskService {
  return DIContainer.resolve<TaskService>(ServiceTokens.TASK);
}

export function getStateComputer(): StateComputer {
  return DIContainer.resolve<StateComputer>(ServiceTokens.STATE_COMPUTER);
}

export function getConfigManager(): ConfigurationManager {
  return DIContainer.resolve<ConfigurationManager>(ServiceTokens.CONFIG_MANAGER);
}

export function getCredentialVault(): CredentialVault {
  return DIContainer.resolve<CredentialVault>(ServiceTokens.CREDENTIAL_VAULT);
}

/**
 * Initialize agent registrations with DI container
 * Discovers agents from YAML and registers them for task-scoped creation
 */
export async function initializeAgents(): Promise<void> {
  logger.info('🎯 Initializing agent registrations with DI container');
  
  try {
    // Import required modules
    const { agentDiscovery } = await import('./agent-discovery');
    const { DefaultAgent } = await import('../agents/DefaultAgent');
    const { OrchestratorAgent } = await import('../agents/OrchestratorAgent');
    
    // Discover all agents from YAML configurations
    const capabilities = await agentDiscovery.discoverAgents();
    
    // Register each discovered agent with DI container
    for (const [agentId] of capabilities) {
      // Create factory function for this agent
      const factory: AgentFactory = async (taskId: string) => {
        logger.info(`🤖 Creating agent instance for task`, { agentId, taskId });
        
        // Create agent instance
        // The agent will handle its own SSE subscriptions internally
        const agent = new DefaultAgent(`${agentId}.yaml`, 'system', taskId);
        
        // Initialize agent for the task (agent handles subscriptions internally)
        await agent.initializeForTask(taskId);
        
        return agent;
      };
      
      // Register agent with DI container
      DIContainer.registerAgent(agentId, factory);
    }
    
    // Register OrchestratorAgent separately (special case - singleton)
    DIContainer.register(
      'Agent:orchestrator_agent',
      () => OrchestratorAgent.getInstance(),
      ServiceLifecycle.SINGLETON
    );
    
    logger.info(`✅ Agent registrations initialized`, {
      registeredAgents: capabilities.size,
      agents: Array.from(capabilities.keys())
    });
    
  } catch (error) {
    logger.error('Failed to initialize agent registrations', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}