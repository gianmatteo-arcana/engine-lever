/**
 * California Business Search Tool
 * 
 * Uses Stagehand to scrape business information from the California
 * Secretary of State website (bizfileonline.sos.ca.gov)
 * 
 * This tool is stateless - creates a new browser instance for each search
 * and closes it after retrieving results.
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod/v3';
import { logger } from '../utils/logger';

export interface CaliforniaBusinessDetails {
  entityName: string;
  entityNumber: string;
  registrationDate?: string;
  status: string;
  entityType: string;
  jurisdiction?: string;
  agentName?: string;
  agentAddress?: string;
  principalAddress?: string;
  mailingAddress?: string;
  ceoName?: string;
  secretaryName?: string;
  cfoName?: string;
  directors?: string[];
  filingHistory?: Array<{
    date: string;
    type: string;
    description: string;
  }>;
}

export interface BusinessLookupResult {
  success: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  entity?: CaliforniaBusinessDetails;
  alternatives?: CaliforniaBusinessDetails[];
  reason?: string;
  suggestedUserPrompt?: string;
}

export interface BusinessLookupOptions {
  strictMatching?: boolean;
  includeInactive?: boolean;
  maxAlternatives?: number;
  timeoutMs?: number;
}

export class CaliforniaBusinessSearchTool {
  private readonly searchUrl = 'https://bizfileonline.sos.ca.gov/search/business';
  
  /**
   * Search for a business by name in California
   * Creates a new browser instance for this search
   */
  async searchByName(businessName: string): Promise<CaliforniaBusinessDetails[]> {
    logger.info(`[CaliforniaBusinessSearch] Starting search for: ${businessName}`);
    
    let stagehand: Stagehand | null = null;
    
    try {
      // Create new Stagehand instance for this search
      // Run headless by default, unless DEBUG_BROWSER env var is set
      const headless = !process.env.DEBUG_BROWSER;
      
      stagehand = new Stagehand({
        env: 'LOCAL',
        verbose: 1,
        domSettleTimeoutMs: 15000,
        localBrowserLaunchOptions: {
          headless,
          args: headless ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=VizDisplayCompositor',
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
          ] : [],
          viewport: { width: 1920, height: 1080 },
          userDataDir: undefined // Don't persist browser data
        }
      });
      
      await stagehand.init();
      const page = stagehand.page;
      await page.goto(this.searchUrl);
      
      logger.info('[CaliforniaBusinessSearch] Navigated to search page');
      
      // Wait for page to fully load and detect iframe presence
      await new Promise(resolve => setTimeout(resolve, 5000)); // Allow time for dynamic content
      
      // Check if iframe exists (headless vs non-headless difference)
      try {
        await page.waitForSelector('iframe', { timeout: 10000 });
        logger.info('[CaliforniaBusinessSearch] Iframe detected, using iframe-aware approach');
        
        // Use iframe-aware approach
        await page.act({ action: 'Select "Corporation Name" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
        await page.act({ action: `Enter "${businessName}" in the business name search field`, iframes: true, domSettleTimeoutMs: 15000 });
        await page.act({ action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });
      } catch (iframeError) {
        logger.info('[CaliforniaBusinessSearch] No iframe detected, using direct approach');
        
        // Use direct approach for non-iframe version
        await page.act({ action: 'Select "Corporation Name" from the search type dropdown', domSettleTimeoutMs: 15000 });
        await page.act({ action: `Enter "${businessName}" in the business name search field`, domSettleTimeoutMs: 15000 });
        await page.act({ action: 'Click the Search button', domSettleTimeoutMs: 15000 });
      }
      
      // Wait for results to load with timeout protection
      try {
        await page.waitForLoadState('load', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Additional wait for dynamic content
      } catch (loadError) {
        logger.warn('[CaliforniaBusinessSearch] Page load timeout, proceeding with extraction');
      }
      
      logger.info('[CaliforniaBusinessSearch] Extracting search results');
      
      // Extract the search results
      const searchResultsSchema = z.object({
        results: z.array(
          z.object({
            entityName: z.string(),
            entityNumber: z.string(),
            registrationDate: z.string().optional(),
            status: z.string(),
            entityType: z.string(),
            jurisdiction: z.string().optional()
          })
        )
      });
      
      // Check iframe presence for extraction
      let useIframes = false;
      try {
        await page.waitForSelector('iframe', { timeout: 2000 });
        useIframes = true;
      } catch {
        // Iframe not present - use direct approach
      }
      
      const extractedData = await page.extract({
        instruction: `Extract all business search results. For each result, get the entity name, entity number, registration date, status, entity type, and jurisdiction if available`,
        schema: searchResultsSchema,
        ...(useIframes ? { iframes: true } : {}),
        domSettleTimeoutMs: 15000
      });
      
      const searchResults = extractedData.results || [];
      
      if (searchResults.length === 0) {
        logger.info('[CaliforniaBusinessSearch] No results found');
        return [];
      }
      
      logger.info(`[CaliforniaBusinessSearch] Found ${searchResults.length} results`);
      
      // Return basic search results directly (no detailed page navigation)
      // This makes searchByName fast regardless of result count
      logger.info(`[CaliforniaBusinessSearch] Completed fast search with ${searchResults.length} basic results`);
      return searchResults;
      
    } catch (error) {
      logger.error('[CaliforniaBusinessSearch] Search error:', error);
      throw new Error(`Failed to search California business registry: ${error}`);
    } finally {
      // Always close the browser instance
      if (stagehand) {
        try {
          await stagehand.close();
          logger.info('[CaliforniaBusinessSearch] Browser instance closed');
        } catch (closeError) {
          logger.error('[CaliforniaBusinessSearch] Error closing browser:', closeError);
        }
      }
    }
  }
  
  /**
   * Search for a business by entity number
   */
  async searchByEntityNumber(entityNumber: string): Promise<CaliforniaBusinessDetails | null> {
    logger.info(`[CaliforniaBusinessSearch] Starting search for entity: ${entityNumber}`);
    
    let stagehand: Stagehand | null = null;
    
    try {
      // Run headless by default, unless DEBUG_BROWSER env var is set
      const headless = !process.env.DEBUG_BROWSER;
      
      stagehand = new Stagehand({
        env: 'LOCAL',
        verbose: 1,
        domSettleTimeoutMs: 15000,
        localBrowserLaunchOptions: {
          headless,
          args: headless ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=VizDisplayCompositor',
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
          ] : [],
          viewport: { width: 1920, height: 1080 },
          userDataDir: undefined // Don't persist browser data
        }
      });
      
      await stagehand.init();
      const page = stagehand.page;
      await page.goto(this.searchUrl);
      
      // Wait for page to fully load and detect iframe presence
      await new Promise(resolve => setTimeout(resolve, 5000)); // Allow time for dynamic content
      
      // Check if iframe exists (headless vs non-headless difference)
      try {
        await page.waitForSelector('iframe', { timeout: 10000 });
        logger.info('[CaliforniaBusinessSearch] Iframe detected, using iframe-aware approach');
        
        // Use iframe-aware approach
        await page.act({ action: 'Select "Entity Number" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
        await page.act({ action: `Enter "${entityNumber}" in the entity number search field`, iframes: true, domSettleTimeoutMs: 15000 });
        await page.act({ action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });
      } catch (iframeError) {
        logger.info('[CaliforniaBusinessSearch] No iframe detected, using direct approach');
        
        // Use direct approach for non-iframe version
        await page.act({ action: 'Select "Entity Number" from the search type dropdown', domSettleTimeoutMs: 15000 });
        await page.act({ action: `Enter "${entityNumber}" in the entity number search field`, domSettleTimeoutMs: 15000 });
        await page.act({ action: 'Click the Search button', domSettleTimeoutMs: 15000 });
      }
      
      // Wait for results with timeout protection
      try {
        await page.waitForLoadState('load', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Additional wait for dynamic content
      } catch (loadError) {
        logger.warn('[CaliforniaBusinessSearch] Page load timeout, proceeding with extraction');
      }
      
      // Extract comprehensive detailed information (searchByEntityNumber returns ALL available details)
      const detailsSchema = z.object({
        entityName: z.string(),
        entityNumber: z.string(),
        registrationDate: z.string().optional(),
        status: z.string(),
        entityType: z.string(),
        jurisdiction: z.string().optional(),
        
        // Agent information
        agentName: z.string().optional(),
        agentAddress: z.string().optional(),
        agentCity: z.string().optional(),
        agentState: z.string().optional(),
        agentZip: z.string().optional(),
        
        // Business addresses
        principalAddress: z.string().optional(),
        mailingAddress: z.string().optional(),
        streetAddress: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        
        // Officers and management
        ceoName: z.string().optional(),
        presidentName: z.string().optional(),
        secretaryName: z.string().optional(),
        cfoName: z.string().optional(),
        treasurerName: z.string().optional(),
        directors: z.array(z.string()).optional(),
        officers: z.array(z.object({
          name: z.string(),
          title: z.string(),
          address: z.string().optional()
        })).optional(),
        
        // Business details
        businessPurpose: z.string().optional(),
        ein: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        
        // Filing and status information
        filingHistory: z.array(
          z.object({
            date: z.string(),
            type: z.string(),
            description: z.string(),
            status: z.string().optional()
          })
        ).optional(),
        lastFilingDate: z.string().optional(),
        nextFilingDue: z.string().optional(),
        taxStatus: z.string().optional(),
        
        // Additional metadata
        incorporationState: z.string().optional(),
        stockShares: z.string().optional(),
        stockType: z.string().optional()
      });
      
      // Check iframe presence for extraction
      let useIframes = false;
      try {
        await page.waitForSelector('iframe', { timeout: 2000 });
        useIframes = true;
      } catch {
        // Iframe not present - use direct approach
      }
      
      const details = await page.extract({
        instruction: `Extract ALL available business information from this entity details page including:
        - Basic entity info (name, number, status, type, registration date)
        - Complete agent information (name, full address)
        - All business addresses (principal, mailing, street addresses)  
        - All officers and directors with names and titles
        - Business details (purpose, EIN, contact info)
        - Complete filing history with dates and types
        - Tax and incorporation status
        - Any stock or share information
        - All other available details on the page`,
        schema: detailsSchema,
        ...(useIframes ? { iframes: true } : {}),
        domSettleTimeoutMs: 15000
      });
      
      logger.info('[CaliforniaBusinessSearch] Entity details extracted successfully');
      return details as CaliforniaBusinessDetails;
      
    } catch (error) {
      logger.error('[CaliforniaBusinessSearch] Search error:', error);
      return null;
    } finally {
      if (stagehand) {
        try {
          await stagehand.close();
        } catch (closeError) {
          logger.error('[CaliforniaBusinessSearch] Error closing browser:', closeError);
        }
      }
    }
  }

  /**
   * Agent-friendly lookup with robust error handling and confidence scoring
   * Designed for automated workflows where graceful failure is important
   */
  async lookupBusiness(
    businessName: string, 
    options: BusinessLookupOptions = {}
  ): Promise<BusinessLookupResult> {
    const {
      strictMatching = false,
      includeInactive = false,
      maxAlternatives = 3,
      timeoutMs = 45000
    } = options;

    logger.info(`[CaliforniaBusinessSearch] Agent lookup for: "${businessName}"`);

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
      const searchPromise = this.searchByName(businessName);
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
      logger.error(`[CaliforniaBusinessSearch] Agent lookup failed for: "${businessName}"`, error);
      
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
   * Smart lookup that tries name first, then suggests entity number lookup
   */
  async smartLookup(
    businessName: string, 
    entityNumber?: string
  ): Promise<BusinessLookupResult> {
    // If we have entity number, use that first (most reliable)
    if (entityNumber) {
      const entityResult = await this.searchByEntityNumber(entityNumber);
      if (entityResult) {
        return {
          success: true,
          confidence: 'high',
          entity: entityResult
        };
      }
      logger.info(`[CaliforniaBusinessSearch] Entity number failed, trying name search`);
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

  // Private helper methods for agent lookup
  private async handleNoResults(businessName: string): Promise<BusinessLookupResult> {
    // Try variations of the business name
    const variations = this.generateNameVariations(businessName);
    
    for (const variation of variations) {
      try {
        const results = await this.searchByName(variation);
        if (results && results.length > 0) {
          logger.info(`[CaliforniaBusinessSearch] Found results with variation: "${variation}"`);
          return {
            success: false,
            confidence: 'low',
            reason: `No exact match found for "${businessName}"`,
            alternatives: results.slice(0, 3),
            suggestedUserPrompt: `No exact match found for "${businessName}". Found similar businesses - is one of these correct?`
          };
        }
      } catch (error) {
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
      return similarity > 0.8;
    });

    if (closeMatches.length === 1) {
      return {
        success: true,
        confidence: 'medium',
        entity: closeMatches[0]
      };
    }

    return {
      success: false,
      confidence: 'low',
      reason: 'Multiple possible matches found',
      alternatives: results.slice(0, maxAlternatives),
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
      .replace(/[^\w\s]/g, '')
      .replace(/\b(llc|inc|corp|corporation|company|co|ltd)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const normalized1 = this.normalizeForComparison(name1);
    const normalized2 = this.normalizeForComparison(name2);
    
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
}

// Export singleton instance for convenience
export const californiaBusinessSearch = new CaliforniaBusinessSearchTool();