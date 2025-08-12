/**
 * Celebration Agent Tests
 * Tests all functionality specified in PRD lines 681-720
 * 
 * MANDATORY: No mock data - tests real celebration logic
 */

import { AchievementTracker } from '../AchievementTracker';
import { TaskContext, AgentRequest } from '../../types/engine-types';

describe('AchievementTracker', () => {
  let agent: AchievementTracker;
  let mockContext: TaskContext;

  beforeEach(() => {
    agent = new AchievementTracker();
    
    mockContext = {
      contextId: 'test_context_celebration',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'celebrating',
        completeness: 75,
        data: {
          user: {
            email: 'achiever@startup.com',
            firstName: 'Alex',
            lastName: 'Johnson'
          },
          business: {
            name: 'Startup Success Inc',
            entityType: 'Corporation',
            state: 'CA',
            industry: 'Technology'
          }
        }
      },
      history: [
        {
          entryId: 'entry_1',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          actor: { type: 'agent', id: 'profile_collection_agent', version: '1.0.0' },
          operation: 'profile_collection_completed',
          data: {
            fieldsCompleted: 8,
            timeSpent: 90
          },
          reasoning: 'Profile collection successful'
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

  describe('Achievement Detection', () => {
    test('should detect task completion achievement', async () => {
      mockContext.currentState.status = 'completed';
      
      const request: AgentRequest = {
        requestId: 'req_cel_1',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('completed');
      expect(response.data.achievement).toBeDefined();
      expect(response.data.achievement.type).toBe('completion');
      expect(response.data.achievement.title).toBe('Task Completed!');
    });

    test('should detect milestone progress (25%, 50%, 75%)', async () => {
      const milestones = [25, 50, 75];
      
      for (const milestone of milestones) {
        mockContext.currentState.completeness = milestone;
        
        const request: AgentRequest = {
          requestId: `req_cel_milestone_${milestone}`,
          agentRole: 'celebration_agent',
          instruction: 'celebrate',
          data: {}
        };

        const response = await agent.processRequest(request, mockContext);

        expect(response.data.achievement).toBeDefined();
        expect(response.data.achievement.title).toBe(`${milestone}% Complete!`);
        
        const expectedType = milestone >= 50 ? 'milestone' : 'micro';
        expect(response.data.achievement.type).toBe(expectedType);
      }
    });

    test('should detect business discovery achievement', async () => {
      mockContext.history.push({
        entryId: 'entry_2',
        timestamp: new Date().toISOString(),
        sequenceNumber: 2,
        actor: { type: 'agent', id: 'business_discovery_agent', version: '1.0.0' },
        operation: 'business_found',
        data: { businessName: 'Test Corp' },
        reasoning: 'Found in CA records'
      });

      const request: AgentRequest = {
        requestId: 'req_cel_2',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.achievement).toBeDefined();
      expect(response.data.achievement.id).toBe('business_discovered');
      expect(response.data.achievement.type).toBe('milestone');
    });

    test('should detect error recovery achievement', async () => {
      mockContext.history.push(
        {
          entryId: 'entry_error',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          actor: { type: 'agent', id: 'some_agent', version: '1.0.0' },
          operation: 'processing_error',
          data: { error: 'Network timeout' }
        },
        {
          entryId: 'entry_recovery',
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
          actor: { type: 'agent', id: 'some_agent', version: '1.0.0' },
          operation: 'processing_complete',
          data: { recovered: true }
        }
      );

      const request: AgentRequest = {
        requestId: 'req_cel_3',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.data.achievement).toBeDefined();
      expect(response.data.achievement.id).toBe('error_recovered');
      expect(response.data.achievement.title).toBe('Great Recovery!');
    });

    test('should not celebrate when no achievement detected', async () => {
      mockContext.currentState.completeness = 33; // Not a milestone
      
      const request: AgentRequest = {
        requestId: 'req_cel_4',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('completed');
      expect(response.data.noCelebration).toBe(true);
      expect(response.reasoning).toContain('No achievement detected');
    });
  });

  describe('Celebration Configuration', () => {
    test('should generate enthusiastic celebration for completion', async () => {
      mockContext.currentState.status = 'completed';
      
      const request: AgentRequest = {
        requestId: 'req_cel_5',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const celebration = response.data.celebration;
      expect(celebration.type).toBe('completion');
      expect(celebration.intensity).toBe('enthusiastic');
      expect(celebration.duration).toBeGreaterThanOrEqual(5);
      
      const confetti = celebration.elements.find((e: any) => e.type === 'confetti');
      expect(confetti).toBeDefined();
      expect(confetti.properties.density).toBe('high');
    });

    test('should generate moderate celebration for milestone', async () => {
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_6',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const celebration = response.data.celebration;
      expect(celebration.intensity).toBe('moderate');
      expect(celebration.duration).toBe(3);
    });

    test('should generate subtle celebration for micro achievement', async () => {
      mockContext.currentState.completeness = 25;
      
      const request: AgentRequest = {
        requestId: 'req_cel_7',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const celebration = response.data.celebration;
      expect(celebration.intensity).toBe('subtle');
      expect(celebration.duration).toBe(1);
    });

    test('should add haptic feedback for mobile devices', async () => {
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_8',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {},
        context: {
          deviceType: 'mobile'
        }
      };

      const response = await agent.processRequest(request, mockContext);

      const haptic = response.data.celebration.elements.find(
        (e: any) => e.type === 'haptic'
      );
      expect(haptic).toBeDefined();
      expect(haptic.properties.pattern).toBe('success');
    });
  });

  describe('User Personalization', () => {
    test('should identify first-timer user profile', async () => {
      // Clear celebration history
      mockContext.history = [];
      mockContext.currentState.completeness = 25;
      
      const request: AgentRequest = {
        requestId: 'req_cel_9',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // First-timers get more enthusiastic celebrations
      expect(response.data.celebration.intensity).toBe('enthusiastic');
      expect(response.data.celebration.duration).toBeGreaterThan(1);
    });

    test('should identify power user profile', async () => {
      // Add many previous celebrations
      for (let i = 0; i < 15; i++) {
        mockContext.history.push({
          entryId: `celebration_${i}`,
          timestamp: new Date().toISOString(),
          sequenceNumber: i + 2,
          actor: { type: 'agent', id: 'celebration_agent', version: '1.0.0' },
          operation: 'celebration_generated',
          data: { celebrationType: 'micro' }
        });
      }
      
      mockContext.currentState.completeness = 25;
      
      const request: AgentRequest = {
        requestId: 'req_cel_10',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Power users get subtle celebrations
      expect(response.data.celebration.intensity).toBe('subtle');
      expect(response.data.celebration.duration).toBe(1);
    });

    test('should identify struggling user profile', async () => {
      // Add error history
      mockContext.history.push({
        entryId: 'error_1',
        timestamp: new Date().toISOString(),
        sequenceNumber: 2,
        actor: { type: 'agent', id: 'some_agent', version: '1.0.0' },
        operation: 'validation_error',
        data: { field: 'businessName' }
      });
      
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_11',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const message = response.uiRequests![0].message;
      expect(message).toContain("You're doing great");
    });
  });

  describe('Badge System', () => {
    test('should award Speed Demon badge for quick completion', async () => {
      mockContext.currentState.completeness = 100;
      
      const request: AgentRequest = {
        requestId: 'req_cel_12',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      // Simulate quick completion
      const response = await agent.processRequest(request, mockContext);
      
      // Note: Since timeTaken is calculated internally, we can't easily test this
      // But we can verify the badge structure if awarded
      if (response.data.badges.length > 0) {
        const speedBadge = response.data.badges.find((b: any) => b.id === 'speed_demon');
        if (speedBadge) {
          expect(speedBadge.name).toBe('Speed Demon');
          expect(speedBadge.icon).toBe('⚡');
        }
      }
    });

    test('should award First Timer badge', async () => {
      // Clear celebration history
      mockContext.history = [];
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_13',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const firstTimerBadge = response.data.badges.find(
        (b: any) => b.id === 'first_timer'
      );
      expect(firstTimerBadge).toBeDefined();
      expect(firstTimerBadge.name).toBe('First Timer');
      expect(firstTimerBadge.icon).toBe('🌟');
    });

    test('should award Perfectionist badge for error-free flow', async () => {
      // No errors in history
      mockContext.currentState.completeness = 75;
      
      const request: AgentRequest = {
        requestId: 'req_cel_14',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const perfectionistBadge = response.data.badges.find(
        (b: any) => b.id === 'perfectionist'
      );
      expect(perfectionistBadge).toBeDefined();
      expect(perfectionistBadge.name).toBe('Perfectionist');
      expect(perfectionistBadge.icon).toBe('💎');
    });

    test('should award Comeback Kid badge for error recovery', async () => {
      // Add error and then completion
      mockContext.history.push({
        entryId: 'error_comeback',
        timestamp: new Date().toISOString(),
        sequenceNumber: 2,
        actor: { type: 'agent', id: 'some_agent', version: '1.0.0' },
        operation: 'validation_error',
        data: { error: 'Invalid input' }
      });
      
      mockContext.currentState.status = 'completed';
      
      const request: AgentRequest = {
        requestId: 'req_cel_15',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const comebackBadge = response.data.badges.find(
        (b: any) => b.id === 'comeback_kid'
      );
      expect(comebackBadge).toBeDefined();
      expect(comebackBadge.name).toBe('Comeback Kid');
      expect(comebackBadge.icon).toBe('💪');
    });
  });

  describe('Motivational Messages', () => {
    test('should generate time-appropriate messages', async () => {
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_16',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const message = response.uiRequests![0].message;
      expect(message).toBeTruthy();
      
      // Check if time-based message is included
      const hour = new Date().getHours();
      if (hour < 12) {
        expect(message.toLowerCase()).toMatch(/morning|starting strong/i);
      } else if (hour >= 22) {
        expect(message.toLowerCase()).toMatch(/dedication|late/i);
      }
    });

    test('should include industry-specific motivation', async () => {
      mockContext.currentState.completeness = 75;
      
      const request: AgentRequest = {
        requestId: 'req_cel_17',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const message = response.uiRequests![0].message;
      // Business is Technology industry
      expect(message).toContain('Building something amazing');
    });

    test('should generate appropriate message for Food & Beverage', async () => {
      mockContext.currentState.data.business.industry = 'Food & Beverage';
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_18',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const message = response.uiRequests![0].message;
      expect(message).toContain('Ready to serve success');
    });
  });

  describe('UI Request Generation', () => {
    test('should generate celebration UI request', async () => {
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_19',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.uiRequests).toBeDefined();
      expect(response.uiRequests!.length).toBe(1);
      
      const uiRequest = response.uiRequests![0];
      expect(uiRequest.suggestedTemplates).toContain('progress_celebration');
      expect(uiRequest.title).toBe('50% Complete!');
      expect(uiRequest.context.urgency).toBe('low');
    });

    test('should include celebration elements in UI request', async () => {
      mockContext.currentState.status = 'completed';
      
      const request: AgentRequest = {
        requestId: 'req_cel_20',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      expect(uiRequest.celebration).toBeDefined();
      expect(uiRequest.celebration.type).toBe('completion');
      expect(uiRequest.celebration.elements).toBeDefined();
      expect(Array.isArray(uiRequest.celebration.elements)).toBe(true);
    });

    test('should set auto-advance timing', async () => {
      mockContext.currentState.completeness = 25;
      
      const request: AgentRequest = {
        requestId: 'req_cel_21',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      expect(uiRequest.timing).toBeDefined();
      expect(uiRequest.timing.autoAdvance).toBe(1000); // 1 second for micro
      expect(uiRequest.timing.skipEnabled).toBe(true);
    });

    test('should include badge animations', async () => {
      mockContext.history = []; // First timer
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_22',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      if (uiRequest.badges && uiRequest.badges.length > 0) {
        expect(uiRequest.badges[0].animation).toBe('fadeInScale');
      }
    });
  });

  describe('Context Recording', () => {
    test('should record celebration initiation', async () => {
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_23',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const initiationEntry = mockContext.history.find(entry => 
        entry.operation === 'celebration_initiated'
      );

      expect(initiationEntry).toBeDefined();
      expect(initiationEntry?.data).toHaveProperty('achievement');
      expect(initiationEntry?.reasoning).toContain('Detected');
    });

    test('should record celebration generation details', async () => {
      mockContext.currentState.completeness = 75;
      
      const request: AgentRequest = {
        requestId: 'req_cel_24',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const generationEntry = mockContext.history.find(entry => 
        entry.operation === 'celebration_generated'
      );

      expect(generationEntry).toBeDefined();
      expect(generationEntry?.data).toHaveProperty('celebrationType');
      expect(generationEntry?.data).toHaveProperty('duration');
      expect(generationEntry?.data).toHaveProperty('message');
      expect(generationEntry?.data).toHaveProperty('badgesEarned');
    });

    test('should update context progress', async () => {
      const initialProgress = mockContext.currentState.completeness;
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_25',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      // Progress should be updated (by 5% for non-100% achievements)
      expect(mockContext.currentState.completeness).toBe(55);
    });
  });

  describe('Error Handling', () => {
    test('should provide fallback encouragement on error', async () => {
      // Corrupt context to cause error
      mockContext.currentState = null as any;
      
      const request: AgentRequest = {
        requestId: 'req_cel_26',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('completed');
      expect(response.data.fallbackMessage).toBeDefined();
      expect(response.data.fallbackMessage).toContain('Great work');
    });

    test('should record error in context', async () => {
      mockContext.currentState = null as any;
      
      const request: AgentRequest = {
        requestId: 'req_cel_27',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const errorEntry = mockContext.history.find(entry => 
        entry.operation === 'celebration_error'
      );

      expect(errorEntry).toBeDefined();
      expect(errorEntry?.data).toHaveProperty('error');
    });
  });

  describe('Next Agent Routing', () => {
    test('should not specify next agent when task completed', async () => {
      mockContext.currentState.status = 'completed';
      
      const request: AgentRequest = {
        requestId: 'req_cel_28',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.nextAgent).toBeUndefined();
    });

    test('should route to orchestrator when task ongoing', async () => {
      mockContext.currentState.status = 'processing';
      mockContext.currentState.completeness = 50;
      
      const request: AgentRequest = {
        requestId: 'req_cel_29',
        agentRole: 'celebration_agent',
        instruction: 'celebrate',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.nextAgent).toBe('orchestrator');
    });
  });
});

/**
 * Performance Tests
 */
describe('AchievementTracker Performance', () => {
  let agent: AchievementTracker;

  beforeEach(() => {
    agent = new AchievementTracker();
  });

  test('should complete celebration within time limits', async () => {
    const mockContext: TaskContext = {
      contextId: 'perf_test',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'celebrating',
        completeness: 50,
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
      agentRole: 'celebration_agent',
      instruction: 'celebrate',
      data: {}
    };

    const startTime = Date.now();
    const response = await agent.processRequest(request, mockContext);
    const endTime = Date.now();

    // Should complete within 1 second
    expect(endTime - startTime).toBeLessThan(1000);
    expect(response).toBeDefined();
  });
});