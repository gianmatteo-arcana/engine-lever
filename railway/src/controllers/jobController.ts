import { Router, Request, Response } from 'express';
import { businessAnalysisQueue, aiTaskQueue } from '../services/queueService';
import SupabaseService from '../services/supabaseService';
import { JobPriority } from '../services/queueService';

const router = Router();

// Create a new job
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { type, userId, data, priority = JobPriority.NORMAL } = req.body;

    // Create job record in database
    const jobRecord = await SupabaseService.createJobRecord({
      type,
      status: 'queued',
      userId,
      payload: data,
      priority
    });

    // Add to appropriate queue
    let job;
    switch (type) {
      case 'business-analysis':
        job = await businessAnalysisQueue.add('analyze-business-data', {
          userId,
          jobId: jobRecord.id,
          ...data
        }, { priority });
        break;
      case 'ai-task':
        job = await aiTaskQueue.add('generate-business-plan', {
          userId,
          jobId: jobRecord.id,
          ...data
        }, { priority });
        break;
      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    res.json({
      success: true,
      jobId: jobRecord.id,
      queueJobId: job.id,
      status: 'queued'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get job status
router.get('/:jobId/status', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    // This would query the database for job status
    res.json({
      jobId,
      status: 'processing',
      progress: 50,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as jobRoutes };