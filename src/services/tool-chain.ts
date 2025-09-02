/**
 * ToolChain Service - EXACTLY as PRD specifies
 * Lines 1239-1330 of Engine PRD
 * 
 * Provides all external integrations
 * Will migrate to MCP Server post-MVP
 */

import { CredentialVault } from './credential-vault';
import { californiaBusinessSearch } from '../tools/california-business-search';

// Canonical entity types that we recognize across jurisdictions
export enum EntityType {
  LLC = 'LLC',
  CORPORATION = 'Corporation',
  LIMITED_PARTNERSHIP = 'Limited Partnership',
  GENERAL_PARTNERSHIP = 'General Partnership',
  SOLE_PROPRIETORSHIP = 'Sole Proprietorship',
  LLP = 'LLP',
  PROFESSIONAL_CORPORATION = 'Professional Corporation',
  NONPROFIT = 'Nonprofit'
}

// Canonical statuses that we recognize across jurisdictions
export enum EntityStatus {
  ACTIVE = 'Active',
  SUSPENDED = 'Suspended',
  DISSOLVED = 'Dissolved',
  MERGED = 'Merged',
  CONVERTED = 'Converted'
}

export interface BusinessEntity {
  name: string;
  entityType: string;           // Raw entity type from source
  entityTypeNormalized?: EntityType; // Canonical form when recognizable
  formationDate: string;
  status: string;                // Raw status from source  
  statusNormalized?: EntityStatus;   // Canonical form when recognizable
  ein?: string;
  jurisdiction?: string;         // Where the entity is registered
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
   * Returns ALL matches found, letting the client decide how to handle multiple results
   */
  async searchBusinessEntity(
    businessName: string,
    state: string = 'CA'
  ): Promise<BusinessEntity[]> {
    try {
      // Only supports California searches
      if (state !== 'CA') {
        console.log(`[ToolChain] State ${state} not supported. Only California (CA) is available.`);
        return [];
      }
      
      console.log(`[ToolChain] Searching California Secretary of State for: ${businessName}`);
      
      // Use the real California business search tool
      const results = await californiaBusinessSearch.searchByName(businessName);
      
      if (!results || results.length === 0) {
        console.log(`[ToolChain] No results found for: ${businessName}`);
        return [];
      }
      
      console.log(`[ToolChain] Found ${results.length} matches for: ${businessName}`);
      
      // Convert ALL results to our BusinessEntity format
      const businessEntities: BusinessEntity[] = results.map(result => {
        // Parse address from the detailed information
        let address: BusinessEntity['address'] | undefined;
        if (result.principalAddress) {
          // Basic parsing - can be improved based on actual format
          const addressParts = result.principalAddress.split(',').map(s => s.trim());
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
          name: result.entityName,
          entityType: result.entityType,  // Keep raw value
          entityTypeNormalized: this.normalizeEntityType(result.entityType),
          formationDate: result.registrationDate || '',
          status: result.status,  // Keep raw value
          statusNormalized: this.normalizeStatus(result.status),
          ein: undefined, // California SOS doesn't provide EIN
          jurisdiction: 'CA',
          address
        };
      });
      
      return businessEntities;
      
    } catch (error) {
      console.error('[ToolChain] California business search error:', error);
      return [];
    }
  }
  
  /**
   * Normalize entity types to canonical forms when recognizable
   * Returns undefined if the type doesn't match known patterns
   */
  private normalizeEntityType(rawType: string): EntityType | undefined {
    const typeUpper = rawType.toUpperCase();
    
    // Map common variations to canonical forms
    if (typeUpper.includes('LLC') || 
        typeUpper.includes('LIMITED LIABILITY COMPANY') ||
        typeUpper.includes('L.L.C.')) {
      return EntityType.LLC;
    }
    
    if (typeUpper.includes('CORPORATION') || 
        typeUpper.includes('CORP') ||
        typeUpper.includes('INC') ||
        typeUpper.includes('INCORPORATED')) {
      return EntityType.CORPORATION;
    }
    
    if (typeUpper.includes('LIMITED PARTNERSHIP') ||
        typeUpper.includes('LP') ||
        typeUpper === 'L.P.') {
      return EntityType.LIMITED_PARTNERSHIP;
    }
    
    if (typeUpper.includes('GENERAL PARTNERSHIP') ||
        typeUpper === 'PARTNERSHIP' ||
        typeUpper === 'GP') {
      return EntityType.GENERAL_PARTNERSHIP;
    }
    
    if (typeUpper.includes('SOLE PROPRIETOR')) {
      return EntityType.SOLE_PROPRIETORSHIP;
    }
    
    if (typeUpper.includes('LIMITED LIABILITY PARTNERSHIP') ||
        typeUpper === 'LLP') {
      return EntityType.LLP;
    }
    
    if (typeUpper.includes('PROFESSIONAL CORPORATION') ||
        typeUpper === 'PC' ||
        typeUpper === 'P.C.') {
      return EntityType.PROFESSIONAL_CORPORATION;
    }
    
    if (typeUpper.includes('NON-PROFIT') ||
        typeUpper.includes('NONPROFIT') ||
        typeUpper.includes('NOT-FOR-PROFIT')) {
      return EntityType.NONPROFIT;
    }
    
    // Return undefined for unrecognized types
    // This preserves the raw value without making assumptions
    return undefined;
  }
  
