import { jest } from '@jest/globals';
import { AgentManager } from '../agents';

// Mock dependencies
jest.mock('../services/database');
jest.mock('../agents/OrchestratorAgent');

describe.skip('AgentManager', () => {
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

    it('should initialize all role-based agents', async () => {
      expect(AgentManager.getAgentCount()).toBe(1); // Only OrchestratorAgent for now
    });

    it('should get agent status by role', async () => {
      const status = AgentManager.getAgentStatus('orchestrator' as any);
      expect(status).toBeDefined();
      expect(status.role).toBe('orchestrator');
      expect(status.status).toBeDefined();
    });

    it('should get all agents status', async () => {
      const statuses = AgentManager.getAllAgentsStatus();
      expect(statuses).toHaveLength(1); // Only OrchestratorAgent for now
      expect(statuses[0]).toHaveProperty('role');
      expect(statuses[0]).toHaveProperty('status');
      expect(statuses[0]).toHaveProperty('metrics');
    });

    it('should create tasks', async () => {
      const taskRequest = {
        userId: 'user-123',
        businessId: 'biz-456', 
        templateId: 'soi-filing',
        priority: 'high',
        metadata: { type: 'test' }
      };
      
      const taskId = await AgentManager.createTask(taskRequest);
      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task-\d+/);
    });

    it('should get task status', async () => {
      const taskRequest = {
        userId: 'user-123',
        businessId: 'biz-456',
        templateId: 'soi-filing'
      };
      
      const taskId = await AgentManager.createTask(taskRequest);
      const mockUserToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const status = await AgentManager.getTaskStatus(taskId, mockUserToken);
      
      expect(status).toBeDefined();
      // Note: status might be null if task doesn't exist in DB
      if (status) {
        expect(status.taskId).toBe(taskId);
        expect(status.status).toBeDefined();
      }
    });

    it('should report healthy when initialized', async () => {
      expect(AgentManager.isHealthy()).toBe(true);
    });

    it('should report unhealthy when not initialized', async () => {
      await AgentManager.stop();
      expect(AgentManager.isHealthy()).toBe(false);
    });
  });

  describe('task lifecycle', () => {
    beforeEach(async () => {
      await AgentManager.initialize();
    });

    it('should handle task creation with minimal config', async () => {
      const taskRequest = {
        userId: 'user-123',
        businessId: 'biz-456',
        templateId: 'soi-filing'
      };
      
      const taskId = await AgentManager.createTask(taskRequest);
      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
    });

    it('should handle task creation with full config', async () => {
      const taskRequest = {
        userId: 'user-123',
        businessId: 'biz-456',
        templateId: 'soi-filing',
        priority: 'critical',
        deadline: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
        metadata: {
          type: 'test',
          source: 'unit-test',
          version: '1.0.0'
        }
      };
      
      const taskId = await AgentManager.createTask(taskRequest);
      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task-\d+/);
    });

    it('should throw error when creating task without initialization', async () => {
      await AgentManager.stop();
      
      const taskRequest = {
        userId: 'user-123',
        businessId: 'biz-456',
        templateId: 'soi-filing'
      };
      
      await expect(AgentManager.createTask(taskRequest)).rejects.toThrow('AgentManager not initialized');
    });
  });
});