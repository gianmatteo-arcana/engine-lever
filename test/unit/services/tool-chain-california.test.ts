/**
 * Unit tests for ToolChain California business search integration
 */

import { ToolChain } from '../../../src/services/tool-chain';
import { californiaBusinessSearch } from '../../../src/tools/california-business-search';

// Mock the california business search tool
jest.mock('../../../src/tools/california-business-search');

describe('ToolChain - California Business Search Integration', () => {
  let toolChain: ToolChain;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Don't mock CredentialVault constructor to avoid that error
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    
    toolChain = new ToolChain();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('searchBusinessEntity', () => {
    it('should use California business search tool for CA searches', async () => {
      const mockResults = [
        {
          entityName: 'Test Corp',
          entityNumber: '123456',
          status: 'ACTIVE',
          entityType: 'CORPORATION',
          registrationDate: '2020-01-01',
          principalAddress: '123 Main St, Suite 100, San Francisco, CA 94105'
        }
      ];
      
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue(mockResults);
      
      const result = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(californiaBusinessSearch.searchByName).toHaveBeenCalledWith('Test Corp');
      expect(result).toBeDefined();
      expect(result?.name).toBe('Test Corp');
      expect(result?.status).toBe('Active');
      expect(result?.entityType).toBe('Corporation');
    });
    
    it('should return null for non-California states', async () => {
      const result = await toolChain.searchBusinessEntity('Test Corp', 'NY');
      
      expect(result).toBeNull();
      expect(californiaBusinessSearch.searchByName).not.toHaveBeenCalled();
    });
    
    it('should return null when no results found', async () => {
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue([]);
      
      const result = await toolChain.searchBusinessEntity('Nonexistent Company', 'CA');
      
      expect(result).toBeNull();
    });
    
    it('should map entity types correctly', async () => {
      const testCases = [
        { input: 'LIMITED LIABILITY COMPANY', expected: 'LLC' },
        { input: 'LLC', expected: 'LLC' },
        { input: 'CORPORATION', expected: 'Corporation' },
        { input: 'CORP', expected: 'Corporation' },
        { input: 'PARTNERSHIP', expected: 'Partnership' },
        { input: 'SOLE PROPRIETORSHIP', expected: 'Sole Proprietorship' },
        { input: 'UNKNOWN TYPE', expected: 'Corporation' } // default
      ];
      
      for (const testCase of testCases) {
        jest.clearAllMocks(); // Clear previous mocks
        (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue([
          {
            entityName: 'Test',
            entityNumber: '123',
            status: 'Active',
            entityType: testCase.input
          }
        ]);
        
        const result = await toolChain.searchBusinessEntity('Test', 'CA');
        
        expect(result?.entityType).toBe(testCase.expected);
      }
    });
    
    it('should map status correctly', async () => {
      const testCases = [
        { input: 'ACTIVE', expected: 'Active' },
        { input: 'SUSPENDED', expected: 'Suspended' },
        { input: 'DISSOLVED', expected: 'Dissolved' },
        { input: 'CANCELED', expected: 'Dissolved' },
        { input: 'UNKNOWN', expected: 'Active' } // default
      ];
      
      for (const testCase of testCases) {
        (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue([
          {
            entityName: 'Test',
            entityNumber: '123',
            status: testCase.input,
            entityType: 'LLC'
          }
        ]);
        
        const result = await toolChain.searchBusinessEntity('Test', 'CA');
        
        expect(result?.status).toBe(testCase.expected);
      }
    });
    
    it('should parse addresses correctly', async () => {
      const mockResults = [
        {
          entityName: 'Test Corp',
          entityNumber: '123',
          status: 'Active',
          entityType: 'Corporation',
          principalAddress: '123 Main Street, San Francisco, CA 94105'
        }
      ];
      
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue(mockResults);
      
      const result = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(result?.address).toEqual({
        street: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105'
      });
    });
    
    it('should handle complex addresses with suites', async () => {
      const mockResults = [
        {
          entityName: 'Test Corp',
          entityNumber: '123',
          status: 'Active',
          entityType: 'Corporation',
          principalAddress: '456 Market St, Suite 2000, Floor 20, San Francisco, CA 94105-1234'
        }
      ];
      
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue(mockResults);
      
      const result = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(result?.address).toEqual({
        street: '456 Market St, Suite 2000, Floor 20',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105-1234'
      });
    });
    
    it('should handle missing address gracefully', async () => {
      const mockResults = [
        {
          entityName: 'Test Corp',
          entityNumber: '123',
          status: 'Active',
          entityType: 'Corporation'
          // No address provided
        }
      ];
      
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue(mockResults);
      
      const result = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(result?.address).toBeUndefined();
    });
    
    it('should handle search errors gracefully', async () => {
      (californiaBusinessSearch.searchByName as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      
      const result = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '[ToolChain] California business search error:',
        expect.any(Error)
      );
    });
  });
  
  describe('Tool Registry', () => {
    it('should include California business search in registry', () => {
      const registry = toolChain.getToolRegistry();
      
      expect(registry.searchBusinessEntity).toBeDefined();
      expect(registry.searchBusinessEntity.name).toBe('searchBusinessEntity');
      expect(registry.searchBusinessEntity.category).toBe('public_records');
    });
    
    it('should document California-only limitation', () => {
      const registry = toolChain.getToolRegistry();
      const tool = registry.searchBusinessEntity;
      
      expect(tool.parameters.state.enum).toEqual(['CA']);
      expect(tool.capabilities).toContain('california_only');
      expect(tool.limitations).toContain('California entities only');
    });
    
    it('should specify real-time data capability', () => {
      const registry = toolChain.getToolRegistry();
      const tool = registry.searchBusinessEntity;
      
      expect(tool.capabilities).toContain('real_time_data');
      expect(tool.capabilities).toContain('no_authentication_required');
      expect(tool.dataSource).toBe('https://bizfileonline.sos.ca.gov');
    });
  });
  
  describe('Tool Discovery', () => {
    it('should provide detailed tool description for LLMs', () => {
      const tools = toolChain.getAvailableTools();
      
      expect(tools).toContain('searchBusinessEntity');
      expect(tools).toContain('California Secretary of State');
      expect(tools).toContain('Real-time data from bizfileonline.sos.ca.gov');
      expect(tools).toContain("Only 'CA' (California) is supported");
    });
    
    it('should list all available data fields', () => {
      const tools = toolChain.getAvailableTools();
      
      expect(tools).toContain('Entity name');
      expect(tools).toContain('number');
      expect(tools).toContain('registration date');
      expect(tools).toContain('agent info');
      expect(tools).toContain('addresses');
      expect(tools).toContain('officers');
      expect(tools).toContain('filing history');
    });
  });
  
  describe('searchPublicRecords alias', () => {
    it('should work as an alias for searchBusinessEntity', async () => {
      const mockResults = [
        {
          entityName: 'Test Corp',
          entityNumber: '123',
          status: 'Active',
          entityType: 'Corporation'
        }
      ];
      
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue(mockResults);
      
      const result = await toolChain.searchPublicRecords('Test Corp');
      
      expect(californiaBusinessSearch.searchByName).toHaveBeenCalledWith('Test Corp');
      expect(result?.name).toBe('Test Corp');
    });
  });
});