/**
 * Unit Tests for AgentDiscoveryService
 * 
 * Tests the critical functionality of agent discovery from YAML configurations
 * using REAL agent configuration files from the repository.
 * 
 * As per user requirement: "the unit test here should not rely on mock data 
 * as we have perfectly fine actual agent config data in the repo!!"
 * 
 * Simplified to use just one test YAML file per user feedback:
 * "just pick one yaml file don't go crazy!"
 */

import { AgentDiscoveryService } from '../../../src/services/agent-discovery';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../src/utils/logger';

// Only mock the logger and DefaultAgent, use real fs and yaml
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../src/agents/DefaultAgent');

describe('AgentDiscoveryService', () => {
  let service: AgentDiscoveryService;
  const testAgentPath = path.join(__dirname, '../../test_agent.yaml');
  const realAgentPath = path.join(process.cwd(), 'config/agents/profile_collection_agent.yaml');

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a new instance for each test to avoid state pollution
    service = new AgentDiscoveryService('config/agents');
  });

  describe('constructor', () => {
    it('should set configPath relative to process.cwd()', () => {
      const customPath = 'custom/agents';
      const customService = new AgentDiscoveryService(customPath);
      // The constructor joins with process.cwd()
      expect(customService['configPath']).toBe(path.join(process.cwd(), customPath));
    });

    it('should use default configPath when not provided', () => {
      const defaultService = new AgentDiscoveryService();
      expect(defaultService['configPath']).toBe(path.join(process.cwd(), 'config/agents'));
    });
  });

  describe('discoverAgents with REAL YAML files', () => {
    it('should discover and parse profile_collection_agent.yaml correctly', async () => {
      // Verify the real agent file exists
      expect(fs.existsSync(realAgentPath)).toBe(true);
      
      const capabilities = await service.discoverAgents();
      
      // Check that profile_collection_agent was discovered
      expect(capabilities.has('profile_collection_agent')).toBe(true);
      
      const profileCapability = capabilities.get('profile_collection_agent');
      expect(profileCapability).toBeDefined();
      expect(profileCapability?.agentId).toBe('profile_collection_agent');
      expect(profileCapability?.name).toBe('Profile Collection Specialist Agent');
      expect(profileCapability?.version).toBe('1.0.0');
      expect(profileCapability?.role).toBe('profile_collection_specialist');
      expect(profileCapability?.protocolVersion).toBe('1.0.0');
      expect(profileCapability?.communicationMode).toBe('async');
      
      // Check real skills from the actual YAML
      expect(profileCapability?.skills).toContain('Intelligent form pre-filling and smart defaults');
      expect(profileCapability?.skills).toContain('Progressive disclosure and user experience optimization');
      
      // Check real routing configuration
      expect(profileCapability?.canReceiveFrom).toContain('orchestrator_agent');
      expect(profileCapability?.canReceiveFrom).toContain('data_collection_agent');
      expect(profileCapability?.canSendTo).toContain('orchestrator_agent');
      expect(profileCapability?.canSendTo).toContain('communication_agent');
    });

    it('should filter out base_agent.yaml and other non-agent files', async () => {
      const capabilities = await service.discoverAgents();
      
      // These files should be filtered out
      expect(capabilities.has('base_agent')).toBe(false);
      expect(capabilities.has('test_agent')).toBe(false); // Now in test directory
      expect(capabilities.has('orchestrator')).toBe(false); // duplicate without _agent suffix
    });

    it('should set availability to "available" for discovered agents', async () => {
      const capabilities = await service.discoverAgents();
      
      const profileCapability = capabilities.get('profile_collection_agent');
      expect(profileCapability?.availability).toBe('available');
    });

    it('should build routing table from real agent configurations', async () => {
      await service.discoverAgents();
      
      // Test real routing relationships from the YAML files
      // profile_collection_agent can receive from orchestrator_agent
      expect(service.canCommunicate('orchestrator_agent', 'profile_collection_agent')).toBe(true);
      
      // profile_collection_agent can send to orchestrator_agent
      expect(service.canCommunicate('profile_collection_agent', 'orchestrator_agent')).toBe(true);
      
      // profile_collection_agent can send to communication_agent
      expect(service.canCommunicate('profile_collection_agent', 'communication_agent')).toBe(true);
    });
  });

  describe('instantiateAgent', () => {
    beforeEach(async () => {
      // Discover real agents first
      await service.discoverAgents();
    });

    it('should instantiate an agent successfully', async () => {
      const { DefaultAgent } = await import('../../../src/agents/DefaultAgent');
      const mockAgent = { id: 'profile_collection_instance' };
      (DefaultAgent as any).mockImplementation(() => mockAgent);

      const agent = await service.instantiateAgent('profile_collection_agent', 'business123', 'user456');
      
      expect(agent).toBe(mockAgent);
      expect(DefaultAgent).toHaveBeenCalledWith('profile_collection_agent.yaml', 'business123', 'user456');
    });

    it('should cache agent instances by businessId', async () => {
      const { DefaultAgent } = await import('../../../src/agents/DefaultAgent');
      const mockAgent = { id: 'cached_agent' };
      (DefaultAgent as any).mockImplementation(() => mockAgent);

      const agent1 = await service.instantiateAgent('profile_collection_agent', 'business123');
      const agent2 = await service.instantiateAgent('profile_collection_agent', 'business123');
      
      expect(agent1).toBe(agent2);
      expect(DefaultAgent).toHaveBeenCalledTimes(1); // Should use cached instance
    });

    it('should create separate instances for different businessIds', async () => {
      const { DefaultAgent } = await import('../../../src/agents/DefaultAgent');
      let callCount = 0;
      (DefaultAgent as any).mockImplementation(() => ({ id: `agent_${++callCount}` }));

      const agent1 = await service.instantiateAgent('profile_collection_agent', 'business123');
      const agent2 = await service.instantiateAgent('profile_collection_agent', 'business456');
      
      expect(agent1).not.toBe(agent2);
      expect(DefaultAgent).toHaveBeenCalledTimes(2);
    });

    it('should throw error for non-existent agent', async () => {
      await expect(service.instantiateAgent('non_existent_agent', 'business123'))
        .rejects
        .toThrow('Agent configuration not found: non_existent_agent');
    });
  });

  describe('query methods', () => {
    beforeEach(async () => {
      await service.discoverAgents();
    });

    describe('getCapabilities', () => {
      it('should return all discovered agent capabilities', () => {
        const capabilities = service.getCapabilities();
        
        expect(capabilities.length).toBeGreaterThan(0);
        
        // Check that profile_collection_agent is included
        const agentIds = capabilities.map(c => c.agentId);
        expect(agentIds).toContain('profile_collection_agent');
      });
    });

    describe('getAgentCapability', () => {
      it('should return capability for existing agent', () => {
        const capability = service.getAgentCapability('profile_collection_agent');
        
        expect(capability).toBeDefined();
        expect(capability?.agentId).toBe('profile_collection_agent');
        expect(capability?.name).toBe('Profile Collection Specialist Agent');
        expect(capability?.role).toBe('profile_collection_specialist');
      });

      it('should return undefined for non-existent agent', () => {
        const capability = service.getAgentCapability('fake_agent');
        expect(capability).toBeUndefined();
      });
    });

    describe('findAgentsBySkill', () => {
      it('should find agents with matching skills', () => {
        // Search for agents with form-related skills
        const agents = service.findAgentsBySkill('form');
        
        expect(agents.length).toBeGreaterThan(0);
        
        // profile_collection_agent should be in the results
        const agentIds = agents.map(a => a.agentId);
        expect(agentIds).toContain('profile_collection_agent');
      });

      it('should be case-insensitive', () => {
        const agentsLower = service.findAgentsBySkill('form');
        const agentsUpper = service.findAgentsBySkill('FORM');
        
        expect(agentsLower.length).toBe(agentsUpper.length);
      });
    });

    describe('findAgentsByRole', () => {
      it('should find agent with profile collection role', () => {
        const agents = service.findAgentsByRole('profile_collection');
        
        expect(agents.length).toBeGreaterThanOrEqual(1);
        
        const agentIds = agents.map(a => a.agentId);
        expect(agentIds).toContain('profile_collection_agent');
      });
    });

    describe('canCommunicate', () => {
      it('should verify communication paths based on routing config', () => {
        // Based on profile_collection_agent.yaml routing configuration
        expect(service.canCommunicate('orchestrator_agent', 'profile_collection_agent')).toBe(true);
        expect(service.canCommunicate('profile_collection_agent', 'orchestrator_agent')).toBe(true);
        expect(service.canCommunicate('profile_collection_agent', 'communication_agent')).toBe(true);
      });
    });

    describe('getSenders', () => {
      it('should return agents that can send to profile_collection_agent', () => {
        const senders = service.getSenders('profile_collection_agent');
        
        expect(senders).toContain('orchestrator_agent');
        expect(senders).toContain('data_collection_agent');
      });
    });

    describe('getReceivers', () => {
      it('should return agents that can receive from profile_collection_agent', () => {
        const receivers = service.getReceivers('profile_collection_agent');
        
        expect(receivers).toContain('orchestrator_agent');
        expect(receivers).toContain('communication_agent');
      });
    });
  });

  describe('generateCapabilityReport', () => {
    it('should generate a formatted capability report', async () => {
      await service.discoverAgents();
      
      const report = service.generateCapabilityReport();
      
      // Check report structure
      expect(report).toContain('🤖 AGENT CAPABILITY REGISTRY');
      expect(report).toContain('============================================================');
      
      // Check for profile_collection_agent in the report
      expect(report).toContain('Profile Collection Specialist Agent (profile_collection_agent)');
      expect(report).toContain('Role: profile_collection_specialist');
      expect(report).toContain('Protocol: A2A v1.0.0');
      
      // Check for routing information
      expect(report).toContain('← Can receive from:');
      expect(report).toContain('→ Can send to:');
      
      // Check summary
      expect(report).toContain('Total Agents:');
    });
  });

  describe('error handling', () => {
    it('should handle missing config directory gracefully', async () => {
      const badService = new AgentDiscoveryService('non/existent/path');
      
      await expect(badService.discoverAgents()).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        '💥 Agent discovery failed',
        expect.any(Object)
      );
    });
  });

  describe('integration with process.cwd()', () => {
    it('should handle different working directories correctly', () => {
      const originalCwd = process.cwd();
      const mockCwd = '/mock/working/directory';
      
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);
      
      const testService = new AgentDiscoveryService('config/agents');
      expect(testService['configPath']).toBe(path.join(mockCwd, 'config/agents'));
      
      // Restore original
      jest.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    });
  });
});