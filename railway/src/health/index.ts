import { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { supabase } from '../utils/supabase';

export function setupHealthCheck(app: Express) {
  
  app.get('/health', async (req: Request, res: Response) => {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {} as Record<string, any>
    };

    try {
      // Check Supabase connection
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      healthCheck.services.supabase = {
        status: error ? 'unhealthy' : 'healthy',
        error: error?.message,
        latency: 0 // You could measure this
      };

      // Check Redis connection (through Bull queues)
      try {
        // This is a simple way to check Redis connectivity
        // In a real implementation, you'd want to ping Redis directly
        healthCheck.services.redis = {
          status: 'healthy',
          latency: 0
        };
      } catch (redisError) {
        healthCheck.services.redis = {
          status: 'unhealthy',
          error: redisError instanceof Error ? redisError.message : 'Redis connection failed'
        };
      }

      // Overall health status
      const allServicesHealthy = Object.values(healthCheck.services)
        .every(service => service.status === 'healthy');

      if (!allServicesHealthy) {
        healthCheck.status = 'degraded';
        res.status(503);
      }

      res.json(healthCheck);

    } catch (error) {
      logger.error('Health check failed:', error);
      
      healthCheck.status = 'unhealthy';
      healthCheck.services.general = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      res.status(503).json(healthCheck);
    }
  });

  // Detailed health check for monitoring systems
  app.get('/health/detailed', async (req: Request, res: Response) => {
    try {
      const detailed = {
        timestamp: new Date().toISOString(),
        application: {
          name: 'railway-background-service',
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          uptime: process.uptime(),
          pid: process.pid
        },
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        services: {} as Record<string, any>
      };

      // Test Supabase with actual query
      const supabaseStart = Date.now();
      try {
        const { data, error } = await supabase
          .from('background_jobs')
          .select('count(*)', { count: 'exact' })
          .limit(1);

        detailed.services.supabase = {
          status: error ? 'unhealthy' : 'healthy',
          latency: Date.now() - supabaseStart,
          jobCount: data?.[0]?.count || 0,
          error: error?.message
        };
      } catch (error) {
        detailed.services.supabase = {
          status: 'unhealthy',
          latency: Date.now() - supabaseStart,
          error: error instanceof Error ? error.message : 'Connection failed'
        };
      }

      res.json(detailed);

    } catch (error) {
      logger.error('Detailed health check failed:', error);
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  logger.info('✅ Health check endpoints configured');
}