  /**
   * Normalize status to canonical forms when recognizable
   * Returns undefined if the status doesn't match known patterns
   */
  private normalizeStatus(rawStatus: string): EntityStatus | undefined {
    const statusUpper = rawStatus.toUpperCase();
    
    if (statusUpper.includes('ACTIVE') || 
        statusUpper.includes('GOOD STANDING') ||
        statusUpper === 'CURRENT') {
      return EntityStatus.ACTIVE;
    }
    
    if (statusUpper.includes('SUSPENDED') ||
        statusUpper.includes('SUSPEND') ||
        statusUpper.includes('FORFEITED')) {
      return EntityStatus.SUSPENDED;
    }
    
    if (statusUpper.includes('DISSOLVED') ||
        statusUpper.includes('CANCELED') ||
        statusUpper.includes('CANCELLED') ||
        statusUpper.includes('TERMINATED') ||
        statusUpper.includes('INACTIVE')) {
      return EntityStatus.DISSOLVED;
    }
    
    if (statusUpper.includes('MERGED')) {
      return EntityStatus.MERGED;
    }
    
    if (statusUpper.includes('CONVERTED')) {
      return EntityStatus.CONVERTED;
    }
    
    // Return undefined for unrecognized statuses
    return undefined;
  }
  
  /**
   * Search for a specific business by entity number
   * Returns exactly one result or null
   */
  async searchByEntityNumber(
    entityNumber: string,
    state: string = 'CA'
  ): Promise<BusinessEntity | null> {
    try {
      // Only supports California searches
      if (state !== 'CA') {
        console.log(`[ToolChain] State ${state} not supported. Only California (CA) is available.`);
        return null;
      }
      
      console.log(`[ToolChain] Searching California Secretary of State for entity: ${entityNumber}`);
      
      // Use the real California business search tool
      const result = await californiaBusinessSearch.searchByEntityNumber(entityNumber);
      
      if (!result) {
        console.log(`[ToolChain] No entity found with number: ${entityNumber}`);
        return null;
      }
      
      // Parse address from the detailed information
      let address: BusinessEntity['address'] | undefined;
      if (result.principalAddress) {
        const addressParts = result.principalAddress.split(',').map(s => s.trim());
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
        name: result.entityName,
        entityType: result.entityType,  // Keep raw value
        entityTypeNormalized: this.normalizeEntityType(result.entityType),
        formationDate: result.registrationDate || '',
        status: result.status,  // Keep raw value
        statusNormalized: this.normalizeStatus(result.status),
        ein: undefined, // California SOS doesn't provide EIN
        jurisdiction: 'CA',
        address
      };
      
    } catch (error) {
      console.error('[ToolChain] Entity number search error:', error);
      return null;
    }
  }
  
  /**
   * Search public records for business information
   * Returns all matches found
   */
  async searchPublicRecords(businessName: string): Promise<BusinessEntity[]> {
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
- searchBusinessEntity(businessName, state): Search California Secretary of State for business entities by name
  * Returns: Array of ALL matching business entities
  * State: Only 'CA' (California) is supported
  * Data source: Real-time data from bizfileonline.sos.ca.gov
  * Details available: Entity name, number, type, status, registration date, agent info, addresses, officers, filing history
  
- searchByEntityNumber(entityNumber, state): Search for a specific business by entity number
  * Returns: Single business entity or null if not found
  * State: Only 'CA' (California) is supported
  * Use when you have the exact entity number
  
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
        description: 'Search California Secretary of State for registered business entities by name',
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
          type: 'BusinessEntity[]',
          description: 'Array of ALL matching business entities (empty array if none found)'
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
      searchByEntityNumber: {
        name: 'searchByEntityNumber',
        description: 'Search California Secretary of State for a specific business by entity number',
        category: 'public_records',
        parameters: {
          entityNumber: {
            type: 'string',
            required: true,
            description: 'Entity number to search for (e.g., C0806592)'
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
          description: 'Single business entity or null if not found'
        },
        capabilities: [
          'real_time_data',
          'california_only',
          'public_records',
          'exact_match',
          'no_authentication_required'
        ],
        dataSource: 'https://bizfileonline.sos.ca.gov',
        limitations: [
          'California entities only',
          'Requires exact entity number',
          'Does not provide EIN'
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