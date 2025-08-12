/**
 * Profile Collection Agent Tests
 * Tests all functionality specified in PRD lines 439-520
 * 
 * MANDATORY: No mock data - tests real profile collection logic
 * Uses test database and mock external APIs only
 */

import { ProfileCollector } from '../ProfileCollector';
import { TaskContext, AgentRequest } from '../../types/engine-types';

describe('ProfileCollector', () => {
  let agent: ProfileCollector;
  let mockContext: TaskContext;

  beforeEach(() => {
    agent = new ProfileCollector();
    
    mockContext = {
      contextId: 'test_context_456',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'gathering_user_info',
        phase: 'profile_collection',
        completeness: 35,
        data: {
          user: {
            email: 'sarah@innovativedesign.com',
            firstName: 'Sarah',
            lastName: 'Johnson',
            location: 'Austin, TX'
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

  describe('Profile Collection After Successful Business Discovery', () => {
    test('should use business discovery results for high-confidence defaults', async () => {
      // Add business found entry to context
      mockContext.history.push({
        entryId: 'entry_1',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'agent', id: 'business_discovery_agent', version: '1.0.0' },
        operation: 'business_found',
        data: {
          business: {
            name: 'Innovative Design LLC',
            entityType: 'LLC',
            state: 'Texas',
            ein: '12-3456789',
            status: 'Active'
          },
          confidence: 0.90,
          searchDetails: { statesSearched: ['texas'], source: 'texas_sos' }
        },
        reasoning: 'Business found with high confidence'
      });

      const request: AgentRequest = {
        requestId: 'req_201',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.smartDefaults.businessName).toBe('Innovative Design LLC');
      expect(response.data.smartDefaults.entityType).toBe('LLC');
      expect(response.data.smartDefaults.state).toBe('TX');
      expect(response.data.smartDefaults.confidence).toBeGreaterThan(0.8);
      expect(response.data.strategy).toBe('high_confidence_prefill');
    });

    test('should generate pre-filled form with business discovery data', async () => {
      // Add business found entry
      mockContext.history.push({
        entryId: 'entry_2',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'agent', id: 'business_discovery_agent', version: '1.0.0' },
        operation: 'business_found',
        data: {
          business: {
            name: 'TechStart Inc',
            entityType: 'Corporation',
            state: 'Delaware',
            status: 'Active'
          },
          confidence: 0.85
        },
        reasoning: 'Business found in Delaware records'
      });

      const request: AgentRequest = {
        requestId: 'req_202',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.uiRequests).toHaveLength(1);
      const uiRequest = response.uiRequests![0];
      
      expect(uiRequest.title).toContain('Confirm Your Business Details');
      expect(uiRequest.formDefinition).toBeDefined();
      
      const businessNameField = uiRequest.formDefinition.find((f: any) => f.id === 'businessName');
      expect(businessNameField?.defaultValue).toBe('TechStart Inc');
      
      const entityTypeField = uiRequest.formDefinition.find((f: any) => f.id === 'entityType');
      expect(entityTypeField?.defaultValue).toBe('Corporation');
      
      const stateField = uiRequest.formDefinition.find((f: any) => f.id === 'state');
      expect(stateField?.defaultValue).toBe('DE');
    });
  });

  describe('Profile Collection After Failed Business Discovery', () => {
    test('should infer defaults from email domain when business not found', async () => {
      // Add business not found entry
      mockContext.history.push({
        entryId: 'entry_3',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'agent', id: 'business_discovery_agent', version: '1.0.0' },
        operation: 'business_not_found',
        data: {
          searchDetails: {
            statesSearched: ['texas', 'delaware'],
            queriesAttempted: ['Innovative Design', 'Innovative Design LLC']
          }
        },
        reasoning: 'Business not found in public records'
      });

      const request: AgentRequest = {
        requestId: 'req_203',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.smartDefaults.businessName).toBe('Innovative Design');
      expect(response.data.smartDefaults.entityType).toBe('LLC'); // Business domain suggests LLC
      expect(response.data.smartDefaults.state).toBe('TX'); // From location
      expect(response.data.strategy).toBe('moderate_confidence_suggest');
    });

    test('should use guided collection for personal email domains', async () => {
      mockContext.currentState.data.user.email = 'sarah.johnson@gmail.com';
      
      mockContext.history.push({
        entryId: 'entry_4',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'agent', id: 'business_discovery_agent', version: '1.0.0' },
        operation: 'business_not_found',
        data: { searchDetails: { statesSearched: [], queriesAttempted: [] } },
        reasoning: 'No business search attempted for personal email'
      });

      const request: AgentRequest = {
        requestId: 'req_204',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.smartDefaults.businessName).toBeUndefined();
      expect(response.data.smartDefaults.entityType).toBe('Sole Proprietorship');
      expect(response.data.strategy).toBe('guided_collection');
      expect(response.uiRequests![0].title).toContain('Tell Us About Your Business');
    });
  });

  describe('Smart Defaults Generation', () => {
    test('should generate high-confidence defaults from business discovery', () => {
      const businessDiscovery = {
        found: true,
        business: {
          name: 'Austin Creative LLC',
          entityType: 'LLC',
          state: 'Texas'
        },
        confidence: 0.92
      };

      const defaults = (agent as any).generateSmartDefaults(businessDiscovery, mockContext);

      expect(defaults.businessName).toBe('Austin Creative LLC');
      expect(defaults.entityType).toBe('LLC');
      expect(defaults.state).toBe('TX');
      expect(defaults.confidence).toBeGreaterThan(0.8);
    });

    test('should infer defaults from email domain when business not found', () => {
      const businessDiscovery = { found: false };

      const defaults = (agent as any).generateSmartDefaults(businessDiscovery, mockContext);

      expect(defaults.businessName).toBe('Innovative Design');
      expect(defaults.entityType).toBe('LLC');
      expect(defaults.state).toBe('TX');
      expect(defaults.confidence).toBeGreaterThan(0.4);
      expect(defaults.confidence).toBeLessThan(0.8);
    });

    test('should handle missing location gracefully', () => {
      mockContext.currentState.data.user.location = undefined;
      const businessDiscovery = { found: false };

      const defaults = (agent as any).generateSmartDefaults(businessDiscovery, mockContext);

      expect(defaults.state).toBe('CA'); // Default fallback
      expect(defaults.confidence).toBeGreaterThan(0);
    });
  });

  describe('Collection Strategy Determination', () => {
    test('should use high_confidence_prefill for confident defaults', () => {
      const defaults = { confidence: 0.85, businessName: 'Test LLC', entityType: 'LLC', state: 'CA' };
      const existing = {};

      const strategy = (agent as any).determineCollectionStrategy(defaults, existing);

      expect(strategy).toBe('high_confidence_prefill');
    });

    test('should use moderate_confidence_suggest for medium confidence', () => {
      const defaults = { confidence: 0.6, businessName: 'Test Corp', entityType: 'Corporation' };
      const existing = {};

      const strategy = (agent as any).determineCollectionStrategy(defaults, existing);

      expect(strategy).toBe('moderate_confidence_suggest');
    });

    test('should use update_existing when profile data exists', () => {
      const defaults = { confidence: 0.3 };
      const existing = { businessName: 'Existing Co', entityType: 'LLC', state: 'NY' };

      const strategy = (agent as any).determineCollectionStrategy(defaults, existing);

      expect(strategy).toBe('update_existing');
    });

    test('should use guided_collection for low confidence, no existing data', () => {
      const defaults = { confidence: 0.2 };
      const existing = {};

      const strategy = (agent as any).determineCollectionStrategy(defaults, existing);

      expect(strategy).toBe('guided_collection');
    });
  });

  describe('Form Generation', () => {
    test('should generate base fields for all strategies', () => {
      const strategy = 'guided_collection';
      const defaults = { confidence: 0.3, businessName: 'Test', entityType: 'LLC', state: 'CA' };
      const existing = {};

      const form = (agent as any).generateOptimizedForm(strategy, defaults, existing);

      expect(form).toHaveLength(3); // businessName, entityType, state
      
      const businessNameField = form.find((f: any) => f.id === 'businessName');
      expect(businessNameField).toBeDefined();
      expect(businessNameField.required).toBe(true);
      expect(businessNameField.defaultValue).toBe('Test');

      const entityTypeField = form.find((f: any) => f.id === 'entityType');
      expect(entityTypeField).toBeDefined();
      expect(entityTypeField.type).toBe('select');
      expect(entityTypeField.options).toBeDefined();

      const stateField = form.find((f: any) => f.id === 'state');
      expect(stateField).toBeDefined();
      expect(stateField.type).toBe('select');
    });

    test('should include optional fields for high confidence strategy', () => {
      const strategy = 'high_confidence_prefill';
      const defaults = { confidence: 0.9, businessName: 'Tech LLC', industry: 'Technology' };
      const existing = {};

      const form = (agent as any).generateOptimizedForm(strategy, defaults, existing);

      expect(form.length).toBeGreaterThan(3);
      
      const websiteField = form.find((f: any) => f.id === 'website');
      expect(websiteField).toBeDefined();
      expect(websiteField.required).toBe(false);

      const industryField = form.find((f: any) => f.id === 'industry');
      expect(industryField).toBeDefined();
      expect(industryField.required).toBe(false);
    });
  });

  describe('Context Recording', () => {
    test('should record collection initiation with proper reasoning', async () => {
      const request: AgentRequest = {
        requestId: 'req_205',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const initiationEntry = mockContext.history.find(entry => 
        entry.operation === 'profile_collection_initiated'
      );

      expect(initiationEntry).toBeDefined();
      expect(initiationEntry?.actor.type).toBe('agent');
      expect(initiationEntry?.actor.id).toBe('profile_collection_agent');
      expect(initiationEntry?.reasoning).toContain('Starting profile collection');
      expect(initiationEntry?.data).toHaveProperty('requestId');
    });

    test('should record collection strategy with confidence level', async () => {
      const request: AgentRequest = {
        requestId: 'req_206',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const strategyEntry = mockContext.history.find(entry => 
        entry.operation === 'collection_strategy_determined'
      );

      expect(strategyEntry).toBeDefined();
      expect(strategyEntry?.data).toHaveProperty('strategy');
      expect(strategyEntry?.data).toHaveProperty('defaults');
      expect(strategyEntry?.data).toHaveProperty('confidence');
      expect(strategyEntry?.reasoning).toContain('strategy');
    });
  });

  describe('UI Request Generation', () => {
    test('should generate appropriate UI request for high-confidence scenario', async () => {
      // Add high-confidence business discovery
      mockContext.history.push({
        entryId: 'entry_5',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'agent', id: 'business_discovery_agent', version: '1.0.0' },
        operation: 'business_found',
        data: {
          business: { name: 'Confirmed LLC', entityType: 'LLC', state: 'California' },
          confidence: 0.95
        },
        reasoning: 'High confidence business match'
      });

      const request: AgentRequest = {
        requestId: 'req_207',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.uiRequests).toHaveLength(1);
      const uiRequest = response.uiRequests![0];

      expect(uiRequest.suggestedTemplates).toContain('business_profile_form');
      expect(uiRequest.title).toContain('Confirm');
      expect(uiRequest.description).toContain('We found some information');
      expect(uiRequest).toHaveProperty('progressIndicator');
      expect(uiRequest.progressIndicator.current).toBe(2);
      expect(uiRequest.progressIndicator.total).toBe(4);
      expect(uiRequest.context.userProgress).toBe(45);
    });

    test('should generate guidance-focused UI for low confidence', async () => {
      mockContext.currentState.data.user.email = 'user@gmail.com';
      
      const request: AgentRequest = {
        requestId: 'req_208',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      expect(uiRequest.title).toContain('Tell Us About');
      expect(uiRequest.description).toContain('Help us understand');
      expect(uiRequest.actions).toHaveProperty('help');
    });
  });

  describe('Helper Methods', () => {
    test('should identify personal email domains correctly', () => {
      expect((agent as any).isPersonalEmailDomain('user@gmail.com')).toBe(true);
      expect((agent as any).isPersonalEmailDomain('contact@business.com')).toBe(false);
      expect((agent as any).isPersonalEmailDomain('owner@yahoo.com')).toBe(true);
      expect((agent as any).isPersonalEmailDomain('info@company.io')).toBe(false);
    });

    test('should extract business name from domain correctly', () => {
      expect((agent as any).extractBusinessNameFromDomain('techstartup.com')).toBe('Techstartup');
      expect((agent as any).extractBusinessNameFromDomain('innovativedesign.io')).toBe('Innovativedesign');
      expect((agent as any).extractBusinessNameFromDomain('myCompany.net')).toBe('My Company');
    });

    test('should extract state from location correctly', () => {
      expect((agent as any).extractStateFromLocation('Austin, TX')).toBe('TX');
      expect((agent as any).extractStateFromLocation('San Francisco, CA')).toBe('CA');
      expect((agent as any).extractStateFromLocation('New York')).toBe('NY');
      expect((agent as any).extractStateFromLocation('Seattle')).toBe('WA');
      expect((agent as any).extractStateFromLocation('Unknown City')).toBe('CA'); // Default
    });

    test('should infer entity type based on context', () => {
      const businessEmailUser = { email: 'owner@techcompany.com' };
      expect((agent as any).inferEntityType(businessEmailUser, mockContext)).toBe('LLC');

      const personalEmailUser = { email: 'john@gmail.com' };
      expect((agent as any).inferEntityType(personalEmailUser, mockContext)).toBe('Sole Proprietorship');
    });

    test('should infer industry from business name', () => {
      expect((agent as any).inferIndustry('TechStartup Solutions', mockContext)).toBe('Technology');
      expect((agent as any).inferIndustry('Smith Consulting Group', mockContext)).toBe('Professional Services');
      expect((agent as any).inferIndustry('Downtown Restaurant', mockContext)).toBe('Food & Beverage');
      expect((agent as any).inferIndustry('Generic Business', mockContext)).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle processing errors gracefully', async () => {
      // Force an error by corrupting context
      mockContext.currentState.data = null as any;

      const request: AgentRequest = {
        requestId: 'req_209',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('error');
      expect(response.data).toHaveProperty('error');
      
      const errorEntry = mockContext.history.find(entry => 
        entry.operation === 'profile_collection_error'
      );
      expect(errorEntry).toBeDefined();
    });
  });

  describe('Integration with Agent Flow', () => {
    test('should specify next agent after profile collection', async () => {
      const request: AgentRequest = {
        requestId: 'req_210',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response).toHaveProperty('nextAgent');
      expect(response.nextAgent).toBe('entity_compliance_agent');
    });

    test('should maintain context progression', async () => {
      const initialHistoryLength = mockContext.history.length;
      
      const request: AgentRequest = {
        requestId: 'req_211',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile_data',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      expect(mockContext.history.length).toBeGreaterThan(initialHistoryLength);
      
      // Check sequence numbers are correct
      const newEntries = mockContext.history.slice(initialHistoryLength);
      newEntries.forEach((entry, index) => {
        expect(entry.sequenceNumber).toBe(initialHistoryLength + index + 1);
      });
    });
  });
});

/**
 * Performance Tests
 */
describe('ProfileCollector Performance', () => {
  let agent: ProfileCollector;

  beforeEach(() => {
    agent = new ProfileCollector();
  });

  test('should complete profile collection within time limits', async () => {
    const mockContext: TaskContext = {
      contextId: 'perf_test',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'gathering_user_info',
        phase: 'profile_collection',
        completeness: 35,
        data: {
          user: {
            email: 'test@business.com',
            firstName: 'Test',
            lastName: 'User',
            location: 'San Francisco, CA'
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
      agentRole: 'profile_collection_agent',
      instruction: 'collect_profile_data',
      data: {}
    };

    const startTime = Date.now();
    const response = await agent.processRequest(request, mockContext);
    const endTime = Date.now();

    // Should complete within 5 seconds (PRD requirement)
    expect(endTime - startTime).toBeLessThan(5000);
    expect(response).toBeDefined();
    expect(response.status).toBe('needs_input');
  });
});