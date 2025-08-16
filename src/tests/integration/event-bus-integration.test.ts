/**
 * Event Bus Integration Test
 * 
 * Integration test for Epic #49: A2A Event Bus
 * Demonstrates the full flow of agent execution with event emission
 * and PostgreSQL persistence through UnifiedEventBus
 */

import { BaseAgent } from '../../agents/base/BaseAgent';
import { UnifiedEventBus } from '../../services/event-bus';
import { DatabaseService } from '../../services/database';
import {
  RequestContext,
  AgentExecutionEvent,
  TaskStatusUpdateEvent
} from '../../types/a2a-types';
import { BaseAgentRequest, BaseAgentResponse } from '../../types/base-agent-types';

// Mock database service for integration test
jest.mock('../../services/database');

// Mock the task events service  
jest.mock('../../services/task-events', () => ({
  emitTaskEvent: jest.fn().mockResolvedValue(undefined)
}));

/**
 * Test Implementation of a Compliance Agent
 * Demonstrates real-world usage of the event bus system
 */
class ComplianceAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    // Using orchestrator.yaml as it exists and has proper structure
    super('orchestrator.yaml', businessId, userId);
  }

  /**
   * Override to provide custom compliance logic
   */
  async executeInternal(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    // Simulate compliance processing
    return {
      status: 'completed' as const,
      contextUpdate: {
        entryId: 'entry_' + Date.now(),
        sequenceNumber: 1,
        timestamp: new Date().toISOString(),
        actor: {
          type: 'agent' as const,
          id: 'compliance_agent',
          version: '1.0.0'
        },
        operation: 'compliance_check',
        data: {
          entityType: 'LLC',
          state: 'CA',
          complianceStatus: 'compliant',
          nextDeadline: '2025-12-31'
        },
        reasoning: 'Verified compliance status for CA LLC',
        confidence: 0.95,
        trigger: {
          type: 'orchestrator_request' as const,
          source: 'orchestrator',
          requestId: request.parameters?.requestId
        }
      },
      confidence: 0.95,
      uiRequests: [
        {
          type: 'notification',
          message: 'Compliance check completed successfully',
          severity: 'info'
        }
      ]
    };
  }
}

