import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiRoutes } from './api';
import { AgentManager } from './agents';
import { MCPServer } from './mcp-server';
import { QueueManager } from './queues';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// CORS configuration - allow multiple origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://raenkewzlvrdqufwxjpl.supabase.co',
  'https://lovable.dev',
  'https://c8eb2d86-d79d-470d-b29c-7a82d220346b.lovableproject.com'
];

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration with proper OPTIONS handling
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or is a Lovable subdomain/project
    if (allowedOrigins.includes(origin) || 
        origin.endsWith('.lovable.dev') ||
        origin.endsWith('.lovableproject.com') ||
        origin === process.env.FRONTEND_URL) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(null, false); // Changed to not throw error
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle preflight requests for all routes
app.options('*', cors());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      agents: AgentManager.isHealthy(),
      mcp: MCPServer.isHealthy(),
      queues: QueueManager.isHealthy()
    }
  });
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');
  
  try {
    // Stop accepting new requests
    server.close(async (err) => {
      if (err) {
        logger.error('Error during server shutdown:', err);
        process.exit(1);
      }
      
      // Shutdown services
      await AgentManager.stop();
      await MCPServer.stop();
      await QueueManager.stop();
      
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
async function startServer() {
  try {
    logger.info('🚀 Starting Biz Buddy Backend Services...');
    
    // Initialize core services
    await QueueManager.initialize();
    logger.info('✅ Queue Manager initialized');
    
    await MCPServer.initialize();
    logger.info('✅ MCP Server initialized');
    
    await AgentManager.initialize();
    logger.info('✅ Agent Manager initialized');
    
    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🌟 Biz Buddy Backend running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
      logger.info(`🤖 Agents: ${AgentManager.getAgentCount()} active`);
      logger.info(`🛠️ MCP Tools: ${MCPServer.getToolCount()} available`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app };