/**
 * Unit tests for California Business Search Tool
 * 
 * These tests verify the tool's functionality and prevent regressions
 */

import { CaliforniaBusinessSearchTool } from '../../../src/tools/california-business-search';
import { Stagehand } from '@browserbasehq/stagehand';

// Mock Stagehand
jest.mock('@browserbasehq/stagehand');

describe('CaliforniaBusinessSearchTool', () => {
  let tool: CaliforniaBusinessSearchTool;
  let mockStagehand: jest.Mocked<Stagehand>;
  let mockPage: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create tool instance
    tool = new CaliforniaBusinessSearchTool();
    
    // Setup mock page
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      act: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      goBack: jest.fn().mockResolvedValue(undefined),
      extract: jest.fn()
    };
    
    // Setup mock Stagehand
    mockStagehand = {
      init: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      page: mockPage
    } as any;
    
    // Make constructor return our mock
    (Stagehand as jest.MockedClass<typeof Stagehand>).mockImplementation(() => mockStagehand);
  });
  
  describe('searchByName', () => {
    it('should create a new Stagehand instance for each search', async () => {
      // Setup mock response
      mockPage.extract.mockResolvedValue({
        results: []
      });
      
      // Perform search
      await tool.searchByName('Test Company');
      
      // Verify Stagehand was created with enhanced bot detection evasion
      expect(Stagehand).toHaveBeenCalledWith({
        env: 'LOCAL',
        verbose: 1,
        domSettleTimeoutMs: 15000,
        localBrowserLaunchOptions: {
          headless: true,
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
      
      // Verify initialization
      expect(mockStagehand.init).toHaveBeenCalled();
    });
    
    it('should navigate to the California SOS website', async () => {
      mockPage.extract.mockResolvedValue({
        results: []
      });
      
      await tool.searchByName('Test Company');
      
      expect(mockPage.goto).toHaveBeenCalledWith('https://bizfileonline.sos.ca.gov/search/business');
    });
    
    it('should perform the search actions in correct order', async () => {
      mockPage.extract.mockResolvedValue({
        results: []
      });
      
      await tool.searchByName('Apple Inc');
      
      // Verify search actions with enhanced options
      expect(mockPage.act).toHaveBeenNthCalledWith(1, { action: 'Select "Corporation Name" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
      expect(mockPage.act).toHaveBeenNthCalledWith(2, { action: 'Enter "Apple Inc" in the business name search field', iframes: true, domSettleTimeoutMs: 15000 });
      expect(mockPage.act).toHaveBeenNthCalledWith(3, { action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });
    });
    
    it('should return empty array when no results found', async () => {
      mockPage.extract.mockResolvedValue({
        results: []
      });
      
      const results = await tool.searchByName('Nonexistent Company XYZ');
      
      expect(results).toEqual([]);
    });
    
    it('should return basic search results only (fast search)', async () => {
      const mockResults = [
        {
          entityName: 'Apple Inc.',
          entityNumber: 'C0806592',
          status: 'Active',
          entityType: 'Corporation',
          registrationDate: '1977-01-03'
        }
      ];
      
      // Mock search results (no additional details extraction)
      mockPage.extract.mockResolvedValueOnce({
        results: mockResults
      });
      
      const results = await tool.searchByName('Apple Inc');
      
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        entityName: 'Apple Inc.',
        entityNumber: 'C0806592',
        status: 'Active',
        entityType: 'Corporation',
        registrationDate: '1977-01-03'
      });
      
      // Verify no detail fetching happened (no additional extract calls)
      expect(mockPage.extract).toHaveBeenCalledTimes(1);
      // Verify no navigation to individual entity pages
      expect(mockPage.act).toHaveBeenCalledTimes(3); // Only the search actions
      expect(mockPage.goBack).not.toHaveBeenCalled();
    });
    
    it('should handle multiple search results quickly (fast search)', async () => {
      const mockResults = [
        {
          entityName: 'Google LLC',
          entityNumber: '123456',
          status: 'Active',
          entityType: 'LLC'
        },
        {
          entityName: 'Google Inc (Dissolved)',
          entityNumber: '789012',
          status: 'Dissolved',
          entityType: 'Corporation'
        }
      ];
      
      mockPage.extract.mockResolvedValueOnce({
        results: mockResults
      });
      
      const results = await tool.searchByName('Google');
      
      expect(results).toHaveLength(2);
      expect(results[0].entityName).toBe('Google LLC');
      expect(results[1].entityName).toBe('Google Inc (Dissolved)');
      
      // Verify fast search behavior - no navigation to individual pages
      expect(mockPage.extract).toHaveBeenCalledTimes(1); // Only search results extraction
      expect(mockPage.goBack).not.toHaveBeenCalled(); // No navigation back from detail pages
    });
    
    it('should always close the browser even on error', async () => {
      mockPage.extract.mockRejectedValue(new Error('Extraction failed'));
      
      await expect(tool.searchByName('Test')).rejects.toThrow('Failed to search California business registry');
      
      expect(mockStagehand.close).toHaveBeenCalled();
    });
    
    it('should handle search extraction errors gracefully', async () => {
      mockPage.extract.mockRejectedValue(new Error('Search extraction failed'));
      
      await expect(tool.searchByName('Test Company')).rejects.toThrow('Failed to search California business registry');
      
      // Browser should still be closed even on error
      expect(mockStagehand.close).toHaveBeenCalled();
    });
  });
  
  describe('searchByEntityNumber', () => {
    it('should search by entity number and return comprehensive details', async () => {
      const mockDetails = {
        entityName: 'Apple Inc.',
        entityNumber: 'C0806592',
        status: 'Active',
        entityType: 'Corporation',
        registrationDate: '1977-01-03',
        jurisdiction: 'California',
        
        // Agent information
        agentName: 'CT Corporation System',
        agentAddress: '818 West Seventh Street, Los Angeles, CA 90017',
        
        // Business addresses
        principalAddress: 'One Apple Park Way, Cupertino, CA 95014',
        mailingAddress: 'One Apple Park Way, Cupertino, CA 95014',
        
        // Officers
        ceoName: 'Tim Cook',
        presidentName: 'Tim Cook',
        secretaryName: 'Kate Adams',
        cfoName: 'Luca Maestri',
        
        // Business details
        businessPurpose: 'To engage in any lawful act or activity',
        filingHistory: [
          {
            date: '2024-01-15',
            type: 'Statement of Information',
            description: 'Annual filing',
            status: 'Filed'
          }
        ]
      };
      
      mockPage.extract.mockResolvedValue(mockDetails);
      
      const result = await tool.searchByEntityNumber('C0806592');
      
      expect(mockPage.act).toHaveBeenNthCalledWith(1, { action: 'Select "Entity Number" from the search type dropdown', iframes: true, domSettleTimeoutMs: 15000 });
      expect(mockPage.act).toHaveBeenNthCalledWith(2, { action: 'Enter "C0806592" in the entity number search field', iframes: true, domSettleTimeoutMs: 15000 });
      expect(mockPage.act).toHaveBeenNthCalledWith(3, { action: 'Click the Search button', iframes: true, domSettleTimeoutMs: 15000 });
      
      expect(result).toMatchObject(mockDetails);
      expect(result?.agentName).toBe('CT Corporation System');
      expect(result?.ceoName).toBe('Tim Cook');
      expect(result?.filingHistory).toHaveLength(1);
    });
    
    it('should return null when entity not found', async () => {
      mockPage.extract.mockResolvedValue(null);
      
      const result = await tool.searchByEntityNumber('INVALID123');
      
      expect(result).toBeNull();
    });
    
    it('should close browser on entity number search error', async () => {
      mockPage.extract.mockRejectedValue(new Error('Search failed'));
      
      const result = await tool.searchByEntityNumber('123');
      
      expect(result).toBeNull();
      expect(mockStagehand.close).toHaveBeenCalled();
    });
  });
  
  describe('Stagehand configuration', () => {
    it('should use correct Stagehand configuration', async () => {
      mockPage.extract.mockResolvedValue({ results: [] });
      
      await tool.searchByName('Test');
      
      expect(Stagehand).toHaveBeenCalledWith({
        env: 'LOCAL',
        verbose: 1,
        domSettleTimeoutMs: 15000,
        localBrowserLaunchOptions: {
          headless: true,
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
    });
    
    it('should create separate instances for concurrent searches', async () => {
      mockPage.extract.mockResolvedValue({ results: [] });
      
      // Start two searches concurrently
      const search1 = tool.searchByName('Company 1');
      const search2 = tool.searchByName('Company 2');
      
      await Promise.all([search1, search2]);
      
      // Should have created two separate Stagehand instances
      expect(Stagehand).toHaveBeenCalledTimes(2);
      expect(mockStagehand.init).toHaveBeenCalledTimes(2);
      expect(mockStagehand.close).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('Data extraction schema', () => {
    it('should request all required fields during extraction', async () => {
      mockPage.extract.mockResolvedValue({ results: [] });
      
      await tool.searchByName('Test');
      
      // Check that extract was called with proper schema
      const extractCall = mockPage.extract.mock.calls[0][0];
      expect(extractCall.instruction).toContain('entity name');
      expect(extractCall.instruction).toContain('entity number');
      expect(extractCall.instruction).toContain('registration date');
      expect(extractCall.instruction).toContain('status');
      expect(extractCall.instruction).toContain('entity type');
    });
    
    it('should handle optional fields correctly', async () => {
      const mockResults = [
        {
          entityName: 'Test LLC',
          entityNumber: '123',
          status: 'Active',
          entityType: 'LLC'
          // No registrationDate or jurisdiction - should be optional
        }
      ];
      
      mockPage.extract.mockResolvedValueOnce({ results: mockResults });
      mockPage.extract.mockResolvedValueOnce({}); // No additional details
      
      const results = await tool.searchByName('Test LLC');
      
      expect(results).toHaveLength(1);
      expect(results[0].registrationDate).toBeUndefined();
      expect(results[0].jurisdiction).toBeUndefined();
    });
  });
});