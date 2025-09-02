/**
 * Agent-Friendly Business Lookup Tool
 * 
 * This tool provides robust business entity lookup specifically designed for agent-driven
 * user onboarding workflows. It handles ambiguous results, failures, and edge cases
 * gracefully so agents can prefill business profile information without requiring
 * user input.
 */

import { CaliforniaBusinessSearchTool, CaliforniaBusinessDetails } from './california-business-search';
import { logger } from '../utils/logger';

export interface BusinessLookupResult {
  success: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  entity?: CaliforniaBusinessDetails;
  alternatives?: CaliforniaBusinessDetails[];
  reason?: string;
  suggestedUserPrompt?: string; // What to ask user if we need clarification
}

export interface BusinessLookupOptions {
  strictMatching?: boolean; // If true, only return exact matches
  includeInactive?: boolean; // If true, include dissolved/inactive entities
  maxAlternatives?: number; // How many alternatives to return
  timeoutMs?: number; // Timeout for search operation
}

export class AgentBusinessLookup {
  private searchTool: CaliforniaBusinessSearchTool;
  
  constructor() {
    this.searchTool = new CaliforniaBusinessSearchTool();
  }

  /**
   * Primary method for agents: Look up a business entity with robust handling
   */
  async lookupBusiness(
    businessName: string, 
    options: BusinessLookupOptions = {}
  ): Promise<BusinessLookupResult> {
    const {
      strictMatching = false,
      includeInactive = false,
      maxAlternatives = 3,
      timeoutMs = 45000 // 45 second timeout
    } = options;

    logger.info(`[AgentBusinessLookup] Starting lookup for: "${businessName}"`);

    // Input validation
    if (!businessName || businessName.trim().length < 2) {
      return {
        success: false,
        confidence: 'none',
        reason: 'Business name too short or empty',
        suggestedUserPrompt: 'Please provide the full legal business name'
      };
    }

    try {
      // Search with timeout
      const searchPromise = this.searchTool.searchByName(businessName);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Search timeout')), timeoutMs)
      );

      const results = await Promise.race([searchPromise, timeoutPromise]);
      
      if (!results || results.length === 0) {
        return await this.handleNoResults(businessName);
      }

      // Filter results based on options
      let filteredResults = results;
      if (!includeInactive) {
        filteredResults = results.filter(entity => 
          !this.isInactive(entity.status)
        );
      }

      if (filteredResults.length === 0) {
        return {
          success: false,
          confidence: 'low',
          reason: 'Only inactive entities found',
          alternatives: results.slice(0, maxAlternatives),
          suggestedUserPrompt: 'Found dissolved/inactive entities with this name. Is the business currently active?'
        };
      }

      // Analyze results for best match
      return this.analyzeResults(businessName, filteredResults, maxAlternatives, strictMatching);

    } catch (error) {
      logger.error(`[AgentBusinessLookup] Search failed for: "${businessName}"`, error);
      
      if (error instanceof Error && error.message?.includes('timeout')) {
        return {
          success: false,
          confidence: 'none',
          reason: 'Search timeout - California SOS website may be slow',
          suggestedUserPrompt: 'The business registry search is currently slow. Please try again later or provide the entity number if known.'
        };
      }

      return {
        success: false,
        confidence: 'none',
        reason: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestedUserPrompt: 'Unable to search business registry. Please provide business details manually.'
      };
    }
  }

  /**
   * Look up business by entity number (more reliable for agents when available)
   */
  async lookupByEntityNumber(entityNumber: string): Promise<BusinessLookupResult> {
    logger.info(`[AgentBusinessLookup] Entity number lookup: ${entityNumber}`);

    if (!entityNumber || !this.isValidEntityNumber(entityNumber)) {
      return {
        success: false,
        confidence: 'none',
        reason: 'Invalid entity number format',
        suggestedUserPrompt: 'Please provide a valid California entity number (e.g., C1234567)'
      };
    }

    try {
      const result = await this.searchTool.searchByEntityNumber(entityNumber);
      
      if (!result) {
        return {
          success: false,
          confidence: 'none',
          reason: 'Entity number not found',
          suggestedUserPrompt: `Entity number ${entityNumber} was not found. Please verify the number is correct.`
        };
      }

      return {
        success: true,
        confidence: 'high',
        entity: result
      };

    } catch (error) {
      logger.error(`[AgentBusinessLookup] Entity search failed: ${entityNumber}`, error);
      return {
        success: false,
        confidence: 'none',
        reason: `Entity lookup error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestedUserPrompt: 'Unable to lookup entity number. Please provide business details manually.'
      };
    }
  }

  /**
   * Smart business lookup that tries name first, then suggests entity number lookup
   */
  async smartLookup(
    businessName: string, 
    entityNumber?: string
  ): Promise<BusinessLookupResult> {
    // If we have entity number, use that first (most reliable)
    if (entityNumber) {
      const entityResult = await this.lookupByEntityNumber(entityNumber);
      if (entityResult.success) {
        return entityResult;
      }
      // If entity number fails, fall back to name search
      logger.info(`[AgentBusinessLookup] Entity number failed, trying name search`);
    }

    // Try name search
    const nameResult = await this.lookupBusiness(businessName);
    
    // If name search is ambiguous, suggest entity number lookup
    if (nameResult.success && nameResult.confidence === 'medium' && nameResult.alternatives) {
      nameResult.suggestedUserPrompt = 
        `Found multiple matches for "${businessName}". For precise identification, please provide the California entity number.`;
    }

    return nameResult;
  }

  // Private helper methods

  private async handleNoResults(businessName: string): Promise<BusinessLookupResult> {
    // Try variations of the business name
    const variations = this.generateNameVariations(businessName);
    
    for (const variation of variations) {
      try {
        const results = await this.searchTool.searchByName(variation);
        if (results && results.length > 0) {
          logger.info(`[AgentBusinessLookup] Found results with variation: "${variation}"`);
          return {
            success: false,
            confidence: 'low',
            reason: `No exact match found for "${businessName}"`,
            alternatives: results.slice(0, 3),
            suggestedUserPrompt: `No exact match found for "${businessName}". Found similar businesses - is one of these correct?`
          };
        }
      } catch (error) {
        // Continue trying other variations
        continue;
      }
    }

    return {
      success: false,
      confidence: 'none',
      reason: 'No matching businesses found',
      suggestedUserPrompt: `No businesses found matching "${businessName}". Please verify the business name or provide the California entity number.`
    };
  }

  private analyzeResults(
    searchTerm: string, 
    results: CaliforniaBusinessDetails[], 
    maxAlternatives: number,
    strictMatching: boolean
  ): BusinessLookupResult {
    const normalizedSearch = this.normalizeForComparison(searchTerm);
    
    // Find exact matches
    const exactMatches = results.filter(entity => {
      const normalizedEntity = this.normalizeForComparison(entity.entityName || '');
      return normalizedEntity === normalizedSearch;
    });

    if (exactMatches.length === 1) {
      return {
        success: true,
        confidence: 'high',
        entity: exactMatches[0]
      };
    }

    if (exactMatches.length > 1) {
      // Multiple exact matches - need user clarification
      return {
        success: false,
        confidence: 'medium',
        reason: 'Multiple exact matches found',
        alternatives: exactMatches.slice(0, maxAlternatives),
        suggestedUserPrompt: `Found ${exactMatches.length} businesses with exact name "${searchTerm}". Please provide additional details or entity number.`
      };
    }

    if (strictMatching) {
      return {
        success: false,
        confidence: 'low',
        reason: 'No exact match found (strict mode)',
        alternatives: results.slice(0, maxAlternatives),
        suggestedUserPrompt: `No exact match found for "${searchTerm}". Please verify the exact legal business name.`
      };
    }

    // Find close matches
    const closeMatches = results.filter(entity => {
      const similarity = this.calculateNameSimilarity(searchTerm, entity.entityName || '');
      return similarity > 0.8; // 80% similarity threshold
    });

    if (closeMatches.length === 1) {
      return {
        success: true,
        confidence: 'medium',
        entity: closeMatches[0]
      };
    }

    // Return best matches for user review
    const bestMatches = results.slice(0, maxAlternatives);
    return {
      success: false,
      confidence: 'low',
      reason: 'Multiple possible matches found',
      alternatives: bestMatches,
      suggestedUserPrompt: `Found several businesses matching "${searchTerm}". Please review and select the correct one.`
    };
  }

  private generateNameVariations(businessName: string): string[] {
    const variations: string[] = [];
    const cleanName = businessName.trim();
    
    // Try without common suffixes
    const suffixes = ['LLC', 'Inc', 'Corp', 'Corporation', 'Company', 'Co', 'Ltd'];
    let withoutSuffix = cleanName;
    for (const suffix of suffixes) {
      withoutSuffix = withoutSuffix.replace(new RegExp(`\\s+${suffix}\\.?$`, 'i'), '');
    }
    if (withoutSuffix !== cleanName) {
      variations.push(withoutSuffix);
    }

    // Try with common suffixes if not present
    if (!/\b(LLC|Inc|Corp|Corporation|Company|Co|Ltd)\b/i.test(cleanName)) {
      variations.push(`${cleanName} LLC`);
      variations.push(`${cleanName} Inc`);
      variations.push(`${cleanName} Corporation`);
    }

    return variations;
  }

  private normalizeForComparison(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\b(llc|inc|corp|corporation|company|co|ltd)\b/g, '') // Remove suffixes
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const normalized1 = this.normalizeForComparison(name1);
    const normalized2 = this.normalizeForComparison(name2);
    
    // Simple word-based Jaccard similarity
    const words1 = new Set(normalized1.split(' '));
    const words2 = new Set(normalized2.split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private isInactive(status: string): boolean {
    const inactiveStatuses = [
      'dissolved', 'suspended', 'cancelled', 'forfeited', 
      'inactive', 'terminated', 'merged', 'converted'
    ];
    return inactiveStatuses.some(inactive => 
      status.toLowerCase().includes(inactive)
    );
  }

  private isValidEntityNumber(entityNumber: string): boolean {
    // California entity numbers are typically format: C1234567, 12345678, etc.
    return /^[A-Z]?\d{7,8}$/i.test(entityNumber.trim());
  }
}

// Export singleton for use by agents
export const agentBusinessLookup = new AgentBusinessLookup();