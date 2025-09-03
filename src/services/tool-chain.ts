/**
 * ToolChain Service - EXACTLY as PRD specifies
 * Lines 1239-1330 of Engine PRD
 * 
 * Provides all external integrations
 * Will migrate to MCP Server post-MVP
 */

import { CredentialVault } from './credential-vault';
import { californiaBusinessSearch } from '../tools/california-business-search';
import { BusinessMemoryTool, BusinessMemorySearchParams, BusinessKnowledge } from '../tools/business-memory';
import type { Tool, ToolExecutionResult, ToolChain as IToolChain } from '../toolchain/ToolChain';
import { 
  validateRequiredParams, 
  sanitizeObject, 
  logUndefinedStringDetected,
  safeString 
} from '../utils/validation-guards';
import { logger } from '../utils/logger';

// Canonical business entity types that we recognize across jurisdictions
export enum BusinessEntityType {
  LLC = 'LLC',
  CORPORATION = 'Corporation',
  LIMITED_PARTNERSHIP = 'Limited Partnership',
  GENERAL_PARTNERSHIP = 'General Partnership',
  SOLE_PROPRIETORSHIP = 'Sole Proprietorship',
  LLP = 'LLP',
  PROFESSIONAL_CORPORATION = 'Professional Corporation',
  NONPROFIT = 'Nonprofit'
}

// Canonical business entity statuses that we recognize across jurisdictions
export enum BusinessEntityStatus {
  ACTIVE = 'Active',
  SUSPENDED = 'Suspended',
  DISSOLVED = 'Dissolved',
  MERGED = 'Merged',
  CONVERTED = 'Converted'
}

export interface BusinessEntity {
  name: string;
  entityNumber?: string;         // CA entity number (e.g., C0806592, 201919710409)
  entityType: string;           // Raw entity type from source
  entityTypeNormalized?: BusinessEntityType; // Canonical form when recognizable
  formationDate: string;
  status: string;                // Raw status from source  
  statusNormalized?: BusinessEntityStatus;   // Canonical form when recognizable
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
 * Implements IToolChain interface for agent compatibility
 */
export class ToolChain implements IToolChain {
  private credentials: CredentialVault;
  private businessMemory: BusinessMemoryTool;
  
