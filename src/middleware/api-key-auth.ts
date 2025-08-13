/**
 * API Key Authentication Middleware
 * Provides API key-based authentication for service-to-service communication
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { RequestContextService } from '../services/request-context';
import { getDatabaseService } from '../services/dependency-injection';
import { logger } from '../utils/logger';

/**
 * API Key structure
 */
interface ApiKey {
  id: string;
  key: string;
  name: string;
  businessId?: string;
  userId?: string;
  permissions: string[];
  rateLimit?: number;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

/**
 * API Key validation result
 */
interface ApiKeyValidation {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}

/**
 * Generate a secure API key
 */
export function generateApiKey(prefix: string = 'sk'): string {
  const randomBytes = crypto.randomBytes(32);
  const key = randomBytes.toString('base64url');
  return `${prefix}_${key}`;
}

/**
 * Hash API key for storage
 */
export function hashApiKey(key: string): string {
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * Validate API key format
 */
function isValidApiKeyFormat(key: string): boolean {
  // Format: prefix_base64urlString (e.g., sk_abc123...)
  const pattern = /^[a-z]+_[A-Za-z0-9_-]+$/;
  return pattern.test(key) && key.length >= 20;
}

/**
 * Extract API key from request
 */
function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const key = authHeader.substring(7);
    if (isValidApiKeyFormat(key)) {
      return key;
    }
  }
  
  // Check X-API-Key header
  const apiKeyHeader = req.get('x-api-key');
  if (apiKeyHeader && isValidApiKeyFormat(apiKeyHeader)) {
    return apiKeyHeader;
  }
  
  // Check query parameter (less secure, avoid in production)
  const queryKey = req.query.api_key || req.query.apiKey;
  if (queryKey && typeof queryKey === 'string' && isValidApiKeyFormat(queryKey)) {
    logger.warn('API key passed in query parameter - consider using headers instead');
    return queryKey;
  }
  
  return null;
}

/**
 * Validate API key against database
 */
async function validateApiKey(key: string): Promise<ApiKeyValidation> {
  try {
    const hashedKey = hashApiKey(key);
    const dbService = getDatabaseService();
    
    // TODO: Implement API key validation with database
    // For now, return invalid for all keys until database schema is updated
    
    // Query API keys table
    // const result = await dbService.query(
    //   `SELECT id, name, business_id, user_id, permissions, rate_limit, 
    //           expires_at, last_used_at, created_at, is_active, metadata
    //    FROM api_keys 
    //    WHERE key_hash = $1 AND is_active = true`,
    //   [hashedKey]
    // );
    
    // if (!result || result.length === 0) {
    //   return { valid: false, error: 'Invalid API key' };
    // }
    
    // const apiKeyData = result[0];
    
    // // Check expiration
    // if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    //   return { valid: false, error: 'API key expired' };
    // }
    
    // // Update last used timestamp
    // await dbService.query(
    //   'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    //   [apiKeyData.id]
    // );
    
    // const apiKey: ApiKey = {
    //   id: apiKeyData.id,
    //   key: key, // Store the original key for reference
    //   name: apiKeyData.name,
    //   businessId: apiKeyData.business_id,
    //   userId: apiKeyData.user_id,
    //   permissions: apiKeyData.permissions || [],
    //   rateLimit: apiKeyData.rate_limit,
    //   expiresAt: apiKeyData.expires_at,
    //   lastUsedAt: apiKeyData.last_used_at,
    //   createdAt: apiKeyData.created_at,
    //   isActive: apiKeyData.is_active,
    //   metadata: apiKeyData.metadata
    // };
    
    // return { valid: true, apiKey };
    
    return { valid: false, error: 'API key authentication not yet implemented' };
  } catch (error: any) {
    logger.error('API key validation error', error);
    return { valid: false, error: 'Failed to validate API key' };
  }
}

/**
 * Check if API key has required permission
 */
function hasPermission(apiKey: ApiKey, requiredPermission: string): boolean {
  // Check for wildcard permission
  if (apiKey.permissions.includes('*') || apiKey.permissions.includes('admin')) {
    return true;
  }
  
  // Check specific permission
  if (apiKey.permissions.includes(requiredPermission)) {
    return true;
  }
  
  // Check permission patterns (e.g., 'contexts:*' matches 'contexts:read')
  const permissionParts = requiredPermission.split(':');
  if (permissionParts.length > 1) {
    const wildcardPermission = `${permissionParts[0]}:*`;
    if (apiKey.permissions.includes(wildcardPermission)) {
      return true;
    }
  }
  
  return false;
}

/**
 * API Key authentication middleware
 */
