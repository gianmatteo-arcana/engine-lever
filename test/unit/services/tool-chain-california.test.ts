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
    it('should return all matches from California business search', async () => {
      const mockResults = [
        {
          entityName: 'Test Corp',
          entityNumber: '123456',
          status: 'ACTIVE',
          entityType: 'CORPORATION',
          registrationDate: '2020-01-01',
          principalAddress: '123 Main St, Suite 100, San Francisco, CA 94105'
        },
        {
          entityName: 'Test Corp LLC',
          entityNumber: '789012',
          status: 'SUSPENDED',
          entityType: 'LLC',
          registrationDate: '2019-05-15'
        }
      ];
      
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue(mockResults);
      
      const results = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(californiaBusinessSearch.searchByName).toHaveBeenCalledWith('Test Corp');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Test Corp');
      expect(results[0].status).toBe('ACTIVE');
      expect(results[0].statusNormalized).toBe('Active');
      expect(results[0].entityType).toBe('CORPORATION');
      expect(results[0].entityTypeNormalized).toBe('Corporation');
      expect(results[1].name).toBe('Test Corp LLC');
      expect(results[1].status).toBe('SUSPENDED');
      expect(results[1].statusNormalized).toBe('Suspended');
      expect(results[1].entityType).toBe('LLC');
      expect(results[1].entityTypeNormalized).toBe('LLC');
    });
    
    it('should return empty array for non-California states', async () => {
      const results = await toolChain.searchBusinessEntity('Test Corp', 'NY');
      
      expect(results).toEqual([]);
      expect(californiaBusinessSearch.searchByName).not.toHaveBeenCalled();
    });
    
    it('should return empty array when no results found', async () => {
      (californiaBusinessSearch.searchByName as jest.Mock).mockResolvedValue([]);
      
      const results = await toolChain.searchBusinessEntity('Nonexistent Company', 'CA');
      
      expect(results).toEqual([]);
    });
    
    it('should normalize entity types correctly', async () => {
      const testCases = [
        { input: 'LIMITED LIABILITY COMPANY', normalized: 'LLC' },
        { input: 'LLC', normalized: 'LLC' },
        { input: 'CORPORATION', normalized: 'Corporation' },
        { input: 'CORP', normalized: 'Corporation' },
        { input: 'GENERAL PARTNERSHIP', normalized: 'General Partnership' },
        { input: 'SOLE PROPRIETORSHIP', normalized: 'Sole Proprietorship' },
        { input: 'ALIEN ENTITY TYPE', normalized: undefined } // unrecognized
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
        
        const results = await toolChain.searchBusinessEntity('Test', 'CA');
        
        expect(results).toHaveLength(1);
        expect(results[0].entityType).toBe(testCase.input); // Raw value preserved
        expect(results[0].entityTypeNormalized).toBe(testCase.normalized);
      }
    });
    
    it('should normalize status correctly', async () => {
      const testCases = [
        { input: 'ACTIVE', normalized: 'Active' },
        { input: 'SUSPENDED', normalized: 'Suspended' },
        { input: 'DISSOLVED', normalized: 'Dissolved' },
        { input: 'CANCELED', normalized: 'Dissolved' },
        { input: 'UNKNOWN STATUS', normalized: undefined } // unrecognized
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
        
        const results = await toolChain.searchBusinessEntity('Test', 'CA');
        
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe(testCase.input); // Raw value preserved
        expect(results[0].statusNormalized).toBe(testCase.normalized);
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
      
      const results = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(results).toHaveLength(1);
      expect(results[0].address).toEqual({
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
      
      const results = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(results).toHaveLength(1);
      expect(results[0].address).toEqual({
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
      
      const results = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(results).toHaveLength(1);
      expect(results[0].address).toBeUndefined();
    });
    
    it('should handle search errors gracefully', async () => {
      (californiaBusinessSearch.searchByName as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );
      
      const results = await toolChain.searchBusinessEntity('Test Corp', 'CA');
      
      expect(results).toEqual([]);
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
  
  describe('searchByEntityNumber', () => {
    it('should return single entity when found', async () => {
      const mockResult = {
        entityName: 'Apple Inc.',
        entityNumber: 'C0806592',
        status: 'ACTIVE',
        entityType: 'CORPORATION',
        registrationDate: '1977-01-03',
        principalAddress: 'One Apple Park Way, Cupertino, CA 95014'
      };
      
      (californiaBusinessSearch.searchByEntityNumber as jest.Mock).mockResolvedValue(mockResult);
      
      const result = await toolChain.searchByEntityNumber('C0806592', 'CA');
      
      expect(californiaBusinessSearch.searchByEntityNumber).toHaveBeenCalledWith('C0806592');
      expect(result).toBeDefined();
      expect(result?.name).toBe('Apple Inc.');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.statusNormalized).toBe('Active');
      expect(result?.entityType).toBe('CORPORATION');
      expect(result?.entityTypeNormalized).toBe('Corporation');
    });
    
    it('should return null when entity not found', async () => {
      (californiaBusinessSearch.searchByEntityNumber as jest.Mock).mockResolvedValue(null);
      
      const result = await toolChain.searchByEntityNumber('INVALID123', 'CA');
      
      expect(result).toBeNull();
    });
    
    it('should return null for non-California states', async () => {
      const result = await toolChain.searchByEntityNumber('123456', 'NY');
      
      expect(result).toBeNull();
      expect(californiaBusinessSearch.searchByEntityNumber).not.toHaveBeenCalled();
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
      
      const results = await toolChain.searchPublicRecords('Test Corp');
      
      expect(californiaBusinessSearch.searchByName).toHaveBeenCalledWith('Test Corp');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Test Corp');
    });
  });
});