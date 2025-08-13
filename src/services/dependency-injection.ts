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
    (context) => new TaskService(),
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