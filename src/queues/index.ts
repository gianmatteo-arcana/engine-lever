import Bull from 'bull';
import { logger } from '../utils/logger';

export class QueueManager {
  private static queues: Map<string, Bull.Queue> = new Map();
  private static initialized = false;

  static async initialize(): Promise<void> {
    try {
      logger.info('Initializing Queue Manager...');
      
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      };

      // Create core queues
      const agentQueue = new Bull('agent-tasks', { redis: redisConfig });
      const mcpQueue = new Bull('mcp-tools', { redis: redisConfig });
      const generalQueue = new Bull('general-tasks', { redis: redisConfig });

      // Set up queue processors
      agentQueue.process('agent-task', 5, this.processAgentTask);
      mcpQueue.process('mcp-tool', 10, this.processMCPTool);
      generalQueue.process('general-task', 3, this.processGeneralTask);

      // Store queues
      this.queues.set('agents', agentQueue);
      this.queues.set('mcp', mcpQueue);
      this.queues.set('general', generalQueue);

      // Set up queue event handlers
      this.setupQueueEventHandlers();
      
      this.initialized = true;
      logger.info(`Queue Manager initialized with ${this.queues.size} queues`);
    } catch (error) {
      logger.error('Failed to initialize Queue Manager:', error);
      throw error;
    }
  }

  static async stop(): Promise<void> {
    try {
      logger.info('Stopping Queue Manager...');
      
      for (const [name, queue] of this.queues) {
        logger.info(`Closing queue: ${name}`);
        await queue.close();
      }
      
      this.queues.clear();
      this.initialized = false;
      logger.info('Queue Manager stopped');
    } catch (error) {
      logger.error('Error stopping Queue Manager:', error);
      throw error;
    }
  }

  static isHealthy(): boolean {
    return this.initialized;
  }

  static getQueue(name: string): Bull.Queue | undefined {
    return this.queues.get(name);
  }

  static async enqueueAgentTask(taskData: any, options?: Bull.JobOptions): Promise<Bull.Job> {
    const queue = this.queues.get('agents');
    if (!queue) {
      throw new Error('Agent queue not initialized');
    }

    logger.info('Enqueueing agent task:', taskData);
    return queue.add('agent-task', taskData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options
    });
  }

  static async enqueueMCPTool(toolData: any, options?: Bull.JobOptions): Promise<Bull.Job> {
    const queue = this.queues.get('mcp');
    if (!queue) {
      throw new Error('MCP queue not initialized');
    }

    logger.info('Enqueueing MCP tool:', toolData);
    return queue.add('mcp-tool', toolData, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
      removeOnComplete: 20,
      removeOnFail: 10,
      ...options
    });
  }

  static async enqueueGeneralTask(taskData: any, options?: Bull.JobOptions): Promise<Bull.Job> {
    const queue = this.queues.get('general');
    if (!queue) {
      throw new Error('General queue not initialized');
    }

    logger.info('Enqueueing general task:', taskData);
    return queue.add('general-task', taskData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 5,
      removeOnFail: 3,
      ...options
    });
  }

  private static async processAgentTask(job: Bull.Job): Promise<any> {
    logger.info(`Processing agent task: ${job.id}`, job.data);
    
    try {
      // TODO: Implement agent task processing
      // - Route to appropriate agent
      // - Handle A2A communication
      // - Track task progress
      
      job.progress(50);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      job.progress(100);
      
      return {
        status: 'completed',
        result: 'Agent task completed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Agent task ${job.id} failed:`, error);
      throw error;
    }
  }

  private static async processMCPTool(job: Bull.Job): Promise<any> {
    logger.info(`Processing MCP tool: ${job.id}`, job.data);
    
    try {
      // TODO: Implement MCP tool processing
      // - Validate tool parameters
      // - Execute tool via MCP protocol
      // - Return tool results
      
      job.progress(30);
      
      const { toolName, params: _params } = job.data;
      
      // Simulate tool execution
      await new Promise(resolve => setTimeout(resolve, 500));
      
      job.progress(100);
      
      return {
        status: 'completed',
        toolName,
        result: 'MCP tool executed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`MCP tool ${job.id} failed:`, error);
      throw error;
    }
  }

  private static async processGeneralTask(job: Bull.Job): Promise<any> {
    logger.info(`Processing general task: ${job.id}`, job.data);
    
    try {
      // TODO: Implement general task processing
      job.progress(25);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      job.progress(100);
      
      return {
        status: 'completed',
        result: 'General task completed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`General task ${job.id} failed:`, error);
      throw error;
    }
  }

  private static setupQueueEventHandlers(): void {
    for (const [name, queue] of this.queues) {
      queue.on('completed', (job, result) => {
        logger.info(`${name} job completed:`, { jobId: job.id, result });
      });

      queue.on('failed', (job, err) => {
        logger.error(`${name} job failed:`, { jobId: job.id, error: err.message });
      });

      queue.on('stalled', (job) => {
        logger.warn(`${name} job stalled:`, { jobId: job.id });
      });
    }
  }

  static async getQueueStats(): Promise<any> {
    const stats: any = {};
    
    for (const [name, queue] of this.queues) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      
      stats[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    }
    
    return stats;
  }
}