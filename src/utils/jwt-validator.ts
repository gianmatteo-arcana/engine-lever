/**
 * JWT Validation Utility
 * 
 * SYSTEMATIC SOLUTION for authentication between frontend and backend
 * This utility provides a single, reliable way to validate JWTs from the frontend
 * 
 * PRINCIPLES:
 * 1. Backend is the source of truth for authentication
 * 2. All auth goes through JWT validation
 * 3. No special headers or edge functions required
 * 4. Works consistently for all UI components
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

// Create a Supabase client for JWT validation
// This uses the anon key which is safe for JWT validation
let supabase: SupabaseClient | null = null;

// Initialize Supabase client if environment variables are available
function initSupabaseClient(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logger.warn('Supabase environment variables not configured - JWT validation disabled');
    logger.warn('Set SUPABASE_URL and SUPABASE_ANON_KEY to enable JWT validation');
    return null;
  }
  
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

export interface JWTUser {
  id: string;
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
}

/**
 * Validates a JWT token and extracts user information
 * 
 * @param token - The JWT token from the Authorization header
 * @returns User information if valid, null if invalid
 */
export async function validateJWT(token: string): Promise<JWTUser | null> {
  try {
    // E2E test mode - use basic JWT parsing without Supabase signature validation
    if (process.env.JEST_E2E_TEST === 'true') {
      logger.debug('E2E test mode - using basic JWT parsing');
      return parseJWTWithoutValidation(token);
    }
    
    // Initialize Supabase client if not already done
    if (!supabase) {
      supabase = initSupabaseClient();
    }
    
    // If Supabase is not configured, try basic JWT parsing
    if (!supabase) {
      logger.debug('Supabase not configured - attempting basic JWT parsing');
      return parseJWTWithoutValidation(token);
    }
    
    // Use Supabase's built-in JWT validation
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      logger.debug(`JWT validation failed: ${error.message}`);
      return null;
    }
    
    if (!user) {
      logger.debug('JWT validation failed: No user found');
      return null;
    }
    
    // Return standardized user info
    return {
      id: user.id,
      email: user.email,
      role: user.role || 'authenticated',
      aud: user.aud,
      // exp is not directly available from getUser, but token is valid
    };
  } catch (error) {
    logger.error('JWT validation error:', error);
    return null;
  }
}

/**
 * Parse JWT without validation (for development/testing only)
 * WARNING: This does NOT verify the signature and should only be used
 * when Supabase is not configured (e.g., local development)
 * 
 * @param token - The JWT token
 * @returns User information if parseable, null if not
 */
function parseJWTWithoutValidation(token: string): JWTUser | null {
  try {
    if (!isTokenWellFormed(token)) {
      return null;
    }
    
    // Decode the payload (middle part of JWT)
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Extract user information from common JWT claims
    return {
      id: payload.sub || payload.user_id || 'unknown',
      email: payload.email,
      role: payload.role || 'authenticated',
      aud: payload.aud,
      exp: payload.exp
    };
  } catch (error) {
    logger.debug('Failed to parse JWT without validation:', error);
    return null;
  }
}

/**
 * Extracts JWT token from Authorization header
 * 
 * @param authHeader - The Authorization header value
 * @returns The JWT token or null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Some clients might send just the token
  if (authHeader.length > 100) {
    return authHeader;
  }
  
  return null;
}

/**
 * Quick validation check without making a Supabase call
 * Just checks if the token looks valid (has the right structure)
 * 
 * @param token - The JWT token
 * @returns true if token looks valid
 */
export function isTokenWellFormed(token: string): boolean {
  if (!token) return false;
  
  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // Each part should be base64 encoded
  try {
    parts.forEach(part => {
      if (part.length === 0) throw new Error('Empty part');
    });
    return true;
  } catch {
    return false;
  }
}