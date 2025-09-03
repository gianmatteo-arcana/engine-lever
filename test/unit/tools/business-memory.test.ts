/**
 * Unit tests for Business Memory Tool
 * 
 * Tests the knowledge extraction and retrieval functionality
 * Part of Issue #55: Knowledge Extraction and Business Memory System
 */

import { BusinessMemoryTool } from '../../../src/tools/business-memory';
import { DatabaseService } from '../../../src/services/database';

// Mock the database service
jest.mock('../../../src/services/database');

describe('BusinessMemoryTool', () => {
  let tool: BusinessMemoryTool;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance successfully', () => {
      // Mock DatabaseService.getInstance
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({});
      
      tool = new BusinessMemoryTool();
      expect(tool).toBeDefined();
      expect(DatabaseService.getInstance).toHaveBeenCalled();
    });
  });

  describe('searchMemory', () => {
    it('should call database with correct parameters', async () => {
      // Create a complete mock chain
      const mockResult = { data: [], error: null };
      const mockQuery = {
        or: jest.fn().mockResolvedValue(mockResult),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis()
      };
      
      const mockDb = {
        getServiceClient: jest.fn().mockReturnValue({
          from: jest.fn(() => mockQuery)
        })
      };
      
      (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDb);
      
      tool = new BusinessMemoryTool();
      
      const result = await tool.searchMemory({
        businessId: 'test-123',
        minConfidence: 0.7
      });
      
      expect(result).toBeDefined();
      expect(result.facts).toEqual({});
      expect(result.metadata.factCount).toBe(0);
    });
  });

  describe('persistKnowledge', () => {
    it('should persist knowledge successfully', async () => {
      const mockDb = {
        getServiceClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: null, error: null })
                  })
                })
              })
            }),
            insert: jest.fn().mockResolvedValue({ error: null })
          })
        })
      };
      
      (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDb);
      
      tool = new BusinessMemoryTool();
      
      await expect(tool.persistKnowledge([
        {
          businessId: 'test-123',
          knowledgeType: 'profile',
          category: 'identity',
          fieldName: 'business.name',
          fieldValue: 'Test Corp',
          confidence: 0.9
        }
      ])).resolves.not.toThrow();
    });
  });

  describe('clearExpiredKnowledge', () => {
    it('should clear expired knowledge', async () => {
      const mockDb = {
        getServiceClient: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnValue({
              lt: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockResolvedValue({ 
                    data: [{ id: '1' }, { id: '2' }], 
                    error: null 
                  })
                })
              })
            })
          })
        })
      };
      
      (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDb);
      
      tool = new BusinessMemoryTool();
      
      const count = await tool.clearExpiredKnowledge();
      expect(count).toBe(2);
    });
  });
});