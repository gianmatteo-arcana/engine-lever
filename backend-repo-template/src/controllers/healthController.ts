import { Router, Request, Response } from 'express';
import { getQueueStats } from '../services/queueService';
import { getSupabase } from '../services/supabaseService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {} as Record<string, any>
    };

    // Check Supabase connection
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      healthCheck.services.supabase = {
        status: error ? 'unhealthy' : 'healthy',
        error: error?.message
      };
    } catch (error) {
      healthCheck.services.supabase = {
        status: 'unhealthy',
        error: 'Supabase not initialized'
      };
    }

    // Check Redis/Queues if available
    try {
      const queueStats = await getQueueStats();
      healthCheck.services.redis = {
        status: 'healthy',
        queues: queueStats
      };
    } catch (error) {
      healthCheck.services.redis = {
        status: 'not_configured',
        message: 'Redis queues not available'
      };
    }

    // Overall health status
    const allServicesHealthy = Object.values(healthCheck.services)
      .every(service => service.status === 'healthy' || service.status === 'not_configured');

    if (!allServicesHealthy) {
      healthCheck.status = 'degraded';
      res.status(503);
    }

    res.json(healthCheck);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as healthRoutes };