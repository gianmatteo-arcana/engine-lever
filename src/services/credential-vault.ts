/**
 * Credential Vault - EXACTLY as PRD specifies
 * Lines 1334-1385 of Engine PRD
 * 
 * Secure storage for tenant credentials
 * 
 * PRODUCTION BEHAVIOR:
 * - ENCRYPTION_KEY is optional at startup (warns if missing)
 * - Runtime operations REQUIRE ENCRYPTION_KEY in production
 * - Any store/get/delete operation will FAIL with clear error if key missing
 * - Must be 64 hexadecimal characters (32 bytes for AES-256)
 * - Generate with: openssl rand -hex 32
 * 
 * MVP IMPLEMENTATION:
 * - Service starts even without ENCRYPTION_KEY (for MVP flexibility)
 * - Operations fail with actionable error messages
 * - Development uses default key for convenience
 * - Production requires explicit key for actual operations
 * 
 * TODO: POST-MVP SECURITY IMPROVEMENTS:
 * - [ ] CRITICAL: Implement per-tenant encryption keys (derived from master)
 * - [ ] CRITICAL: Add AWS KMS or similar for key management
 * - [ ] IMPORTANT: Add key rotation mechanism
 * - [ ] IMPORTANT: Implement envelope encryption pattern
 * - [ ] NICE: Add support for Hardware Security Modules (HSM)
 * - [ ] NICE: Implement credential versioning for rollback
 * - [ ] NICE: Add support for temporary credentials with expiration
 * 
 * SECURITY CONSIDERATIONS:
 * - Current implementation uses one key for all tenants (acceptable for MVP)
 * - Production should migrate to per-tenant keys or KMS
 * - Encryption key should be rotated periodically
 * - Consider using database-native encryption (pgcrypto) as alternative
 */

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

/**
 * Credential Vault for secure credential storage
 * Exactly matches PRD lines 1334-1385
 */
export class CredentialVault {
  private supabase: any;
  private encryptionKey: string;
  private encryptionKeyMissing: boolean = false; // Track if key is missing in production
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // TODO: Add these properties for future enhancements
  // private keyVersion: number = 1;
  // private rateLimiter: RateLimiter;
  // private metricsCollector: MetricsCollector;
  
  constructor() {
    // Get configuration - check multiple possible env var names
    const supabaseUrl = process.env.SUPABASE_URL?.trim() || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 
                       process.env.REACT_APP_SUPABASE_URL?.trim();
    
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || 
                        process.env.SUPABASE_SERVICE_KEY || 
                        process.env.SUPABASE_ANON_KEY ||
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                        process.env.REACT_APP_SUPABASE_ANON_KEY)?.trim();
    
    // Validate configuration - FAIL HARD if not configured
    const errors = [];
    
