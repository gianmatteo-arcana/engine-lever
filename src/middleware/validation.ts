/**
 * Request Validation Middleware
 * Validates and sanitizes all incoming requests
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { RequestContextService } from '../services/request-context';
import { InputValidator } from '../services/secure-database';
import { logger } from '../utils/logger';

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  // UUID validation
  uuid: z.string().refine(InputValidator.isValidUUID, 'Invalid UUID format'),
  
  // Business ID validation
  businessId: z.string().refine(InputValidator.isValidBusinessId, 'Invalid business ID format'),
  
  // Context ID validation
  contextId: z.string().refine(InputValidator.isValidContextId, 'Invalid context ID format'),
  
  // Email validation
  email: z.string().email().max(255),
  
  // Pagination
  pagination: z.object({
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0)
  }),
  
  // Sort order
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  
  // Priority levels
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  
  // Status values
  status: z.enum(['pending', 'active', 'in_progress', 'completed', 'failed', 'cancelled']),
  
  // Template IDs
  templateId: z.enum([
    'onboarding',
    'soi-filing',
    'business-registration',
    'tax-filing',
    'insurance-renewal',
    'compliance-check'
  ]),
  
  // Metadata (sanitized JSON)
  metadata: z.record(z.any()).transform(data => InputValidator.sanitizeJSON(data)),
  
  // Date/time
  datetime: z.string().datetime(),
  
  // Safe string (sanitized)
  safeString: z.string().transform(str => InputValidator.sanitizeString(str))
};

/**
 * Request validation middleware factory
 */
export function validateRequest(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      if (req.body && Object.keys(req.body).length > 0) {
        req.body = await schema.parseAsync(req.body);
      }
      
      RequestContextService.log('info', 'Request validation passed', {
        path: req.path,
        method: req.method
      });
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        RequestContextService.log('warn', 'Request validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid request data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          })),
          requestId: RequestContextService.getContext()?.requestId
        });
      }
      
      // Unexpected error
      RequestContextService.log('error', 'Validation middleware error', { error });
      next(error);
    }
  };
}

/**
 * Query parameter validation middleware
 */
export function validateQuery(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        RequestContextService.log('warn', 'Query validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          })),
          requestId: RequestContextService.getContext()?.requestId
        });
      }
      
      next(error);
    }
  };
}

/**
 * Path parameter validation middleware
 */
export function validateParams(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        RequestContextService.log('warn', 'Path parameter validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        return res.status(400).json({
          error: 'Invalid path parameters',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          })),
          requestId: RequestContextService.getContext()?.requestId
        });
      }
      
      next(error);
    }
  };
}

/**
 * Headers validation middleware
 */
export function validateHeaders(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedHeaders = await schema.parseAsync(req.headers);
      
      // Merge validated headers back
      Object.assign(req.headers, validatedHeaders);
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        RequestContextService.log('warn', 'Header validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        return res.status(400).json({
          error: 'Invalid request headers',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          })),
          requestId: RequestContextService.getContext()?.requestId
        });
      }
      
      next(error);
    }
  };
}

/**
 * Content type validation middleware
 */
export function requireContentType(contentType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestContentType = req.get('content-type');
    
    if (!requestContentType || !requestContentType.includes(contentType)) {
      RequestContextService.log('warn', 'Invalid content type', {
        expected: contentType,
        received: requestContentType
      });
      
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be ${contentType}`,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    next();
  };
}

/**
 * Request size validation middleware
 */
export function limitRequestSize(maxSizeBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);
    
    if (contentLength > maxSizeBytes) {
      RequestContextService.log('warn', 'Request too large', {
        size: contentLength,
        maxSize: maxSizeBytes
      });
      
      return res.status(413).json({
        error: 'Payload Too Large',
        message: `Request body must not exceed ${maxSizeBytes} bytes`,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    next();
  };
}

/**
 * XSS protection middleware
 * Sanitizes common XSS vectors in request data
 */
export function xssProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    next();
  };
}

/**
 * Recursively sanitize object to prevent XSS
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return InputValidator.sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitize key and value
        const sanitizedKey = InputValidator.sanitizeString(key, 100);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * API versioning validation
 */
export function requireApiVersion(supportedVersions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = req.get('api-version') || req.query.v || 'v2';
    
    if (!supportedVersions.includes(version as string)) {
      return res.status(400).json({
        error: 'Unsupported API Version',
        message: `API version ${version} is not supported`,
        supportedVersions,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Store version in request for later use
    (req as any).apiVersion = version;
    
    next();
  };
}

/**
 * Combined validation middleware for common patterns
 */
export const validators = {
  // Context creation validation
  createContext: [
    requireContentType('application/json'),
    limitRequestSize(1024 * 1024), // 1MB
    validateRequest(z.object({
      businessId: CommonSchemas.businessId,
      templateId: CommonSchemas.templateId,
      metadata: CommonSchemas.metadata.optional(),
      priority: CommonSchemas.priority.optional(),
      deadline: CommonSchemas.datetime.optional()
    }))
  ],
  
  // Context query validation
  queryContexts: [
    validateQuery(z.object({
      businessId: CommonSchemas.businessId.optional(),
      status: CommonSchemas.status.optional(),
      templateId: CommonSchemas.templateId.optional(),
      limit: z.coerce.number().min(1).max(100).optional(),
      offset: z.coerce.number().min(0).optional(),
      orderBy: z.enum(['created_at', 'updated_at', 'status']).optional(),
      order: CommonSchemas.sortOrder.optional()
    }))
  ],
  
  // Context ID in path
  contextId: [
    validateParams(z.object({
      contextId: CommonSchemas.contextId
    }))
  ],
  
  // Business ID in path
  businessId: [
    validateParams(z.object({
      businessId: CommonSchemas.businessId
    }))
  ],
  
  // Event creation validation
  createEvent: [
    requireContentType('application/json'),
    limitRequestSize(512 * 1024), // 512KB
    validateRequest(z.object({
      operation: z.string().min(1).max(100),
      actor: z.string().min(1).max(255),
      data: z.record(z.any()).optional(),
      metadata: CommonSchemas.metadata.optional()
    }))
  ]
};

/**
 * Apply default security validations to all routes
 */
export function applySecurityValidations() {
  return [
    xssProtection(),
    limitRequestSize(10 * 1024 * 1024) // 10MB default max
  ];
}