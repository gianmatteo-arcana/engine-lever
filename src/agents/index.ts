/**
 * Pure A2A (Agent-to-Agent) Protocol System
 * 
 * This module exports the core agent classes for the pure A2A protocol system.
 * AgentManager has been eliminated in favor of direct A2A communication through
 * OrchestratorAgent which manages agent lifecycle and discovery.
 * 
 * ARCHITECTURAL CHANGE: AgentManager → Pure A2A Protocol
 * 
 * OLD SYSTEM:
 * - Central AgentManager singleton managing all agents
 * - Agents communicate through manager intermediary
 * - Fixed agent registration and mapping
 * 
 * NEW SYSTEM:
 * - OrchestratorAgent manages agent lifecycle on-demand
 * - Direct A2A messaging between agents via BaseAgent
 * - Dynamic agent discovery from YAML configurations
 * - No central manager - pure protocol-driven communication
 * 
 * BENEFITS:
 * - Reduced complexity and single points of failure
 * - Better scalability and fault tolerance
 * - Simpler debugging and testing
 * - True agent autonomy and self-organization
 */

// Export core agent types
export * from './base/types';

// Export essential agent classes for pure A2A system
export { BaseAgent } from './base/BaseAgent';
export { OrchestratorAgent } from './OrchestratorAgent';

/**
 * =============================================================================
 * PURE A2A ARCHITECTURE
 * =============================================================================
 * 
 * Agents are discovered dynamically from YAML configurations and communicate
 * directly with each other through the A2A protocol. No central manager.
 * 
 * AGENT LIFECYCLE:
 * 1. OrchestratorAgent.getInstance() - Get orchestrator singleton
 * 2. orchestrator.initializeAgentSystem() - Discover agents from YAML
 * 3. orchestrator.spawnAgent(agentId, tenantId) - Create agent on-demand
 * 4. agent.sendA2AMessage(toAgentId, message) - Direct agent communication
 * 
 * COMMUNICATION FLOW:
 * User → OrchestratorAgent → A2A Protocol → Specialist Agents → Tools/MCP
 * 
 * DISCOVERY & ROUTING:
 * - Agent capabilities loaded from YAML configurations
 * - Routing rules defined in YAML (canReceiveFrom, canSendTo)
 * - Dynamic peer discovery through orchestrator
 * - No hardcoded agent registrations
 */