export function requireApiKey(requiredPermission?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = extractApiKey(req);
    
    if (!apiKey) {
      RequestContextService.log('warn', 'Missing API key', {
        path: req.path,
        method: req.method
      });
      
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid API key',
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    const validation = await validateApiKey(apiKey);
    
    if (!validation.valid || !validation.apiKey) {
      RequestContextService.log('warn', 'Invalid API key', {
        error: validation.error,
        path: req.path
      });
      
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error || 'The provided API key is invalid',
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Check permission if required
    if (requiredPermission && !hasPermission(validation.apiKey, requiredPermission)) {
      RequestContextService.log('warn', 'Insufficient permissions', {
        apiKeyId: validation.apiKey.id,
        required: requiredPermission,
        permissions: validation.apiKey.permissions
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This operation requires the '${requiredPermission}' permission`,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Attach API key info to request
    (req as any).apiKey = validation.apiKey;
    (req as any).isApiKeyAuth = true;
    
    // Set context if business or user is associated
    if (validation.apiKey.businessId) {
      const context = RequestContextService.getContext();
      if (context) {
        context.businessId = validation.apiKey.businessId;
      }
    }
    
    if (validation.apiKey.userId) {
      (req as any).userId = validation.apiKey.userId;
    }
    
    RequestContextService.log('info', 'API key authenticated', {
      apiKeyId: validation.apiKey.id,
      name: validation.apiKey.name,
      businessId: validation.apiKey.businessId
    });
    
    next();
  };
}

/**
 * Optional API key authentication
 * Allows both JWT and API key authentication
 */
export function optionalApiKey() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = extractApiKey(req);
    
    if (!apiKey) {
      // No API key provided, continue without it
      return next();
    }
    
    const validation = await validateApiKey(apiKey);
    
    if (validation.valid && validation.apiKey) {
      // Valid API key found
      (req as any).apiKey = validation.apiKey;
      (req as any).isApiKeyAuth = true;
      
      if (validation.apiKey.businessId) {
        const context = RequestContextService.getContext();
        if (context) {
          context.businessId = validation.apiKey.businessId;
        }
      }
      
      if (validation.apiKey.userId) {
        (req as any).userId = validation.apiKey.userId;
      }
    }
    
    next();
  };
}

/**
 * Create API key table migration
 * This SQL should be added to the database migrations
 */
export const API_KEY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    rate_limit INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    
    -- Indexes
    INDEX idx_api_keys_key_hash (key_hash),
    INDEX idx_api_keys_business_id (business_id),
    INDEX idx_api_keys_user_id (user_id),
    INDEX idx_api_keys_is_active (is_active)
  );
  
  -- Add check constraint for valid permissions
  ALTER TABLE api_keys ADD CONSTRAINT valid_permissions 
    CHECK (permissions <@ ARRAY[
      'admin', '*',
      'contexts:read', 'contexts:write', 'contexts:delete', 'contexts:*',
      'businesses:read', 'businesses:write', 'businesses:delete', 'businesses:*',
      'events:read', 'events:write', 'events:*',
      'users:read', 'users:write', 'users:delete', 'users:*'
    ]::TEXT[]);
`;

/**
 * API Key management functions
 */
export class ApiKeyManager {
  /**
   * Create a new API key
   */
  static async createApiKey(options: {
    name: string;
    businessId?: string;
    userId?: string;
    permissions?: string[];
    expiresIn?: number; // Hours until expiration
    metadata?: Record<string, any>;
  }): Promise<{ key: string; id: string }> {
    const key = generateApiKey();
    const hashedKey = hashApiKey(key);
    const dbService = getDatabaseService();
    
    const expiresAt = options.expiresIn 
      ? new Date(Date.now() + options.expiresIn * 60 * 60 * 1000)
      : null;
    
    // TODO: Implement API key creation in database
    // const result = await dbService.query(
    //   `INSERT INTO api_keys 
    //    (key_hash, name, business_id, user_id, permissions, expires_at, metadata)
    //    VALUES ($1, $2, $3, $4, $5, $6, $7)
    //    RETURNING id`,
    //   [
    //     hashedKey,
    //     options.name,
    //     options.businessId,
    //     options.userId,
    //     options.permissions || [],
    //     expiresAt,
    //     options.metadata || {}
    //   ]
    // );
    
    const tempId = crypto.randomBytes(16).toString('hex');
    
    logger.info('API key created (mock)', {
      id: tempId,
      name: options.name,
      businessId: options.businessId
    });
    
    return { key, id: tempId };
  }
  
  /**
   * Revoke an API key
   */
  static async revokeApiKey(keyId: string): Promise<void> {
    const dbService = getDatabaseService();
    
    // TODO: Implement API key revocation in database
    // await dbService.query(
    //   'UPDATE api_keys SET is_active = false WHERE id = $1',
    //   [keyId]
    // );
    
    logger.info('API key revoked (mock)', { id: keyId });
  }
  
  /**
   * List API keys for a business
   */
  static async listApiKeys(businessId: string): Promise<ApiKey[]> {
    const dbService = getDatabaseService();
    
    // TODO: Implement API key listing from database
    // const result = await dbService.query(
    //   `SELECT id, name, permissions, rate_limit, expires_at, 
    //           last_used_at, created_at, is_active, metadata
    //    FROM api_keys 
    //    WHERE business_id = $1
    //    ORDER BY created_at DESC`,
    //   [businessId]
    // );
    
    // return result.map((row: any) => ({
    //   id: row.id,
    //   key: '[REDACTED]',
    //   name: row.name,
    //   businessId,
    //   permissions: row.permissions,
    //   rateLimit: row.rate_limit,
    //   expiresAt: row.expires_at,
    //   lastUsedAt: row.last_used_at,
    //   createdAt: row.created_at,
    //   isActive: row.is_active,
    //   metadata: row.metadata
    // }));
    
    // Return empty array for now
    return [];
  }
}