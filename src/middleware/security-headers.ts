/**
 * Security Headers Middleware
 * Implements comprehensive security headers for API protection
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Generate a nonce for Content Security Policy
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  contentSecurityPolicy?: boolean | string;
  strictTransportSecurity?: boolean | string;
  xContentTypeOptions?: boolean;
  xFrameOptions?: string;
  xXssProtection?: boolean;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  crossOriginEmbedderPolicy?: string;
  crossOriginOpenerPolicy?: string;
  crossOriginResourcePolicy?: string;
}

/**
 * Default security headers configuration
 */
const defaultConfig: SecurityHeadersConfig = {
  contentSecurityPolicy: true,
  strictTransportSecurity: true,
  xContentTypeOptions: true,
  xFrameOptions: 'DENY',
  xXssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: 'geolocation=(), microphone=(), camera=()',
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin'
};

/**
 * Apply security headers middleware
 */
export function securityHeaders(config: SecurityHeadersConfig = {}) {
  const finalConfig = { ...defaultConfig, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Content-Security-Policy
    if (finalConfig.contentSecurityPolicy) {
      const nonce = generateNonce();
      (req as any).cspNonce = nonce;
      
      const csp = typeof finalConfig.contentSecurityPolicy === 'string'
        ? finalConfig.contentSecurityPolicy
        : [
            "default-src 'self'",
            `script-src 'self' 'nonce-${nonce}'`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests"
          ].join('; ');
      
      res.setHeader('Content-Security-Policy', csp);
    }
    
    // Strict-Transport-Security (HSTS)
    if (finalConfig.strictTransportSecurity) {
      const hsts = typeof finalConfig.strictTransportSecurity === 'string'
        ? finalConfig.strictTransportSecurity
        : 'max-age=31536000; includeSubDomains; preload';
      
      res.setHeader('Strict-Transport-Security', hsts);
    }
    
    // X-Content-Type-Options
    if (finalConfig.xContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // X-Frame-Options
    if (finalConfig.xFrameOptions) {
      res.setHeader('X-Frame-Options', finalConfig.xFrameOptions);
    }
    
    // X-XSS-Protection
    if (finalConfig.xXssProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    
    // Referrer-Policy
    if (finalConfig.referrerPolicy) {
      res.setHeader('Referrer-Policy', finalConfig.referrerPolicy);
    }
    
    // Permissions-Policy (formerly Feature-Policy)
    if (finalConfig.permissionsPolicy) {
      res.setHeader('Permissions-Policy', finalConfig.permissionsPolicy);
    }
    
    // Cross-Origin-Embedder-Policy
    if (finalConfig.crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', finalConfig.crossOriginEmbedderPolicy);
    }
    
    // Cross-Origin-Opener-Policy
    if (finalConfig.crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', finalConfig.crossOriginOpenerPolicy);
    }
    
    // Cross-Origin-Resource-Policy
    if (finalConfig.crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', finalConfig.crossOriginResourcePolicy);
    }
    
    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Add custom security headers
    res.setHeader('X-Content-Security-Policy', 'default-src \'self\'');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    
    next();
  };
}

/**
 * API-specific security headers
 * More restrictive for API endpoints
 */
export function apiSecurityHeaders() {
  return securityHeaders({
    contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
    xFrameOptions: 'DENY',
    crossOriginResourcePolicy: 'same-origin'
  });
}

/**
 * CORS security headers
 * Properly configure CORS with security in mind
 */
export function corsSecurityHeaders(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Correlation-Id');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
    }
    
    // Vary header for proper caching
    res.setHeader('Vary', 'Origin');
    
    next();
  };
}

/**
 * Cache control headers
 * Prevent sensitive data caching
 */
export function cacheControlHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // No caching for API responses by default
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Prevent caching of sensitive data
    if (req.path.includes('/auth') || 
        req.path.includes('/user') || 
        req.path.includes('/business')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
    
    next();
  };
}

/**
 * Security headers for file uploads
 */
export function uploadSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Restrict content types for uploads
    if (req.method === 'POST' && req.is('multipart/form-data')) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Download-Options', 'noopen');
      res.setHeader('Content-Disposition', 'attachment');
    }
    
    next();
  };
}

/**
 * Apply all recommended security headers
 */
export function applyAllSecurityHeaders(options: {
  allowedOrigins?: string[];
  enableHSTS?: boolean;
} = {}) {
  const { allowedOrigins = [], enableHSTS = true } = options;
  
  return [
    securityHeaders({ strictTransportSecurity: enableHSTS }),
    cacheControlHeaders(),
    uploadSecurityHeaders(),
    ...(allowedOrigins.length > 0 ? [corsSecurityHeaders(allowedOrigins)] : [])
  ];
}

/**
 * Development-friendly security headers
 * Less restrictive for local development
 */
export function developmentSecurityHeaders() {
  return securityHeaders({
    contentSecurityPolicy: false, // Disable CSP in development
    strictTransportSecurity: false, // No HSTS in development
    crossOriginEmbedderPolicy: 'unsafe-none',
    crossOriginOpenerPolicy: 'unsafe-none'
  });
}

/**
 * Production security headers
 * Maximum security for production environment
 */
export function productionSecurityHeaders() {
  return securityHeaders({
    contentSecurityPolicy: [
      "default-src 'none'",
      "script-src 'self'",
      "connect-src 'self'",
      "img-src 'self' https:",
      "style-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "upgrade-insecure-requests",
      "block-all-mixed-content"
    ].join('; '),
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    permissionsPolicy: [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()'
    ].join(', ')
  });
}