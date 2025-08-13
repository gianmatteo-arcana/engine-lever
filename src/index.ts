import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { logger } from './utils/logger';
import { extractUserContext } from './middleware/auth';
import { apiRoutes } from './api';
import { AgentManager } from './agents';
import { persistentAgentManager } from './agents/PersistentAgentManager';
import { MCPServer } from './mcp-server';
import { QueueManager } from './queues';
import { initializeTaskEvents } from './services/task-events';
import { requestContextMiddleware } from './services/request-context';
import { initializeServices } from './services/dependency-injection';
import { applySecurityValidations } from './middleware/validation';
import { complianceAuditLogger, securityAuditLogger, performanceAuditLogger } from './middleware/audit-logging';
import { productionSecurityHeaders, developmentSecurityHeaders, cacheControlHeaders } from './middleware/security-headers';

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

// Apply environment-specific security headers
if (process.env.NODE_ENV === 'production') {
  app.use(productionSecurityHeaders());
} else {
  app.use(developmentSecurityHeaders());
}

// Cache control headers
app.use(cacheControlHeaders());

// Request context middleware - MUST be early in the chain
app.use(requestContextMiddleware());

// Apply global security validations
app.use(applySecurityValidations());

// Audit logging
app.use(complianceAuditLogger());
app.use(securityAuditLogger());
app.use(performanceAuditLogger(500)); // Log requests over 500ms

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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey', 'X-User-Id', 'X-User-Email', 'X-User-Role', 'X-User-Token'],
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

// Extract user context from headers (set by backend-proxy edge function)
// This runs for ALL requests to extract user info if present
app.use(extractUserContext);

// Health check endpoint (no auth required)
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
app.use('/api', apiRoutes); // v1 - legacy routes

// API v2 - Clean architecture with universal endpoints
import { apiV2Routes } from './api/v2';
app.use('/api/v2', apiV2Routes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Error:', err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

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
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        await persistentAgentManager.stop();
      }
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
    
    // Initialize dependency injection container
    initializeServices();
    logger.info('✅ Dependency injection container initialized');
    
    // Initialize task events service
    initializeTaskEvents();
    logger.info('✅ Task Events service initialized');
    
    // Initialize core services
    await QueueManager.initialize();
    logger.info('✅ Queue Manager initialized');
    
    await MCPServer.initialize();
    logger.info('✅ MCP Server initialized');
    
    await AgentManager.initialize();
    logger.info('✅ Agent Manager initialized');
    
    // Initialize Persistent Agent Manager if Supabase is configured
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      await persistentAgentManager.initialize();
      logger.info('✅ Persistent Agent Manager initialized');
    } else {
      logger.warn('⚠️ Supabase not configured - using in-memory agent manager only');
    }
    
    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🌟 Biz Buddy Backend running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
      logger.info(`🤖 Agents: ${AgentManager.getAgentCount()} active`);
      logger.info(`🛠️ MCP Tools: ${MCPServer.getToolCount()} available`);
      logger.info(`🚀 Version: 1.0.1 - DevOps test ${new Date().toISOString()}`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app };