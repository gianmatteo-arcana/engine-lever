/**
 * Credential Vault - EXACTLY as PRD specifies
 * Lines 1334-1385 of Engine PRD
 * 
 * Secure storage for tenant credentials
 * 
 * TODO: Implement the following improvements:
 * - [ ] Add key rotation mechanism for periodic encryption key updates
 * - [ ] Implement credential versioning for rollback capability
 * - [ ] Add support for different encryption algorithms
 * - [ ] Implement credential sharing between tenants (with permissions)
 * - [ ] Add support for temporary credentials with expiration
 * - [ ] Implement bulk operations for performance
 * - [ ] Add support for credential templates
 * - [ ] Implement automatic credential rotation for supported services
 * - [ ] Add monitoring and alerting for failed access attempts
 * - [ ] Implement rate limiting for credential access
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
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // TODO: Add these properties for future enhancements
  // private keyVersion: number = 1;
  // private rateLimiter: RateLimiter;
  // private metricsCollector: MetricsCollector;
  
  constructor() {
    // Validate and get Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
    
    // Validate configuration RIGHT WHERE IT'S USED
    const errors = [];
    
    // Check URL
    if (!supabaseUrl) {
      errors.push('SUPABASE_URL is not set');
    } else if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
      errors.push(`SUPABASE_URL is invalid: "${supabaseUrl}"`);
    }
    
    // Check Key - must be valid
    if (!supabaseKey) {
      errors.push('SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY is not set');
    } else if (supabaseKey.length < 30) {
      errors.push(`SUPABASE_SERVICE_KEY is too short (${supabaseKey.length} chars) - likely empty or invalid`);
    } else if (supabaseKey.includes('[') || supabaseKey.includes('Get from')) {
      errors.push('SUPABASE_SERVICE_KEY contains placeholder text - not a real key');
    } else {
      // Check for valid formats
      const isJWT = supabaseKey.startsWith('eyJ') && supabaseKey.includes('.');
      const isAPIKey = supabaseKey.startsWith('sbp_') || supabaseKey.length === 40;
      
      if (!isJWT && !isAPIKey) {
        errors.push(`SUPABASE_SERVICE_KEY has invalid format (not JWT or API key)`);
      }
    }
    
    if (errors.length > 0) {
      // Fail with clear, actionable error AT THE POINT OF FAILURE
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
    
    // If we get here, configuration is valid - TypeScript needs explicit type assertion
    this.supabase = createClient(supabaseUrl!, supabaseKey!);
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-for-dev';
    
    // Validate encryption key format (must be 32 bytes / 64 hex chars for AES-256)
    if (this.encryptionKey.length < 32) {
      // Pad the key if it's too short (for dev only)
      if (process.env.NODE_ENV !== 'production') {
        this.encryptionKey = this.encryptionKey.padEnd(64, '0');
      } else {
        throw new Error('Encryption key is invalid - must be at least 32 bytes');
      }
    }
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