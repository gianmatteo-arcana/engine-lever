/**
 * Request Context Service
 * Provides request-scoped context for multi-tenant isolation
 * Replaces singleton patterns with proper dependency injection
 */

import { Request } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../utils/logger';

export interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  businessId?: string;
  userToken?: string;
  startTime: number;
  correlationId?: string;
}

/**
 * AsyncLocalStorage provides request-scoped storage
 * that persists across async operations
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Request Context Service
 * Manages request-scoped data for proper multi-tenant isolation
 */
export class RequestContextService {
  /**
   * Run a function with a request context
   */
  static run<T>(context: RequestContext, fn: () => T): T {
    return asyncLocalStorage.run(context, fn);
  }

  /**
   * Get the current request context
   */
  static getContext(): RequestContext | undefined {
    return asyncLocalStorage.getStore();
  }

  /**
   * Get a required context (throws if not found)
   */
  static getRequiredContext(): RequestContext {
    const context = asyncLocalStorage.getStore();
    if (!context) {
      throw new Error('No request context found. Ensure middleware is properly configured.');
    }
    return context;
  }

  /**
   * Create context from Express request
   */
  static createFromRequest(req: Request & { userId?: string; userToken?: string }): RequestContext {
    return {
      requestId: this.generateRequestId(),
      userId: req.userId,
      userToken: req.userToken,
      tenantId: req.headers['x-tenant-id'] as string,
      businessId: req.headers['x-business-id'] as string,
      correlationId: req.headers['x-correlation-id'] as string,
      startTime: Date.now()
    };
  }

  /**
   * Generate a unique request ID
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log with context
   */
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const context = this.getContext();
    logger[level](message, {
      ...data,
      requestId: context?.requestId,
      userId: context?.userId,
      tenantId: context?.tenantId,
      businessId: context?.businessId,
      duration: context ? Date.now() - context.startTime : undefined
    });
  }
}

/**
 * Express middleware to establish request context
 */
export function requestContextMiddleware() {
  return (req: Request & { userId?: string; userToken?: string }, res: any, next: any) => {
    const context = RequestContextService.createFromRequest(req);
    
    // Add request ID to response headers for tracing
    res.setHeader('X-Request-Id', context.requestId);
    
    // Run the rest of the request in context
    RequestContextService.run(context, () => {
      RequestContextService.log('info', 'Request started', {
        method: req.method,
        path: req.path,
        query: req.query
      });
      
      // Log when response finishes
      res.on('finish', () => {
        RequestContextService.log('info', 'Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode
        });
      });
      
      next();
    });
  };
}