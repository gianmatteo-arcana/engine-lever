/**
 * Audit Logging Middleware
 * Tracks all API requests for compliance and security
 */

import { Request, Response, NextFunction } from 'express';
import { RequestContextService } from '../services/request-context';
import { getDatabaseService } from '../services/dependency-injection';
import { logger } from '../utils/logger';

/**
 * Audit log entry structure
 */
interface AuditLogEntry {
  id?: string;
  timestamp: string;
  requestId: string;
  userId?: string;
  businessId?: string;
  method: string;
  path: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  statusCode: number;
  responseTime: number;
  ipAddress: string;
  userAgent?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Sensitive fields to redact from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'ssn',
  'creditCard',
  'credit_card',
  'cvv',
  'pin'
];

/**
 * Paths that should always be audited
 */
const CRITICAL_PATHS = [
  '/api/v2/contexts',
  '/api/v2/businesses',
  '/api/auth',
  '/api/admin'
];

/**
 * Paths to exclude from audit logging
 */
const EXCLUDED_PATHS = [
  '/health',
  '/api/v2/health',
  '/metrics',
  '/favicon.ico'
];

/**
 * Redact sensitive information from objects
 */
function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const redacted: any = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();
      
      // Check if field is sensitive
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        redacted[key] = redactSensitiveData(obj[key]);
      } else {
        redacted[key] = obj[key];
      }
    }
  }
  
  return redacted;
}

/**
 * Determine if a path should be audited
 */
function shouldAuditPath(path: string): boolean {
  // Always exclude certain paths
  if (EXCLUDED_PATHS.some(excluded => path.startsWith(excluded))) {
    return false;
  }
  
  // Always include critical paths
  if (CRITICAL_PATHS.some(critical => path.startsWith(critical))) {
    return true;
  }
  
  // Include all authenticated endpoints
  if (path.startsWith('/api/')) {
    return true;
  }
  
  return false;
}

/**
 * Extract IP address from request
 */
function getIpAddress(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Audit logging middleware
 */
export function auditLogger(options: {
  enabled?: boolean;
  logToDatabase?: boolean;
  logToFile?: boolean;
  redactSensitive?: boolean;
} = {}) {
  const {
    enabled = true,
    logToDatabase = true,
    logToFile = true,
    redactSensitive = true
  } = options;
  
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!enabled || !shouldAuditPath(req.path)) {
      return next();
    }
    
    const startTime = Date.now();
    const context = RequestContextService.getContext();
    
    // Capture original end function
    const originalEnd = res.end;
    const originalJson = res.json;
    
    // Prepare audit entry
    const auditEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      requestId: context?.requestId || 'unknown',
      userId: (req as any).userId,
      businessId: context?.businessId,
      method: req.method,
      path: req.path,
      query: redactSensitive ? redactSensitiveData(req.query) : req.query,
      body: redactSensitive ? redactSensitiveData(req.body) : req.body,
      statusCode: 0,
      responseTime: 0,
      ipAddress: getIpAddress(req),
      userAgent: req.get('user-agent'),
      metadata: {
        correlationId: req.get('x-correlation-id'),
        apiVersion: (req as any).apiVersion || 'v2'
      }
    };
    
    // Intercept response
    res.json = function(body: any) {
      auditEntry.statusCode = res.statusCode;
      
      // Capture error if present
      if (res.statusCode >= 400 && body) {
        auditEntry.error = body.error || body.message || 'Unknown error';
      }
      
      return originalJson.call(this, body);
    };
    
    // Use response finish event instead of overriding end
    res.on('finish', () => {
      auditEntry.statusCode = res.statusCode;
      auditEntry.responseTime = Date.now() - startTime;
      
      // Log audit entry asynchronously
      logAuditEntry(auditEntry, { logToDatabase, logToFile }).catch(err => {
        logger.error('Failed to log audit entry', err);
      });
    });
    
    next();
  };
}

/**
 * Log audit entry to configured destinations
 */
