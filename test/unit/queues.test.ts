import { QueueManager } from '../../src/queues';
import Bull from 'bull';

// Mock Bull more specifically for this test
jest.mock('bull');
const MockBull = Bull as jest.MockedClass<typeof Bull>;

describe('QueueManager', () => {
  let mockQueue: jest.Mocked<Bull.Queue>;

  beforeEach(() => {
    // Create a mock queue instance
    mockQueue = {
      process: jest.fn(),
      add: jest.fn().mockResolvedValue({ id: 'test-job' }),
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn()
    } as any;

    // Mock Bull constructor to return our mock queue
    MockBull.mockImplementation(() => mockQueue);

    // Reset QueueManager state
    QueueManager.stop();
  });

  afterEach(async () => {
    await QueueManager.stop();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(QueueManager.initialize()).resolves.not.toThrow();
      expect(QueueManager.isHealthy()).toBe(true);
    });

    it('should create three queues', async () => {
      await QueueManager.initialize();
      
      expect(MockBull).toHaveBeenCalledTimes(3);
      expect(MockBull).toHaveBeenCalledWith('agent-tasks', expect.any(Object));
      expect(MockBull).toHaveBeenCalledWith('mcp-tools', expect.any(Object));
      expect(MockBull).toHaveBeenCalledWith('general-tasks', expect.any(Object));
    });

    it('should set up queue processors', async () => {
      await QueueManager.initialize();
      
      expect(mockQueue.process).toHaveBeenCalledWith('agent-task', 5, expect.any(Function));
      expect(mockQueue.process).toHaveBeenCalledWith('mcp-tool', 10, expect.any(Function));
      expect(mockQueue.process).toHaveBeenCalledWith('general-task', 3, expect.any(Function));
    });

    it('should set up event handlers', async () => {
      await QueueManager.initialize();
      
      expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
    });
  });

  describe('stop', () => {
    it('should stop successfully when initialized', async () => {
      await QueueManager.initialize();
      await expect(QueueManager.stop()).resolves.not.toThrow();
      expect(QueueManager.isHealthy()).toBe(false);
    });

    it('should close all queues', async () => {
      await QueueManager.initialize();
      await QueueManager.stop();
      
      expect(mockQueue.close).toHaveBeenCalledTimes(3);
    });

    it('should handle stop when not initialized', async () => {
      await expect(QueueManager.stop()).resolves.not.toThrow();
      expect(QueueManager.isHealthy()).toBe(false);
    });
  });

  describe('queue operations', () => {
    beforeEach(async () => {
      await QueueManager.initialize();
    });

    describe('enqueueAgentTask', () => {
      it('should enqueue agent task successfully', async () => {
        const taskData = { type: 'business_analysis', data: {} };
        
        const job = await QueueManager.enqueueAgentTask(taskData);
        
        expect(mockQueue.add).toHaveBeenCalledWith('agent-task', taskData, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 10,
          removeOnFail: 5
        });
        expect(job).toEqual({ id: 'test-job' });
      });

      it('should accept custom options', async () => {
        const taskData = { type: 'business_analysis' };
        const options = { priority: 10, delay: 1000 };
        
        await QueueManager.enqueueAgentTask(taskData, options);
        
        expect(mockQueue.add).toHaveBeenCalledWith('agent-task', taskData, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 10,
          removeOnFail: 5,
          priority: 10,
          delay: 1000
        });
      });

      it('should throw error when queue not initialized', async () => {
        await QueueManager.stop();
        
        await expect(
          QueueManager.enqueueAgentTask({ type: 'test' })
        ).rejects.toThrow('Agent queue not initialized');
      });
    });

    describe('enqueueMCPTool', () => {
      it('should enqueue MCP tool successfully', async () => {
        const toolData = { toolName: 'business_analyzer', params: {} };
        
        const job = await QueueManager.enqueueMCPTool(toolData);
        
        expect(mockQueue.add).toHaveBeenCalledWith('mcp-tool', toolData, {
          attempts: 2,
          backoff: { type: 'fixed', delay: 1000 },
          removeOnComplete: 20,
          removeOnFail: 10
        });
        expect(job).toEqual({ id: 'test-job' });
      });

      it('should throw error when queue not initialized', async () => {
        await QueueManager.stop();
        
        await expect(
          QueueManager.enqueueMCPTool({ toolName: 'test' })
        ).rejects.toThrow('MCP queue not initialized');
      });
    });

    describe('enqueueGeneralTask', () => {
      it('should enqueue general task successfully', async () => {
        const taskData = { type: 'notification', data: {} };
        
        const job = await QueueManager.enqueueGeneralTask(taskData);
        
        expect(mockQueue.add).toHaveBeenCalledWith('general-task', taskData, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 5,
          removeOnFail: 3
        });
        expect(job).toEqual({ id: 'test-job' });
      });

      it('should throw error when queue not initialized', async () => {
        await QueueManager.stop();
        
        await expect(
          QueueManager.enqueueGeneralTask({ type: 'test' })
        ).rejects.toThrow('General queue not initialized');
      });
    });
  });

  describe('getQueue', () => {
    it('should return queue by name when initialized', async () => {
      await QueueManager.initialize();
      
      const agentQueue = QueueManager.getQueue('agents');
      expect(agentQueue).toBe(mockQueue);
    });

    it('should return undefined for non-existent queue', async () => {
      await QueueManager.initialize();
      
      const queue = QueueManager.getQueue('non-existent');
      expect(queue).toBeUndefined();
    });
  });

  describe('getQueueStats', () => {
    beforeEach(async () => {
      await QueueManager.initialize();
    });

    it('should return stats for all queues', async () => {
      // Mock different states for queues
      mockQueue.getWaiting.mockResolvedValue([1, 2] as any);
      mockQueue.getActive.mockResolvedValue([1] as any);
      mockQueue.getCompleted.mockResolvedValue([1, 2, 3] as any);
      mockQueue.getFailed.mockResolvedValue([1, 2] as any);

      const stats = await QueueManager.getQueueStats();

      expect(stats).toEqual({
        agents: {
          waiting: 2,
          active: 1,
          completed: 3,
          failed: 2
        },
        mcp: {
          waiting: 2,
          active: 1,
          completed: 3,
          failed: 2
        },
        general: {
          waiting: 2,
          active: 1,
          completed: 3,
          failed: 2
        }
      });
    });

    it('should handle empty queues', async () => {
      const stats = await QueueManager.getQueueStats();

      expect(stats).toEqual({
        agents: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0
        },
        mcp: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0
        },
        general: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0
        }
      });
    });
  });

  describe('health check', () => {
    it('should return false when not initialized', () => {
      expect(QueueManager.isHealthy()).toBe(false);
    });

    it('should return true when initialized', async () => {
      await QueueManager.initialize();
      expect(QueueManager.isHealthy()).toBe(true);
    });
  });
});