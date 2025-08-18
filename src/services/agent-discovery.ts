/**
 * Agent Discovery Service
 * 
 * Dynamically discovers agents from YAML configurations and
 * builds a capability registry using A2A protocol metadata
 * 
 * This service implements the A2A protocol's discovery mechanism
 * allowing agents to advertise their capabilities and routing rules
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { logger } from '../utils/logger';
import { DefaultAgent } from '../agents/DefaultAgent';

/**
 * Agent Capability extracted from YAML a2a section
 */
export interface AgentCapability {
  agentId: string;
  name: string;
  version: string;
  role: string;
  protocolVersion: string;
  communicationMode: 'sync' | 'async';
  skills: string[];
  canReceiveFrom: string[];
  canSendTo: string[];
  operations?: string[];
  availability: 'available' | 'busy' | 'offline' | 'not_implemented';
}

/**
 * Agent Discovery Service
 * 
 * Discovers agents from YAML files and provides:
 * 1. Dynamic agent instantiation
 * 2. Capability registry for A2A protocol
 * 3. Routing information for inter-agent communication
 * 4. Agent discovery API for orchestrator
 */
export class AgentDiscoveryService {
  private agentConfigs: Map<string, any> = new Map();
  private agentInstances: Map<string, DefaultAgent> = new Map();
  private capabilityRegistry: Map<string, AgentCapability> = new Map();
  private routingTable: Map<string, Set<string>> = new Map(); // who can send to whom
  
  constructor(private configPath: string = 'config/agents') {
    this.configPath = path.join(process.cwd(), configPath);
  }
  
