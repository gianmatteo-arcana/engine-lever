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
      stagehand = new Stagehand({
        env: 'LOCAL',
        verbose: 1
      });
      
      await stagehand.init();
      const page = stagehand.page;
      await page.goto(this.searchUrl);
      
      logger.info('[CaliforniaBusinessSearch] Navigated to search page');
      
      // Select search type and enter business name
      await page.act('Select "Corporation Name" from the search type dropdown');
      
      await page.act(`Enter "${businessName}" in the business name search field`);
      
      await page.act('Click the Search button');
      
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
        schema: searchResultsSchema
      });
      
      const searchResults = extractedData.results || [];
      
      if (searchResults.length === 0) {
        logger.info('[CaliforniaBusinessSearch] No results found');
        return [];
      }
      
      logger.info(`[CaliforniaBusinessSearch] Found ${searchResults.length} results`);
      
      // For each result, click through to get detailed information
      const detailedResults: CaliforniaBusinessDetails[] = [];
      
      for (const result of searchResults) {
        try {
          // Navigate back to search results if needed
          await page.act(`Click on the entity number ${result.entityNumber} to view details`);
          
          await page.waitForLoadState('networkidle');
          
          // Extract detailed information from the entity page
          const detailsSchema = z.object({
            agentName: z.string().optional(),
            agentAddress: z.string().optional(),
            principalAddress: z.string().optional(),
            mailingAddress: z.string().optional(),
            ceoName: z.string().optional(),
            secretaryName: z.string().optional(),
            cfoName: z.string().optional(),
            directors: z.array(z.string()).optional(),
            filingHistory: z.array(
              z.object({
                date: z.string(),
                type: z.string(),
                description: z.string()
              })
            ).optional()
          });
          
          const details = await page.extract({
            instruction: `Extract all available business details including entity information, agent information, addresses, officers, and filing history`,
            schema: detailsSchema
          });
          
          // Combine basic and detailed information
          detailedResults.push({
            ...result,
            ...(details || {})
          });
          
          // Navigate back to search results for next entity
          await page.goBack();
          await page.waitForLoadState('networkidle');
          
        } catch (detailError) {
          logger.error(`[CaliforniaBusinessSearch] Error getting details for ${result.entityNumber}:`, detailError);
          // Still include the basic information even if details fail
          detailedResults.push(result as CaliforniaBusinessDetails);
        }
      }
      
      logger.info(`[CaliforniaBusinessSearch] Completed search with ${detailedResults.length} detailed results`);
      return detailedResults;
      
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
      stagehand = new Stagehand({
        env: 'LOCAL',
        verbose: 1
      });
      
      await stagehand.init();
      const page = stagehand.page;
      await page.goto(this.searchUrl);
      
      // Select entity number search
      await page.act('Select "Entity Number" from the search type dropdown');
      
      await page.act(`Enter "${entityNumber}" in the entity number search field`);
      
      await page.act('Click the Search button');
      
      await page.waitForLoadState('networkidle');
      
      // Extract the detailed information directly (entity number search goes straight to details)
      const detailsSchema = z.object({
        entityName: z.string(),
        entityNumber: z.string(),
        registrationDate: z.string().optional(),
        status: z.string(),
        entityType: z.string(),
        jurisdiction: z.string().optional(),
        agentName: z.string().optional(),
        agentAddress: z.string().optional(),
        principalAddress: z.string().optional(),
        mailingAddress: z.string().optional(),
        ceoName: z.string().optional(),
        secretaryName: z.string().optional(),
        cfoName: z.string().optional(),
        directors: z.array(z.string()).optional(),
        filingHistory: z.array(
          z.object({
            date: z.string(),
            type: z.string(),
            description: z.string()
          })
        ).optional()
      });
      
      const details = await page.extract({
        instruction: `Extract all available business details including entity name, number, status, type, registration date, agent information, addresses, officers, and filing history`,
        schema: detailsSchema
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