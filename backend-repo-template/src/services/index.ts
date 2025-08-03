import { logger } from '../utils/logger';
import { initializeSupabase } from './supabaseService';
import { initializeRedis } from './queueService';

export async function initializeServices(): Promise<void> {
  try {
    // Initialize Supabase connection
    await initializeSupabase();
    logger.info('✅ Supabase service initialized');
    
    // Initialize Redis (if configured)
    if (process.env.REDIS_URL) {
      await initializeRedis();
      logger.info('✅ Redis service initialized');
    } else {
      logger.warn('⚠️ Redis not configured, background jobs disabled');
    }
    
    logger.info('✅ All services initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    throw error;
  }
}