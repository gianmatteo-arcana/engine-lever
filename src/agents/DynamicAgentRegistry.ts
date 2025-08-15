/**
 * DynamicAgentRegistry - Automatically discovers and loads agent YAML configurations
 * 
 * This registry dynamically scans the configs directory for YAML files and
 * creates agent instances without hardcoding. New agents can be added simply
 * by dropping a YAML file in the configs directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './base/BaseAgent';
import { DefaultAgent } from './DefaultAgent';
import { OrchestratorAgent } from './OrchestratorAgent';
import { TaskManagementAgent } from './TaskManagementAgent';
import { logger } from '../utils/logger';

export class DynamicAgentRegistry {
  private static instance: DynamicAgentRegistry;
  private agents = new Map<string, BaseAgent>();
  private agentConfigs = new Map<string, string>();

  private constructor() {
    this.discoverAgentConfigs();
  }

  static getInstance(): DynamicAgentRegistry {
    if (!DynamicAgentRegistry.instance) {
      DynamicAgentRegistry.instance = new DynamicAgentRegistry();
    }
    return DynamicAgentRegistry.instance;
  }

  /**
   * Dynamically discover all YAML configuration files in the configs directory
   */
  private discoverAgentConfigs(): void {
    const configDir = path.join(__dirname, 'configs');
    
    try {
      // Check if configs directory exists
      if (!fs.existsSync(configDir)) {
        logger.warn(`Agent configs directory not found: ${configDir}`);
        return;
      }

      // Read all YAML files from the configs directory
      const files = fs.readdirSync(configDir);
      const yamlFiles = files.filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml')
      );

      // Register each YAML file
      for (const file of yamlFiles) {
        // Extract agent type from filename (e.g., 'data-enrichment-agent.yaml' -> 'data-enrichment')
        const agentType = file
          .replace('-agent.yaml', '')
          .replace('-agent.yml', '')
          .replace('.yaml', '')
          .replace('.yml', '');
        
        const configPath = `configs/${file}`;
        this.agentConfigs.set(agentType, configPath);
        
        logger.info(`Discovered agent configuration: ${agentType} -> ${configPath}`);
      }

      logger.info(`Discovered ${this.agentConfigs.size} agent configurations`);
    } catch (error) {
      logger.error('Failed to discover agent configurations:', error);
    }
  }

  /**
   * Create or get an agent instance based on type
   * Special cases get their own classes, others use DefaultAgent
   */
  createAgent(
    agentType: string,
    businessId: string,
    userId?: string
  ): BaseAgent {
    const cacheKey = `${agentType}-${businessId}-${userId || 'system'}`;
    
    // Return cached instance if exists
    const cached = this.agents.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get config path for this agent type
    const configPath = this.agentConfigs.get(agentType);
    if (!configPath) {
      throw new Error(`No configuration found for agent type: ${agentType}`);
    }

    let agent: BaseAgent;

    // Special cases get their own classes based on agent type
    // These are identified by their type name, not hardcoded
    if (agentType.includes('orchestrat')) {
      // Orchestrator agents need special orchestration logic
      agent = new OrchestratorAgent(configPath, businessId, userId);
    } else if (agentType === 'task-management') {
      // TaskManagementAgent needs singleton pattern and direct DB access
      agent = TaskManagementAgent.getInstance();
    } else {
      // All other agents use DefaultAgent with YAML configuration
      agent = new DefaultAgent(configPath, businessId, userId);
    }

    this.agents.set(cacheKey, agent);
    return agent;
  }

  /**
   * Get all available agent types discovered from YAML files
   */
  getAvailableAgentTypes(): string[] {
    return Array.from(this.agentConfigs.keys());
  }

  /**
   * Check if an agent type is available
   */
  isAgentAvailable(agentType: string): boolean {
    return this.agentConfigs.has(agentType);
  }

  /**
   * Refresh the registry by re-scanning for YAML files
   * Useful when new YAML files are added at runtime
   */
  refresh(): void {
    this.agentConfigs.clear();
    this.agents.clear();
    this.discoverAgentConfigs();
  }

  /**
   * Clear the agent cache (useful for testing)
   */
  clear(): void {
    this.agents.clear();
  }

  /**
   * Get configuration path for an agent type
   */
  getConfigPath(agentType: string): string | undefined {
    return this.agentConfigs.get(agentType);
  }
}

// Export singleton instance
export const dynamicAgentRegistry = DynamicAgentRegistry.getInstance();

/**
 * Helper function to create agents using dynamic registry
 */
export function createAgent(
  agentType: string,
  businessId: string,
  userId?: string
): BaseAgent {
  return dynamicAgentRegistry.createAgent(agentType, businessId, userId);
}