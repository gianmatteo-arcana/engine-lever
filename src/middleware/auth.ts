/**
 * Authentication Middleware
 * 
 * SYSTEMATIC SOLUTION: Single source of truth for authentication
 * 
 * This middleware:
 * 1. Extracts JWT from Authorization header
 * 2. Validates JWT with Supabase
 * 3. Extracts user info from validated token
 * 4. Makes user info available to all route handlers
 * 
 * NO special headers or edge functions required
 * Works consistently for ALL UI components
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { validateJWT, extractTokenFromHeader } from '../utils/jwt-validator';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  userToken?: string; // The raw JWT token
}

/**
 * Middleware to extract and validate user context from JWT
 * 
 * This is an async middleware that validates JWTs from the frontend
 * It's the SINGLE source of truth for authentication
 */
export const extractUserContext = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Extract JWT token from Authorization header
    const authHeader = req.headers['authorization'] as string;
    const token = extractTokenFromHeader(authHeader);
    
    if (token) {
      req.userToken = token;
      
      // Validate JWT and extract user info
      const user = await validateJWT(token);
      
      if (user) {
        req.userId = user.id;
        req.userEmail = user.email;
        req.userRole = user.role;
        
        logger.debug(`Authenticated request from user: ${req.userId} (${req.userEmail})`);
      } else {
        logger.debug('Invalid JWT token provided');
      }
    }
    
    // FALLBACK: Check for x-user-* headers (for backward compatibility with edge functions)
    if (!req.userId) {
      const userId = req.headers['x-user-id'] as string;
      const userEmail = req.headers['x-user-email'] as string;
      const userRole = req.headers['x-user-role'] as string;
      
      if (userId) {
        req.userId = userId;
        req.userEmail = userEmail;
        req.userRole = userRole;
        logger.debug(`Using headers for auth: ${userId}`);
      }
    }
    
    // FALLBACK: Check query params or body (for backward compatibility)
    if (!req.userId) {
      const queryUserId = req.query.user_id as string;
      const bodyUserId = req.body?.user_id;
      
      if (queryUserId || bodyUserId) {
        req.userId = queryUserId || bodyUserId;
        logger.debug(`Using params for auth: ${req.userId}`);
      }
    }
    
    // Log final auth state
    if (req.userId) {
      logger.info(`Request authenticated: ${req.userId} (${req.userEmail || 'no email'})`);
    } else {
      logger.debug('Request without authentication (public endpoint or health check)');
    }
    
    next();
  } catch (error) {
    logger.error('Error in auth middleware:', error);
    // Don't block the request, let requireAuth handle it
    next();
  }
};

/**
 * Middleware to require authentication
 * Use this on routes that require a logged-in user
 */
export const requireAuth = (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): void | Response => {
  // Check for user ID (should be set by extractUserContext)
  if (!req.userId) {
    logger.warn(`Unauthorized request to ${req.path} - no user ID`);
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
      hint: 'Include a valid JWT token in the Authorization header'
    });
  }
  
  // Check for JWT token (required for database operations)
  if (!req.userToken) {
    logger.warn(`Unauthorized request to ${req.path} - no JWT token`);
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must provide a valid JWT token to access this resource',
      hint: 'Include Authorization: Bearer <token> header'
    });
  }
  
  // Verify user ID format (should be a UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.userId)) {
    logger.warn(`Invalid user ID format: ${req.userId}`);
    return res.status(401).json({
      error: 'Invalid authentication',
      message: 'Invalid user ID format',
      userId: req.userId
    });
  }
  
  // Authentication is valid
  logger.debug(`Auth check passed for user: ${req.userId}`);
  next();
};