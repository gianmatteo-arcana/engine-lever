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
      
      // Verify Stagehand was created
      expect(Stagehand).toHaveBeenCalledWith({
        env: 'LOCAL',
        verbose: 1
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
      
      // Verify search actions
      expect(mockPage.act).toHaveBeenNthCalledWith(1, 'Select "Corporation Name" from the search type dropdown');
      expect(mockPage.act).toHaveBeenNthCalledWith(2, 'Enter "Apple Inc" in the business name search field');
      expect(mockPage.act).toHaveBeenNthCalledWith(3, 'Click the Search button');
    });
    
    it('should return empty array when no results found', async () => {
      mockPage.extract.mockResolvedValue({
        results: []
      });
      
      const results = await tool.searchByName('Nonexistent Company XYZ');
      
      expect(results).toEqual([]);
    });
    
    it('should extract and return business details', async () => {
      const mockResults = [
        {
          entityName: 'Apple Inc.',
          entityNumber: 'C0806592',
          status: 'Active',
          entityType: 'Corporation',
          registrationDate: '1977-01-03'
        }
      ];
      
      // Mock search results
      mockPage.extract.mockResolvedValueOnce({
        results: mockResults
      });
      
      // Mock details extraction
      mockPage.extract.mockResolvedValueOnce({
        agentName: 'CT Corporation System',
        principalAddress: 'One Apple Park Way, Cupertino, CA 95014'
      });
      
      const results = await tool.searchByName('Apple Inc');
      
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        entityName: 'Apple Inc.',
        entityNumber: 'C0806592',
        status: 'Active',
        agentName: 'CT Corporation System'
      });
    });
    
    it('should handle multiple search results', async () => {
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
      
      // Mock details for each result
      mockPage.extract.mockResolvedValueOnce({ agentName: 'Agent 1' });
      mockPage.extract.mockResolvedValueOnce({ agentName: 'Agent 2' });
      
      const results = await tool.searchByName('Google');
      
      expect(results).toHaveLength(2);
      expect(mockPage.goBack).toHaveBeenCalledTimes(2);
    });
    
    it('should always close the browser even on error', async () => {
      mockPage.extract.mockRejectedValue(new Error('Extraction failed'));
      
      await expect(tool.searchByName('Test')).rejects.toThrow('Failed to search California business registry');
      
      expect(mockStagehand.close).toHaveBeenCalled();
    });
    
    it('should handle extraction errors gracefully', async () => {
      const mockResults = [
        {
          entityName: 'Test Company',
          entityNumber: '123',
          status: 'Active',
          entityType: 'LLC'
        }
      ];
      
      mockPage.extract.mockResolvedValueOnce({
        results: mockResults
      });
      
      // Simulate error getting details
      mockPage.extract.mockRejectedValueOnce(new Error('Details extraction failed'));
      
      const results = await tool.searchByName('Test Company');
      
      // Should still return basic info even if details fail
      expect(results).toHaveLength(1);
      expect(results[0].entityName).toBe('Test Company');
    });
  });
  
  describe('searchByEntityNumber', () => {
    it('should search by entity number correctly', async () => {
      const mockDetails = {
        entityName: 'Apple Inc.',
        entityNumber: 'C0806592',
        status: 'Active',
        entityType: 'Corporation',
        agentName: 'CT Corporation System'
      };
      
      mockPage.extract.mockResolvedValue(mockDetails);
      
      const result = await tool.searchByEntityNumber('C0806592');
      
      expect(mockPage.act).toHaveBeenNthCalledWith(1, 'Select "Entity Number" from the search type dropdown');
      expect(mockPage.act).toHaveBeenNthCalledWith(2, 'Enter "C0806592" in the entity number search field');
      expect(mockPage.act).toHaveBeenNthCalledWith(3, 'Click the Search button');
      
      expect(result).toMatchObject(mockDetails);
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
        verbose: 1
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