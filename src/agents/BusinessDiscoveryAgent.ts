/**
 * Entity Discovery Agent
 * 
 * AGENT MISSION: Discover and identify entities from available data sources
 * using pattern matching, data correlation, and confidence scoring.
 * 
 * This agent is GENERAL PURPOSE - it discovers entities from any type of
 * data source. Task Templates define which specific sources to search and
 * what patterns to look for. The agent handles the technical aspects of
 * searching, matching, and confidence calculation.
 * 
 * EXPERTISE:
 * - Pattern matching and entity recognition
 * - Multi-source data correlation
 * - Confidence scoring algorithms
 * - Search optimization strategies
 * - Name variation generation
 */

import { BaseAgent } from './base/BaseAgent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest 
} from '../types/engine-types';
import { DatabaseService } from '../services/database';

interface EntitySearchResult {
  found: boolean;
  confidence: number; // 0-1
  entityData?: {
    identifier: string;
    name: string;
    type: string;
    attributes: Record<string, any>;
    source: string;
    lastVerified?: string;
  };
  searchMetrics: {
    sourcesQueried: string[];
    patternsAttempted: number;
    timeElapsed: number;
    matchQuality: string; // 'exact' | 'fuzzy' | 'partial'
  };
}

interface SearchPatterns {
  primaryIdentifier?: string;
  alternateIdentifiers: string[];
  attributes: Record<string, any>;
  correlationHints?: Record<string, any>;
}

/**
 * Entity Discovery Agent - Consolidated BaseAgent Implementation
 * Specializes in finding and identifying entities from various data sources
 */
