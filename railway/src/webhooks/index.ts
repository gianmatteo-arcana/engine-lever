import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { queues } from '../queues';

// Validation schemas
const EnqueueJobSchema = z.object({
  userId: z.string().uuid(),
  jobType: z.enum(['llm_processing', 'data_sync', 'notifications', 'maintenance']),
  priority: z.number().min(1).max(10).default(5),
  payload: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional()
});

const JobStatusUpdateSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  result: z.record(z.any()).optional(),
  errorMessage: z.string().optional()
});

export function setupWebhooks(app: Express, jobQueues: typeof queues) {
  
  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      queues: Object.keys(jobQueues).reduce((acc, name) => ({
        ...acc,
        [name]: 'active'
      }), {})
    });
  });

  // Enqueue new background job
  app.post('/api/jobs/enqueue', async (req: Request, res: Response) => {
    try {
      const validation = EnqueueJobSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }

      const { userId, jobType, priority, payload, scheduledAt } = validation.data;
      
      // Select appropriate queue
      const queue = jobQueues[jobType as keyof typeof jobQueues];
      if (!queue) {
        return res.status(400).json({
          error: `Invalid job type: ${jobType}`
        });
      }

      // Create job options
      const jobOptions: any = {
        priority,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 50
      };

      if (scheduledAt) {
        jobOptions.delay = new Date(scheduledAt).getTime() - Date.now();
      }

      // Add job to queue
      const job = await queue.add(`${jobType}_${userId}`, {
        userId,
        jobType,
        ...payload
      }, jobOptions);

      logger.info(`Job ${job.id} enqueued in ${jobType} queue for user ${userId}`);

      res.json({
        success: true,
        jobId: job.id,
        queueName: jobType,
        estimatedDelay: jobOptions.delay || 0
      });

    } catch (error) {
      logger.error('Failed to enqueue job:', error);
      res.status(500).json({
        error: 'Failed to enqueue job',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get job status
  app.get('/api/jobs/:jobId/status', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      // Search across all queues for the job
      let foundJob = null;
      let queueName = '';

      for (const [name, queue] of Object.entries(jobQueues)) {
        try {
          const job = await queue.getJob(jobId);
          if (job) {
            foundJob = job;
            queueName = name;
            break;
          }
        } catch (error) {
          // Continue searching other queues
        }
      }

      if (!foundJob) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      const jobData = {
        id: foundJob.id,
        name: foundJob.name,
        queue: queueName,
        status: await foundJob.getState(),
        progress: foundJob.progress(),
        data: foundJob.data,
        createdAt: new Date(foundJob.timestamp).toISOString(),
        processedAt: foundJob.processedOn ? new Date(foundJob.processedOn).toISOString() : null,
        finishedAt: foundJob.finishedOn ? new Date(foundJob.finishedOn).toISOString() : null,
        attemptsMade: foundJob.attemptsMade,
        failedReason: foundJob.failedReason
      };

      res.json(jobData);

    } catch (error) {
      logger.error('Failed to get job status:', error);
      res.status(500).json({
        error: 'Failed to get job status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Cancel job
  app.delete('/api/jobs/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      // Search across all queues for the job
      let foundJob = null;
      let queueName = '';

      for (const [name, queue] of Object.entries(jobQueues)) {
        try {
          const job = await queue.getJob(jobId);
          if (job) {
            foundJob = job;
            queueName = name;
            break;
          }
        } catch (error) {
          // Continue searching other queues
        }
      }

      if (!foundJob) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      await foundJob.remove();
      logger.info(`Job ${jobId} cancelled from ${queueName} queue`);

      res.json({
        success: true,
        message: `Job ${jobId} cancelled successfully`
      });

    } catch (error) {
      logger.error('Failed to cancel job:', error);
      res.status(500).json({
        error: 'Failed to cancel job',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get queue statistics
  app.get('/api/queues/stats', async (req: Request, res: Response) => {
    try {
      const stats: Record<string, any> = {};

      for (const [name, queue] of Object.entries(jobQueues)) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          total: waiting.length + active.length + completed.length + failed.length
        };
      }

      res.json({
        timestamp: new Date().toISOString(),
        queues: stats
      });

    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      res.status(500).json({
        error: 'Failed to get queue statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info('✅ Webhook endpoints configured');
}