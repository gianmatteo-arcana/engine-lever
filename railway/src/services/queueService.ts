import Queue from 'bull';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  keepAlive: 30000,
});

// Queue configurations
const queueConfig = {
  redis: {
    port: redis.options.port,
    host: redis.options.host,
    password: redis.options.password,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

// Job Queues
export const businessAnalysisQueue = new Queue('business-analysis', queueConfig);
export const documentProcessingQueue = new Queue('document-processing', queueConfig);
export const aiTaskQueue = new Queue('ai-tasks', queueConfig);
export const emailNotificationQueue = new Queue('email-notifications', queueConfig);
export const reportGenerationQueue = new Queue('report-generation', queueConfig);

// Queue array for easier management
export const allQueues = [
  businessAnalysisQueue,
  documentProcessingQueue,
  aiTaskQueue,
  emailNotificationQueue,
  reportGenerationQueue,
];

// Initialize all queues
export async function initializeQueues(): Promise<void> {
  try {
    // Test Redis connection
    await redis.ping();
    logger.info('✅ Redis connection established');

    // Initialize each queue
    for (const queue of allQueues) {
      await queue.isReady();
      logger.info(`✅ Queue ${queue.name} initialized`);
      
      // Set up queue event listeners
      setupQueueEventListeners(queue);
    }

    logger.info('✅ All queues initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize queues:', error);
    throw error;
  }
}

// Queue event listeners for monitoring
function setupQueueEventListeners(queue: Queue.Queue): void {
  queue.on('completed', (job, result) => {
    logger.info(`✅ Job ${job.id} in queue ${queue.name} completed`, {
      jobId: job.id,
      queueName: queue.name,
      duration: Date.now() - job.timestamp,
    });
  });

  queue.on('failed', (job, err) => {
    logger.error(`❌ Job ${job.id} in queue ${queue.name} failed:`, {
      jobId: job.id,
      queueName: queue.name,
      error: err.message,
      attempts: job.attemptsMade,
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`⚠️ Job ${job.id} in queue ${queue.name} stalled`, {
      jobId: job.id,
      queueName: queue.name,
    });
  });

  queue.on('progress', (job, progress) => {
    logger.info(`🔄 Job ${job.id} progress: ${progress}%`, {
      jobId: job.id,
      queueName: queue.name,
      progress,
    });
  });
}

// Job priority levels
export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 15,
}

// Queue statistics
export async function getQueueStats(queueName?: string) {
  const queues = queueName ? 
    allQueues.filter(q => q.name === queueName) : 
    allQueues;

  const stats = await Promise.all(
    queues.map(async (queue) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(), 
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        name: queue.name,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    })
  );

  return stats;
}

// Clean up old jobs
export async function cleanupQueues(): Promise<void> {
  logger.info('🧹 Starting queue cleanup...');
  
  for (const queue of allQueues) {
    try {
      await queue.clean(24 * 60 * 60 * 1000, 'completed'); // Remove completed jobs older than 24h
      await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Remove failed jobs older than 7 days
      logger.info(`✅ Cleaned up queue: ${queue.name}`);
    } catch (error) {
      logger.error(`❌ Failed to cleanup queue ${queue.name}:`, error);
    }
  }
}

// Graceful shutdown
export async function shutdownQueues(): Promise<void> {
  logger.info('🛑 Shutting down queues...');
  
  await Promise.all(
    allQueues.map(async (queue) => {
      await queue.close();
      logger.info(`✅ Queue ${queue.name} closed`);
    })
  );
  
  await redis.disconnect();
  logger.info('✅ Redis connection closed');
}

export { redis };