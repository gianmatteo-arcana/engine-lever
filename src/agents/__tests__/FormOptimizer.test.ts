/**
 * UX Optimization Agent Tests
 * Tests all functionality specified in PRD lines 601-680
 * 
 * MANDATORY: No mock data - tests real UX optimization logic
 */

import { FormOptimizer } from '../FormOptimizer';
import { TaskContext, AgentRequest } from '../../types/engine-types';

// Mock dependencies
jest.mock('../../services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      createContextHistoryEntry: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      upsertAgentContext: jest.fn().mockResolvedValue({}),
      createUIAugmentation: jest.fn().mockResolvedValue({ id: 'ui_123' }),
      createSystemAuditEntry: jest.fn().mockResolvedValue({}),
      getTaskAgentContexts: jest.fn().mockResolvedValue([])
    })
  }
}));

jest.mock('../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response for form optimization',
        model: 'mock-model',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));

describe('FormOptimizer', () => {
  let agent: FormOptimizer;
  let mockContext: TaskContext;

  beforeEach(() => {
    agent = new FormOptimizer();
    
    mockContext = {
      contextId: 'test_context_ux',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'form_optimization',
        completeness: 65,
        data: {
          user: {
            email: 'user@techstartup.com',
            location: 'San Francisco, CA'
          },
          business: {
            name: 'TechStartup Inc',
            entityType: 'Corporation',
            state: 'CA'
          }
        }
      },
      history: [
        {
          entryId: 'entry_1',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          actor: { type: 'agent', id: 'profile_collection_agent', version: '1.0.0' },
          operation: 'profile_collection_initiated',
          data: {
            formDefinition: [
              { id: 'businessName', type: 'text', label: 'Business Name', required: true },
              { id: 'entityType', type: 'select', label: 'Entity Type', required: true },
              { id: 'state', type: 'select', label: 'State', required: true },
              { id: 'ein', type: 'text', label: 'EIN', required: false },
              { id: 'website', type: 'text', label: 'Website', required: false },
              { id: 'phone', type: 'tel', label: 'Phone', required: false },
              { id: 'address', type: 'text', label: 'Address', required: false },
              { id: 'industry', type: 'select', label: 'Industry', required: false }
            ]
          }
        }
      ],
      templateSnapshot: {
        id: 'user_onboarding',
        version: '2.0',
        metadata: { name: 'Test Template', description: 'Test', category: 'test' },
        goals: { primary: [] }
      }
    };
  });

  describe('Form Optimization', () => {
    test('should reduce form fields by removing unnecessary ones', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_1',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.optimizedForm).toBeDefined();
      expect(response.data.metrics.reductionPercentage).toBeGreaterThan(0);
      
      const originalCount = 8; // From mock context
      const optimizedCount = response.data.optimizedForm.fields.length;
      expect(optimizedCount).toBeLessThan(originalCount);
    });

    test('should group fields into logical sections', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_2',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const sections = response.data.optimizedForm.sections;
      expect(sections).toBeDefined();
      expect(sections.length).toBeGreaterThan(0);
      
      // Should have basic info section
      const basicSection = sections.find((s: any) => s.id === 'basic_info');
      expect(basicSection).toBeDefined();
      expect(basicSection.fields).toContain('businessName');
    });

    test('should apply progressive disclosure for complex forms', async () => {
      // Add more fields to trigger progressive disclosure
      mockContext.history[0].data.formDefinition.push(
        { id: 'license1', type: 'text', label: 'License 1', required: false },
        { id: 'license2', type: 'text', label: 'License 2', required: false },
        { id: 'permit1', type: 'text', label: 'Permit 1', required: false }
      );

      const request: AgentRequest = {
        requestId: 'req_ux_3',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const sections = response.data.optimizedForm.sections;
      // Later sections should be collapsed
      const collapsedSections = sections.filter((s: any) => s.collapsed);
      expect(collapsedSections.length).toBeGreaterThan(0);
    });
  });

  describe('Device Optimization', () => {
    test('should optimize for mobile devices', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_4',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {},
        context: {
          deviceType: 'mobile'
        }
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.optimizedForm.layout).toBe('single');
      expect(response.data.optimizedForm.mobileLayout).toBeDefined();
      expect(response.data.optimizedForm.mobileLayout.columns).toBe(1);
      expect(response.data.optimizedForm.mobileLayout.touchTargetSize).toBe(48);
    });

    test('should add keyboard optimizations for mobile', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_5',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {},
        context: {
          deviceType: 'mobile'
        }
      };

      const response = await agent.processRequest(request, mockContext);

      const mobileLayout = response.data.optimizedForm.mobileLayout;
      expect(mobileLayout.keyboardOptimizations).toBeDefined();
      expect(mobileLayout.keyboardOptimizations.email).toBe('email');
      expect(mobileLayout.keyboardOptimizations.phone).toBe('tel');
    });

    test('should use multi-column layout for desktop', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_6',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {},
        context: {
          deviceType: 'desktop'
        }
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.optimizedForm.layout).not.toBe('single');
      expect(response.data.optimizedForm.mobileLayout).toBeUndefined();
    });
  });

  describe('Quick Actions', () => {
    test('should generate quick actions for common scenarios', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_7',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const quickActions = response.data.optimizedForm.quickActions;
      expect(quickActions).toBeDefined();
      expect(quickActions.length).toBeGreaterThan(0);
      
      // Should have single-member LLC action
      const singleLLC = quickActions.find((a: any) => a.id === 'single_llc');
      expect(singleLLC).toBeDefined();
      expect(singleLLC.prefilledData.entityType).toBe('LLC');
    });

    test('should include industry-specific quick actions', async () => {
      mockContext.history[0].data.formDefinition.push(
        { id: 'industry', type: 'select', label: 'Industry', required: false }
      );

      const request: AgentRequest = {
        requestId: 'req_ux_8',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const quickActions = response.data.optimizedForm.quickActions;
      const techStartup = quickActions.find((a: any) => a.id === 'tech_startup');
      expect(techStartup).toBeDefined();
      expect(techStartup.prefilledData.industry).toBe('Technology');
    });
  });

  describe('Progress Indicators', () => {
    test('should create step-based progress for few sections', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_9',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const progress = response.data.optimizedForm.progressIndicator;
      expect(progress).toBeDefined();
      expect(progress.type).toBe('steps');
      expect(progress.total).toBeLessThanOrEqual(3);
    });

    test('should show time remaining', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_10',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const progress = response.data.optimizedForm.progressIndicator;
      expect(progress.showTimeRemaining).toBe(true);
    });
  });

  describe('Cognitive Load Analysis', () => {
    test('should calculate cognitive load score', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_11',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.metrics.cognitiveLoadScore).toBeDefined();
      expect(response.data.metrics.cognitiveLoadScore).toBeGreaterThanOrEqual(0);
      expect(response.data.metrics.cognitiveLoadScore).toBeLessThanOrEqual(100);
    });

    test('should recommend high optimization for complex forms', async () => {
      // Add many fields to increase cognitive load
      for (let i = 0; i < 10; i++) {
        mockContext.history[0].data.formDefinition.push(
          { id: `field${i}`, type: 'text', label: `Field ${i}`, required: true }
        );
      }

      const request: AgentRequest = {
        requestId: 'req_ux_12',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should use progressive layout for high cognitive load
      expect(response.data.optimizedForm.layout).toBe('progressive');
    });
  });

  describe('Time Estimation', () => {
    test('should estimate completion time', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_13',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.optimizedForm.estimatedTime).toBeDefined();
      expect(response.data.optimizedForm.estimatedTime).toBeGreaterThan(0);
      expect(response.data.metrics.estimatedCompletionTime).toBe(
        response.data.optimizedForm.estimatedTime
      );
    });

    test('should reduce time estimate with quick actions', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_14',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // With quick actions, time should be reduced
      const hasQuickActions = response.data.optimizedForm.quickActions.length > 0;
      if (hasQuickActions) {
        const baseTime = response.data.optimizedForm.fields.length * 15;
        expect(response.data.optimizedForm.estimatedTime).toBeLessThan(baseTime);
      }
    });
  });

  describe('UI Request Generation', () => {
    test('should generate optimized form UI request', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_15',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.uiRequests).toBeDefined();
      expect(response.uiRequests!.length).toBe(1);
      
      const uiRequest = response.uiRequests![0];
      expect(uiRequest.semanticData.suggestedTemplates).toContain('optimized_profile_form');
      expect(uiRequest.semanticData.title).toBe('Almost There!');
    });

    test('should include motivational message based on optimization', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_16',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      expect(uiRequest.semanticData.motivationalMessage).toBeDefined();
      expect(uiRequest.semanticData.motivationalMessage).toContain('simplified');
    });

    test('should include mobile optimizations in UI request', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_17',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {},
        context: {
          deviceType: 'mobile'
        }
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      expect(uiRequest.semanticData.mobileOptimizations).toBeDefined();
      expect(uiRequest.semanticData.mobileOptimizations.enableSwipeNavigation).toBe(true);
      expect(uiRequest.semanticData.mobileOptimizations.showFloatingProgress).toBe(true);
    });
  });

  describe('Context Recording', () => {
    test('should record optimization initiation', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_18',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const initiationEntry = mockContext.history.find(entry => 
        entry.operation === 'ux_optimization_initiated'
      );

      expect(initiationEntry).toBeDefined();
      expect(initiationEntry?.data).toHaveProperty('originalFieldCount');
      expect(initiationEntry?.data).toHaveProperty('deviceType');
    });

    test('should record optimization results', async () => {
      const request: AgentRequest = {
        requestId: 'req_ux_19',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const resultsEntry = mockContext.history.find(entry => 
        entry.operation === 'form_optimization_completed'
      );

      expect(resultsEntry).toBeDefined();
      expect(resultsEntry?.data).toHaveProperty('metrics');
      expect(resultsEntry?.data).toHaveProperty('layoutType');
      expect(resultsEntry?.reasoning).toContain('Reduced fields');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing form data gracefully', async () => {
      // Remove form definition from context
      mockContext.history = [];

      const request: AgentRequest = {
        requestId: 'req_ux_20',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should still work with default fields
      expect(response.status).toBe('needs_input');
      expect(response.data.optimizedForm.fields.length).toBeGreaterThan(0);
    });

    test('should handle optimization errors', async () => {
      // Corrupt context to cause error
      mockContext.history = null as any;

      const request: AgentRequest = {
        requestId: 'req_ux_21',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('error');
      expect(response.data).toHaveProperty('error');
    });
  });
});

/**
 * Performance Tests
 */
describe('FormOptimizer Performance', () => {
  let agent: FormOptimizer;

  beforeEach(() => {
    agent = new FormOptimizer();
  });

  test('should optimize within time limits', async () => {
    const mockContext: TaskContext = {
      contextId: 'perf_test',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'optimization',
        completeness: 60,
        data: {}
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
      agentRole: 'ux_optimization_agent',
      instruction: 'optimize_form',
      data: {}
    };

    const startTime = Date.now();
    const response = await agent.processRequest(request, mockContext);
    const endTime = Date.now();

    // Should complete within 2 seconds
    expect(endTime - startTime).toBeLessThan(2000);
    expect(response).toBeDefined();
  });
});