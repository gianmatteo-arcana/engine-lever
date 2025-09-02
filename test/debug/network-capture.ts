#!/usr/bin/env npx ts-node

/**
 * Debug script to capture network requests during California business search
 * This helps us reverse engineer the actual API endpoints being used
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { logger } from './utils/logger';

interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
}

async function captureNetworkTraffic(searchTerm: string = 'Apple Inc') {
  logger.info(`[NetworkCapture] Starting network capture for search: ${searchTerm}`);
  
  const requests: NetworkRequest[] = [];
  let stagehand: Stagehand | null = null;
  
  try {
    stagehand = new Stagehand({
      env: 'LOCAL',
      verbose: 2, // More verbose for debugging
      domSettleTimeoutMs: 15000,
      localBrowserLaunchOptions: {
        headless: false, // Run visible so we can monitor
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        ],
        viewport: { width: 1920, height: 1080 },
        userDataDir: undefined
      }
    });

    await stagehand.init();
    const page = stagehand.page;

    // Capture all requests
    page.on('request', (request: any) => {
      const networkRequest: NetworkRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData()
      };
      
      // Log important requests (not images, fonts, etc.)
      if (!request.url().match(/\.(png|jpg|jpeg|gif|css|js|woff|woff2)(\?|$)/i)) {
        logger.info(`[NetworkCapture] REQUEST: ${request.method()} ${request.url()}`);
        if (request.postData()) {
          logger.info(`[NetworkCapture] POST DATA: ${request.postData()}`);
        }
      }
      
      requests.push(networkRequest);
    });

    // Capture all responses
    page.on('response', async (response: any) => {
      const request = requests.find(req => req.url === response.url());
      if (request && !response.url().match(/\.(png|jpg|jpeg|gif|css|js|woff|woff2)(\?|$)/i)) {
        try {
          const body = await response.text();
          request.response = {
            status: response.status(),
            headers: response.headers(),
            body: body.length > 2000 ? body.substring(0, 2000) + '...[truncated]' : body
          };
          
          logger.info(`[NetworkCapture] RESPONSE: ${response.status()} ${response.url()}`);
          if (body && body.length > 0 && body.includes('results')) {
            logger.info(`[NetworkCapture] RESPONSE BODY (partial): ${body.substring(0, 500)}`);
          }
        } catch (error) {
          logger.error(`[NetworkCapture] Error reading response body:`, error);
        }
      }
    });

    // Navigate to the search page
    await page.goto('https://bizfileonline.sos.ca.gov/search/business');
    logger.info('[NetworkCapture] Navigated to search page');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    logger.info('[NetworkCapture] Starting search interaction');

    // Perform the search using our current approach
    await page.act({ action: 'Select "Corporation Name" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
    await page.act({ action: `Enter "${searchTerm}" in the business name search field`, iframes: true, domSettleTimeoutMs: 15000 });
    
    logger.info('[NetworkCapture] About to click search button - this should trigger the key API calls');
    await page.act({ action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });

    // Wait for search results
    await page.waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Additional wait

    logger.info('[NetworkCapture] Search completed, analyzing captured requests...');

  } catch (error) {
    logger.error('[NetworkCapture] Error during capture:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
    }
  }

  // Analyze the captured requests
  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`[NetworkCapture] ANALYSIS - Captured ${requests.length} requests`);
  logger.info(`${'='.repeat(80)}`);

  // Look for API-like requests
  const apiRequests = requests.filter(req => {
    const url = req.url.toLowerCase();
    return (
      // Look for common API patterns
      url.includes('/api/') ||
      url.includes('/search') ||
      url.includes('/query') ||
      url.includes('.json') ||
      url.includes('.xml') ||
      // Look for POST requests (likely form submissions)
      req.method === 'POST' ||
      // Look for requests with search-related parameters
      url.includes('name=') ||
      url.includes('entity') ||
      url.includes('business')
    ) && (
      // Exclude static resources
      !url.match(/\.(png|jpg|jpeg|gif|css|js|woff|woff2)(\?|$)/i)
    );
  });

  logger.info(`\n[NetworkCapture] Found ${apiRequests.length} potential API requests:`);
  
  apiRequests.forEach((req, index) => {
    logger.info(`\n--- Request ${index + 1} ---`);
    logger.info(`URL: ${req.url}`);
    logger.info(`Method: ${req.method}`);
    
    if (req.postData) {
      logger.info(`POST Data: ${req.postData}`);
    }
    
    if (req.response) {
      logger.info(`Response Status: ${req.response.status}`);
      if (req.response.body && req.response.body.length > 0) {
        logger.info(`Response Body: ${req.response.body}`);
      }
    }
  });

  // Generate curl commands for the interesting requests
  logger.info(`\n${'='.repeat(80)}`);
  logger.info(`[NetworkCapture] CURL COMMANDS FOR REPRODUCTION`);
  logger.info(`${'='.repeat(80)}`);

  apiRequests.forEach((req, index) => {
    if (req.method === 'POST' && req.postData) {
      logger.info(`\n# Request ${index + 1}:`);
      let curlCmd = `curl -X ${req.method} '${req.url}'`;
      
      // Add headers
      Object.entries(req.headers).forEach(([key, value]) => {
        if (!key.toLowerCase().includes('cookie') && !key.toLowerCase().includes('authorization')) {
          curlCmd += ` \\\n  -H '${key}: ${value}'`;
        }
      });
      
      // Add POST data
      if (req.postData) {
        curlCmd += ` \\\n  -d '${req.postData}'`;
      }
      
      logger.info(curlCmd);
    }
  });

  logger.info(`\n[NetworkCapture] Network capture completed!`);
  return { requests, apiRequests };
}

// Main execution
async function main() {
  const searchTerm = process.argv[2] || 'Apple Inc';
  
  logger.info(`[NetworkCapture] Starting network traffic analysis for: "${searchTerm}"`);
  logger.info(`[NetworkCapture] This will run in visible browser mode to monitor network requests`);
  logger.info(`[NetworkCapture] Looking for API endpoints that can be called directly...\n`);
  
  try {
    await captureNetworkTraffic(searchTerm);
  } catch (error) {
    logger.error('[NetworkCapture] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}