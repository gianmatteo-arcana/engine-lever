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
      
      // Wait for iframe content to fully load
      await page.waitForLoadState('networkidle');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Additional 3 second wait
      
      // Try direct approach first - use known selectors
      try {
        // Wait for iframe to be ready
        await page.waitForSelector('iframe', { timeout: 10000 });
        const iframe = page.locator('iframe').first();
        const iframeContent = await iframe.contentFrame();
        
        if (iframeContent) {
          // Fill the search input directly
          await iframeContent.locator('input.search-input').fill(businessName);
          await iframeContent.locator('button:has-text("Execute search")').click();
          
          logger.info('[CaliforniaBusinessSearch] Used direct selectors successfully');
        } else {
          throw new Error('Could not access iframe content');
        }
      } catch (directError) {
        logger.info(`[CaliforniaBusinessSearch] Direct approach failed: ${directError}. Falling back to Stagehand AI.`);
        
        // Fallback to Stagehand AI approach
        await page.act({ action: 'Select "Corporation Name" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
        await page.act({ action: `Enter "${businessName}" in the business name search field`, iframes: true, domSettleTimeoutMs: 15000 });
        await page.act({ action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });
      }
      
      // Wait for results to load
      await page.waitForLoadState('networkidle');
      
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
      
      const extractedData = await page.extract({
        instruction: `Extract all business search results. For each result, get the entity name, entity number, registration date, status, entity type, and jurisdiction if available`,
        schema: searchResultsSchema,
        iframes: true,
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
      
      // Wait for iframe content to fully load
      await page.waitForLoadState('networkidle');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Additional 3 second wait
      
      // Select entity number search
      await page.act({ action: 'Select "Entity Number" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
      
      await page.act({ action: `Enter "${entityNumber}" in the entity number search field`, iframes: true, domSettleTimeoutMs: 15000 });
      
      await page.act({ action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });
      
      await page.waitForLoadState('networkidle');
      
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
        iframes: true,
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
}

// Export singleton instance for convenience
export const californiaBusinessSearch = new CaliforniaBusinessSearchTool();