import { PersistentAgentManager } from '../agents/PersistentAgentManager';
import { AgentRole } from '../agents/base/types';

// Mock the database service with the actual API methods
jest.mock('../services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      createTask: jest.fn().mockResolvedValue({ id: 'task-123' }),
      getTask: jest.fn(),
      updateTask: jest.fn(),
      getUserTasks: jest.fn(),
      createSystemExecution: jest.fn().mockResolvedValue({ id: 'exec-123' }),
      updateSystemExecution: jest.fn(),
      getTaskExecutions: jest.fn(),
      saveSystemMessage: jest.fn(),
      createSystemAuditEntry: jest.fn(),
      getSystemAgentMetrics: jest.fn(),
      getUserClient: jest.fn(),
      clearUserClient: jest.fn(),
      clearAllUserClients: jest.fn()
    }))
  }
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('PersistentAgentManager', () => {
  let manager: PersistentAgentManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new PersistentAgentManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await manager.initialize();

      expect(manager.isHealthy()).toBe(true);
      expect(manager.getAllAgentsStatus()).toHaveLength(7);
    });

    it('should not reinitialize if already initialized', async () => {
      await manager.initialize();
      const firstInit = manager.isHealthy();
      
      await manager.initialize(); // Second call - should not reinitialize

      // Should still be healthy and have same agent count
      expect(manager.isHealthy()).toBe(firstInit);
      expect(manager.getAllAgentsStatus()).toHaveLength(7);
    });
  });

  describe('Task Creation', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should create a task successfully', async () => {
      const taskId = await manager.createTask({
        userToken: 'test-token',
        userId: 'user-123',
        businessId: 'biz-123',
        templateId: 'soi-filing',
        priority: 'high',
        metadata: { test: true }
      });

      expect(taskId).toBe('task-123');
    });

    it('should require initialization before creating tasks', async () => {
      const uninitializedManager = new PersistentAgentManager();
      
      await expect(uninitializedManager.createTask({
        userToken: 'test-token',
        userId: 'user-123',
        businessId: 'biz-123'
      })).rejects.toThrow('PersistentAgentManager not initialized');
    });
  });

  describe('Agent Management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should get agent status by role', () => {
      const status = manager.getAgentStatus(AgentRole.ORCHESTRATOR);
      
      expect(status).toBeDefined();
      expect(status.role).toBe(AgentRole.ORCHESTRATOR);
      expect(status.status).toBeDefined();
    });

    it('should get all agents status', () => {
      const allStatus = manager.getAllAgentsStatus();
      
      expect(allStatus).toHaveLength(7);
      expect(allStatus[0]).toHaveProperty('role');
      expect(allStatus[0]).toHaveProperty('status');
    });

    it('should return not_found for invalid agent role', () => {
      const status = manager.getAgentStatus('INVALID_ROLE' as AgentRole);
      
      expect(status.status).toBe('not_found');
    });
  });

  describe('Health Check', () => {
    it('should report healthy when initialized', async () => {
      await manager.initialize();
      expect(manager.isHealthy()).toBe(true);
    });

    it('should report unhealthy when not initialized', () => {
      const uninitializedManager = new PersistentAgentManager();
      expect(uninitializedManager.isHealthy()).toBe(false);
    });

    it('should report unhealthy after stopping', async () => {
      await manager.initialize();
      expect(manager.isHealthy()).toBe(true);
      
      await manager.stop();
      expect(manager.isHealthy()).toBe(false);
    });
  });

  describe('Lifecycle', () => {
    it('should stop gracefully', async () => {
      await manager.initialize();

      await manager.stop();

      expect(manager.isHealthy()).toBe(false);
      expect(manager.getAllAgentsStatus()).toHaveLength(0);
    });
  });

  // Note: Pause/Resume functionality tests are omitted as the 
  // underlying database methods don't exist in the current API
  // These would need to be reimplemented when the API is updated
});