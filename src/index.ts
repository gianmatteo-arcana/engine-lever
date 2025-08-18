import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { logger } from './utils/logger';
import { extractUserContext } from './middleware/auth';
import { apiRoutes } from './api';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
// AgentManager removed - using pure A2A protocol with OrchestratorAgent
import { MCPServer } from './mcp-server';
import { QueueManager } from './queues';
import { initializeTaskEvents } from './services/task-events';
import { requestContextMiddleware } from './services/request-context';
import { initializeServices } from './services/dependency-injection';
import { applySecurityValidations } from './middleware/validation';
import { complianceAuditLogger, securityAuditLogger, performanceAuditLogger } from './middleware/audit-logging';
import { getEventListener } from './services/event-listener';
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
app.get('/health', async (req, res) => {
  try {
    const orchestrator = OrchestratorAgent.getInstance();
    const agentSystemHealthy = orchestrator.isSystemHealthy();
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        agents: agentSystemHealthy,
        mcp: MCPServer.isHealthy(),
        queues: QueueManager.isHealthy()
      }
    });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Agent system unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api', apiRoutes); // Main API routes

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
      const orchestrator = OrchestratorAgent.getInstance();
      await orchestrator.shutdownSystem();
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        // Stop Event Listener
        try {
          const eventListener = getEventListener();
          await eventListener.stopListening();
          logger.info('✅ Event Listener stopped');
        } catch (error) {
          logger.error('Error stopping Event Listener', error);
        }
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

/**
 * 🚀 SERVER STARTUP SEQUENCE
 * 
 * This is the main entry point for the Biz Buddy Backend service.
 * The startup sequence is CRITICAL and order-dependent:
 * 
 * 1. Environment Validation - Check all required env vars
 * 2. Core Services - Initialize DI, events, queues, MCP
 * 3. Agent System - Create OrchestratorAgent (requires Supabase!)
 * 4. HTTP Server - Start Express server
 * 
 * COMMON FAILURES:
 * - Missing SUPABASE_* vars → CredentialVault fails
 * - Missing API keys → LLMProvider warns but continues
 * - Config files missing → BaseAgent fails to load
 * 
 * See STARTUP_SEQUENCE.md for complete documentation
 * 
 * NOTE: The punycode deprecation warning is from ESLint dependencies
 * and can be safely ignored. It will be fixed when ESLint updates.
 */
async function startServer() {
  try {
    // STEP 1: ENVIRONMENT VALIDATION
    // Basic check for critical configuration - detailed validation happens in CredentialVault
    const configErrors = [];
    
    // Check if Supabase URL exists (detailed validation in CredentialVault)
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    if (!supabaseUrl) {
      configErrors.push({
        key: 'SUPABASE_URL',
        issue: 'MISSING',
        fix: 'https://raenkewzlvrdqufwxjpl.supabase.co'
      });
    }
    
    // Check if Supabase Service Key exists (detailed validation in CredentialVault)
    const supabaseKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
    if (!supabaseKey) {
      configErrors.push({
        key: 'SUPABASE_SERVICE_KEY',
        issue: 'MISSING',
        fix: 'Get from Supabase Dashboard > Settings > API > service_role'
      });
    }
    
    // Validate API Keys (basic existence check)
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!anthropicKey) {
      configErrors.push({
        key: 'ANTHROPIC_API_KEY',
        issue: 'MISSING',
        fix: 'Get from https://console.anthropic.com/settings/keys'
      });
    }
    
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (!openaiKey) {
      configErrors.push({
        key: 'OPENAI_API_KEY',
        issue: 'MISSING', 
        fix: 'Get from https://platform.openai.com/api-keys'
      });
    }
    
    if (configErrors.length > 0) {
      console.error(`
╔══════════════════════════════════════════════════════════════════════╗
║                  🚨 RAILWAY DEPLOYMENT FAILED 🚨                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  Configuration problems detected:                                     ║
║                                                                        ║`);
      
      configErrors.forEach(({ key, issue }) => {
        console.error(`║  ❌ ${key.padEnd(25)} │ ${issue.padEnd(40)}║`);
      });
      
      console.error(`║                                                                        ║
╠══════════════════════════════════════════════════════════════════════╣
║                    📋 HOW TO FIX IN RAILWAY:                          ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  1. Open Railway Dashboard: https://railway.app/dashboard             ║
║  2. Click on your project: "secure-insight"                           ║
║  3. Click on service: "biz-buddy-backend"                            ║
║  4. Go to "Variables" tab                                            ║
║  5. Fix these variables:                                             ║
║                                                                        ║`);
      
      configErrors.forEach(({ key, fix }, index) => {
        console.error(`║  ${index + 1}. ${key}:`);
        console.error(`║     ${fix.padEnd(65)}║`);
      });
      
      console.error(`║                                                                        ║
║  6. Click "Deploy" to apply changes                                  ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════╣
║  📚 Documentation:                                                     ║
║  - Supabase: https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/settings/api
║  - Anthropic: https://console.anthropic.com                          ║
║  - OpenAI: https://platform.openai.com                               ║
╚══════════════════════════════════════════════════════════════════════╝
`);
      
      // Exit with clear error
      process.exit(1);
    }
    
    // If we get here, all required vars are set
    console.log('✅ All required environment variables are configured');
    
    logger.info('🚀 Starting Biz Buddy Backend Services...');
    
    // Initialize dependency injection container
    initializeServices();
    logger.info('✅ Dependency injection container initialized');
    
    // Initialize agent DI registry for task-scoped agent creation
    const { AgentDIRegistry } = await import('./services/agent-di-registry');
    await AgentDIRegistry.initialize();
    logger.info('✅ Agent DI Registry initialized - agents ready for task-scoped creation');
    
    // Initialize task events service
    initializeTaskEvents();
    logger.info('✅ Task Events service initialized');
    
    // Initialize core services
    await QueueManager.initialize();
    logger.info('✅ Queue Manager initialized');
    
    await MCPServer.initialize();
    logger.info('✅ MCP Server initialized');
    
    // Initialize OrchestratorAgent (pure A2A system)
    const orchestrator = OrchestratorAgent.getInstance();
    await orchestrator.initializeAgentSystem();
    logger.info('✅ Pure A2A Agent System initialized');
    
    // Initialize Event System if Supabase is configured
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      // Pure A2A system - no persistent agent manager needed
      logger.info('✅ A2A Event System ready');
      
      // Start Event Listener for system events
      try {
        const eventListener = getEventListener();
        await eventListener.startListening();
        logger.info('✅ Event Listener started - listening for system events');
      } catch (error) {
        logger.error('Failed to start Event Listener', error);
        // Non-critical - continue startup even if listener fails
      }
    } else {
      logger.warn('⚠️ Supabase not configured - A2A system running without persistence');
    }
    
    // Start HTTP server
    server.listen(PORT, async () => {
      logger.info(`🌟 Biz Buddy Backend running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
      
      try {
        // Get agent count from OrchestratorAgent
        const agentCapabilities = await orchestrator.getDiscoveredCapabilities();
        logger.info(`🤖 Agents: ${agentCapabilities.length} discovered via A2A`);
      } catch (error) {
        logger.warn(`🤖 Agents: Could not get count - ${error}`);
      }
      
      logger.info(`🛠️ MCP Tools: ${MCPServer.getToolCount()} available`);
      logger.info(`🚀 Pure A2A Agent System ready to serve requests!`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app };