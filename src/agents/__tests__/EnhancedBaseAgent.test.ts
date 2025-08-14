/**
 * Enhanced BaseAgent Tests
 * 
 * Tests the template inheritance system and universal schema enforcement
 */

import { EnhancedBaseAgent } from '../base/EnhancedBaseAgent';
import { DataCollectionAgentEnhanced } from '../DataCollectionAgentEnhanced';
import { 
  BaseAgentRequest, 
  BaseAgentResponse,
  UniversalContextEntry 
} from '../../types/base-agent-types';

// Mock LLM Provider for testing
jest.mock('../../services/llm-provider-interface', () => ({
  LLMProvider: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      status: 'completed',
      contextUpdate: {
        operation: 'test_operation',
        data: { result: 'success' },
        reasoning: 'Test reasoning',
        confidence: 0.9
      },
      confidence: 0.9
    })
  }))
}));

// Mock ToolChain for testing
jest.mock('../../services/tool-chain', () => ({
  ToolChain: jest.fn().mockImplementation(() => ({
    getAvailableTools: jest.fn().mockReturnValue('mock tools')
  }))
}));

describe('EnhancedBaseAgent Template Inheritance System', () => {
  let dataAgent: DataCollectionAgentEnhanced;
  
  beforeEach(() => {
    // Reset NODE_ENV to test to avoid initializing real services
    process.env.NODE_ENV = 'test';
    dataAgent = new DataCollectionAgentEnhanced();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Agent Configuration Loading', () => {
    test('should load base template and specialized config successfully', () => {
      const capabilities = dataAgent.getCapabilities();
      
      expect(capabilities).toBeDefined();
      expect(capabilities.id).toBe('data_collection_agent');
      expect(capabilities.role).toBe('data_collection_specialist');
      expect(capabilities.extends).toBe('base_agent');
    });
    
    test('should validate configuration integrity', () => {
      const validation = dataAgent.validateConfiguration();
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      // May have warnings about naming conventions, which is acceptable
    });
    
    test('should provide full configuration for debugging', () => {
      const fullConfig = dataAgent.getFullConfiguration();
      
      expect(fullConfig.base).toBeDefined();
      expect(fullConfig.specialized).toBeDefined();
      expect(fullConfig.specialized.agent.id).toBe('data_collection_agent');
    });
  });
  
  describe('Template Inheritance and Schema Enforcement', () => {
    test('should enforce universal context entry schema', async () => {
      const mockTaskContext = {
        taskId: 'test_task_001',
        userId: 'test_user',
        history: [],
        currentState: { data: {} }
      };
      
      const request: BaseAgentRequest = {
        taskContext: mockTaskContext,
        operation: 'test_operation',
        parameters: { test: 'data' }
      };
      
      const response = await dataAgent.execute(request);
      
      // Validate response structure
      expect(response).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.contextUpdate).toBeDefined();
      expect(response.confidence).toBeDefined();
      
      // Validate universal context entry schema
      const contextEntry = response.contextUpdate;
      expect(contextEntry.entryId).toMatch(/^entry_\d+_[a-z0-9]+$/);
      expect(contextEntry.sequenceNumber).toBe(1); // First entry
      expect(contextEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(contextEntry.actor.type).toBe('agent');
      expect(contextEntry.actor.id).toBe('data_collection_agent');
      expect(contextEntry.actor.version).toBeDefined();
      expect(contextEntry.operation).toBeDefined();
      expect(contextEntry.data).toBeDefined();
      expect(contextEntry.reasoning).toBeDefined();
      expect(typeof contextEntry.confidence).toBe('number');
      expect(contextEntry.confidence).toBeGreaterThanOrEqual(0);
      expect(contextEntry.confidence).toBeLessThanOrEqual(1);
      expect(contextEntry.trigger).toBeDefined();
      expect(contextEntry.trigger.type).toBe('orchestrator_request');
    });
    
    test('should validate confidence scores to 0.0-1.0 range', async () => {
      const mockTaskContext = {
        taskId: 'test_task_002',
        userId: 'test_user',
        history: [],
        currentState: { data: {} }
      };
      
      // Override the mock for this specific test
      const invalidConfidenceMock = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'test_operation',
          data: { result: 'success' },
          reasoning: 'Test reasoning',
          confidence: 2.5 // Invalid confidence > 1.0
        },
        confidence: -0.5 // Invalid confidence < 0.0
      });
      
      // Replace the mock temporarily
      (dataAgent as any).llmProvider.complete = invalidConfidenceMock;
      
      const request: BaseAgentRequest = {
        taskContext: mockTaskContext,
        operation: 'test_operation',
        parameters: { test: 'data' }
      };
      
      const response = await dataAgent.execute(request);
      
      // Should clamp confidence to valid range
      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
      expect(response.contextUpdate.confidence).toBeGreaterThanOrEqual(0);
      expect(response.contextUpdate.confidence).toBeLessThanOrEqual(1);
    });
    
    test('should handle missing response fields gracefully', async () => {
      const mockTaskContext = {
        taskId: 'test_task_003',
        userId: 'test_user',
        history: [{ sequenceNumber: 1 }, { sequenceNumber: 2 }], // Previous entries
        currentState: { data: {} }
      };
      
      // Override the mock for this specific test
      const missingFieldsMock = jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'test_operation',
          data: { result: 'success' }
          // Missing reasoning and confidence
        }
        // Missing overall confidence
      });
      
      // Replace the mock temporarily
      (dataAgent as any).llmProvider.complete = missingFieldsMock;
      
      const request: BaseAgentRequest = {
        taskContext: mockTaskContext,
        operation: 'test_operation',
        parameters: { test: 'data' }
      };
      
      const response = await dataAgent.execute(request);
      
      // Should provide defaults for missing fields
      expect(response.contextUpdate.reasoning).toBe('No reasoning provided');
      expect(response.contextUpdate.sequenceNumber).toBe(3); // Should increment correctly
      expect(typeof response.confidence).toBe('number');
    });
  });
  
  describe('Specialized Agent Methods', () => {
    test('should execute business discovery with correct parameters', async () => {
      const mockTaskContext = {
        taskId: 'discovery_test',
        userId: 'test_user',
        history: [],
        currentState: { data: { email: 'test@example.com' } }
      };
      
      const response = await dataAgent.discoverBusiness('test@techcorp.com', mockTaskContext);
      
      expect(response.status).toBeDefined();
      expect(response.contextUpdate.operation).toBe('business_discovery');
      expect(response.contextUpdate.data).toBeDefined();
    });
    
    test('should create progressive disclosure forms', async () => {
      const mockTaskContext = {
        taskId: 'form_test',
        userId: 'test_user',
        history: [],
        currentState: { progress: 50 }
      };
      
      const response = await dataAgent.createProgressiveDisclosureForm(
        mockTaskContext,
        ['businessName', 'entityType']
      );
      
      expect(response.status).toBeDefined();
      expect(response.contextUpdate.operation).toBe('create_progressive_disclosure_form');
    });
    
    test('should validate business data', async () => {
      const mockTaskContext = {
        taskId: 'validation_test',
        userId: 'test_user',
        history: [],
        currentState: { data: {} }
      };
      
      const mockBusinessData = {
        name: 'TechCorp LLC',
        entityType: 'LLC',
        state: 'California'
      };
      
      const response = await dataAgent.validateBusinessData(mockBusinessData, mockTaskContext);
      
      expect(response.status).toBeDefined();
      expect(response.contextUpdate.operation).toBe('validate_business_data');
    });
  });
  
  describe('Error Handling', () => {
    test('should handle invalid status values', async () => {
      const mockTaskContext = {
        taskId: 'error_test',
        userId: 'test_user',
        history: [],
        currentState: { data: {} }
      };
      
      // Override the mock for this specific test
      const invalidStatusMock = jest.fn().mockResolvedValue({
        status: 'invalid_status', // Invalid status
        contextUpdate: {
          operation: 'test_operation',
          data: { result: 'success' },
          reasoning: 'Test reasoning',
          confidence: 0.9
        }
      });
      
      // Replace the mock temporarily
      (dataAgent as any).llmProvider.complete = invalidStatusMock;
      
      const request: BaseAgentRequest = {
        taskContext: mockTaskContext,
        operation: 'test_operation',
        parameters: { test: 'data' }
      };
      
      const response = await dataAgent.execute(request);
      
      // Should default to 'completed' for invalid status
      expect(response.status).toBe('completed');
    });
    
    test('should throw error for missing contextUpdate', async () => {
      const mockTaskContext = {
        taskId: 'error_test_2',
        userId: 'test_user',
        history: [],
        currentState: { data: {} }
      };
      
      // Override the mock for this specific test
      const missingContextMock = jest.fn().mockResolvedValue({
        status: 'completed'
        // Missing contextUpdate
      });
      
      // Replace the mock temporarily
      (dataAgent as any).llmProvider.complete = missingContextMock;
      
      const request: BaseAgentRequest = {
        taskContext: mockTaskContext,
        operation: 'test_operation',
        parameters: { test: 'data' }
      };
      
      await expect(dataAgent.execute(request)).rejects.toThrow('missing required contextUpdate');
    });
  });
  
  describe('Performance and Integration', () => {
    test('should complete execution within reasonable time', async () => {
      const mockTaskContext = {
        taskId: 'perf_test',
        userId: 'test_user',
        history: [],
        currentState: { data: {} }
      };
      
      const startTime = Date.now();
      
      const response = await dataAgent.gatherBusinessInfo(mockTaskContext, { test: 'data' });
      
      const executionTime = Date.now() - startTime;
      
      expect(response).toBeDefined();
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});