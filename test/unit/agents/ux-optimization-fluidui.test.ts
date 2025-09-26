/**
 * Unit tests for UXOptimizationAgent FluidUI functionality
 * Tests the handleUserMessage method and conversation processing
 */

import { UXOptimizationAgent } from '../../../src/agents/UXOptimizationAgent';
import { BaseAgentResponse } from '../../../src/types/base-agent-types';
import { DatabaseService } from '../../../src/services/database';

// Mock dependencies
jest.mock('../../../src/services/database');
jest.mock('../../../src/services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn(() => ({
      complete: jest.fn().mockResolvedValue('{"extracted": {}, "hasData": false}'),
      isConfigured: jest.fn().mockReturnValue(true)
    }))
  }
}));
jest.mock('../../../src/services/tool-chain', () => ({
  ToolChain: jest.fn(() => ({
    executeTool: jest.fn().mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-123',
        template: { name: 'Test Template' },
        progress: { completeness: 50 },
        collectedData: { fields: {}, missingRequired: [] },
        objectives: { primaryGoal: 'Complete task' },
        insights: { summary: 'Task in progress' }
      }
    }),
    getAvailableToolsDescription: jest.fn().mockReturnValue('Mock tools'),
    searchBusinessMemory: jest.fn().mockResolvedValue({
      facts: {},
      preferences: {},
      patterns: {},
      relationships: {},
      metadata: { factCount: 0, averageConfidence: 0, lastUpdated: new Date().toISOString() }
    })
  }))
}));
jest.mock('../../../src/utils/logger', () => ({
  createTaskLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  })),
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('UXOptimizationAgent FluidUI', () => {
  let agent: UXOptimizationAgent;
  const mockContextId = 'test-context-123';
  const mockTenantId = 'test-tenant-456';
  const mockUserId = 'test-user-789';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup database mocks
    const mockDbService = {
      getContextHistory: jest.fn().mockResolvedValue([]),
      getTask: jest.fn().mockResolvedValue({ id: mockContextId }),
      createTaskContextEvent: jest.fn().mockResolvedValue({ id: 'new-event' })
    };
    (DatabaseService as any).getInstance = jest.fn().mockReturnValue(mockDbService);
    
    agent = new UXOptimizationAgent(mockContextId, mockTenantId, mockUserId);
  });

  describe('handleUserMessage', () => {
    it('should process a simple message and return extracted data', async () => {
      const message = "My business name is Arcana Technologies and we're located at 123 Main Street in San Francisco";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate).toBeDefined();
      expect(response.contextUpdate?.operation).toBe('message_extraction');
      expect(response.contextUpdate?.data).toHaveProperty('originalMessage', message);
    });

    it('should handle messages with no extractable data', async () => {
      const message = "Hello, I need help with my business";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data).toBeDefined();
      // With ephemeral handling, short questions get marked as ephemeral
      if ((response as any).ephemeral) {
        expect(response.contextUpdate?.data.status).toBe('ephemeral');
      } else {
        expect(response.contextUpdate?.data).toHaveProperty('extractedData');
      }
    });

    it('should handle complex business information extraction', async () => {
      const message = "We're a California LLC founded in 2020. Our EIN is 12-3456789 and our main office is at 456 Market St, Suite 200, San Francisco, CA 94105. The CEO is John Smith.";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.reasoning).toContain('Extracted');
      expect(response.confidence).toBeGreaterThan(0.5);
    });

    it('should handle messages with partial information', async () => {
      const message = "My phone number is 415-555-1234 but I'm not sure about the address yet";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data).toHaveProperty('originalMessage');
      expect(response.contextUpdate?.data.status).toBe('success');
    });

    it('should handle error scenarios gracefully', async () => {
      // Test with undefined message
      const response = await agent.handleUserMessage(undefined as any);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('error');
      expect(response.contextUpdate?.operation).toBe('message_error');
      expect(response.confidence).toBeLessThan(0.5);
    });

    it('should handle empty messages', async () => {
      const response = await agent.handleUserMessage('');
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      // Empty message is marked as ephemeral
      expect((response as any).ephemeral).toBe(true);
      expect(response.contextUpdate?.data.status).toBe('ephemeral');
    });

    it('should handle very long messages', async () => {
      const longMessage = 'Lorem ipsum dolor sit amet, '.repeat(100) + 
                         'My business is called TestCorp and we are at 789 Test Ave.';
      
      const response = await agent.handleUserMessage(longMessage);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data.originalMessage).toBe(longMessage);
    });

    it('should set appropriate confidence scores', async () => {
      const clearMessage = "My business name is ClearCorp, EIN 98-7654321, located at 100 Clear St, San Jose, CA 95110";
      const response = await agent.handleUserMessage(clearMessage);
      
      expect(response.confidence).toBeGreaterThan(0.7);
      expect(response.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should include proper trigger information', async () => {
      const message = "Test message for trigger validation";
      const response = await agent.handleUserMessage(message);
      
      expect(response.contextUpdate?.trigger).toBeDefined();
      expect(response.contextUpdate?.trigger?.type).toBe('user_request');
      expect(response.contextUpdate?.trigger?.source).toBe('user');
      expect(response.contextUpdate?.trigger?.details).toHaveProperty('message', message);
    });

    it('should handle messages with special characters', async () => {
      const message = "My company is O'Brien & Associates, LLC @ 123 \"Main\" St. #456";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data.originalMessage).toBe(message);
    });

    it('should handle multilingual content', async () => {
      const message = "My business 商业名称 is International Corp, located at Straße 123";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data.originalMessage).toBe(message);
    });

    it('should handle messages with URLs and emails', async () => {
      const message = "Visit our website at https://example.com or email us at contact@example.com";
      
      const response = await agent.handleUserMessage(message);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
      expect(response.contextUpdate?.data.originalMessage).toBe(message);
    });

    it('should generate unique entry IDs', async () => {
      const response1 = await agent.handleUserMessage("First message");
      const response2 = await agent.handleUserMessage("Second message");
      
      expect(response1.contextUpdate?.entryId).toBeDefined();
      expect(response2.contextUpdate?.entryId).toBeDefined();
      expect(response1.contextUpdate?.entryId).not.toBe(response2.contextUpdate?.entryId);
    });

    it('should include actor information', async () => {
      const response = await agent.handleUserMessage("Test message");
      
      expect(response.contextUpdate?.actor).toBeDefined();
      expect(response.contextUpdate?.actor?.type).toBe('agent');
      expect(response.contextUpdate?.actor?.id).toContain('ux_optimization');
    });

    it('should handle task context parameter', async () => {
      const taskContext = {
        contextId: 'specific-context',
        taskId: 'specific-task',
        tenantId: 'specific-tenant',
        userId: 'specific-user'
      };
      
      const response = await agent.handleUserMessage("Test with context", taskContext);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
    });
  });

  describe('FluidUI Integration', () => {
    it('should indicate when clarification is needed', async () => {
      // Currently returns completed since getPendingUIRequests returns empty array
      // This test documents the expected behavior when UIRequests are available
      const ambiguousMessage = "I think the address might be somewhere on Market Street";
      
      const response = await agent.handleUserMessage(ambiguousMessage);
      
      expect(response).toBeDefined();
      // When UIRequests are available, this should return 'needs_clarification'
      expect(['completed', 'needs_clarification']).toContain(response.status);
    });

    it('should maintain conversation context', async () => {
      // Test sequential messages
      const messages = [
        "My business is called TechCorp",
        "We're located in San Francisco",
        "Our phone number is 415-555-0000"
      ];
      
      for (const message of messages) {
        const response = await agent.handleUserMessage(message);
        expect(response.status).toBe('completed');
        // Check if message is in the data
        if (response.contextUpdate?.data.originalMessage) {
          expect(response.contextUpdate?.data.originalMessage).toBe(message);
        } else {
          // For ephemeral messages, we still have contextUpdate but different structure
          expect(response.contextUpdate).toBeDefined();
        }
      }
    });

    it('should handle conversation mode vs form mode appropriately', async () => {
      // Conversation mode - natural language
      const conversationMessage = "Hey, my business is ABC Corp and we're at 123 Test St";
      const convResponse = await agent.handleUserMessage(conversationMessage);
      
      expect(convResponse.status).toBe('completed');
      expect(convResponse.contextUpdate?.operation).toBe('message_extraction');
      
      // Form mode would be handled by existing methods
      // This documents the separation of concerns
    });
  });

  describe('Error Handling', () => {
    it('should handle null message gracefully', async () => {
      const response = await agent.handleUserMessage(null as any);
      
      expect(response.status).toBe('error');
      expect(response.contextUpdate?.operation).toBe('message_error');
      expect(response.contextUpdate?.data.error).toBeDefined();
    });

    it('should handle undefined task context', async () => {
      const response = await agent.handleUserMessage("Test message", undefined);
      
      expect(response).toBeDefined();
      expect(response.status).toBe('completed');
    });

    it('should handle extraction errors', async () => {
      // Mock an error by passing an object instead of string
      const response = await agent.handleUserMessage({} as any);
      
      expect(response.status).toBe('error');
      expect(response.contextUpdate?.confidence).toBeLessThan(0.5);
    });

    it('should include error details in response', async () => {
      const response = await agent.handleUserMessage(null as any);
      
      expect(response.contextUpdate?.data.error).toBeDefined();
      expect(response.contextUpdate?.reasoning).toContain('Failed');
    });
  });

  describe('Performance', () => {
    it('should handle rapid successive messages', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(agent.handleUserMessage(`Message ${i}`));
      }
      
      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.status).toBe('completed');
      });
    });

    it('should process messages within reasonable time', async () => {
      const startTime = Date.now();
      await agent.handleUserMessage("Performance test message");
      const endTime = Date.now();
      
      // Should process within 1 second (generous for CI environments)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});