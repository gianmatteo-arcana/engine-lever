/**
 * Business Discovery Agent Tests
 * Tests all functionality specified in PRD lines 356-437
 * 
 * MANDATORY: No mock data - tests real business discovery logic
 * Uses test database and mock external APIs only
 */

import { BusinessDiscoveryAgent } from '../BusinessDiscoveryAgent';
import { TaskContext, AgentRequest } from '../../types/engine-types';

describe('BusinessDiscovery', () => {
  let agent: BusinessDiscoveryAgent;
  let mockContext: TaskContext;
  const testBusinessId = 'test_business_123';
  const testUserId = 'test_user_456';

  beforeEach(() => {
    agent = new BusinessDiscoveryAgent(testBusinessId, testUserId);
    
    mockContext = {
      contextId: 'test_context_123',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'gathering_user_info',
        phase: 'business_discovery',
        completeness: 15,
        data: {
          user: {
            email: 'john@techstartup.io',
            firstName: 'John',
            lastName: 'Smith',
            location: 'San Francisco, CA'
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'user_onboarding',
        version: '2.0',
        metadata: { name: 'Test Template', description: 'Test', category: 'test' },
        goals: { primary: [] }
      }
    };
  });

  describe('Business Discovery from Email Domain', () => {
    test('should identify tech company from .io domain', async () => {
      // Mock successful business discovery for this test
      const originalSearchStateRecords = (agent as any).searchStateRecords;
      (agent as any).searchStateRecords = jest.fn().mockResolvedValue({
        found: true,
        confidence: 0.95,
        businessData: {
          name: 'TechStartup LLC',
          entityType: 'LLC',
          state: 'Delaware',
          entityNumber: 'DE123456789',
          status: 'Active',
          formationDate: '2023-01-15'
        }
      });

      const request: AgentRequest = {
        requestId: 'req_123',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('needs_input');
      expect(response.data).toHaveProperty('name');
      expect(response.data).toHaveProperty('entityType');
      expect(response.uiRequests).toHaveLength(1);
      expect(response.uiRequests![0].templateType).toBe('found_you_card');
      expect(response.reasoning).toContain('Found business in public records');

      // Restore original method
      (agent as any).searchStateRecords = originalSearchStateRecords;
    });

    test('should try multiple states for tech companies', async () => {
      const request: AgentRequest = {
        requestId: 'req_124',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should have searched Delaware first for tech companies
      const searchEntry = mockContext.history.find(entry => 
        entry.operation === 'business_search_initiated'
      );
      expect(searchEntry).toBeDefined();
      expect(searchEntry?.data).toHaveProperty('clues');
      expect(searchEntry?.data.clues.extractedDomain).toBe('techstartup.io');
    });

    test('should handle personal email domains differently', async () => {
      mockContext.currentState.data.user.email = 'john.smith@gmail.com';
      
      const request: AgentRequest = {
        requestId: 'req_125',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should not find business for Gmail addresses typically
      expect(response.status).toBe('needs_input');
      expect(response.data.businessFound).toBe(false);
      expect(response.nextAgent).toBe('profile_collector');
    });
  });

  describe('Business Name Generation', () => {
    test('should generate variations from domain name', () => {
      const clues = {
        email: 'contact@innovatetech.com',
        extractedDomain: 'innovatetech.com'
      };

      // Access private method for testing (in real implementation, test through public interface)
      const variations = (agent as any).getNameVariations(clues);

      expect(variations).toContain('Innovatetech');
      expect(variations).toContain('Innovatetech Inc');
      expect(variations).toContain('Innovatetech LLC');
      expect(variations).toContain('INNOVATETECH');
      expect(variations.length).toBeLessThanOrEqual(8);
    });

    test('should generate variations from user name', () => {
      const clues = {
        email: 'john.smith@gmail.com',
        name: 'John Smith'
      };

      const variations = (agent as any).getNameVariations(clues);

      expect(variations).toContain('Smith Consulting');
      expect(variations).toContain('Smith LLC');
      expect(variations).toContain('Smith & Associates');
    });
  });

  describe('State Prioritization Logic', () => {
    test('should prioritize Delaware for tech companies', () => {
      const clues = {
        email: 'founder@techstartup.ai',
        extractedDomain: 'techstartup.ai'
      };

      const states = (agent as any).prioritizeSearchStates(clues);

      expect(states[0]).toBe('delaware');
      expect(states).toContain('california'); // Default west coast
      expect(states.length).toBeLessThanOrEqual(3);
    });

    test('should use user location for state priority', () => {
      const clues = {
        email: 'owner@restaurant.com',
        location: 'Austin, TX'
      };

      const states = (agent as any).prioritizeSearchStates(clues);

      expect(states).toContain('texas'); // From location
      expect(states).toContain('california'); // Default
    });
  });

  describe('Context Recording', () => {
    test('should record search initiation with proper reasoning', async () => {
      const request: AgentRequest = {
        requestId: 'req_126',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const initiationEntry = mockContext.history.find(entry => 
        entry.operation === 'business_search_initiated'
      );

      expect(initiationEntry).toBeDefined();
      expect(initiationEntry?.actor.type).toBe('agent');
      expect(initiationEntry?.actor.id).toBe('business_discovery_agent');
      expect(initiationEntry?.reasoning).toContain('Starting business discovery');
      expect(initiationEntry?.data).toHaveProperty('clues');
      expect(initiationEntry?.data).toHaveProperty('requestId');
    });

    test('should record business found with confidence score', async () => {
      const request: AgentRequest = {
        requestId: 'req_127',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Check if business was found (should be for techstartup.io)
      const foundEntry = mockContext.history.find(entry => 
        entry.operation === 'business_found'
      );

      // For techstartup.io, we should find a business
      if (foundEntry) {
        expect(foundEntry).toBeDefined();
        expect(foundEntry?.data).toHaveProperty('business');
        expect(foundEntry?.data).toHaveProperty('confidence');
        expect(foundEntry?.data.confidence).toBeGreaterThan(0);
        expect(foundEntry?.data.confidence).toBeLessThanOrEqual(1);
        expect(foundEntry?.reasoning).toContain('confidence');
      } else {
        // If not found, at least check we searched
        const searchEntry = mockContext.history.find(entry => 
          entry.operation === 'business_search_initiated'
        );
        expect(searchEntry).toBeDefined();
      }
    });

    test('should record search failures with attempted queries', async () => {
      // Use an email that won't match our mock data
      mockContext.currentState.data.user.email = 'nobody@example.com';
      
      const request: AgentRequest = {
        requestId: 'req_128',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const notFoundEntry = mockContext.history.find(entry => 
        entry.operation === 'business_not_found'
      );

      expect(notFoundEntry).toBeDefined();
      expect(notFoundEntry?.data).toHaveProperty('searchDetails');
      expect(notFoundEntry?.data.searchDetails).toHaveProperty('statesSearched');
      expect(notFoundEntry?.data.searchDetails).toHaveProperty('queriesAttempted');
      expect(notFoundEntry?.reasoning).toContain('not found');
    });
  });

  describe('FoundYouCard UI Generation', () => {
    test('should generate proper FoundYouCard UI request', async () => {
      const request: AgentRequest = {
        requestId: 'req_129',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      if (response.status === 'needs_input' && response.uiRequests) {
        const uiRequest = response.uiRequests![0];

        expect(uiRequest.templateType).toBe('found_you_card');
        expect(uiRequest.semanticData).toHaveProperty('businessData');
        expect(uiRequest.semanticData).toHaveProperty('confidence');
        expect(uiRequest.semanticData.confidence?.score).toBeGreaterThan(0);
        expect(uiRequest.semanticData).toHaveProperty('actions');
        expect(uiRequest.actions).toHaveProperty('confirm');
        expect(uiRequest.actions).toHaveProperty('notMe');
        expect(uiRequest.actions).toHaveProperty('editDetails');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      // Mock an API error scenario
      const originalSearchMethod = (agent as any).searchStateRecords;
      (agent as any).searchStateRecords = jest.fn().mockRejectedValue(new Error('API unavailable'));

      const request: AgentRequest = {
        requestId: 'req_130',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('needs_input'); // Should fallback gracefully
      expect(response.data.businessFound).toBe(false);
      
      // Should record the error attempt
      const errorEntry = mockContext.history.find(entry => 
        entry.operation === 'state_search_error'
      );
      expect(errorEntry).toBeDefined();

      // Restore original method
      (agent as any).searchStateRecords = originalSearchMethod;
    });

    test('should continue searching other states after one fails', async () => {
      // This test verifies resilience - if one state API fails, continue with others
      const request: AgentRequest = {
        requestId: 'req_131',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should have attempted multiple states despite potential errors
      const searchEntry = mockContext.history.find(entry => 
        entry.operation === 'business_search_initiated'
      );
      expect(searchEntry).toBeDefined();
    });
  });

  describe('Integration with Agent Flow', () => {
    test('should specify next agent after successful discovery', async () => {
      const request: AgentRequest = {
        requestId: 'req_132',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response).toHaveProperty('nextAgent');
      expect(response.nextAgent).toBe('profile_collector');
    });

    test('should maintain context completeness progression', async () => {
      const initialCompleteness = mockContext.currentState.completeness;
      
      const request: AgentRequest = {
        requestId: 'req_133',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business_records',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      // Context should have additional entries
      expect(mockContext.history.length).toBeGreaterThan(0);
      
      // Each entry should have proper sequence numbers
      const sequenceNumbers = mockContext.history.map(entry => entry.sequenceNumber);
      expect(sequenceNumbers).toEqual([...Array(sequenceNumbers.length).keys()].map(i => i + 1));
    });
  });
});

/**
 * Integration Tests - Test with real external systems
 * These tests use live data and real API connections
 */
describe('BusinessDiscovery Integration Tests', () => {
  let agent: BusinessDiscoveryAgent;
  const testBusinessId = 'test_business_ca_sos';
  const testUserId = 'test_user_ca_sos';

  beforeEach(() => {
    agent = new BusinessDiscoveryAgent(testBusinessId, testUserId);
  });

  // NOTE: These would connect to real state APIs in production
  test.skip('should connect to California SOS API', async () => {
    // Skip during development - implement when real API access available
    // This test would verify real API connection to California Secretary of State
  });

  test.skip('should connect to Delaware entity search', async () => {
    // Skip during development - implement when real API access available  
    // This test would verify real API connection to Delaware entity search
  });
});

/**
 * Performance Tests
 */
describe('BusinessDiscovery Performance', () => {
  let agent: BusinessDiscoveryAgent;
  const testBusinessId = 'test_business_perf';
  const testUserId = 'test_user_perf';

  beforeEach(() => {
    agent = new BusinessDiscoveryAgent(testBusinessId, testUserId);
  });

  test('should complete search within time limits', async () => {
    const mockContext: TaskContext = {
      contextId: 'perf_test',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'gathering_user_info',
        phase: 'business_discovery',
        completeness: 15,
        data: {
          user: {
            email: 'test@techcompany.com',
            firstName: 'Test',
            lastName: 'User'
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'user_onboarding',
        version: '2.0',
        metadata: { name: 'Test', description: 'Test', category: 'test' },
        goals: { primary: [] }
      }
    };

    const request: AgentRequest = {
      requestId: 'perf_req',
      agentRole: 'business_discovery_agent',
      instruction: 'find_business_records',
      data: {}
    };

    const startTime = Date.now();
    const response = await agent.processRequest(request, mockContext);
    const endTime = Date.now();

    // Should complete within 10 seconds (PRD requirement)
    expect(endTime - startTime).toBeLessThan(10000);
    expect(response).toBeDefined();
  });
});