  constructor() {
    this.credentials = new CredentialVault();
    this.businessMemory = new BusinessMemoryTool();
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
          entityNumber: result.entityNumber,  // Include CA entity number
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
  private normalizeEntityType(rawType: string): BusinessEntityType | undefined {
    const typeUpper = rawType.toUpperCase();
    
    // Map common variations to canonical forms
    if (typeUpper.includes('LLC') || 
        typeUpper.includes('LIMITED LIABILITY COMPANY') ||
        typeUpper.includes('L.L.C.')) {
      return BusinessEntityType.LLC;
    }
    
    if (typeUpper.includes('CORPORATION') || 
        typeUpper.includes('CORP') ||
        typeUpper.includes('INC') ||
        typeUpper.includes('INCORPORATED')) {
      return BusinessEntityType.CORPORATION;
    }
    
    if (typeUpper.includes('LIMITED PARTNERSHIP') ||
        typeUpper.includes('LP') ||
        typeUpper === 'L.P.') {
      return BusinessEntityType.LIMITED_PARTNERSHIP;
    }
    
    if (typeUpper.includes('GENERAL PARTNERSHIP') ||
        typeUpper === 'PARTNERSHIP' ||
        typeUpper === 'GP') {
      return BusinessEntityType.GENERAL_PARTNERSHIP;
    }
    
    if (typeUpper.includes('SOLE PROPRIETOR')) {
      return BusinessEntityType.SOLE_PROPRIETORSHIP;
    }
    
    if (typeUpper.includes('LIMITED LIABILITY PARTNERSHIP') ||
        typeUpper === 'LLP') {
      return BusinessEntityType.LLP;
    }
    
    if (typeUpper.includes('PROFESSIONAL CORPORATION') ||
        typeUpper === 'PC' ||
        typeUpper === 'P.C.') {
      return BusinessEntityType.PROFESSIONAL_CORPORATION;
    }
    
    if (typeUpper.includes('NON-PROFIT') ||
        typeUpper.includes('NONPROFIT') ||
        typeUpper.includes('NOT-FOR-PROFIT')) {
      return BusinessEntityType.NONPROFIT;
    }
    
    // Return undefined for unrecognized types
    // This preserves the raw value without making assumptions
    console.warn(`[ToolChain] Unrecognized entity type: "${rawType}"`);
    return undefined;
  }
  
  /**
   * Normalize status to canonical forms when recognizable
   * Returns undefined if the status doesn't match known patterns
   */
  private normalizeStatus(rawStatus: string): BusinessEntityStatus | undefined {
    const statusUpper = rawStatus.toUpperCase();
    
    if (statusUpper.includes('ACTIVE') || 
        statusUpper.includes('GOOD STANDING') ||
        statusUpper === 'CURRENT') {
      return BusinessEntityStatus.ACTIVE;
    }
    
    if (statusUpper.includes('SUSPENDED') ||
        statusUpper.includes('SUSPEND') ||
        statusUpper.includes('FORFEITED')) {
      return BusinessEntityStatus.SUSPENDED;
    }
    
    if (statusUpper.includes('DISSOLVED') ||
        statusUpper.includes('CANCELED') ||
        statusUpper.includes('CANCELLED') ||
        statusUpper.includes('TERMINATED') ||
        statusUpper.includes('INACTIVE')) {
      return BusinessEntityStatus.DISSOLVED;
    }
    
    if (statusUpper.includes('MERGED')) {
      return BusinessEntityStatus.MERGED;
    }
    
    if (statusUpper.includes('CONVERTED')) {
      return BusinessEntityStatus.CONVERTED;
    }
    
    // Return undefined for unrecognized statuses
    console.warn(`[ToolChain] Unrecognized entity status: "${rawStatus}"`);
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
   * NOTE: This returns a string for backward compatibility
   * Use getAvailableTools() for structured data
   */
  getAvailableToolsDescription(): string {
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

- searchBusinessMemory(businessId, categories?, minConfidence?): Search stored business knowledge
  * Returns: BusinessKnowledge with facts, preferences, patterns, relationships
  * Categories: identity, structure, contact_info, operations, financial, etc.
  * Default confidence: 0.7
  * Use to retrieve learned information about a business
  
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
  getToolRegistry(): Record<string, any> {
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
      searchBusinessMemory: {
        name: 'searchBusinessMemory',
        description: 'Search stored business knowledge from previous interactions',
        category: 'knowledge_base',
        parameters: {
          businessId: {
            type: 'string',
            required: true,
            description: 'The business ID to search knowledge for'
          },
          categories: {
            type: 'array',
            required: false,
            description: 'Optional categories to filter by (identity, structure, contact_info, etc.)'
          },
          minConfidence: {
            type: 'number',
            required: false,
            default: 0.7,
            description: 'Minimum confidence threshold (0.0 to 1.0)'
          }
        },
        returns: {
          type: 'BusinessKnowledge',
          description: 'Structured knowledge including facts, preferences, patterns, and relationships'
        },
        capabilities: [
          'read_only',
          'knowledge_retrieval',
          'progressive_learning',
          'no_authentication_required'
        ],
        dataSource: 'business_knowledge table',
        limitations: [
          'Read-only access',
          'Only returns knowledge above confidence threshold',
          'May have incomplete data for new businesses'
        ]
      },
      persistKnowledge: {
        name: 'persistKnowledge',
        description: 'Persist extracted business knowledge (RESTRICTED: knowledge_extraction_agent only)',
        category: 'knowledge_base',
        restricted: true,
        parameters: {
          knowledge: {
            type: 'array',
            required: true,
            description: 'Array of ExtractedKnowledge items to persist',
            items: {
              type: 'object',
              properties: {
                businessId: { type: 'string', required: true },
                knowledgeType: { 
                  type: 'string', 
                  enum: ['profile', 'preference', 'pattern', 'relationship', 'compliance'],
                  required: true 
                },
                category: { 
                  type: 'string',
                  enum: ['identity', 'structure', 'contact_info', 'operations', 'financial', 'compliance_status', 'communication', 'decision_making', 'documentation'],
                  required: true 
                },
                fieldName: { type: 'string', required: true },
                fieldValue: { type: 'any', required: true },
                confidence: { type: 'number', minimum: 0, maximum: 1, required: true },
                sourceTaskId: { type: 'string' },
                verificationMethod: { 
                  type: 'string',
                  enum: ['user_provided', 'public_records', 'api_verified', 'inferred', 'document_upload']
                },
                expiresAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        returns: {
          type: 'object',
          description: 'Confirmation of persisted knowledge items'
        },
        capabilities: [
          'write_access',
          'knowledge_persistence',
          'restricted_access'
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
   * Search business memory for context enrichment
   * Available to ALL agents during task execution
   * Read-only access to persisted business knowledge
   * 
   * @param businessId - The business to search knowledge for
   * @param categories - Optional categories to filter by
   * @param minConfidence - Minimum confidence threshold (default 0.7)
   * @returns BusinessKnowledge with facts, preferences, patterns, and relationships
   */
  async searchBusinessMemory(
    businessId: string,
    categories?: string[],
    minConfidence: number = 0.7
  ): Promise<BusinessKnowledge> {
    try {
      console.log(`[ToolChain] Searching business memory for: ${businessId}`);
      
      const params: BusinessMemorySearchParams = {
        businessId,
        minConfidence,
        includeExpired: false
      };
      
      // Map string categories to proper types if provided
      if (categories && categories.length > 0) {
        params.categories = categories as any; // Type assertion for flexibility
      }
      
      const knowledge = await this.businessMemory.searchMemory(params);
      
      console.log(`[ToolChain] Found ${knowledge.metadata.factCount} facts with avg confidence ${knowledge.metadata.averageConfidence}`);
      
      return knowledge;
    } catch (error) {
      console.error('[ToolChain] Error searching business memory:', error);
      // Return empty knowledge on error to allow graceful degradation
      return {
        facts: {},
        preferences: {},
        patterns: {},
        relationships: {},
        metadata: {
          lastUpdated: new Date().toISOString(),
          factCount: 0,
          averageConfidence: 0
        }
      };
    }
  }
  
  /**
   * Check if business has any stored knowledge
   * Quick check for agents to determine if memory exists
   */
  async hasBusinessMemory(businessId: string): Promise<boolean> {
    try {
      const knowledge = await this.searchBusinessMemory(businessId, undefined, 0.5);
      return knowledge.metadata.factCount > 0;
    } catch (error) {
      console.error('[ToolChain] Error checking business memory:', error);
      return false;
    }
  }
  
  /**
   * TODO: Migrate to MCP Server
   * This will become: await mcp.call('searchBusinessEntity', params)
   */

  // ======================================================================
  // IToolChain Interface Implementation for Agent Compatibility
  // ======================================================================

  /**
   * Execute a tool by ID with given parameters
   * This is the main entry point for agents to call tools during LLM reasoning
   */
  async executeTool(toolId: string, params: Record<string, unknown>): Promise<ToolExecutionResult> {
    try {
      // 🚨 UNIVERSAL GUARD: Sanitize all parameters and detect undefined/null strings
      const sanitizedParams = sanitizeObject(params);
      
      // Log any undefined string conversions for debugging
      Object.entries(params).forEach(([key, value]) => {
        logUndefinedStringDetected(value, `tool execution ${toolId}.${key}`, logger);
      });
      
      switch (toolId) {
        case 'searchBusinessEntity': {
          // Validate required parameters universally
          validateRequiredParams(sanitizedParams, ['businessName'], `tool ${toolId}`);
          
          const businessName = safeString(sanitizedParams.businessName);
          const state = safeString(sanitizedParams.state) || 'CA';
          
          if (!businessName) {
            throw new Error('Business name cannot be empty, null, undefined, or the literal string "undefined"');
          }
          
          const entities = await this.searchBusinessEntity(businessName, state);
          return {
            success: true,
            data: entities,
            executionTime: Date.now()
          };
        }

        case 'searchByEntityNumber': {
          validateRequiredParams(sanitizedParams, ['entityNumber'], `tool ${toolId}`);
          
          const entityNumber = safeString(sanitizedParams.entityNumber);
          const state = safeString(sanitizedParams.state) || 'CA';
          
          if (!entityNumber) {
            throw new Error('Entity number cannot be empty, null, undefined, or the literal string "undefined"');
          }
          
          const entity = await this.searchByEntityNumber(entityNumber, state);
          return {
            success: true,
            data: entity,
            executionTime: Date.now()
          };
        }

        case 'searchBusinessMemory': {
          const categories = sanitizedParams.categories as string[] | undefined;
          const minConfidence = (sanitizedParams.minConfidence as number) || 0.7;
          
          // BusinessMemory requires a businessId, so if none provided, we use a wildcard search
          const businessId = safeString(sanitizedParams.businessId) || '*'; // Use wildcard for all businesses
          
          const knowledge = await this.searchBusinessMemory(businessId, categories, minConfidence);
          return {
            success: true,
            data: knowledge,
            executionTime: Date.now()
          };
        }

        case 'validateEmail': {
          validateRequiredParams(sanitizedParams, ['email'], `tool ${toolId}`);
          
          const email = safeString(sanitizedParams.email);
          
          if (!email) {
            throw new Error('Email cannot be empty, null, undefined, or the literal string "undefined"');
          }
          
          const emailValid = this.validateEmail(email);
          return {
            success: true,
            data: { valid: emailValid },
            executionTime: Date.now()
          };
        }

        case 'validateEIN': {
          validateRequiredParams(sanitizedParams, ['ein'], `tool ${toolId}`);
          
          const ein = safeString(sanitizedParams.ein);
          
          if (!ein) {
            throw new Error('EIN cannot be empty, null, undefined, or the literal string "undefined"');
          }
          
          const einValid = this.validateEIN(ein);
          return {
            success: true,
            data: { valid: einValid },
            executionTime: Date.now()
          };
        }

        case 'extractGoogleOAuthData': {
          const userData = this.extractGoogleOAuthData(params.profile as any);
          return {
            success: true,
            data: userData,
            executionTime: Date.now()
          };
        }

        case 'persistKnowledge': {
          // Restricted tool - only for knowledge_extraction_agent
          try {
            const knowledge = params.knowledge as any[];
            if (!Array.isArray(knowledge)) {
              return {
                success: false,
                error: 'Knowledge must be an array of ExtractedKnowledge items'
              };
            }
            
            await this.businessMemory.persistKnowledge(knowledge);
            return {
              success: true,
              data: {
                persisted: knowledge.length,
                message: `Successfully persisted ${knowledge.length} knowledge items`
              },
              executionTime: Date.now()
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to persist knowledge'
            };
          }
        }

        case 'getQuickBooksData': {
          try {
            const qbData = await this.getQuickBooksData(
              params.tenantId as string,
              params.dataType as string
            );
            return {
              success: true,
              data: qbData,
              executionTime: Date.now()
            };
          } catch (error) {
            if (error instanceof NeedCredentialsError) {
              return {
                success: false,
                error: error.message,
                metadata: { requiresCredentials: true }
              };
            }
            throw error;
          }
        }

        case 'processPayment': {
          try {
            const payment = await this.processPayment(
              params.amount as number,
              params.description as string,
              params.tenantId as string
            );
            return {
              success: true,
              data: payment,
              executionTime: Date.now()
            };
          } catch (error) {
            if (error instanceof NeedCredentialsError) {
              return {
                success: false,
                error: error.message,
                metadata: { requiresCredentials: true }
              };
            }
            throw error;
          }
        }

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolId}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  /**
   * Get all available tools as structured data
   */
  async getAvailableTools(): Promise<Tool[]> {
    const registry = this.getToolRegistry();
    return Object.entries(registry).map(([id, tool]) => ({
      id,
      name: tool.name,
      description: tool.description,
      version: '1.0.0',
      capabilities: tool.capabilities || [],
      parameters: tool.parameters
    }));
  }

  /**
   * Find tools by capability
   */
  async findToolsByCapability(capability: string): Promise<Tool[]> {
    const allTools = await this.getAvailableTools();
    return allTools.filter(tool => 
      tool.capabilities.includes(capability)
    );
  }

  /**
   * Get information about a specific tool
   */
  async getToolInfo(toolId: string): Promise<Tool | null> {
    const registry = this.getToolRegistry();
    const tool = registry[toolId];
    if (!tool) return null;

    return {
      id: toolId,
      name: tool.name,
      description: tool.description,
      version: '1.0.0',
      capabilities: tool.capabilities || [],
      parameters: tool.parameters
    };
  }

  /**
   * Check if a tool is available
   */
  async isToolAvailable(toolId: string): Promise<boolean> {
    const registry = this.getToolRegistry();
    return toolId in registry;
  }
}