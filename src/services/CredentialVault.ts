/**
 * Credential Vault - EXACTLY as PRD specifies
 * Lines 1334-1385 of Engine PRD
 * 
 * Secure storage for tenant credentials
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
  
  constructor() {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || 'https://raenkewzlvrdqufwxjpl.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-for-dev';
  }
  
  /**
   * Store encrypted credentials for a tenant
   * PRD lines 1337-1352
   */
  async store(
    tenantId: string,
    service: string,
    credentials: any
  ): Promise<void> {
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
  }
  
  /**
   * Retrieve decrypted credentials for a tenant
   * PRD lines 1354-1369
   */
  async get(
    tenantId: string,
    service: string
  ): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('tenant_credentials')
      .select('encrypted_credentials')
      .eq('tenant_id', tenantId)
      .eq('service_name', service)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return await this.decrypt(data.encrypted_credentials);
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
}