async function logAuditEntry(
  entry: AuditLogEntry,
  options: { logToDatabase: boolean; logToFile: boolean }
) {
  const { logToDatabase, logToFile } = options;
  
  // Log to file/console
  if (logToFile) {
    const level = entry.statusCode >= 500 ? 'error' : 
                  entry.statusCode >= 400 ? 'warn' : 'info';
    
    logger.log(level, 'API Request', {
      audit: true,
      ...entry
    });
  }
  
  // Log to database
  if (logToDatabase) {
    try {
      const dbService = getDatabaseService();
      
      // Store in audit_logs table
      // TODO: Implement proper audit log storage
      // await dbService.query(
      //   `INSERT INTO audit_logs 
      //    (request_id, user_id, business_id, method, path, status_code, 
      //     response_time, ip_address, user_agent, error, metadata, created_at)
      //    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      //   [
      //     entry.requestId,
      //     entry.userId,
      //     entry.businessId,
      //     entry.method,
      //     entry.path,
      //     entry.statusCode,
      //     entry.responseTime,
      //     entry.ipAddress,
      //     entry.userAgent,
      //     entry.error,
      //     JSON.stringify(entry.metadata),
      //     entry.timestamp
      //   ]
      // );
    } catch (error) {
      logger.error('Failed to write audit log to database', error);
    }
  }
}

/**
 * Compliance-specific audit logger
 * Tracks sensitive operations for regulatory compliance
 */
export function complianceAuditLogger() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const context = RequestContextService.getContext();
    
    // Determine if this is a compliance-sensitive operation
    const isComplianceOperation = 
      req.path.includes('/contexts') ||
      req.path.includes('/businesses') ||
      req.path.includes('/auth') ||
      req.method === 'DELETE' ||
      req.method === 'PUT';
    
    if (!isComplianceOperation) {
      return next();
    }
    
    // Log compliance event
    RequestContextService.log('info', 'Compliance operation', {
      compliance: true,
      userId: (req as any).userId,
      operation: `${req.method} ${req.path}`,
      businessId: context?.businessId,
      metadata: {
        userAgent: req.get('user-agent'),
        ipAddress: getIpAddress(req),
        timestamp: new Date().toISOString()
      }
    });
    
    next();
  };
}

/**
 * Security audit logger
 * Tracks security-relevant events
 */
export function securityAuditLogger() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Track authentication failures
    if (req.path.includes('/auth') && res.statusCode === 401) {
      RequestContextService.log('warn', 'Authentication failure', {
        security: true,
        ipAddress: getIpAddress(req),
        userAgent: req.get('user-agent'),
        path: req.path
      });
    }
    
    // Track authorization failures
    if (res.statusCode === 403) {
      RequestContextService.log('warn', 'Authorization failure', {
        security: true,
        userId: (req as any).userId,
        ipAddress: getIpAddress(req),
        path: req.path,
        method: req.method
      });
    }
    
    // Track suspicious patterns
    const suspiciousPatterns = [
      '../',
      '<script',
      'javascript:',
      'DROP TABLE',
      'DELETE FROM',
      'INSERT INTO'
    ];
    
    const requestData = JSON.stringify({
      body: req.body,
      query: req.query,
      params: req.params
    });
    
    if (suspiciousPatterns.some(pattern => requestData.includes(pattern))) {
      RequestContextService.log('warn', 'Suspicious request pattern detected', {
        security: true,
        threat: 'potential_attack',
        ipAddress: getIpAddress(req),
        path: req.path,
        method: req.method
      });
    }
    
    next();
  };
}

/**
 * Performance audit logger
 * Tracks slow requests and performance issues
 */
export function performanceAuditLogger(thresholdMs: number = 1000) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Monitor response time
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      
      if (responseTime > thresholdMs) {
        RequestContextService.log('warn', 'Slow request detected', {
          performance: true,
          path: req.path,
          method: req.method,
          responseTime,
          threshold: thresholdMs
        });
      }
    });
    
    next();
  };
}

/**
 * Create audit log table migration
 * This SQL should be added to the database migrations
 */
export const AUDIT_LOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(255) NOT NULL,
    user_id UUID,
    business_id UUID,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    error TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for querying
    INDEX idx_audit_logs_user_id (user_id),
    INDEX idx_audit_logs_business_id (business_id),
    INDEX idx_audit_logs_created_at (created_at),
    INDEX idx_audit_logs_request_id (request_id),
    INDEX idx_audit_logs_status_code (status_code)
  );
  
  -- Partition by month for better performance
  -- ALTER TABLE audit_logs PARTITION BY RANGE (created_at);
`;