export class BusinessDiscoveryAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('business_discovery_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - discovers entities from data sources
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `eda_${Date.now()}`;
    
    try {
      // Extract search patterns from context and request
      const searchPatterns = this.extractSearchPatterns(context, request);
      
      // Record discovery initiation
      await this.recordContextEntry(context, {
        operation: 'entity_discovery_initiated',
        data: { 
          patterns: searchPatterns, 
          requestId,
          dataSources: request.data?.dataSources || context.metadata?.dataSources || ['default']
        },
        reasoning: 'Starting entity discovery using available patterns and configured data sources'
      });

      // Perform entity discovery across data sources
      const searchResult = await this.discoverEntity(searchPatterns, request, context);

      if (searchResult.found && searchResult.entityData) {
        // Entity discovered successfully
        await this.recordContextEntry(context, {
          operation: 'entity_discovered',
          data: { 
            entity: searchResult.entityData,
            confidence: searchResult.confidence,
            metrics: searchResult.searchMetrics
          },
          reasoning: `Entity discovered with ${(searchResult.confidence * 100).toFixed(0)}% confidence from ${searchResult.entityData.source}`
        });

        // Generate confirmation UI if needed
        const uiRequests = request.data?.requireConfirmation !== false 
          ? [this.createConfirmationUI(searchResult.entityData, searchResult.confidence)]
          : [];

        return {
          status: 'needs_input',
          data: {
            entityFound: true,
            entity: searchResult.entityData,
            confidence: searchResult.confidence,
            searchMetrics: searchResult.searchMetrics
          },
          uiRequests,
          reasoning: `Entity discovered with ${searchResult.searchMetrics.matchQuality} match quality`,
          nextAgent: request.data?.nextAgent || 'profile_collector'
        };

      } else {
        // Entity not found
        await this.recordContextEntry(context, {
          operation: 'entity_not_found',
          data: { 
            searchMetrics: searchResult.searchMetrics,
            patterns: searchPatterns 
          },
          reasoning: `Entity not found after querying ${searchResult.searchMetrics.sourcesQueried.length} sources with ${searchResult.searchMetrics.patternsAttempted} pattern variations`
        });

        return {
          status: 'needs_input',
          data: { 
            entityFound: false,
            searchAttempted: true,
            searchMetrics: searchResult.searchMetrics
          },
          reasoning: 'Entity not found in available data sources, additional information needed',
          nextAgent: request.data?.nextAgent || 'profile_collector'
        };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'entity_discovery_error',
        data: { error: error.message, requestId },
        reasoning: 'Entity discovery failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during entity discovery'
      };
    }
  }

  /**
   * Extract search patterns from context and request
   * Generic pattern extraction - Task Templates define specific patterns
   */
  private extractSearchPatterns(context: TaskContext, request: AgentRequest): SearchPatterns {
    const userData = context.currentState.data.user || {};
    const entityData = context.currentState.data.entity || {};
    
    // Build search patterns from available data
    const patterns: SearchPatterns = {
      primaryIdentifier: request.data?.primaryIdentifier || entityData.identifier,
      alternateIdentifiers: [],
      attributes: {}
    };

    // Extract identifiers from various sources
    if (userData.email) {
      const domain = userData.email.split('@')[1];
      if (domain && !this.isGenericDomain(domain)) {
        patterns.alternateIdentifiers.push(domain);
        patterns.attributes.emailDomain = domain;
      }
    }

    // Add name-based patterns if available
    if (userData.name || entityData.name) {
      const name = userData.name || entityData.name;
      patterns.attributes.name = name;
      patterns.alternateIdentifiers.push(...this.generateNameVariations(name));
    }

    // Add any additional attributes from context
    if (request.data?.searchAttributes) {
      Object.assign(patterns.attributes, request.data.searchAttributes);
    }

    // Add correlation hints from Task Template
    if (context.metadata?.correlationHints) {
      patterns.correlationHints = context.metadata.correlationHints;
    }

    return patterns;
  }

  /**
   * Discover entity from configured data sources
   * Task Templates specify which sources and search strategies to use
   */
  private async discoverEntity(
    patterns: SearchPatterns, 
    request: AgentRequest,
    context: TaskContext
  ): Promise<EntitySearchResult> {
    const startTime = Date.now();
    const result: EntitySearchResult = {
      found: false,
      confidence: 0,
      searchMetrics: {
        sourcesQueried: [],
        patternsAttempted: 0,
        timeElapsed: 0,
        matchQuality: 'partial'
      }
    };

    // Get data sources from request or context
    const dataSources = request.data?.dataSources || 
                       context.metadata?.dataSources || 
                       ['public_records'];

    // Generate search variations
    const searchVariations = this.generateSearchVariations(patterns);
    result.searchMetrics.patternsAttempted = searchVariations.length;

    // Search each data source
    for (const source of dataSources) {
      try {
        result.searchMetrics.sourcesQueried.push(source);
        
        // Search with each variation
        for (const variation of searchVariations) {
          const searchResponse = await this.searchDataSource(source, variation, context);
          
          if (searchResponse.found) {
            result.found = true;
            result.entityData = searchResponse.entityData;
            result.confidence = searchResponse.confidence;
            result.searchMetrics.matchQuality = searchResponse.matchQuality || 'fuzzy';
            result.searchMetrics.timeElapsed = Date.now() - startTime;
            return result;
          }
        }

        // Respect search limits from Task Template
        const maxSources = context.metadata?.maxDataSources || 3;
        if (result.searchMetrics.sourcesQueried.length >= maxSources) {
          break;
        }

      } catch (error: any) {
        // Log search error but continue with next source
        await this.recordContextEntry(context, {
          operation: 'source_search_error',
          data: { source, error: error.message },
          reasoning: `Error searching ${source}, continuing with next data source`
        });
      }
    }

    result.searchMetrics.timeElapsed = Date.now() - startTime;
    return result;
  }

  /**
   * Generate search variations based on patterns
   * Generic variation generation - works with any entity type
   */
  private generateSearchVariations(patterns: SearchPatterns): any[] {
    const variations: any[] = [];

    // Primary identifier is highest priority
    if (patterns.primaryIdentifier) {
      variations.push({
        type: 'exact',
        identifier: patterns.primaryIdentifier,
        attributes: patterns.attributes
      });
    }

    // Add alternate identifier variations
    patterns.alternateIdentifiers.forEach(altId => {
      variations.push({
        type: 'alternate',
        identifier: altId,
        attributes: patterns.attributes
      });
    });

    // Add attribute-based searches if no identifiers
    if (variations.length === 0 && Object.keys(patterns.attributes).length > 0) {
      variations.push({
        type: 'attributes',
        identifier: null,
        attributes: patterns.attributes
      });
    }

    // Apply correlation hints if provided
    if (patterns.correlationHints) {
      variations.forEach(v => {
        v.correlationHints = patterns.correlationHints;
      });
    }

    // Limit variations to prevent excessive searching
    return variations.slice(0, 10);
  }

  /**
   * Generate name variations for searching
   * Generic algorithm - works with any naming pattern
   */
  private generateNameVariations(name: string): string[] {
    if (!name) return [];
    
    const variations: string[] = [];
    const baseName = name.trim();
    
    // Basic variations
    variations.push(
      baseName,
      baseName.toLowerCase(),
      baseName.toUpperCase(),
      baseName.replace(/\s+/g, ''), // No spaces
      baseName.replace(/[^a-zA-Z0-9]/g, '') // Alphanumeric only
    );

    // If multi-word, try last word (often surname or main identifier)
    const words = baseName.split(/\s+/);
    if (words.length > 1) {
      variations.push(words[words.length - 1]);
      variations.push(words[0]); // First word
      variations.push(words.map(w => w[0]).join('')); // Initials
    }

    // Remove duplicates
    return [...new Set(variations)].slice(0, 8);
  }

  /**
   * Search a specific data source
   * This is where Task Templates can provide source-specific logic
   */
  private async searchDataSource(
    source: string, 
    searchPattern: any,
    context: TaskContext
  ): Promise<{
    found: boolean;
    confidence: number;
    entityData?: any;
    matchQuality?: string;
  }> {
    // Task Templates provide source-specific search configuration
    const _sourceConfig = context.metadata?.dataSourceConfigs?.[source] || {};
    
    // This would integrate with actual data sources via ToolChain
    // For now, return not found to maintain system flow
    console.log(`[EntityDiscovery] Searching ${source} with pattern:`, searchPattern.type);
    
    // Real implementation would:
    // 1. Use ToolChain to access the data source
    // 2. Apply search pattern with source-specific logic
    // 3. Calculate confidence based on match quality
    // 4. Return structured entity data
    
    return { 
      found: false, 
      confidence: 0
    };
  }

  /**
   * Create confirmation UI for discovered entity
   * Generic UI that works with any entity type
   */
  private createConfirmationUI(entityData: any, confidence: number): UIRequest {
    return {
      requestId: `entity_confirm_${Date.now()}`,
      templateType: 'entity_confirmation' as any,
      semanticData: {
        agentRole: 'entity_discovery_agent',
        title: 'Entity Found',
        description: `We found an entity matching your information with ${(confidence * 100).toFixed(0)}% confidence`,
        entityData,
        confidence: {
          score: confidence,
          source: entityData.source,
          lastVerified: entityData.lastVerified || new Date().toISOString()
        },
        actions: {
          confirm: {
            type: 'submit' as const,
            label: 'Yes, this is correct',
            primary: true,
            handler: () => ({ action: 'confirm_entity', entityData })
          },
          reject: {
            type: 'cancel' as const,
            label: 'No, this is not correct',
            handler: () => ({ action: 'reject_entity' })
          },
          modify: {
            type: 'custom' as const,
            label: 'Edit Details',
            handler: () => ({ action: 'modify_entity', entityData })
          }
        }
      },
      context: {
        userProgress: 25,
        deviceType: 'responsive',
        urgency: 'medium'
      }
    } as any;
  }

  /**
   * Check if domain is generic (not entity-specific)
   */
  private isGenericDomain(domain: string): boolean {
    const genericDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'
    ];
    return genericDomains.includes(domain.toLowerCase());
  }

  /**
   * Record context entry with proper reasoning
   */
  private async recordContextEntry(context: TaskContext, entry: Partial<ContextEntry>): Promise<void> {
    const contextEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: (context.history?.length || 0) + 1,
      actor: {
        type: 'agent',
        id: 'entity_discovery_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Entity discovery action',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'entity_discovery',
        details: {}
      }
    };

    if (!context.history) {
      context.history = [];
    }
    context.history.push(contextEntry);

    // Persist to database if available
    if (context.contextId) {
      try {
        const db = DatabaseService.getInstance();
        await db.createContextHistoryEntry(context.contextId, contextEntry);
      } catch (error) {
        console.error('Failed to persist context entry to database:', error);
        // Continue even if database write fails
      }
    }
  }
}