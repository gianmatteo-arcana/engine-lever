import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  userToken?: string; // JWT token for user-scoped Supabase client
}

/**
 * Middleware to extract user context from headers
 * Headers are set by the Supabase edge function backend-proxy
 * Simple extraction only - no validation
 */
export const extractUserContext = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Extract JWT token from Authorization header
  const authHeader = req.headers['authorization'] as string;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.userToken = authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  // Extract user context from headers (set by backend-proxy edge function OR direct calls)
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userRole = req.headers['x-user-role'] as string;

  // Also check for user_id in query params (for GET requests) or body (for POST/PUT/PATCH)
  const queryUserId = req.query.user_id as string;
  const bodyUserId = req.body?.user_id;

  // Use the most authoritative source (headers from edge function)
  req.userId = userId || queryUserId || bodyUserId || undefined;
  req.userEmail = userEmail;
  req.userRole = userRole;

  // Log the user context for debugging
  if (req.userId) {
    logger.info(`Request from user: ${req.userId} (${req.userEmail || 'no email'}) - Token: ${req.userToken ? 'present' : 'missing'}`);
  } else {
    logger.debug('Request without user context (likely health check or public endpoint)');
  }

  next();
};

/**
 * Middleware to require authentication
 * Simple check - let privileged API calls fail naturally if auth is invalid
 */
export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Check for JWT token (required for RLS)
  if (!req.userToken) {
    logger.warn(`Unauthorized request to ${req.path} - no JWT token`);
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must provide a valid JWT token to access this resource'
    });
  }

  // Check for user ID (should be provided by proxy or headers)
  if (!req.userId) {
    logger.warn(`Unauthorized request to ${req.path} - no user ID after header extraction`);
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    });
  }

  // Verify user ID format (should be a UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.userId)) {
    logger.warn(`Invalid user ID format: ${req.userId}`);
    return res.status(401).json({
      error: 'Invalid authentication',
      message: 'Invalid user ID format'
    });
  }

  // If we reach here, authentication looks valid
  // Let the database operations fail naturally if JWT is actually invalid
  next();
};