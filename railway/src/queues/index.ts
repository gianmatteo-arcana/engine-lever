import Queue from 'bull';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Processors
import { processLLMJob } from './processors/llm-processor';
import { processDataSyncJob } from './processors/data-sync-processor';
import { processNotificationJob } from './processors/notification-processor';
import { processMaintenanceJob } from './processors/maintenance-processor';

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

// Create Redis connection
const redis = new Redis(redisConfig);

// Queue configurations
export const queues = {
  llmProcessing: new Queue('llm_processing', { redis: redisConfig }),
  dataSync: new Queue('data_sync', { redis: redisConfig }),
  notifications: new Queue('notifications', { redis: redisConfig }),
  maintenance: new Queue('maintenance', { redis: redisConfig })
};

export async function initializeQueues() {
  try {
    // Set up queue processors
    queues.llmProcessing.process(3, processLLMJob); // 3 concurrent LLM jobs
    queues.dataSync.process(5, processDataSyncJob); // 5 concurrent data sync jobs
    queues.notifications.process(10, processNotificationJob); // 10 concurrent notifications
    queues.maintenance.process(1, processMaintenanceJob); // 1 maintenance job at a time

    // Global error handlers
    Object.entries(queues).forEach(([name, queue]) => {
      queue.on('error', (error) => {
        logger.error(`Queue ${name} error:`, error);
      });

      queue.on('waiting', (jobId) => {
        logger.debug(`Job ${jobId} is waiting in queue ${name}`);
      });

      queue.on('active', (job) => {
        logger.info(`Job ${job.id} started processing in queue ${job.queue.name}`);
      });

      queue.on('completed', (job) => {
        logger.info(`Job ${job.id} completed in queue ${job.queue.name}`);
      });

      queue.on('failed', (job, error) => {
        logger.error(`Job ${job?.id} failed in queue ${job?.queue.name}:`, error);
      });

      queue.on('stalled', (job) => {
        logger.warn(`Job ${job.id} stalled in queue ${job.queue.name}`);
      });
    });

    // Test Redis connection
    await redis.ping();
    logger.info('✅ Redis connection established');

    // Set up recurring maintenance jobs
    await setupRecurringJobs();

    return queues;
  } catch (error) {
    logger.error('❌ Failed to initialize queues:', error);
    throw error;
  }
}

async function setupRecurringJobs() {
  // Clean up completed jobs daily at 2 AM
  await queues.maintenance.add(
    'cleanup-completed-jobs',
    { action: 'cleanup_completed_jobs' },
    { 
      repeat: { cron: '0 2 * * *' }, // Daily at 2 AM
      removeOnComplete: 5,
      removeOnFail: 3
    }
  );

  // Generate daily reports at 6 AM
  await queues.maintenance.add(
    'generate-daily-reports',
    { action: 'generate_daily_reports' },
    { 
      repeat: { cron: '0 6 * * *' }, // Daily at 6 AM
      removeOnComplete: 5,
      removeOnFail: 3
    }
  );

  logger.info('✅ Recurring maintenance jobs scheduled');
}

// Export individual queues for external use
export const { llmProcessing, dataSync, notifications, maintenance } = queues;