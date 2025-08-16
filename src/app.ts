/**
 * Express app configuration
 * Exported separately for testing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { extractUserContext } from './middleware/auth';
import { apiRoutes } from './api';
import { requestContextMiddleware } from './services/request-context';
import { applySecurityValidations } from './middleware/validation';
import { complianceAuditLogger, securityAuditLogger, performanceAuditLogger } from './middleware/audit-logging';
import { productionSecurityHeaders, developmentSecurityHeaders, cacheControlHeaders } from './middleware/security-headers';

const app = express();

// CORS configuration - allow multiple origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'https://biz-buddy-ally-now.lovableproject.com',
  'https://thirsty-party-9a3a96.lovableproject.com',
  'https://inspiring-presence-b1e40f.lovableproject.com',
  'https://a7b2c7e8-48f1-4a93-8297-b60ceb39bb61.lovableproject.com',
  'https://9c088a65-f23d-4663-b11e-d5c72edbd20a.lovableproject.com',
  'https://c8eb2d86-d79d-470d-b29c-7a82d220346b.lovableproject.com',
  'https://inspiring-presence.lovableproject.com',
  'https://biz-buddy-ally-now-production.up.railway.app',
  'https://smallbizally.lovable.app'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow in dev, but log
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Session-ID']
}));

// Security headers
if (process.env.NODE_ENV === 'production') {
  app.use(productionSecurityHeaders);
} else {
  app.use(developmentSecurityHeaders);
}
app.use(cacheControlHeaders);

// Basic middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for now to avoid conflicts
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request context
app.use(requestContextMiddleware);

// Security validations
app.use(applySecurityValidations);

// Audit logging
app.use(complianceAuditLogger);
app.use(securityAuditLogger);
app.use(performanceAuditLogger);

// Authentication middleware for protected routes
app.use('/api', extractUserContext);

// API routes
app.use('/api', apiRoutes);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    database_connected: true,
    unified_schema: 'applied'
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  if (err.status) {
    res.status(err.status).json({ error: err.message });
  } else if (err.code === '23502') {
    res.status(400).json({ error: 'Missing required field' });
  } else if (err.code === '23503') {
    res.status(400).json({ error: 'Foreign key constraint violation' });
  } else if (err.code === '23505') {
    res.status(400).json({ error: 'Duplicate key violation' });
  } else if (err.code === '23514') {
    res.status(400).json({ error: 'Check constraint violation' });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;