  /**
   * Discover all agents from YAML configurations
   * Builds capability registry and routing table
   */
  async discoverAgents(): Promise<Map<string, AgentCapability>> {
    logger.info('🔍 Starting agent discovery from YAML configurations', {
      configPath: this.configPath
    });
    
    try {
      // Read all YAML files in the config directory
      const files = fs.readdirSync(this.configPath)
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
        .filter(file => !file.includes('base_agent')) // Skip base template
        .filter(file => !file.includes('test_agent')); // Skip test configs
      
      logger.info(`📁 Found ${files.length} agent configuration files`);
      
      for (const file of files) {
        try {
          const filePath = path.join(this.configPath, file);
          const configContent = fs.readFileSync(filePath, 'utf8');
          const config = yaml.parse(configContent);
          
          if (!config.agent || !config.agent.id) {
            logger.warn(`⚠️ Skipping ${file} - missing agent configuration`);
            continue;
          }
          
          // Store raw config
          this.agentConfigs.set(config.agent.id, config);
          
          // Extract A2A capabilities
          const capability = this.extractCapabilities(config);
          this.capabilityRegistry.set(config.agent.id, capability);
          
          // Build routing table
          this.updateRoutingTable(config.agent.id, config);
          
          logger.info(`✅ Discovered agent: ${config.agent.id}`, {
            role: config.agent.role,
            version: config.agent.version,
            skills: capability.skills.length,
            routes: {
              canReceiveFrom: capability.canReceiveFrom.length,
              canSendTo: capability.canSendTo.length
            }
          });
          
        } catch (error) {
          logger.error(`❌ Failed to load agent config: ${file}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      logger.info(`🎯 Agent discovery complete`, {
        discovered: this.capabilityRegistry.size,
        capabilities: Array.from(this.capabilityRegistry.keys())
      });
      
      // Log routing table for debugging
      this.logRoutingTable();
      
      return this.capabilityRegistry;
      
    } catch (error) {
      logger.error('💥 Agent discovery failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Extract A2A capabilities from agent configuration
   */
  private extractCapabilities(config: any): AgentCapability {
    const agent = config.agent;
    const a2a = agent.a2a || {};
    
    return {
      agentId: agent.id,
      name: agent.name || agent.id,
      version: agent.version || '1.0.0',
      role: agent.role,
      protocolVersion: a2a.protocolVersion || '1.0.0',
      communicationMode: a2a.communicationMode || 'async',
      skills: agent.agent_card?.skills || [],
      canReceiveFrom: a2a.routing?.canReceiveFrom || [],
      canSendTo: a2a.routing?.canSendTo || [],
      operations: Object.keys(config.operations || {}),
      availability: 'available' // Will be updated based on instantiation
    };
  }
  
  /**
   * Update routing table for inter-agent communication
   */
  private updateRoutingTable(agentId: string, config: any): void {
    const a2a = config.agent.a2a || {};
    const routing = a2a.routing || {};
    
    // Add inbound routes
    if (routing.canReceiveFrom) {
      for (const sender of routing.canReceiveFrom) {
        if (!this.routingTable.has(sender)) {
          this.routingTable.set(sender, new Set());
        }
        this.routingTable.get(sender)!.add(agentId);
      }
    }
    
    // Add outbound routes
    if (routing.canSendTo) {
      if (!this.routingTable.has(agentId)) {
        this.routingTable.set(agentId, new Set());
      }
      for (const receiver of routing.canSendTo) {
        this.routingTable.get(agentId)!.add(receiver);
      }
    }
  }
  
  /**
   * Log routing table for debugging
   */
  private logRoutingTable(): void {
    logger.info('📊 Agent Routing Table:');
    for (const [sender, receivers] of this.routingTable.entries()) {
      logger.info(`  ${sender} → [${Array.from(receivers).join(', ')}]`);
    }
  }
  
  /**
   * Instantiate an agent from its configuration
   * Uses DefaultAgent for all agents except OrchestratorAgent
   */
  async instantiateAgent(agentId: string, businessId: string = 'system', userId?: string): Promise<DefaultAgent> {
    // Check if already instantiated
    const cacheKey = `${agentId}:${businessId}`;
    if (this.agentInstances.has(cacheKey)) {
      return this.agentInstances.get(cacheKey)!;
    }
    
    const config = this.agentConfigs.get(agentId);
    if (!config) {
      throw new Error(`Agent configuration not found: ${agentId}`);
    }
    
    try {
      // Create DefaultAgent instance with YAML config path
      const configFileName = `${agentId}.yaml`;
      const agent = new DefaultAgent(configFileName, businessId, userId);
      
      // Store instance
      this.agentInstances.set(cacheKey, agent);
      
      // Update capability availability
      const capability = this.capabilityRegistry.get(agentId);
      if (capability) {
        capability.availability = 'available';
      }
      
      logger.info(`🤖 Instantiated agent: ${agentId}`, {
        businessId,
        userId,
        role: config.agent.role
      });
      
      return agent;
      
    } catch (error) {
      logger.error(`Failed to instantiate agent: ${agentId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Update capability to show not implemented
      const capability = this.capabilityRegistry.get(agentId);
      if (capability) {
        capability.availability = 'not_implemented';
      }
      
      throw error;
    }
  }
  
  /**
   * Get all discovered capabilities
   */
  getCapabilities(): AgentCapability[] {
    return Array.from(this.capabilityRegistry.values());
  }
  
  /**
   * Get capability for specific agent
   */
  getAgentCapability(agentId: string): AgentCapability | undefined {
    return this.capabilityRegistry.get(agentId);
  }
  
  /**
   * Find agents by skill
   */
  findAgentsBySkill(skill: string): AgentCapability[] {
    return this.getCapabilities().filter(cap => 
      cap.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
    );
  }
  
  /**
   * Find agents by role
   */
  findAgentsByRole(role: string): AgentCapability[] {
    return this.getCapabilities().filter(cap => 
      cap.role.toLowerCase().includes(role.toLowerCase())
    );
  }
  
  /**
   * Check if agent can communicate with another
   */
  canCommunicate(fromAgent: string, toAgent: string): boolean {
    const routes = this.routingTable.get(fromAgent);
    return routes ? routes.has(toAgent) : false;
  }
  
  /**
   * Get all agents that can send to a specific agent
   */
  getSenders(agentId: string): string[] {
    const senders: string[] = [];
    for (const [sender, receivers] of this.routingTable.entries()) {
      if (receivers.has(agentId)) {
        senders.push(sender);
      }
    }
    return senders;
  }
  
  /**
   * Get all agents that can receive from a specific agent
   */
  getReceivers(agentId: string): string[] {
    const routes = this.routingTable.get(agentId);
    return routes ? Array.from(routes) : [];
  }
  
  /**
   * Generate capability report for display
   */
  generateCapabilityReport(): string {
    const report: string[] = [
      '🤖 AGENT CAPABILITY REGISTRY',
      '=' .repeat(60)
    ];
    
    for (const cap of this.getCapabilities()) {
      report.push(`\n📋 ${cap.name} (${cap.agentId})`);
      report.push(`   Role: ${cap.role}`);
      report.push(`   Version: ${cap.version}`);
      report.push(`   Protocol: A2A v${cap.protocolVersion} (${cap.communicationMode})`);
      report.push(`   Status: ${cap.availability}`);
      
      if (cap.skills.length > 0) {
        report.push(`   Skills:`);
        cap.skills.forEach(skill => report.push(`     • ${skill}`));
      }
      
      if (cap.operations && cap.operations.length > 0) {
        report.push(`   Operations: ${cap.operations.join(', ')}`);
      }
      
      report.push(`   Communication:`);
      report.push(`     ← Can receive from: ${cap.canReceiveFrom.join(', ') || 'none'}`);
      report.push(`     → Can send to: ${cap.canSendTo.join(', ') || 'none'}`);
    }
    
    report.push('\n' + '=' .repeat(60));
    report.push(`Total Agents: ${this.capabilityRegistry.size}`);
    
    return report.join('\n');
  }
}

// Export singleton instance
export const agentDiscovery = new AgentDiscoveryService();