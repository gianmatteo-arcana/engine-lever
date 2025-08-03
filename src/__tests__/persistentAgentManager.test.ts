import { PersistentAgentManager } from '../agents/PersistentAgentManager';
import { dbService } from '../services/database';
import { AgentRole, TaskPriority } from '../agents/base/types';

// Mock the database service
jest.mock('../services/database', () => ({
  dbService: {
    initialize: jest.fn(),
    createTask: jest.fn(),
    getTask: jest.fn(),
    updateTask: jest.fn(),
    createExecution: jest.fn(),
    getExecution: jest.fn(),
    updateExecution: jest.fn(),
    getPausedExecutions: jest.fn(),
    saveMessage: jest.fn(),
    markMessageProcessed: jest.fn(),
    getUnprocessedMessages: jest.fn(),
    createPausePoint: jest.fn(),
    resumeFromPausePoint: jest.fn(),
    getActivePausePoints: jest.fn(),
    addAuditEntry: jest.fn(),
    saveWorkflowState: jest.fn(),
    getLatestWorkflowState: jest.fn()
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
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);

      await manager.initialize();

      expect(dbService.initialize).toHaveBeenCalled();
      expect(manager.isHealthy()).toBe(true);
      expect(manager.getAgentCount()).toBe(7);
    });

    it('should not reinitialize if already initialized', async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);

      await manager.initialize();
      await manager.initialize(); // Second call

      expect(dbService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should resume paused executions on initialization', async () => {
      const pausedExecution = {
        id: 'exec-123',
        task_id: 'task-123',
        execution_id: 'exec-123',
        is_paused: true,
        current_step: 'validation',
        completed_steps: [],
        variables: {}
      };

      const pausedTask = {
        id: 'task-123',
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'paused',
        priority: 'high',
        metadata: {}
      };

      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([pausedExecution]);
      (dbService.getTask as jest.Mock).mockResolvedValue(pausedTask);
      (dbService.getActivePausePoints as jest.Mock).mockResolvedValue([]);

      await manager.initialize();

      expect(dbService.getPausedExecutions).toHaveBeenCalled();
      expect(dbService.getTask).toHaveBeenCalledWith('task-123');
    });
  });

  describe('Task Creation', () => {
    beforeEach(async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);
      await manager.initialize();
    });

    it('should create a task successfully', async () => {
      const taskRecord = {
        id: 'task-123',
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'pending',
        priority: 'high',
        metadata: {},
        created_at: new Date().toISOString()
      };

      (dbService.createTask as jest.Mock).mockResolvedValue(taskRecord);
      (dbService.createExecution as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        task_id: 'task-123',
        execution_id: 'exec-123'
      });
      (dbService.updateTask as jest.Mock).mockResolvedValue(taskRecord);
      (dbService.updateExecution as jest.Mock).mockResolvedValue({});

      const taskId = await manager.createTask({
        userId: 'user-123',
        businessId: 'biz-123',
        templateId: 'soi-filing',
        priority: 'high',
        metadata: { test: true }
      });

      expect(taskId).toBe('task-123');
      expect(dbService.createTask).toHaveBeenCalled();
      expect(dbService.createExecution).toHaveBeenCalled();
      expect(dbService.addAuditEntry).toHaveBeenCalledWith(
        'task-123',
        'task_created',
        expect.any(Object),
        AgentRole.ORCHESTRATOR,
        'user-123'
      );
      expect(dbService.updateTask).toHaveBeenCalledWith('task-123', { status: 'active' });
    });

    it('should throw error if not initialized', async () => {
      const uninitializedManager = new PersistentAgentManager();

      await expect(uninitializedManager.createTask({
        userId: 'user-123',
        businessId: 'biz-123'
      })).rejects.toThrow('PersistentAgentManager not initialized');
    });

    it('should handle task creation failure', async () => {
      (dbService.createTask as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(manager.createTask({
        userId: 'user-123',
        businessId: 'biz-123'
      })).rejects.toThrow('Database error');
    });
  });

  describe('Task Pause and Resume', () => {
    beforeEach(async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);
      await manager.initialize();
    });

    it('should pause a task', async () => {
      (dbService.updateExecution as jest.Mock).mockResolvedValue({});
      (dbService.updateTask as jest.Mock).mockResolvedValue({});
      (dbService.createPausePoint as jest.Mock).mockResolvedValue('resume-token-123');

      const resumeToken = await manager.pauseTask({
        taskId: 'task-123',
        executionId: 'exec-123',
        reason: 'User approval required',
        pauseType: 'user_approval',
        requiredAction: 'Approve SOI form'
      });

      expect(resumeToken).toBe('resume-token-123');
      expect(dbService.updateExecution).toHaveBeenCalledWith('exec-123', {
        is_paused: true,
        paused_at: expect.any(String),
        pause_reason: 'User approval required',
        resume_data: undefined
      });
      expect(dbService.updateTask).toHaveBeenCalledWith('task-123', { status: 'paused' });
      expect(dbService.createPausePoint).toHaveBeenCalled();
    });

    it('should resume a task', async () => {
      const pausePoint = {
        id: 'pause-123',
        task_id: 'task-123',
        execution_id: 'exec-123',
        pause_type: 'user_approval',
        resumed: true,
        resume_token: 'resume-token-123'
      };

      const execution = {
        id: 'exec-123',
        task_id: 'task-123',
        execution_id: 'exec-123',
        current_step: 'approval',
        completed_steps: ['validation'],
        variables: {}
      };

      const task = {
        id: 'task-123',
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'paused',
        priority: 'high',
        metadata: {}
      };

      (dbService.resumeFromPausePoint as jest.Mock).mockResolvedValue(pausePoint);
      (dbService.getExecution as jest.Mock).mockResolvedValue(execution);
      (dbService.updateExecution as jest.Mock).mockResolvedValue({});
      (dbService.updateTask as jest.Mock).mockResolvedValue({});
      (dbService.getTask as jest.Mock).mockResolvedValue(task);

      const resumed = await manager.resumeTask({
        resumeToken: 'resume-token-123',
        resumeData: { approved: true },
        userId: 'user-123'
      });

      expect(resumed).toBe(true);
      expect(dbService.resumeFromPausePoint).toHaveBeenCalledWith(
        'resume-token-123',
        { approved: true }
      );
      expect(dbService.updateExecution).toHaveBeenCalledWith('exec-123', {
        is_paused: false,
        paused_at: undefined,
        pause_reason: undefined,
        resume_data: undefined
      });
      expect(dbService.updateTask).toHaveBeenCalledWith('task-123', { status: 'active' });
    });

    it('should return false for invalid resume token', async () => {
      (dbService.resumeFromPausePoint as jest.Mock).mockResolvedValue(null);

      const resumed = await manager.resumeTask({
        resumeToken: 'invalid-token'
      });

      expect(resumed).toBe(false);
    });
  });

  describe('Task Status', () => {
    beforeEach(async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);
      await manager.initialize();
    });

    it('should get task status', async () => {
      const task = {
        id: 'task-123',
        status: 'active',
        priority: 'high',
        created_at: new Date().toISOString()
      };

      const execution = {
        current_step: 'validation',
        completed_steps: ['initialization'],
        is_paused: false
      };

      (dbService.getTask as jest.Mock).mockResolvedValue(task);
      (dbService.getExecution as jest.Mock).mockResolvedValue(execution);
      (dbService.getActivePausePoints as jest.Mock).mockResolvedValue([]);

      const status = await manager.getTaskStatus('task-123');

      expect(status).toEqual({
        taskId: 'task-123',
        status: 'active',
        priority: 'high',
        createdAt: task.created_at,
        currentStep: 'validation',
        completedSteps: ['initialization'],
        isPaused: false,
        pauseReason: undefined,
        activePausePoints: 0,
        message: 'Task is being processed'
      });
    });

    it('should return not_found for non-existent task', async () => {
      (dbService.getTask as jest.Mock).mockResolvedValue(null);

      const status = await manager.getTaskStatus('non-existent');

      expect(status).toEqual({ status: 'not_found' });
    });
  });

  describe('Agent Management', () => {
    beforeEach(async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);
      await manager.initialize();
    });

    it('should get agent status', () => {
      const status = manager.getAgentStatus(AgentRole.ORCHESTRATOR);

      expect(status).toHaveProperty('role', AgentRole.ORCHESTRATOR);
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('metrics');
    });

    it('should get all agents status', () => {
      const allStatus = manager.getAllAgentsStatus();

      expect(allStatus).toHaveLength(7);
      expect(allStatus[0]).toHaveProperty('role');
      expect(allStatus[0]).toHaveProperty('status');
      expect(allStatus[0]).toHaveProperty('metrics');
    });

    it('should return not_found for invalid agent role', () => {
      const status = manager.getAgentStatus('invalid' as AgentRole);

      expect(status).toEqual({ status: 'not_found' });
    });

    it('should check health correctly', () => {
      expect(manager.isHealthy()).toBe(true);
    });
  });

  describe('Message Processing', () => {
    beforeEach(async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);
      await manager.initialize();
    });

    it('should process unprocessed messages', async () => {
      const unprocessedMessages = [
        {
          message_id: 'msg-123',
          from_agent: 'orchestrator',
          to_agent: 'legal_compliance',
          message_type: 'request',
          priority: 'high',
          payload: { action: 'validate' },
          created_at: new Date().toISOString()
        }
      ];

      (dbService.getUnprocessedMessages as jest.Mock).mockResolvedValue(unprocessedMessages);
      (dbService.markMessageProcessed as jest.Mock).mockResolvedValue(undefined);

      // Wait for message processing interval to run
      await new Promise(resolve => setTimeout(resolve, 6000));

      expect(dbService.getUnprocessedMessages).toHaveBeenCalled();
    }, 10000);
  });

  describe('Cleanup', () => {
    it('should stop gracefully', async () => {
      (dbService.getPausedExecutions as jest.Mock).mockResolvedValue([]);
      await manager.initialize();

      await manager.stop();

      expect(manager.isHealthy()).toBe(false);
      expect(manager.getAgentCount()).toBe(0);
    });
  });
});