import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { createClient } from '@supabase/supabase-js';

/**
 * Extended Request interface to include user context
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  userToken?: string; // JWT token for user-scoped Supabase client
}

/**
 * Helper function to decode JWT token and extract user information
 */
async function validateJWTToken(token: string): Promise<{ userId?: string; userEmail?: string; userRole?: string } | null> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error('Missing Supabase configuration for JWT validation');
      return null;
    }

    // Create Supabase client for JWT validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Validate the token by making a request with it
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      logger.warn('Invalid JWT token', { error: error?.message });
      return null;
    }

    return {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role || 'authenticated'
    };
  } catch (error) {
    logger.error('JWT validation error', error);
    return null;
  }
}

/**
 * Middleware to extract and validate user context from headers or JWT token
 * Headers are set by the Supabase edge function backend-proxy
 * If no headers, tries to decode JWT token directly
 */
export const extractUserContext = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Extract JWT token from Authorization header
  const authHeader = req.headers['authorization'] as string;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.userToken = authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  // Extract user context from headers (set by backend-proxy edge function)
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

  // If no user context from headers but we have a JWT token, decode it asynchronously
  if (!req.userId && req.userToken) {
    logger.debug('No user context in headers, attempting JWT token validation');
    validateJWTToken(req.userToken)
      .then(jwtResult => {
        if (jwtResult) {
          req.userId = jwtResult.userId;
          req.userEmail = jwtResult.userEmail;
          req.userRole = jwtResult.userRole;
          logger.info('JWT token validated successfully', { userId: req.userId, email: req.userEmail });
        }
        proceedWithRequest();
      })
      .catch(error => {
        logger.error('JWT validation failed', error);
        proceedWithRequest();
      });
  } else {
    proceedWithRequest();
  }

  function proceedWithRequest() {
    // Log the user context for debugging
    if (req.userId) {
      logger.info(`Request from user: ${req.userId} (${req.userEmail || 'no email'}) - Token: ${req.userToken ? 'present' : 'missing'}`);
    } else {
      logger.debug('Request without user context (likely health check or public endpoint)');
    }

    next();
  }
};

/**
 * Async version of extractUserContext for routes that need async JWT validation
 */
export const extractUserContextAsync = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Extract JWT token from Authorization header
  const authHeader = req.headers['authorization'] as string;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.userToken = authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  // Extract user context from headers (set by backend-proxy edge function)
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

  // If no user context from headers but we have a JWT token, decode it
  if (!req.userId && req.userToken) {
    logger.debug('No user context in headers, attempting JWT token validation');
    const jwtResult = await validateJWTToken(req.userToken);
    if (jwtResult) {
      req.userId = jwtResult.userId;
      req.userEmail = jwtResult.userEmail;
      req.userRole = jwtResult.userRole;
      logger.info('JWT token validated successfully', { userId: req.userId, email: req.userEmail });
    }
  }

  // Log the user context for debugging
  if (req.userId) {
    logger.info(`Request from user: ${req.userId} (${req.userEmail || 'no email'}) - Token: ${req.userToken ? 'present' : 'missing'}`);
  } else {
    logger.debug('Request without user context (likely health check or public endpoint)');
  }

  next();
};

/**
 * Middleware to require authentication for protected endpoints
 * Handles JWT token validation if user context is not already set
 */
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Check for JWT token (required for RLS)
  if (!req.userToken) {
    logger.warn(`Unauthorized request to ${req.path} - no JWT token`);
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must provide a valid JWT token to access this resource'
    });
  }

  // If we don't have userId yet, try to validate JWT token
  if (!req.userId) {
    logger.debug('No user ID in request, attempting JWT validation');
    try {
      const jwtResult = await validateJWTToken(req.userToken);
      if (jwtResult) {
        req.userId = jwtResult.userId;
        req.userEmail = jwtResult.userEmail;
        req.userRole = jwtResult.userRole;
        logger.info('JWT token validated in requireAuth', { userId: req.userId, email: req.userEmail });
      }
    } catch (error) {
      logger.error('JWT validation failed in requireAuth', error);
    }
  }

  if (!req.userId) {
    logger.warn(`Unauthorized request to ${req.path} - no user ID after JWT validation`);
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

  next();
};

/**
 * Middleware to optionally extract user context without requiring it
 * Used for endpoints that can work with or without authentication
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  extractUserContext(req, res, next);
};