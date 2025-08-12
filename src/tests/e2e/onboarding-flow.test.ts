/**
 * End-to-End Onboarding Flow Test
 * 
 * Tests the complete user onboarding journey from initial request
 * through business discovery, profile collection, compliance analysis,
 * and final celebration.
 */

import { DatabaseService } from '../../services/database';
import { StateComputer } from '../../services/state-computer';
import { UIStrategyEngine } from '../../services/ui-strategy-engine';
import { BusinessDiscovery } from '../../agents/BusinessDiscovery';
import { ProfileCollector } from '../../agents/ProfileCollector';
import { ComplianceAnalyzer } from '../../agents/ComplianceAnalyzer';
import { AchievementTracker } from '../../agents/AchievementTracker';
import { FormOptimizer } from '../../agents/FormOptimizer';
import { 
  TaskContext, 
  AgentRequest, 
  AgentResponse,
  UIRequest,
  TaskTemplate
} from '../../types/engine-types';

// Mock Orchestrator since it doesn't exist yet
class Orchestrator {
  async createTask(request: any): Promise<string> {
    return 'task_' + Date.now();
  }
  
  async executeTask(taskId: string, context: TaskContext): Promise<any> {
    return {
      status: 'processing',
      phase: 'discovery'
    };
  }
}

// Mock external dependencies
jest.mock('../../services/database');
jest.mock('../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response',
        model: 'mock-model',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));

// Mock user interaction simulator
class UserInteractionSimulator {
  private responses: Map<string, any> = new Map();

  constructor() {
    // Pre-configure typical user responses
    this.responses.set('email', 'john@techstartup.io');
    this.responses.set('businessName', 'TechStartup Inc');
    this.responses.set('entityType', 'Corporation');
    this.responses.set('state', 'Delaware');
    this.responses.set('ein', '12-3456789');
    this.responses.set('industry', 'Technology');
    this.responses.set('employees', 15);
    this.responses.set('annualRevenue', 2500000);
  }

  async respondToUIRequest(uiRequest: UIRequest): Promise<any> {
    const response: any = {};
    
    // Simulate user filling out the requested fields
    for (const field of uiRequest.dataNeeded) {
      if (this.responses.has(field)) {
        response[field] = this.responses.get(field);
      } else {
        // Generate a default response for unknown fields
        response[field] = `User input for ${field}`;
      }
    }

    // Simulate interaction delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return response;
  }

  async provideApproval(): Promise<boolean> {
    // Simulate user approval
    await new Promise(resolve => setTimeout(resolve, 50));
    return true;
  }
}

