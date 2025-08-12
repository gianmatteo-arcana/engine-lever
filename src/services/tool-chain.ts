/**
 * ToolChain Service - EXACTLY as PRD specifies
 * Lines 1239-1330 of Engine PRD
 * 
 * Provides all external integrations
 * Will migrate to MCP Server post-MVP
 */

import { CredentialVault } from './credential-vault';

export interface BusinessEntity {
  name: string;
  entityType: 'LLC' | 'Corporation' | 'Sole Proprietorship' | 'Partnership';
  formationDate: string;
  status: 'Active' | 'Suspended' | 'Dissolved';
  ein?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  amount: number;
  timestamp: string;
}

export class NeedCredentialsError extends Error {
  constructor(public service: string) {
    super(`Credentials needed for ${service}`);
    this.name = 'NeedCredentialsError';
  }
}

/**
 * ToolChain provides all external integrations
 * Exactly matches PRD lines 1244-1330
 */
export class ToolChain {
  private credentials: CredentialVault;
  
  constructor() {
    this.credentials = new CredentialVault();
  }
  
  /**
   * California Business Connect API
   * PRD lines 1247-1271
   */
  async searchBusinessEntity(
    businessName: string,
    state: string = 'CA'
  ): Promise<BusinessEntity | null> {
    try {
      // For MVP, return mock data
      // TODO: Integrate with real CA SOS API
      console.log(`[ToolChain] Searching for business: ${businessName} in ${state}`);
      
      // Mock response for demo
      if (businessName.toLowerCase().includes('tech')) {
        return {
          name: businessName,
          entityType: 'LLC',
          formationDate: '2023-01-15',
          status: 'Active',
          ein: '12-3456789',
          address: {
            street: '123 Market St',
            city: 'San Francisco',
            state: 'CA',
            zip: '94105'
          }
        };
      }
      
      return null;
    } catch (error) {
      console.error('CBC API error:', error);
      return null;
    }
  }
  
  /**
   * Search public records for business information
   */
  async searchPublicRecords(businessName: string): Promise<BusinessEntity | null> {
    // Alias for searchBusinessEntity
    return this.searchBusinessEntity(businessName);
  }
  
  /**
   * QuickBooks Integration (requires user credentials)
   * PRD lines 1273-1289
   */
  async getQuickBooksData(
    tenantId: string,
    dataType: string
  ): Promise<any> {
    // Check if we have credentials
    const creds = await this.credentials.get(tenantId, 'quickbooks');
    
    if (!creds) {
      // Need to request from user
      throw new NeedCredentialsError('quickbooks');
    }
    
    // Mock QuickBooks data for demo
    return {
      dataType,
      business: {
        name: 'Example Business LLC',
        address: '123 Main St, San Francisco, CA 94102'
      }
    };
  }
  
  /**
   * Stripe Payment Processing
   * PRD lines 1291-1313
   */
  async processPayment(
    amount: number,
    description: string,
    tenantId: string
  ): Promise<PaymentResult> {
    // Get stored payment method for tenant
    const paymentMethod = await this.credentials.get(tenantId, 'payment_method');
    
    if (!paymentMethod) {
      throw new NeedCredentialsError('payment_method');
    }
    
    // Mock payment for demo
    return {
      success: true,
      transactionId: `txn_${Date.now()}`,
      amount,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Email validation
   * PRD lines 1315-1318
   */
  validateEmail(email: string): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }
  
  /**
   * EIN validation
   * PRD lines 1320-1324
   */
  validateEIN(ein: string): boolean {
    const pattern = /^\d{2}-\d{7}$/;
    return pattern.test(ein);
  }
  
  /**
   * Extract data from Google OAuth profile
   */
  extractGoogleOAuthData(profile: any): {
    firstName: string;
    lastName: string;
    email: string;
  } {
    // Parse Google OAuth profile
    const names = (profile.name || '').split(' ');
    return {
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      email: profile.email || ''
    };
  }
  
  /**
   * Get list of available tools for LLM context
   */
  getAvailableTools(): string {
    return `
Available Tools:
- searchBusinessEntity(businessName, state): Search CA Secretary of State
- getQuickBooksData(tenantId, dataType): Retrieve QuickBooks data
- processPayment(amount, description, tenantId): Process payment via Stripe
- validateEmail(email): Validate email format
- validateEIN(ein): Validate EIN format
- extractGoogleOAuthData(profile): Extract user data from OAuth
`;
  }
  
  /**
   * TODO: Migrate to MCP Server
   * This will become: await mcp.call('searchBusinessEntity', params)
   */
}