describe('Event Bus Integration', () => {
  let complianceAgent: ComplianceAgent;
  let eventBus: UnifiedEventBus;
  let mockDbService: jest.Mocked<any>;
  const businessId = 'test-business-456';
  const userId = 'test-user-789';
  const contextId = 'context-integration-test';
  const taskId = 'task-integration-test';

  beforeEach(() => {
    // Setup mock database with both old and new patterns for integration testing
    const persistedEvents: any[] = [];
    
    mockDbService = {
      // New pattern: addContextEvent and getContextHistory (used by UnifiedEventBus)
      addContextEvent: jest.fn().mockImplementation((event) => {
        const eventWithMeta = {
          ...event,
          id: 'event-' + Date.now(),
          sequence_number: persistedEvents.length + 1,
          created_at: new Date().toISOString()
        };
        persistedEvents.push(eventWithMeta);
        return Promise.resolve(eventWithMeta);
      }),
      
      getContextHistory: jest.fn().mockImplementation((userToken, contextId) => {
        return Promise.resolve(persistedEvents.filter(event => event.context_id === contextId));
      }),
      
      // Legacy pattern: getUserClient (for backward compatibility)
      getUserClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockImplementation((data) => {
            persistedEvents.push(data);
            return Promise.resolve({ error: null });
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: persistedEvents,
                  error: null
                })
              })
            })
          })
        })
      })
    };

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);

    // Create agent and event bus
    complianceAgent = new ComplianceAgent(businessId, userId);
    eventBus = new UnifiedEventBus(contextId, taskId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Agent Execution Flow', () => {
    it('should execute agent and persist all events to database', async () => {
      // Setup event collectors
      const collectedEvents: AgentExecutionEvent[] = [];
      let finalStatusReceived = false;

      eventBus.on('event', (event) => {
        collectedEvents.push(event);
        
        // Check for final status
        if ('status' in event && 'final' in event) {
          const statusEvent = event as TaskStatusUpdateEvent;
          if (statusEvent.final) {
            finalStatusReceived = true;
          }
        }
      });

      // Create request context
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Check compliance status for our CA LLC'],
          role: 'user'
        },
        taskId,
        contextId
      };

      // Execute agent with event bus
      await complianceAgent.execute(requestContext, eventBus);

      // Verify events were emitted
      expect(collectedEvents.length).toBeGreaterThan(0);
      expect(finalStatusReceived).toBe(true);

      // Verify database persistence was called using new patterns
      expect(mockDbService.addContextEvent).toHaveBeenCalled();
      
      // Verify at least one event was persisted
      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          actor_type: expect.any(String),
          operation: expect.any(String),
          data: expect.any(Object)
        })
      );

      // Verify the compliance result was persisted with proper structure
      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          operation: 'task_execution',
          data: expect.any(Object)
        })
      );
    });

    it('should persist events with incremental sequence numbers', async () => {
      const requestContext: RequestContext = {
        userMessage: {
          content: ['First request'],
          role: 'user'
        },
        taskId,
        contextId
      };

      // Execute multiple times
      await complianceAgent.execute(requestContext, eventBus);
      
      // Second execution with different message
      const secondContext: RequestContext = {
        ...requestContext,
        userMessage: {
          content: ['Second request'],
          role: 'user'
        }
      };
      
      // Create new event bus for second execution (simulating new task)
      const eventBus2 = new UnifiedEventBus(contextId, 'task-2');
      await complianceAgent.execute(secondContext, eventBus2);

      // Verify sequence numbers were incremented
      const mockInsert = mockDbService.getUserClient('service-role')
        .from('task_context_events').insert;
      
      const calls = mockInsert.mock.calls;
      const sequenceNumbers = calls.map((call: any[]) => call[0].sequence_number);
      
      // Verify sequence numbers are incrementing
      for (let i = 1; i < sequenceNumbers.length; i++) {
        if (calls[i][0].task_id === calls[i-1][0].task_id) {
          expect(sequenceNumbers[i]).toBeGreaterThan(sequenceNumbers[i-1]);
        }
      }
    });

    it('should handle agent errors and emit failure events', async () => {
      // Override to simulate error
      jest.spyOn(complianceAgent as any, 'executeInternal')
        .mockRejectedValue(new Error('Compliance check failed'));

      const errorEvents: AgentExecutionEvent[] = [];
      eventBus.on('event', (event) => {
        if ('status' in event && event.status === 'failed') {
          errorEvents.push(event);
        }
      });

      const requestContext: RequestContext = {
        userMessage: {
          content: ['Check compliance'],
          role: 'user'
        },
        taskId,
        contextId
      };

      // Execute and expect error
      await expect(complianceAgent.execute(requestContext, eventBus))
        .rejects.toThrow('Compliance check failed');

      // Verify failure event was emitted
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0]).toMatchObject({
        taskId,
        status: 'failed',
        final: true
      });

      // Verify failure was persisted using new patterns
      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'status_update',
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      );
    });

    it('should emit UI requests as task artifacts', async () => {
      const artifactEvents: AgentExecutionEvent[] = [];
      
      eventBus.on('event', (event) => {
        if ('artifacts' in event) {
          artifactEvents.push(event);
        }
      });

      const requestContext: RequestContext = {
        userMessage: {
          content: ['Check compliance with UI'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await complianceAgent.execute(requestContext, eventBus);

      // Verify UI artifacts were emitted
      expect(artifactEvents.length).toBe(1);
      expect(artifactEvents[0]).toMatchObject({
        taskId,
        artifacts: [
          {
            type: 'notification',
            message: 'Compliance check completed successfully',
            severity: 'info'
          }
        ]
      });
    });
  });

  describe('Event Reconstruction', () => {
    it('should reconstruct historical events from database', async () => {
      // First, execute to persist some events
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Initial compliance check'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await complianceAgent.execute(requestContext, eventBus);

      // Setup mock to return persisted events
      const mockEvents = [
        {
          operation: 'message_received',
          data: { content: 'Initial compliance check', role: 'user' }
        },
        {
          operation: 'task_created',
          data: { id: taskId, status: 'running' }
        },
        {
          operation: 'task_status_updated',
          data: { taskId, status: 'completed', final: true }
        }
      ];

      mockDbService.getUserClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockEvents,
                  error: null
                })
              })
            })
          })
        })
      });

      // Reconstruct events from sequence 1
      const reconstructed = await eventBus.subscribeFromSequence(1);

      expect(reconstructed.length).toBeGreaterThan(0);
      
      // The reconstructed events should include Task events published by the agent
      const taskEvents = reconstructed.filter(event => 'id' in event && 'status' in event && !('taskId' in event));
      expect(taskEvents.length).toBeGreaterThan(0);
      
      // Should also include TaskStatusUpdate events
      const statusEvents = reconstructed.filter(event => 'taskId' in event && 'status' in event);
      expect(statusEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Agent Coordination', () => {
    it('should support multiple agents using the same event bus', async () => {
      // Create a second agent
      class DataCollectionAgent extends BaseAgent {
        constructor(businessId: string) {
          super('orchestrator.yaml', businessId);
        }

        async executeInternal(request: BaseAgentRequest): Promise<BaseAgentResponse> {
          return {
            status: 'completed' as const,
            contextUpdate: {
              entryId: 'entry_' + Date.now(),
              sequenceNumber: 1,
              timestamp: new Date().toISOString(),
              actor: {
                type: 'agent' as const,
                id: 'data_collection_agent',
                version: '1.0.0'
              },
              operation: 'data_collected',
              data: { sources: ['quickbooks', 'database'] },
              reasoning: 'Collected data from multiple sources',
              confidence: 0.9,
              trigger: {
                type: 'orchestrator_request' as const,
                source: 'orchestrator',
                requestId: request.parameters?.requestId
              }
            },
            confidence: 0.9
          };
        }
      }

      const dataAgent = new DataCollectionAgent(businessId);
      
      // Both agents share the same event bus
      const sharedEventBus = new UnifiedEventBus(contextId, taskId);
      
      const allEvents: AgentExecutionEvent[] = [];
      sharedEventBus.on('event', (event) => {
        allEvents.push(event);
      });

      // Execute both agents
      const context1: RequestContext = {
        userMessage: { content: ['Collect data'], role: 'user' },
        taskId,
        contextId
      };

      const context2: RequestContext = {
        userMessage: { content: ['Check compliance'], role: 'user' },
        taskId,
        contextId
      };

      await dataAgent.execute(context1, sharedEventBus);
      await complianceAgent.execute(context2, sharedEventBus);

      // Verify both agents' events were captured
      const dataEvents = allEvents.filter((e: any) => 
        e.result?.operation === 'data_collected'
      );
      const complianceEvents = allEvents.filter((e: any) => 
        e.result?.operation === 'compliance_check'
      );

      expect(dataEvents.length).toBeGreaterThan(0);
      expect(complianceEvents.length).toBeGreaterThan(0);
    });
  });
});