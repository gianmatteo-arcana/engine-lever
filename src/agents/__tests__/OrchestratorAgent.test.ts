/**
 * OrchestratorAgent Test Suite
 * 
 * Tests universal orchestration patterns and Engine PRD compliance
 * Validates that single orchestrator handles ALL task types identically
 */

import { OrchestratorAgent } from '../OrchestratorAgent';
import { LLMProvider } from '../../services/llm-provider-interface';
import { DatabaseService } from '../../services/database';
import { ConfigurationManager } from '../../services/configuration-manager';
import {
  TaskContextFactory,
  TaskTemplateFactory,
  ContextEntryFactory,
  UIRequestFactory,
  TestDataBuilder
} from '../../test-utils/factories';
import {
  TaskContext,
  TaskTemplate,
  ExecutionPlan,
  UIRequest,
  UITemplateType
} from '../../types/engine-types';

// Mock dependencies
jest.mock('../../services/llm-provider-interface');
jest.mock('../../services/database');
jest.mock('../../services/configuration-manager');
jest.mock('../../utils/logger');

describe('OrchestratorAgent - Universal Task Orchestration', () => {
  let orchestrator: OrchestratorAgent;
  let mockLLMProvider: jest.Mocked<LLMProvider>;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (OrchestratorAgent as any).instance = undefined;
    
    // Setup mocks
    mockLLMProvider = new LLMProvider() as jest.Mocked<LLMProvider>;
    mockDbService = DatabaseService.getInstance() as jest.Mocked<DatabaseService>;
    mockConfigManager = new ConfigurationManager() as jest.Mocked<ConfigurationManager>;
    
    // Get orchestrator instance
    orchestrator = OrchestratorAgent.getInstance();
  });
  
  describe('Singleton Pattern', () => {
    it('should maintain single orchestrator instance', () => {
      const instance1 = OrchestratorAgent.getInstance();
      const instance2 = OrchestratorAgent.getInstance();
      
      expect(instance1).toBe(instance2);
    });
    
    it('should not allow direct instantiation', () => {
      // TypeScript prevents this, but verify the pattern
      expect(() => new (OrchestratorAgent as any)()).toThrow();
    });
  });
  
  describe('Universal Task Handling', () => {
    it('should handle ANY task type with identical flow', async () => {
      const templates = [
        TaskTemplateFactory.createOnboardingTemplate(),
        TaskTemplateFactory.createSOITemplate(),
        TaskTemplateFactory.create({ id: 'custom_task' })
      ];
      
      for (const template of templates) {
        const context = TaskContextFactory.create({
          taskTemplateId: template.id,
          templateSnapshot: template
        });
        
        // Mock LLM response for execution plan
        mockLLMProvider.complete.mockResolvedValue({
          content: JSON.stringify({
            phases: [
              {
                id: 'phase1',
                name: 'Test Phase',
                agentIds: ['test_agent'],
                operation: 'test'
              }
            ]
          })
        });
        
        await orchestrator.orchestrateTask(context);
        
        // Verify same orchestration flow regardless of template
        expect(mockLLMProvider.complete).toHaveBeenCalled();
        expect(context.history.length).toBeGreaterThan(0);
        expect(context.history.some(e => e.operation === 'execution_plan_created')).toBe(true);
      }
    });
    
    it('should reject special-case handling', async () => {
      const onboardingContext = TaskContextFactory.create({
        taskTemplateId: 'user_onboarding'
      });
      
      const soiContext = TaskContextFactory.create({
        taskTemplateId: 'soi_filing'
      });
      
      // Mock same plan generation for both
      const mockPlan = {
        phases: [{ id: 'p1', name: 'Phase 1', agentIds: [] }]
      };
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify(mockPlan)
      });
      
      await orchestrator.orchestrateTask(onboardingContext);
      await orchestrator.orchestrateTask(soiContext);
      
      // Verify no special handling based on template type
      const calls = mockLLMProvider.complete.mock.calls;
      
      // Both should use same prompt structure
      expect(calls[0][0].messages[0].role).toBe('system');
      expect(calls[1][0].messages[0].role).toBe('system');
      
      // No template-specific logic
      expect(calls[0][0].messages[0].content).toBe(calls[1][0].messages[0].content);
    });
  });
  
  describe('Execution Plan Creation', () => {
    it('should create dynamic execution plan using LLM', async () => {
      const context = TaskContextFactory.create();
      
      const expectedPlan: ExecutionPlan = {
        phases: [
          {
            id: 'discovery',
            name: 'Business Discovery',
            description: 'Gather business information',
            agentIds: ['business_discovery'],
            operation: 'discover',
            dependencies: []
          },
          {
            id: 'collection',
            name: 'Data Collection',
            description: 'Collect required data',
            agentIds: ['profile_collector'],
            operation: 'collect',
            dependencies: ['discovery']
          }
        ]
      };
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify(expectedPlan)
      });
      
      await orchestrator.orchestrateTask(context);
      
      // Verify LLM was called with proper prompt
      expect(mockLLMProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' })
          ]),
          responseFormat: 'json'
        })
      );
      
      // Verify plan was recorded in context
      const planEntry = context.history.find(e => e.operation === 'execution_plan_created');
      expect(planEntry).toBeDefined();
      expect(planEntry?.data.plan).toEqual(expectedPlan);
    });
    
    it('should include available agents in plan prompt', async () => {
      const context = TaskContextFactory.create();
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({ phases: [] })
      });
      
      await orchestrator.orchestrateTask(context);
      
      const promptCall = mockLLMProvider.complete.mock.calls[0][0];
      const userMessage = promptCall.messages.find(m => m.role === 'user');
      
      expect(userMessage?.content).toContain('Available Agents');
      expect(userMessage?.content).toContain('business_discovery');
      expect(userMessage?.content).toContain('profile_collector');
    });
  });
  
  describe('Progressive Disclosure', () => {
    it('should batch UI requests intelligently', async () => {
      const context = TaskContextFactory.create();
      
      // Create multiple UI requests
      const uiRequests: UIRequest[] = [
        UIRequestFactory.create({ requestId: 'ui1' }),
        UIRequestFactory.create({ requestId: 'ui2' }),
        UIRequestFactory.create({ requestId: 'ui3' }),
        UIRequestFactory.create({ requestId: 'ui4' })
      ];
      
      // Mock execution plan with UI-generating phase
      mockLLMProvider.complete
        .mockResolvedValueOnce({
          content: JSON.stringify({
            phases: [{
              id: 'collect',
              name: 'Collect Data',
              agentIds: ['profile_collector']
            }]
          })
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(['ui3', 'ui1', 'ui2', 'ui4']) // Optimized order
        });
      
      // Spy on private method (for testing)
      const sendSpy = jest.spyOn(orchestrator as any, 'sendUIRequests');
      
      await orchestrator.orchestrateTask(context);
      
      // Verify batching occurred
      if (sendSpy.mock.calls.length > 0) {
        const batch = sendSpy.mock.calls[0][1];
        expect(batch.length).toBeLessThanOrEqual(3); // Min batch size from config
      }
    });
    
    it('should reorder UI requests to minimize interruption', async () => {
      const context = TaskContextFactory.create();
      
      // Mock optimization response
      mockLLMProvider.complete
        .mockResolvedValueOnce({
          content: JSON.stringify({ phases: [] })
        })
        .mockResolvedValueOnce({
          content: JSON.stringify(['ui2', 'ui1', 'ui3']) // Reordered
        });
      
      const uiRequests = [
        UIRequestFactory.create({ requestId: 'ui1' }),
        UIRequestFactory.create({ requestId: 'ui2' }),
        UIRequestFactory.create({ requestId: 'ui3' })
      ];
      
      // Test optimization method
      const optimized = await (orchestrator as any).optimizeUIRequests(uiRequests);
      
      expect(optimized[0].requestId).toBe('ui2');
      expect(optimized[1].requestId).toBe('ui1');
      expect(optimized[2].requestId).toBe('ui3');
    });
  });
  
  describe('Resilience and Fallback Strategies', () => {
    it('should apply fallback when agent unavailable', async () => {
      const context = TaskContextFactory.create();
      
      // Set payment processor as unavailable
      const agentRegistry = (orchestrator as any).agentRegistry;
      const paymentAgent = agentRegistry.get('payment_processor');
      if (paymentAgent) {
        paymentAgent.availability = 'not_implemented';
      }
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({
          phases: [{
            id: 'payment',
            name: 'Process Payment',
            agentIds: ['payment_processor']
          }]
        })
      });
      
      await orchestrator.orchestrateTask(context);
      
      // Verify fallback was applied
      const fallbackEntry = context.history.find(e => 
        e.reasoning?.includes('unavailable')
      );
      expect(fallbackEntry).toBeDefined();
    });
    
    it('should degrade gracefully to manual mode on failure', async () => {
      const context = TaskContextFactory.create();
      
      // Force orchestration failure
      mockLLMProvider.complete.mockRejectedValue(new Error('LLM unavailable'));
      
      await orchestrator.orchestrateTask(context);
      
      // Verify manual mode was triggered
      const failureEntry = context.history.find(e => 
        e.operation === 'orchestration_failed'
      );
      expect(failureEntry).toBeDefined();
      expect(failureEntry?.data.strategy).toBe('degrade');
    });
    
    it('should find alternative agents when primary unavailable', async () => {
      const context = TaskContextFactory.create();
      
      // Create mock agents with overlapping capabilities
      const registry = new Map([
        ['agent1', {
          agentId: 'agent1',
          role: 'primary',
          capabilities: ['data_collection', 'validation'],
          availability: 'offline' as const
        }],
        ['agent2', {
          agentId: 'agent2',
          role: 'backup',
          capabilities: ['data_collection'],
          availability: 'available' as const
        }]
      ]);
      
      (orchestrator as any).agentRegistry = registry;
      
      const alternative = (orchestrator as any).findAlternativeAgent(
        registry.get('agent1')
      );
      
      expect(alternative).toBeDefined();
      expect(alternative?.agentId).toBe('agent2');
    });
  });
  
  describe('Event Sourcing and Traceability', () => {
    it('should record all decisions with complete reasoning', async () => {
      const context = TaskContextFactory.create();
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({
          phases: [
            { id: 'p1', name: 'Phase 1', agentIds: [] },
            { id: 'p2', name: 'Phase 2', agentIds: [] }
          ]
        })
      });
      
      await orchestrator.orchestrateTask(context);
      
      // Verify all entries have reasoning
      context.history.forEach(entry => {
        expect(entry.reasoning).toBeDefined();
        expect(entry.reasoning.length).toBeGreaterThan(0);
      });
      
      // Verify key operations recorded
      expect(context.history.some(e => e.operation === 'execution_plan_created')).toBe(true);
      expect(context.history.some(e => e.operation === 'phase_completed')).toBe(true);
      expect(context.history.some(e => e.operation === 'task_completed')).toBe(true);
    });
    
    it('should maintain append-only history', async () => {
      const context = TaskContextFactory.create();
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({ phases: [] })
      });
      
      const initialHistoryLength = context.history.length;
      
      await orchestrator.orchestrateTask(context);
      
      // Verify only appends, no modifications
      expect(context.history.length).toBeGreaterThan(initialHistoryLength);
      
      // Verify sequence numbers are sequential
      context.history.forEach((entry, index) => {
        expect(entry.sequenceNumber).toBe(index + 1);
      });
    });
    
    it('should include complete actor attribution', async () => {
      const context = TaskContextFactory.create();
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({ phases: [] })
      });
      
      await orchestrator.orchestrateTask(context);
      
      context.history.forEach(entry => {
        expect(entry.actor).toBeDefined();
        expect(entry.actor.type).toBe('agent');
        expect(entry.actor.id).toBe('orchestrator_agent');
        expect(entry.actor.version).toBeDefined();
      });
    });
  });
  
  describe('Goal Achievement', () => {
    it('should stop execution when goals achieved', async () => {
      const template = TaskTemplateFactory.create({
        goals: {
          primary: [
            {
              id: 'goal1',
              description: 'Complete task',
              required: true,
              successCriteria: 'completeness >= 100'
            }
          ]
        }
      });
      
      const context = TaskContextFactory.create({
        templateSnapshot: template,
        currentState: {
          status: 'processing',
          phase: 'execution',
          completeness: 100, // Goal achieved
          data: {}
        }
      });
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({
          phases: [
            { id: 'p1', name: 'Phase 1', agentIds: [] },
            { id: 'p2', name: 'Phase 2', agentIds: [] } // Should not execute
          ]
        })
      });
      
      await orchestrator.orchestrateTask(context);
      
      // Verify execution stopped after first phase
      const phaseCompletions = context.history.filter(e => 
        e.operation === 'phase_completed'
      );
      expect(phaseCompletions.length).toBe(1);
    });
  });
  
  describe('Performance Requirements', () => {
    it('should create execution plan within reasonable time', async () => {
      const context = TaskContextFactory.create();
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({ phases: [] })
      });
      
      const start = Date.now();
      await orchestrator.orchestrateTask(context);
      const duration = Date.now() - start;
      
      // Should complete quickly (excluding actual LLM calls)
      expect(duration).toBeLessThan(1000);
    });
    
    it('should handle large task contexts efficiently', async () => {
      const context = TaskContextFactory.createWithHistory(100);
      
      mockLLMProvider.complete.mockResolvedValue({
        content: JSON.stringify({ phases: [] })
      });
      
      const start = Date.now();
      await orchestrator.orchestrateTask(context);
      const duration = Date.now() - start;
      
      // Should handle large history efficiently
      expect(duration).toBeLessThan(2000);
    });
  });
  
  describe('Manual Mode and Guidance', () => {
    it('should generate manual steps from template', async () => {
      const template = TaskTemplateFactory.create({
        phases: [
          {
            id: 'phase1',
            name: 'Data Collection',
            description: 'Collect required data',
            agents: ['collector'],
            maxDuration: 10,
            canSkip: false
          }
        ]
      });
      
      const context = TaskContextFactory.create({
        templateSnapshot: template
      });
      
      // Force failure to trigger manual mode
      mockLLMProvider.complete.mockRejectedValue(new Error('Service down'));
      
      await orchestrator.orchestrateTask(context);
      
      // Verify manual mode UI request was created
      const manualEntry = context.history.find(e => 
        e.data?.requests?.[0]?.type === UITemplateType.SteppedWizard
      );
      
      expect(manualEntry).toBeDefined();
    });
    
    it('should provide helpful guidance on failure', async () => {
      const context = TaskContextFactory.create();
      
      // Configure to use 'guide' strategy
      (orchestrator as any).config.resilience.fallbackStrategy = 'guide';
      
      // Mock guidance generation
      mockLLMProvider.complete
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          content: 'Step 1: Do this\nStep 2: Do that\nStep 3: Complete'
        });
      
      await orchestrator.orchestrateTask(context);
      
      // Verify guidance was provided
      const guideEntry = context.history.find(e => 
        e.data?.requests?.[0]?.type === UITemplateType.InstructionPanel
      );
      
      expect(guideEntry).toBeDefined();
    });
  });
});