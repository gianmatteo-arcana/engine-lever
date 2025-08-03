import { AgentManager } from '../agents';

describe('AgentManager', () => {
  beforeEach(async () => {
    // Reset the AgentManager state before each test
    await AgentManager.stop();
  });

  afterEach(async () => {
    await AgentManager.stop();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(AgentManager.initialize()).resolves.not.toThrow();
      expect(AgentManager.isHealthy()).toBe(true);
    });

    it('should set initialized state to true', async () => {
      await AgentManager.initialize();
      expect(AgentManager.isHealthy()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop successfully when initialized', async () => {
      await AgentManager.initialize();
      await expect(AgentManager.stop()).resolves.not.toThrow();
      expect(AgentManager.isHealthy()).toBe(false);
    });

    it('should handle stop when not initialized', async () => {
      await expect(AgentManager.stop()).resolves.not.toThrow();
      expect(AgentManager.isHealthy()).toBe(false);
    });
  });

  describe('agent management', () => {
    beforeEach(async () => {
      await AgentManager.stop(); // Ensure clean state
      await AgentManager.initialize();
    });

    it('should create a new agent', async () => {
      const config = { capabilities: ['business_analysis'] };
      const agentId = await AgentManager.createAgent(config);
      
      expect(agentId).toBeDefined();
      expect(agentId).toMatch(/^agent_\d+$/);
      expect(AgentManager.getAgentCount()).toBe(1);
    });

    it('should retrieve agent by ID', async () => {
      const config = { capabilities: ['document_processing'] };
      const agentId = await AgentManager.createAgent(config);
      
      const agent = AgentManager.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent.id).toBe(agentId);
      expect(agent.capabilities).toEqual(['document_processing']);
    });

    it('should return all agents', async () => {
      // Ensure clean state within this test
      await AgentManager.stop();
      await AgentManager.initialize();
      
      const config1 = { capabilities: ['business_analysis'] };
      const config2 = { capabilities: ['document_processing'] };
      
      await AgentManager.createAgent(config1);
      await AgentManager.createAgent(config2);
      
      const agents = AgentManager.getAllAgents();
      expect(agents).toHaveLength(2);
      expect(AgentManager.getAgentCount()).toBe(2);
    });

    it('should stop individual agent', async () => {
      const config = { capabilities: ['compliance_check'] };
      const agentId = await AgentManager.createAgent(config);
      
      expect(AgentManager.getAgentCount()).toBe(1);
      
      await AgentManager.stopAgent(agentId);
      expect(AgentManager.getAgentCount()).toBe(0);
      expect(AgentManager.getAgent(agentId)).toBeUndefined();
    });

    it('should assign task to agent', async () => {
      const config = { capabilities: ['business_analysis'] };
      const agentId = await AgentManager.createAgent(config);
      
      const task = {
        type: 'business_analysis',
        data: { company: 'Test Corp' }
      };
      
      await expect(AgentManager.assignTask(agentId, task)).resolves.not.toThrow();
    });
  });

  describe('health check', () => {
    it('should return false when not initialized', () => {
      expect(AgentManager.isHealthy()).toBe(false);
    });

    it('should return true when initialized', async () => {
      await AgentManager.initialize();
      expect(AgentManager.isHealthy()).toBe(true);
    });
  });

  describe('agent count', () => {
    it('should return 0 when no agents exist', () => {
      expect(AgentManager.getAgentCount()).toBe(0);
    });

    it('should return correct count after creating agents', async () => {
      // Ensure clean state for this test
      await AgentManager.stop();
      await AgentManager.initialize();
      
      // Verify starting from 0
      expect(AgentManager.getAgentCount()).toBe(0);
      
      await AgentManager.createAgent({ capabilities: [] });
      expect(AgentManager.getAgentCount()).toBe(1);
      
      await AgentManager.createAgent({ capabilities: [] });
      expect(AgentManager.getAgentCount()).toBe(2);
    });
  });
});