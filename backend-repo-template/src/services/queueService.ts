import Queue from 'bull';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redis: Redis;
let queues: Record<string, Queue.Queue> = {};

export async function initializeRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
    keepAlive: 30000,
  });

  // Test Redis connection
  await redis.ping();
  logger.info('Redis connection established');

  // Initialize queues
  const queueConfig = {
    redis: {
      port: redis.options.port,
      host: redis.options.host,
      password: redis.options.password,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  };

  // Create job queues
  queues.businessAnalysis = new Queue('business-analysis', queueConfig);
  queues.aiTasks = new Queue('ai-tasks', queueConfig);
  queues.notifications = new Queue('notifications', queueConfig);

  // Set up queue event listeners
  Object.values(queues).forEach(setupQueueEventListeners);

  logger.info('Job queues initialized');
}

function setupQueueEventListeners(queue: Queue.Queue): void {
  queue.on('completed', (job, result) => {
    logger.info(`✅ Job ${job.id} in queue ${queue.name} completed`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`❌ Job ${job.id} in queue ${queue.name} failed:`, err.message);
  });

  queue.on('stalled', (job) => {
    logger.warn(`⚠️ Job ${job.id} in queue ${queue.name} stalled`);
  });
}

export function getQueue(name: string): Queue.Queue {
  const queue = queues[name];
  if (!queue) {
    throw new Error(`Queue ${name} not found`);
  }
  return queue;
}

export async function getQueueStats() {
  const stats = await Promise.all(
    Object.entries(queues).map(async ([name, queue]) => {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
      ]);

      return {
        name,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
      };
    })
  );

  return stats;
}