describe('E2E Onboarding Flow', () => {
  let orchestrator: Orchestrator;
  let dbService: any;
  let userSimulator: UserInteractionSimulator;
  let taskContext: TaskContext;
  let taskTemplate: TaskTemplate;

  beforeEach(() => {
    // Initialize orchestrator and services
    orchestrator = new Orchestrator();
    userSimulator = new UserInteractionSimulator();
    
    // Setup mock database
    const mockUserClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis()
    };
    
    dbService = {
      getUserClient: jest.fn().mockReturnValue(mockUserClient),
      createContextHistoryEntry: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      upsertAgentContext: jest.fn().mockResolvedValue({}),
      createUIAugmentation: jest.fn().mockResolvedValue({ id: 'ui_123' }),
      createSystemAuditEntry: jest.fn().mockResolvedValue({}),
      getTaskAgentContexts: jest.fn().mockResolvedValue([]),
      updateTaskStatus: jest.fn().mockResolvedValue({})
    };
    
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(dbService);

    // Create onboarding task template
    taskTemplate = {
      id: 'user_onboarding',
      version: '2.0',
      metadata: {
        name: 'User Onboarding',
        description: 'Complete new user onboarding process',
        category: 'onboarding',
        priority: 'high',
        estimatedDuration: 600 // 10 minutes
      },
      goals: {
        primary: [
          { id: 'establish_identity', description: 'Verify user and business identity', required: true },
          { id: 'collect_profile', description: 'Gather business profile information', required: true },
          { id: 'analyze_compliance', description: 'Identify compliance requirements', required: true }
        ],
        secondary: [
          { id: 'optimize_experience', description: 'Provide optimized UX', required: false }
        ]
      }
      // Removed requiredFields and agentWorkflow since they're not in TaskTemplate type
    };

    // Initialize task context
    taskContext = {
      contextId: 'ctx_e2e_onboarding_' + Date.now(),
      taskTemplateId: taskTemplate.id,
      tenantId: 'tenant_test',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'initialization',
        completeness: 0,
        data: {}
      },
      history: [],
      templateSnapshot: taskTemplate
    };
  });

  describe('Complete Onboarding Journey', () => {
    it('should complete full onboarding from start to celebration', async () => {
      // Step 1: Initialize onboarding
      const initRequest = {
        taskTemplateId: 'user_onboarding',
        tenantId: 'tenant_test',
        initialData: {
          email: 'john@techstartup.io',
          source: 'web_signup'
        }
      };

      // Create task context
      const taskId = await orchestrator.createTask(initRequest);
      expect(taskId).toBeDefined();

      // Step 2: Start orchestration
      const orchestrationResult = await orchestrator.executeTask(taskId, taskContext);
      
      // Verify initial state
      expect(orchestrationResult.status).toBe('processing');
      expect(orchestrationResult.phase).toBe('discovery');

      // Step 3: Business Discovery Phase
      const businessDiscovery = new BusinessDiscovery();
      const discoveryRequest: AgentRequest = {
        requestId: 'req_discovery',
        agentRole: 'business_discovery',
        instruction: 'find_business',
        data: { email: 'john@techstartup.io' },
        context: {
          userProgress: 0,
          deviceType: 'desktop',
          urgency: 'medium'
        }
      };

      const discoveryResponse = await businessDiscovery.processRequest(discoveryRequest, taskContext);
      
      // Business discovery needs more info
      expect(discoveryResponse.status).toBe('needs_input');
      expect(discoveryResponse.nextAgent).toBe('profile_collector');

      // Step 4: Profile Collection Phase
      const profileCollector = new ProfileCollector();
      const profileRequest: AgentRequest = {
        requestId: 'req_profile',
        agentRole: 'profile_collector',
        instruction: 'collect_profile',
        data: discoveryResponse.data,
        context: {
          userProgress: 25,
          deviceType: 'desktop',
          urgency: 'medium'
        }
      };

      const profileResponse = await profileCollector.processRequest(profileRequest, taskContext);
      
      // Profile collector generates UI request
      expect(profileResponse.status).toBe('needs_input');
      expect(profileResponse.uiRequests).toBeDefined();
      expect(profileResponse.uiRequests!.length).toBeGreaterThan(0);

      // Step 5: Simulate user interaction
      const uiRequest = profileResponse.uiRequests![0];
      const userInput = await userSimulator.respondToUIRequest(uiRequest);
      
      // Update context with user input
      taskContext.currentState.data = {
        ...taskContext.currentState.data,
        ...userInput,
        businessProfile: {
          businessName: userInput.businessName,
          entityType: userInput.entityType,
          state: userInput.state,
          ein: userInput.ein,
          industry: userInput.industry
        }
      };
      taskContext.currentState.completeness = 50;

      // Step 6: Compliance Analysis Phase
      const complianceAnalyzer = new ComplianceAnalyzer();
      const complianceRequest: AgentRequest = {
        requestId: 'req_compliance',
        agentRole: 'compliance_analyzer',
        instruction: 'analyze_requirements',
        data: taskContext.currentState.data,
        context: {
          userProgress: 50,
          deviceType: 'desktop',
          urgency: 'medium'
        }
      };

      const complianceResponse = await complianceAnalyzer.processRequest(complianceRequest, taskContext);
      
      // Compliance analysis completes
      expect(complianceResponse.status).toBe('completed');
      expect(complianceResponse.data.requirements).toBeDefined();
      expect(complianceResponse.data.requirements.length).toBeGreaterThan(0);

      // Step 7: Form Optimization Phase
      const formOptimizer = new FormOptimizer();
      const optimizeRequest: AgentRequest = {
        requestId: 'req_optimize',
        agentRole: 'ux_optimization_agent',
        instruction: 'optimize_form',
        data: {
          ...taskContext.currentState.data,
          requirements: complianceResponse.data.requirements
        },
        context: {
          userProgress: 75,
          deviceType: 'desktop',
          urgency: 'medium'
        }
      };

      const optimizeResponse = await formOptimizer.processRequest(optimizeRequest, taskContext);
      
      // Form optimization provides UI improvements
      expect(optimizeResponse.status).toBe('completed');
      expect(optimizeResponse.data.improvements).toBeDefined();

      // Step 8: Mark task as complete
      taskContext.currentState.status = 'completed';
      taskContext.currentState.completeness = 100;

      // Step 9: Achievement and Celebration Phase
      const achievementTracker = new AchievementTracker();
      const achievementRequest: AgentRequest = {
        requestId: 'req_achievement',
        agentRole: 'achievement_tracker',
        instruction: 'check_achievements',
        data: {
          taskCompleted: true,
          taskType: 'onboarding',
          completionTime: 480 // 8 minutes
        },
        context: {
          userProgress: 100,
          deviceType: 'desktop',
          urgency: 'low'
        }
      };

      const achievementResponse = await achievementTracker.processRequest(achievementRequest, taskContext);
      
      // Verify celebration
      expect(achievementResponse.status).toBe('completed');
      expect(achievementResponse.data.achievement).toBeDefined();
      expect(achievementResponse.data.achievement.type).toBe('completion');
      expect(achievementResponse.data.celebration).toBeDefined();
      expect(achievementResponse.data.celebration.intensity).toBe('enthusiastic');

      // Step 10: Verify final state
      const finalState = StateComputer.computeState(taskContext.history);
      expect(finalState.status).toBe('completed');
      expect(finalState.completeness).toBe(100);
      
      // Verify audit trail
      expect(dbService.createContextHistoryEntry).toHaveBeenCalled();
      expect(dbService.upsertAgentContext).toHaveBeenCalled();
      
      // Verify all required goals met
      const primaryGoals = taskTemplate.goals.primary;
      for (const goal of primaryGoals) {
        expect(finalState.data).toHaveProperty(goal.id);
      }
    });

    it('should handle user abandonment gracefully', async () => {
      // Start onboarding
      const taskId = await orchestrator.createTask({
        taskTemplateId: 'user_onboarding',
        tenantId: 'tenant_test',
        initialData: { email: 'abandon@test.com' }
      });

      // Begin business discovery
      const businessDiscovery = new BusinessDiscovery();
      const discoveryRequest: AgentRequest = {
        requestId: 'req_abandon',
        agentRole: 'business_discovery',
        instruction: 'find_business',
        data: { email: 'abandon@test.com' }
      };

      const discoveryResponse = await businessDiscovery.processRequest(discoveryRequest, taskContext);
      expect(discoveryResponse.status).toBe('needs_input');

      // Simulate user abandonment (no response to UI request)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Task should remain in pending state
      expect(taskContext.currentState.status).toBe('pending');
      expect(taskContext.currentState.completeness).toBeLessThan(50);

      // System should be able to resume later
      const resumeRequest: AgentRequest = {
        requestId: 'req_resume',
        agentRole: 'profile_collector',
        instruction: 'collect_profile',
        data: { resuming: true }
      };

      const profileCollector = new ProfileCollector();
      const resumeResponse = await profileCollector.processRequest(resumeRequest, taskContext);
      
      expect(resumeResponse.status).toBe('needs_input');
      expect(resumeResponse.data.collectionStrategy).toBe('guided_collection');
    });

    it('should adapt UI strategy based on device and progress', async () => {
      const uiEngine = UIStrategyEngine.getInstance();
      
      // Test mobile device adaptation
      const mobileContext = {
        userProgress: 10,
        deviceType: 'mobile' as const,
        urgency: 'low' as const
      };

      const mobileStrategy = uiEngine.determineStrategy(mobileContext);
      expect(mobileStrategy.layoutStrategy).toBe('cards');
      expect(mobileStrategy.visualElements).toContain('swipe_indicators');

      // Test desktop near completion
      const desktopContext = {
        userProgress: 85,
        deviceType: 'desktop' as const,
        urgency: 'medium' as const
      };

      const desktopStrategy = uiEngine.determineStrategy(desktopContext);
      expect(desktopStrategy.layoutStrategy).toBe('all_at_once');
      expect(desktopStrategy.validationLevel).toBe('strict');

      // Test critical urgency
      const criticalContext = {
        userProgress: 50,
        deviceType: 'desktop' as const,
        urgency: 'critical' as const
      };

      const criticalStrategy = uiEngine.determineStrategy(criticalContext);
      expect(criticalStrategy.layoutStrategy).toBe('all_at_once');
      expect(criticalStrategy.assistanceLevel).toBe('minimal');
      expect(criticalStrategy.visualElements).toContain('deadline_timer');
    });

    it('should track performance metrics throughout flow', async () => {
      const startTime = Date.now();
      const metrics: any[] = [];

      // Mock performance tracking
      const trackMetric = (name: string, value: number) => {
        metrics.push({ name, value, timestamp: Date.now() });
      };

      // Execute each phase with timing
      const phases = [
        { name: 'discovery', duration: 150 },
        { name: 'profile_collection', duration: 200 },
        { name: 'compliance_analysis', duration: 100 },
        { name: 'form_optimization', duration: 50 },
        { name: 'celebration', duration: 30 }
      ];

      for (const phase of phases) {
        const phaseStart = Date.now();
        await new Promise(resolve => setTimeout(resolve, phase.duration));
        trackMetric(`${phase.name}_duration`, Date.now() - phaseStart);
      }

      const totalDuration = Date.now() - startTime;
      trackMetric('total_onboarding_duration', totalDuration);

      // Verify metrics collected
      expect(metrics.length).toBe(phases.length + 1);
      expect(metrics.find(m => m.name === 'total_onboarding_duration')).toBeDefined();
      
      // Total should be roughly sum of phases
      const phaseTotal = phases.reduce((sum, p) => sum + p.duration, 0);
      expect(totalDuration).toBeGreaterThanOrEqual(phaseTotal);
      expect(totalDuration).toBeLessThan(phaseTotal + 100); // Allow some overhead
    });

    it('should validate all required fields before completion', async () => {
      // Define required fields for validation
      const requiredFields = [
        { name: 'email', type: 'string', validation: { format: 'email' } },
        { name: 'businessName', type: 'string', validation: { minLength: 2 } },
        { name: 'entityType', type: 'string', validation: { enum: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship'] } },
        { name: 'state', type: 'string', validation: { pattern: '^[A-Z]{2}$' } }
      ];
      const providedData: any = {};

      // Try to complete without required fields
      for (const field of requiredFields) {
        const isValid = validateField(providedData, field);
        expect(isValid).toBe(false);
      }

      // Add valid data
      providedData.email = 'valid@email.com';
      providedData.businessName = 'Valid Business';
      providedData.entityType = 'LLC';
      providedData.state = 'CA';

      // Validate all fields now pass
      for (const field of requiredFields) {
        const isValid = validateField(providedData, field);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network failures during agent communication', async () => {
      // Simulate network error
      dbService.createContextHistoryEntry.mockRejectedValueOnce(new Error('Network timeout'));

      const businessDiscovery = new BusinessDiscovery();
      const request: AgentRequest = {
        requestId: 'req_network_fail',
        agentRole: 'business_discovery',
        instruction: 'find_business',
        data: { email: 'test@example.com' }
      };

      const response = await businessDiscovery.processRequest(request, taskContext);
      
      // Should handle gracefully
      expect(response).toBeDefined();
      expect(response.status).toBe('needs_input');
    });

    it('should handle invalid user input', async () => {
      const profileCollector = new ProfileCollector();
      const request: AgentRequest = {
        requestId: 'req_invalid',
        agentRole: 'profile_collector',
        instruction: 'collect_profile',
        data: {
          email: 'not-an-email', // Invalid email
          businessName: '', // Empty required field
          entityType: 'InvalidType' // Not in enum
        }
      };

      const response = await profileCollector.processRequest(request, taskContext);
      
      // Should request valid input
      expect(response.status).toBe('needs_input');
      expect(response.data.validationErrors).toBeDefined();
    });

    it('should handle concurrent agent requests', async () => {
      const agents = [
        new BusinessDiscovery(),
        new ProfileCollector(),
        new ComplianceAnalyzer()
      ];

      const requests = agents.map((agent, index) => ({
        agent,
        request: {
          requestId: `concurrent_${index}`,
          agentRole: agent.constructor.name.toLowerCase(),
          instruction: 'process',
          data: { test: true }
        } as AgentRequest
      }));

      // Execute concurrently
      const responses = await Promise.all(
        requests.map(({ agent, request }) => 
          agent.processRequest(request, taskContext)
        )
      );

      // All should complete without conflicts
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(response.status).toBeDefined();
      });
    });
  });

  describe('State Consistency', () => {
    it('should maintain state consistency across agent handoffs', async () => {
      const states: any[] = [];
      
      // Track state at each handoff
      const captureState = () => {
        states.push({
          ...taskContext.currentState,
          timestamp: Date.now()
        });
      };

      // Execute agent sequence
      const agentSequence = [
        { agent: new BusinessDiscovery(), role: 'business_discovery' },
        { agent: new ProfileCollector(), role: 'profile_collector' },
        { agent: new ComplianceAnalyzer(), role: 'compliance_analyzer' }
      ];

      for (const { agent, role } of agentSequence) {
        captureState();
        
        const request: AgentRequest = {
          requestId: `state_${role}`,
          agentRole: role,
          instruction: 'process',
          data: taskContext.currentState.data
        };

        await agent.processRequest(request, taskContext);
      }

      captureState();

      // Verify state progression
      expect(states.length).toBe(4);
      
      // Completeness should increase or stay same
      for (let i = 1; i < states.length; i++) {
        expect(states[i].completeness).toBeGreaterThanOrEqual(states[i - 1].completeness);
      }

      // Data should accumulate (not lose information)
      for (let i = 1; i < states.length; i++) {
        const prevKeys = Object.keys(states[i - 1].data);
        const currentKeys = Object.keys(states[i].data);
        
        // Previous keys should still exist
        prevKeys.forEach(key => {
          expect(currentKeys).toContain(key);
        });
      }
    });

    it('should be able to replay from any point in history', async () => {
      // Build up some history
      const history = [
        createHistoryEntry(1, 'task_created', {}),
        createHistoryEntry(2, 'business_found', { business: { name: 'Test Corp' } }),
        createHistoryEntry(3, 'profile_collected', { profile: { ein: '12-3456789' } }),
        createHistoryEntry(4, 'requirements_identified', { requirements: ['annual_report'] })
      ];

      // Replay from different points
      const state1 = StateComputer.computeStateAtSequence(history, 1);
      expect(state1.status).toBe('active');
      expect(state1.data.business).toBeUndefined();

      const state2 = StateComputer.computeStateAtSequence(history, 2);
      expect(state2.data.business).toBeDefined();
      expect(state2.data.profile).toBeUndefined();

      const state3 = StateComputer.computeStateAtSequence(history, 3);
      expect(state3.data.business).toBeDefined();
      expect(state3.data.profile).toBeDefined();

      const stateFinal = StateComputer.computeState(history);
      expect(stateFinal.data.requirements).toBeDefined();
    });
  });
});

// Helper functions
function validateField(data: any, field: any): boolean {
  const value = data[field.name];
  
  if (!value && field.validation?.required !== false) {
    return false;
  }

  if (field.validation) {
    if (field.validation.format === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    if (field.validation.minLength && value.length < field.validation.minLength) {
      return false;
    }
    if (field.validation.enum && !field.validation.enum.includes(value)) {
      return false;
    }
    if (field.validation.pattern && !new RegExp(field.validation.pattern).test(value)) {
      return false;
    }
  }

  return true;
}

function createHistoryEntry(sequence: number, operation: string, data: any) {
  return {
    entryId: `entry_${sequence}`,
    sequenceNumber: sequence,
    timestamp: new Date().toISOString(),
    actor: { type: 'agent' as const, id: 'test_agent', version: '1.0' },
    operation,
    data,
    reasoning: `Test ${operation}`
  };
}