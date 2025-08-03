import { Router, Request, Response } from 'express';
import { getQueueStats } from '../services/queueService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const queueStats = await getQueueStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      queues: queueStats
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as healthRoutes };