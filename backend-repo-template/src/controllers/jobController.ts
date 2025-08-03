import { Router, Request, Response } from 'express';
import { getQueue } from '../services/queueService';
import { SupabaseService } from '../services/supabaseService';
import { logger } from '../utils/logger';

const router = Router();

// Create a new background job
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { type, userId, data, priority = 5 } = req.body;

    if (!type || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, userId'
      });
    }

    // Create job record in database
    const jobRecord = await SupabaseService.createJobRecord({
      type,
      status: 'queued',
      userId,
      payload: data,
      priority
    });

    // Add to queue if Redis is available
    let queueJobId = null;
    try {
      const queue = getQueue(getQueueNameForJobType(type));
      const job = await queue.add(type, {
        userId,
        jobId: jobRecord.id,
        ...data
      }, { priority });
      queueJobId = job.id;
    } catch (error) {
      logger.warn('Queue not available, job stored in database only:', error);
    }

    res.json({
      success: true,
      jobId: jobRecord.id,
      queueJobId,
      status: 'queued',
      message: 'Job created successfully'
    });

  } catch (error) {
    logger.error('Failed to create job:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get job status
router.get('/:jobId/status', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    // In a real implementation, you'd query the database for job status
    res.json({
      jobId,
      status: 'processing',
      progress: 50,
      createdAt: new Date().toISOString(),
      message: 'Job status endpoint - implement database query'
    });

  } catch (error) {
    logger.error('Failed to get job status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint
router.get('/test', (req: Request, res: Response) => {
  res.json({
    message: 'Biz Buddy Backend API is working!',
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /api/jobs/create': 'Create a background job',
      'GET /api/jobs/:id/status': 'Get job status',
      'GET /health': 'Health check'
    }
  });
});

function getQueueNameForJobType(type: string): string {
  // Map job types to queue names
  const queueMap: Record<string, string> = {
    'business-analysis': 'businessAnalysis',
    'ai-task': 'aiTasks',
    'notification': 'notifications'
  };
  
  return queueMap[type] || 'businessAnalysis';
}

export { router as jobRoutes };