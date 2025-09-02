/**
 * ToolChain Service - EXACTLY as PRD specifies
 * Lines 1239-1330 of Engine PRD
 * 
 * Provides all external integrations
 * Will migrate to MCP Server post-MVP
 */

import { CredentialVault } from './credential-vault';
import { californiaBusinessSearch } from '../tools/california-business-search';

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
   * 
   * Uses real California Secretary of State data via Stagehand browser automation
   */
  async searchBusinessEntity(
    businessName: string,
    state: string = 'CA'
  ): Promise<BusinessEntity | null> {
    try {
      // Only supports California searches
      if (state !== 'CA') {
        console.log(`[ToolChain] State ${state} not supported. Only California (CA) is available.`);
        return null;
      }
      
      console.log(`[ToolChain] Searching California Secretary of State for: ${businessName}`);
      
      // Use the real California business search tool
      const results = await californiaBusinessSearch.searchByName(businessName);
      
      if (!results || results.length === 0) {
        console.log(`[ToolChain] No results found for: ${businessName}`);
        return null;
      }
      
      // Return the first/best match, converting to our BusinessEntity format
      const bestMatch = results[0];
      
      // Parse address from the detailed information
      let address: BusinessEntity['address'] | undefined;
      if (bestMatch.principalAddress) {
        // Basic parsing - can be improved based on actual format
        const addressParts = bestMatch.principalAddress.split(',').map(s => s.trim());
        if (addressParts.length >= 3) {
          const lastPart = addressParts[addressParts.length - 1];
          const stateZipMatch = lastPart.match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
          
          address = {
            street: addressParts.slice(0, -2).join(', '),
            city: addressParts[addressParts.length - 2] || '',
            state: stateZipMatch ? stateZipMatch[1] : 'CA',
            zip: stateZipMatch ? stateZipMatch[2] : ''
          };
        }
      }
      
      return {
        name: bestMatch.entityName,
        entityType: this.mapEntityType(bestMatch.entityType),
        formationDate: bestMatch.registrationDate || '',
        status: this.mapStatus(bestMatch.status),
        ein: undefined, // California SOS doesn't provide EIN
        address
      };
      
    } catch (error) {
      console.error('[ToolChain] California business search error:', error);
      return null;
    }
  }
  
  /**
   * Map California entity types to our standardized types
   */
  private mapEntityType(caType: string): BusinessEntity['entityType'] {
    const typeUpper = caType.toUpperCase();
    if (typeUpper.includes('LLC')) return 'LLC';
    if (typeUpper.includes('CORP')) return 'Corporation';
    if (typeUpper.includes('PARTNERSHIP')) return 'Partnership';
    if (typeUpper.includes('SOLE')) return 'Sole Proprietorship';
    // Default to Corporation for unknown types
    return 'Corporation';
  }
  
  /**
   * Map California status to our standardized status
   */
  private mapStatus(caStatus: string): BusinessEntity['status'] {
    const statusUpper = caStatus.toUpperCase();
    if (statusUpper.includes('ACTIVE')) return 'Active';
    if (statusUpper.includes('SUSPENDED')) return 'Suspended';
    if (statusUpper.includes('DISSOLVED')) return 'Dissolved';
    if (statusUpper.includes('CANCELED')) return 'Dissolved';
    // Default to Active for unknown statuses
    return 'Active';
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
- searchBusinessEntity(businessName, state): Search California Secretary of State for business entities
  * Returns: Business entity details including name, type, status, formation date, and address
  * State: Only 'CA' (California) is supported
  * Data source: Real-time data from bizfileonline.sos.ca.gov
  * Details available: Entity name, number, type, status, registration date, agent info, addresses, officers, filing history
  
- getQuickBooksData(tenantId, dataType): Retrieve QuickBooks data (requires credentials)
- processPayment(amount, description, tenantId): Process payment via Stripe (requires credentials)
- validateEmail(email): Validate email format
- validateEIN(ein): Validate EIN format (XX-XXXXXXX)
- extractGoogleOAuthData(profile): Extract user data from OAuth profile
`;
  }
  
  /**
   * Get structured tool registry for programmatic discovery
   */
  getToolRegistry() {
    return {
      searchBusinessEntity: {
        name: 'searchBusinessEntity',
        description: 'Search California Secretary of State for registered business entities',
        category: 'public_records',
        parameters: {
          businessName: {
            type: 'string',
            required: true,
            description: 'Name of the business to search for'
          },
          state: {
            type: 'string',
            required: false,
            default: 'CA',
            enum: ['CA'],
            description: 'State to search in (only California supported)'
          }
        },
        returns: {
          type: 'BusinessEntity',
          nullable: true,
          description: 'Business entity details or null if not found'
        },
        capabilities: [
          'real_time_data',
          'california_only',
          'public_records',
          'no_authentication_required'
        ],
        dataSource: 'https://bizfileonline.sos.ca.gov',
        limitations: [
          'California entities only',
          'Does not provide EIN',
          'May have rate limits',
          'Requires browser automation (slower than API)'
        ]
      },
      getQuickBooksData: {
        name: 'getQuickBooksData',
        description: 'Retrieve financial data from QuickBooks',
        category: 'financial',
        requiresCredentials: true,
        parameters: {
          tenantId: {
            type: 'string',
            required: true,
            description: 'Tenant identifier'
          },
          dataType: {
            type: 'string',
            required: true,
            description: 'Type of data to retrieve'
          }
        }
      },
      processPayment: {
        name: 'processPayment',
        description: 'Process payments via Stripe',
        category: 'payments',
        requiresCredentials: true,
        parameters: {
          amount: {
            type: 'number',
            required: true,
            description: 'Payment amount in cents'
          },
          description: {
            type: 'string',
            required: true,
            description: 'Payment description'
          },
          tenantId: {
            type: 'string',
            required: true,
            description: 'Tenant identifier'
          }
        }
      },
      validateEmail: {
        name: 'validateEmail',
        description: 'Validate email address format',
        category: 'validation',
        parameters: {
          email: {
            type: 'string',
            required: true,
            description: 'Email address to validate'
          }
        }
      },
      validateEIN: {
        name: 'validateEIN',
        description: 'Validate Employer Identification Number format',
        category: 'validation',
        parameters: {
          ein: {
            type: 'string',
            required: true,
            description: 'EIN to validate (format: XX-XXXXXXX)'
          }
        }
      }
    };
  }
  
  /**
   * TODO: Migrate to MCP Server
   * This will become: await mcp.call('searchBusinessEntity', params)
   */
}