    // Check URL
    if (!supabaseUrl) {
      errors.push('SUPABASE_URL is not set (checked: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, REACT_APP_SUPABASE_URL)');
    } else if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
      errors.push(`SUPABASE_URL is invalid: "${supabaseUrl}"`);
    }
    
    // Check Key - MUST be valid
    if (!supabaseKey) {
      errors.push('No Supabase key found (checked: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY)');
    } else if (supabaseKey.length < 30) {
      errors.push(`SUPABASE_SERVICE_KEY is too short (${supabaseKey.length} chars) - likely invalid`);
    } else if (supabaseKey.includes('[') || supabaseKey.includes('Get from')) {
      errors.push('SUPABASE_SERVICE_KEY contains placeholder text - not a real key');
    }
    
    if (errors.length > 0) {
      // FAIL HARD with clear error message
      console.error(`
========================================
🚨 CREDENTIAL VAULT INITIALIZATION FAILED 🚨
========================================
Cannot connect to Supabase. Configuration problems:

${errors.map(e => `  ❌ ${e}`).join('\n')}

To fix this in Railway:
1. Go to your Railway project dashboard
2. Click on the biz-buddy-backend service
3. Go to the Variables tab
4. Add/fix these variables:

   SUPABASE_URL=https://raenkewzlvrdqufwxjpl.supabase.co
   SUPABASE_SERVICE_KEY=[Get from Supabase Dashboard > Settings > API > service_role]

The service_role key:
- Starts with "eyJ" (JWT format)
- Is a long string (200+ characters)
- Never expires (perfect for backend services)
- Has full database access

DO NOT use the anon/public key - it has RLS restrictions.

This is required for:
- Storing encrypted credentials
- Managing tenant secrets
- Database connections
========================================
`);
      throw new Error(`CredentialVault initialization failed: ${errors.join(', ')}`);
    }
    
    // Create Supabase client
    this.supabase = createClient(supabaseUrl!, supabaseKey!);
    // MVP Approach: Simple, predictable encryption key handling
    // TODO: Migrate to per-tenant keys or KMS post-MVP
    
    // Get encryption key from environment or use defaults
    const envKey = process.env.ENCRYPTION_KEY;
    
    if (!envKey) {
      // No key provided - handle based on environment
      if (process.env.NODE_ENV === 'production') {
        // Production: WARN at startup, but will ERROR on actual use
        this.encryptionKeyMissing = true;
        // Set a dummy key so initialization doesn't fail
        this.encryptionKey = 'missing-key-will-error-on-use'.padEnd(64, '0');
        
        console.warn(`
========================================
⚠️  ENCRYPTION KEY WARNING ⚠️
========================================
ENCRYPTION_KEY is not configured in production.

The CredentialVault will initialize, but ANY attempt to store or
retrieve credentials will FAIL with an error.

If you're not using credential storage features yet, you can ignore this.

To enable credential storage, add ENCRYPTION_KEY to Railway:

1. Generate a secure 64-character hex key:
   openssl rand -hex 32

2. Add to Railway environment variables:
   ENCRYPTION_KEY=[your-64-char-hex-key]

Example:
   ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
========================================
`);
      } else {
        // Development/test: Use consistent default for predictability
        this.encryptionKey = 'development-key-do-not-use-in-prod'.padEnd(64, '0');
        console.log('📝 Using development encryption key (not for production)');
      }
    } else {
      // Key provided - validate and use it
      if (envKey.length === 64 && /^[0-9a-f]+$/i.test(envKey)) {
        // Valid 64-char hex key
        this.encryptionKey = envKey;
        console.log('✅ Using provided ENCRYPTION_KEY');
      } else if (envKey.length >= 32) {
        // Key is long enough but not hex - hash it to get valid hex
        this.encryptionKey = crypto
          .createHash('sha256')
          .update(envKey)
          .digest('hex');
        console.warn('⚠️ ENCRYPTION_KEY was not hex format - hashed to create valid key');
      } else {
        // Key too short - pad it (MVP compatibility)
        this.encryptionKey = envKey.padEnd(64, '0');
        console.warn(`⚠️ ENCRYPTION_KEY too short (${envKey.length} chars) - padded to 64`);
      }
    }
    
    // TODO: Post-MVP improvements:
    // 1. Derive per-tenant keys: pbkdf2(masterKey, `tenant:${tenantId}`, 100000, 32, 'sha256')
    // 2. Store key version with encrypted data for rotation support
    // 3. Implement key rotation mechanism
    // 4. Consider AWS KMS or similar for key management
  }
  
  /**
   * Store encrypted credentials for a tenant
   * PRD lines 1337-1352
   * 
   * TODO: Enhancements needed:
   * - [ ] Add credential format validation per service type
   * - [ ] Implement credential strength checking
   * - [ ] Add support for credential metadata (created by, purpose, etc.)
   * - [ ] Implement credential change history
   */
  async store(
    tenantId: string,
    service: string,
    credentials: any
  ): Promise<void> {
    // Check if encryption key is properly configured
    if (this.encryptionKeyMissing) {
      throw new Error(`
ENCRYPTION_KEY not configured in production.
Cannot store credentials without proper encryption.

To fix:
1. Generate key: openssl rand -hex 32
2. Add to Railway: ENCRYPTION_KEY=[your-64-char-hex-key]
3. Restart the service

This is required for storing third-party API credentials securely.
`);
    }
    
    // Validate inputs
    if (!tenantId || typeof tenantId !== 'string') {
      throw new Error('Valid tenant ID is required');
    }
    if (!service || typeof service !== 'string') {
      throw new Error('Valid service name is required');
    }
    if (!credentials || typeof credentials !== 'object') {
      throw new Error('Valid credentials object is required');
    }
    
    // TODO: Add service-specific credential validation
    // Example: if (service === 'stripe') validateStripeCredentials(credentials);
    
    const encrypted = await this.encrypt(credentials);
    
    const { error } = await this.supabase
      .from('tenant_credentials')
      .upsert({
        credential_id: this.generateId(),
        tenant_id: tenantId,
        service_name: service,
        encrypted_credentials: encrypted,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'tenant_id,service_name'
      });
    
    if (error) {
      throw new Error(`Failed to store credentials: ${error.message}`);
    }
    
    // Create audit trail
    await this.createAuditTrail('store', tenantId, service);
  }
  
  /**
   * Retrieve decrypted credentials for a tenant
   * PRD lines 1354-1369
   * 
   * TODO: Enhancements needed:
   * - [ ] Add support for credential refresh if expired
   * - [ ] Implement fallback to previous version if current fails
   * - [ ] Add support for partial credential retrieval (e.g., only API key)
   * - [ ] Implement read-through cache with automatic refresh
   */
  async get(
    tenantId: string,
    service: string
  ): Promise<any | null> {
    // Check if encryption key is properly configured
    if (this.encryptionKeyMissing) {
      throw new Error(`
ENCRYPTION_KEY not configured in production.
Cannot retrieve credentials without proper encryption key.

To fix:
1. Generate key: openssl rand -hex 32
2. Add to Railway: ENCRYPTION_KEY=[your-64-char-hex-key]
3. Restart the service

This is required for retrieving third-party API credentials securely.
`);
    }
    
    // Validate inputs
    if (!tenantId || !service) {
      throw new Error('Both tenantId and service are required');
    }
    
    // Check cache first
    const cacheKey = `${tenantId}:${service}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Log access for audit
      await this.logAccess(tenantId, service, 'cache_hit');
      return cached.data;
    }
    
    const { data, error } = await this.supabase
      .from('tenant_credentials')
      .select('encrypted_credentials')
      .eq('tenant_id', tenantId)
      .eq('service_name', service)
      .single();
    
    if (error || !data) {
      await this.logAccess(tenantId, service, 'not_found');
      return null;
    }
    
    const decrypted = await this.decrypt(data.encrypted_credentials);
    
    // Cache the result
    this.cache.set(cacheKey, { data: decrypted, timestamp: Date.now() });
    
    // Log access for audit
    await this.logAccess(tenantId, service, 'retrieved');
    
    return decrypted;
  }
  
  /**
   * Encrypt data using AES-256-GCM
   * PRD lines 1371-1376
   */
  private async encrypt(data: any): Promise<string> {
    const text = JSON.stringify(data);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.encryptionKey, 'hex').slice(0, 32),
      iv
    );
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      encrypted
    });
  }
  
  /**
   * Decrypt data using AES-256-GCM
   * PRD lines 1378-1383
   */
  private async decrypt(encryptedData: string): Promise<any> {
    const { iv, authTag, encrypted } = JSON.parse(encryptedData);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.encryptionKey, 'hex').slice(0, 32),
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
  
  /**
   * Generate unique credential ID
   */
  private generateId(): string {
    return `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Delete credentials for a service
   */
  async delete(tenantId: string, service: string): Promise<void> {
    // Check if encryption key is properly configured
    if (this.encryptionKeyMissing) {
      throw new Error(`
ENCRYPTION_KEY not configured in production.
Cannot manage credentials without proper encryption key.

To fix:
1. Generate key: openssl rand -hex 32
2. Add to Railway: ENCRYPTION_KEY=[your-64-char-hex-key]
3. Restart the service
`);
    }
    const { error } = await this.supabase
      .from('tenant_credentials')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('service_name', service);
    
    if (error) {
      throw new Error(`Failed to delete credentials: ${error.message}`);
    }
    
    // Clear cache
    this.cache.delete(`${tenantId}:${service}`);
    
    // Create audit trail
    await this.createAuditTrail('delete', tenantId, service);
  }
  
  /**
   * List all services with stored credentials for a tenant
   */
  async listServices(tenantId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('tenant_credentials')
      .select('service_name')
      .eq('tenant_id', tenantId);
    
    if (error) {
      throw new Error(`Failed to list services: ${error.message}`);
    }
    
    return data?.map((row: any) => row.service_name) || [];
  }
  
  /**
   * Log access attempts for audit trail
   */
  private async logAccess(tenantId: string, service: string, action: string): Promise<void> {
    try {
      await this.supabase
        .from('credential_access_log')
        .insert({
          tenant_id: tenantId,
          service_name: service,
          action,
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      // Silently fail audit logging to not break main functionality
      console.error('Failed to log credential access:', error);
    }
  }
  
  /**
   * Create audit trail for operations
   */
  private async createAuditTrail(operation: string, tenantId: string, service: string): Promise<void> {
    try {
      // TODO: Add more audit details like user agent, IP address, etc.
      await this.supabase
        .from('credential_audit')
        .insert({
          operation,
          tenant_id: tenantId,
          service_name: service,
          timestamp: new Date().toISOString(),
          // TODO: Add these fields
          // action: `credential_${operation}`,
          // actor_id: this.getCurrentUserId(),
          // ip_address: this.getClientIP(),
        });
    } catch (error) {
      // Silently fail audit logging
      console.error('Failed to create audit trail:', error);
    }
  }
  
  /**
   * Validate credentials format based on service type
   * TODO: Implement service-specific validation rules
   */
  public validateCredentialsFormat(service: string, credentials: any): boolean {
    // TODO: Implement validation logic for each service type
    // For now, just ensure it's an object with at least one key
    if (!credentials || typeof credentials !== 'object') {
      return false;
    }
    
    const keys = Object.keys(credentials);
    if (keys.length === 0) {
      return false;
    }
    
    // TODO: Add service-specific validation
    switch (service) {
      case 'stripe':
        // return 'apiKey' in credentials && 'secretKey' in credentials;
        break;
      case 'quickbooks':
        // return 'clientId' in credentials && 'clientSecret' in credentials;
        break;
      default:
        // Generic validation - at least one non-empty string value
        return keys.some(key => 
          credentials[key] && typeof credentials[key] === 'string'
        );
    }
    
    return true;
  }
  
  /**
   * Clear cache for a specific tenant/service or all
   * TODO: Add selective cache clearing
   */
  public clearCache(tenantId?: string, service?: string): void {
    if (tenantId && service) {
      this.cache.delete(`${tenantId}:${service}`);
    } else if (tenantId) {
      // Clear all entries for a tenant
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear entire cache
      this.cache.clear();
    }
  }
  
  /**
   * Get cache statistics
   * TODO: Add more detailed metrics
   */
  public getCacheStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: this.cache.size
    };
  }
}