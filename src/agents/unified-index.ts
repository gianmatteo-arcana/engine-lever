/**
 * Unified Agent Index - Central registry for all BaseAgent implementations
 * Provides factory functions and agent management for the new unified architecture
 */

import { BaseAgent } from './base/UnifiedBaseAgent';
import { DataEnrichmentAgent } from './DataEnrichmentAgent';
import { BackendOrchestratorAgent } from './BackendOrchestratorAgent';
import { TaskManagementAgent } from './TaskManagementAgent';

// Re-export the UnifiedBaseAgent class
export { BaseAgent } from './base/UnifiedBaseAgent';

// Re-export all concrete agent implementations
export { DataEnrichmentAgent } from './DataEnrichmentAgent';
export { BackendOrchestratorAgent } from './BackendOrchestratorAgent';
export { TaskManagementAgent } from './TaskManagementAgent';

// YAML-configured agents (load dynamically)
export type YAMLAgentType = 
  | 'SOISpecialistAgent'
  | 'ComplianceAdvisorAgent'
  | 'ProfileBuilderAgent'
  | 'GeneralAssistantAgent'
  | 'TaskOrchestratorAgent';

export type ServiceAgentType = 
  | 'DataEnrichmentAgent'
  | 'BackendOrchestratorAgent'
  | 'TaskManagementAgent'
  | 'EventsAgent'
  | 'BackendAPIAgent'
  | 'TaskReplayAgent';

export type AgentType = YAMLAgentType | ServiceAgentType;

// Agent registry for singleton management
class AgentRegistry {
  private static instance: AgentRegistry;
  private agents = new Map<string, BaseAgent>();
  private yamlAgents = new Map<YAMLAgentType, string>();

  private constructor() {
    // Initialize YAML agent paths
    this.yamlAgents.set('SOISpecialistAgent', 'src/agents/configs/soi-specialist.yaml');
    this.yamlAgents.set('ComplianceAdvisorAgent', 'src/agents/configs/compliance-advisor.yaml');
    this.yamlAgents.set('ProfileBuilderAgent', 'src/agents/configs/profile-builder.yaml');
    this.yamlAgents.set('GeneralAssistantAgent', 'src/agents/configs/general-assistant.yaml');
    this.yamlAgents.set('TaskOrchestratorAgent', 'src/agents/configs/orchestrator.yaml');
  }

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Get or create an agent instance
   */
  getAgent(agentType: AgentType): BaseAgent {
    const existingAgent = this.agents.get(agentType);
    if (existingAgent) {
      return existingAgent;
    }

    let agent: BaseAgent;

    // Create service-based agents
    switch (agentType) {
      case 'DataEnrichmentAgent':
        agent = new DataEnrichmentAgent();
        break;
      case 'BackendOrchestratorAgent':
        agent = new BackendOrchestratorAgent();
        break;
      case 'TaskManagementAgent':
        agent = TaskManagementAgent.getInstance();
        break;
      default:
        // For YAML-configured agents, create BaseAgent instances
        if (this.yamlAgents.has(agentType as YAMLAgentType)) {
          const configPath = this.yamlAgents.get(agentType as YAMLAgentType)!;
          agent = new (class extends BaseAgent {
            constructor() {
              super(configPath);
            }
            
            protected async executeTaskLogic() {
              throw new Error(`${agentType} requires custom implementation`);
            }
          })();
        } else {
          throw new Error(`Unknown agent type: ${agentType}`);
        }
    }

    this.agents.set(agentType, agent);
    return agent;
  }

  /**
   * Get all available agent types
   */
  getAvailableAgentTypes(): AgentType[] {
    return [
      ...Array.from(this.yamlAgents.keys()),
      'DataEnrichmentAgent',
      'BackendOrchestratorAgent', 
      'TaskManagementAgent',
      'EventsAgent',
      'BackendAPIAgent',
      'TaskReplayAgent'
    ];
  }

  /**
   * Check if an agent type is available
   */
  isAgentAvailable(agentType: string): agentType is AgentType {
    return this.getAvailableAgentTypes().includes(agentType as AgentType);
  }

  /**
   * Get agent capabilities for a given type
   */
  async getAgentCapabilities(agentType: AgentType): Promise<string[]> {
    const agent = this.getAgent(agentType);
    const config = await agent.getConfiguration();
    return config.capabilities || [];
  }

  /**
   * Clear the agent registry (useful for testing)
   */
  clear(): void {
    this.agents.clear();
  }
}

// Factory functions for easy agent creation
export const agentRegistry = AgentRegistry.getInstance();

/**
 * Create or get an agent instance
 */
export function createAgent(agentType: AgentType): BaseAgent {
  return agentRegistry.getAgent(agentType);
}

/**
 * Create a data enrichment agent
 */
export function createDataEnrichmentAgent(): DataEnrichmentAgent {
  return agentRegistry.getAgent('DataEnrichmentAgent') as DataEnrichmentAgent;
}

/**
 * Create a backend orchestrator agent
 */
export function createBackendOrchestratorAgent(): BackendOrchestratorAgent {
  return agentRegistry.getAgent('BackendOrchestratorAgent') as BackendOrchestratorAgent;
}

/**
 * Create a task management agent
 */
export function createTaskManagementAgent(): TaskManagementAgent {
  return agentRegistry.getAgent('TaskManagementAgent') as TaskManagementAgent;
}

// Backward compatibility exports
export const intelligentDataEnrichmentService = createDataEnrichmentAgent();
export const taskService = createTaskManagementAgent();

/**
 * Legacy function for creating orchestrator service (backward compatibility)
 */
export function createOrchestratorService(userToken: string) {
  const agent = createBackendOrchestratorAgent();
  
  return {
    async createTask(request: { templateId: string; initialData: Record<string, unknown> }) {
      return agent.createTask({ ...request, userToken });
    },
    
    async getTaskContext(contextId: string) {
      return agent.getTaskContext(contextId, userToken);
    },
    
    async submitUIResponse(submission: any) {
      return agent.submitUIResponse(submission, userToken);
    }
  };
}

// Migration status tracking
export const MIGRATION_STATUS = {
  completed: [
    'DataEnrichmentAgent',
    'BackendOrchestratorAgent', 
    'TaskManagementAgent'
  ],
  yamlConfigured: [
    'SOISpecialistAgent',
    'ComplianceAdvisorAgent',
    'ProfileBuilderAgent',
    'GeneralAssistantAgent',
    'TaskOrchestratorAgent'
  ],
  pending: [
    'EventsAgent',
    'BackendAPIAgent', 
    'TaskReplayAgent'
  ]
} as const;

export default {
  createAgent,
  createDataEnrichmentAgent,
  createBackendOrchestratorAgent,
  createTaskManagementAgent,
  createOrchestratorService,
  agentRegistry,
  MIGRATION_STATUS
};