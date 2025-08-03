import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { initializeQueues } from './queues';
import { setupWebhooks } from './webhooks';
import { setupHealthCheck } from './health';
import { logger } from './utils/logger';
import { supabase } from './utils/supabase';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize the application
async function startServer() {
  try {
    logger.info('🚀 Starting Railway Background Service...');
    
    // Initialize job queues
    const queues = await initializeQueues();
    logger.info('✅ Job queues initialized');
    
    // Set up Bull Board for queue monitoring
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    
    createBullBoard({
      queues: Object.values(queues).map(queue => new BullAdapter(queue)),
      serverAdapter
    });
    
    app.use('/admin/queues', serverAdapter.getRouter());
    
    // Set up webhook endpoints
    setupWebhooks(app, queues);
    logger.info('✅ Webhook endpoints configured');
    
    // Set up health check
    setupHealthCheck(app);
    logger.info('✅ Health check endpoint configured');
    
    // Test Supabase connection
    const { data, error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      logger.error('❌ Supabase connection failed:', error);
      process.exit(1);
    }
    logger.info('✅ Supabase connection established');
    
    // Start the server
    app.listen(port, () => {
      logger.info(`🎯 Railway Background Service running on port ${port}`);
      logger.info(`📊 Queue monitoring available at http://localhost:${port}/admin/queues`);
      logger.info(`🏥 Health check available at http://localhost:${port}/health`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  logger.error('💥 Unhandled error during startup:', error);
  process.exit(1);
});