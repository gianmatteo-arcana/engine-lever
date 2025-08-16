/**
 * BaseAgent Event Emission Test Suite
 * 
 * Tests for Issue #55: Enhanced BaseAgent with A2A AgentExecutor
 * Verifies that BaseAgent properly implements the AgentExecutor interface
 * and emits events through the UnifiedEventBus
 */

import { BaseAgent } from '../BaseAgent';
import { UnifiedEventBus } from '../../../services/event-bus';
import { 
  RequestContext,
  ExecutionEventBus,
  Message,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent
} from '../../../types/a2a-types';
import { logger } from '../../../utils/logger';

// Mock dependencies
jest.mock('../../../services/event-bus');
jest.mock('../../../utils/logger');

// Create a concrete test implementation of BaseAgent
class TestAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('test_agent.yaml', businessId, userId);
  }
}

describe('BaseAgent Event Emission', () => {
  let agent: TestAgent;
  let mockEventBus: jest.Mocked<ExecutionEventBus>;
  const businessId = 'test-business-123';
  const userId = 'test-user-456';
  const taskId = 'test-task-789';
  const contextId = 'test-context-012';

  beforeEach(() => {
    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      on: jest.fn().mockReturnThis(),
      off: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      removeAllListeners: jest.fn().mockReturnThis(),
      finished: jest.fn()
    };

    // Create agent instance
    agent = new TestAgent(businessId, userId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AgentExecutor.execute()', () => {
    it('should execute agent logic and publish events', async () => {
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Process this compliance task'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await agent.execute(requestContext, mockEventBus);

      // Verify task update was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          id: taskId,
          status: 'completed',
          result: expect.objectContaining({
            operation: 'execute',
            confidence: expect.any(Number)
          })
        })
      );

      // Verify status update was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId,
          status: 'completed',
          final: true
        } as TaskStatusUpdateEvent)
      );

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        'Agent execution started',
        expect.objectContaining({
          agentId: 'test_agent',
          taskId,
          contextId
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Agent execution completed',
        expect.objectContaining({
          agentId: 'test_agent',
          taskId,
          duration: expect.any(Number)
        })
      );
    });

    it('should handle UI requests as task artifacts', async () => {
      // Override llmProvider mock to return UI requests
      (agent as any).llmProvider.complete = jest.fn().mockResolvedValue({
        status: 'needs_input',
        contextUpdate: {
          operation: 'collect_data',
          data: { needed: 'user_input' },
          reasoning: 'Need user confirmation',
          confidence: 0.8
        },
        uiRequests: [
          {
            type: 'form',
            fields: ['name', 'email'],
            title: 'User Information'
          }
        ],
        confidence: 0.8
      });

      const requestContext: RequestContext = {
        userMessage: {
          content: ['Collect user data'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await agent.execute(requestContext, mockEventBus);

      // Verify UI requests were published as artifacts
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId,
          artifacts: [
            {
              type: 'form',
              fields: ['name', 'email'],
              title: 'User Information'
            }
          ]
        } as TaskArtifactUpdateEvent)
      );
    });

    it('should handle errors and publish failed status', async () => {
      // Override llmProvider to throw error
      (agent as any).llmProvider.complete = jest.fn()
        .mockRejectedValue(new Error('LLM service unavailable'));

      const requestContext: RequestContext = {
        userMessage: {
          content: ['Process task'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await expect(agent.execute(requestContext, mockEventBus))
        .rejects.toThrow('LLM service unavailable');

      // Verify error status was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId,
          status: 'failed',
          final: true
        } as TaskStatusUpdateEvent)
      );

      // Verify error logging
      expect(logger.error).toHaveBeenCalledWith(
        'Agent execution failed',
        expect.objectContaining({
          agentId: 'test_agent',
          taskId,
          error: 'LLM service unavailable'
        })
      );
    });

    it('should convert A2A request to BaseAgentRequest correctly', async () => {
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Line 1', 'Line 2', 'Line 3'],
          role: 'assistant'
        },
        task: {
          id: 'existing-task',
          status: 'running',
          result: { previous: 'data' }
        },
        taskId,
        contextId
      };

      // Spy on executeInternal to capture the converted request
      const executeInternalSpy = jest.spyOn(agent as any, 'executeInternal');

      await agent.execute(requestContext, mockEventBus);

      expect(executeInternalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'execute',
          parameters: {
            message: 'Line 1\nLine 2\nLine 3',
            role: 'assistant'
          },
          taskContext: {
            contextId,
            taskId,
            task: requestContext.task,
            businessProfile: { businessId }
          }
        })
      );
    });
  });

  describe('AgentExecutor.cancelTask()', () => {
    it('should publish cancellation event', async () => {
      await agent.cancelTask(taskId, mockEventBus);

      // Verify cancellation event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId,
          status: 'canceled',
          final: true
        } as TaskStatusUpdateEvent)
      );

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        'Cancelling task',
        expect.objectContaining({
          agentId: 'test_agent',
          taskId
        })
      );
    });

    it('should call cleanup method', async () => {
      // Spy on cleanupTask method
      const cleanupSpy = jest.spyOn(agent as any, 'cleanupTask');

      await agent.cancelTask(taskId, mockEventBus);

      expect(cleanupSpy).toHaveBeenCalledWith(taskId);
    });
  });

  describe('Event Emission Patterns', () => {
    it('should emit events in correct order', async () => {
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Process task'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await agent.execute(requestContext, mockEventBus);

      const publishCalls = mockEventBus.publish.mock.calls;

      // First call should be task update with result
      expect(publishCalls[0][0]).toMatchObject({
        id: taskId,
        status: 'completed',
        result: expect.any(Object)
      });

      // Second call should be status update
      expect(publishCalls[1][0]).toMatchObject({
        taskId,
        status: 'completed',
        final: true
      });
    });

    it('should include confidence scores in events', async () => {
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Analyze compliance'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await agent.execute(requestContext, mockEventBus);

      // Verify task update includes confidence
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          id: taskId,
          result: expect.objectContaining({
            confidence: expect.any(Number)
          })
        })
      );
    });

    it('should not emit completion status for needs_input', async () => {
      // Override to return needs_input status
      (agent as any).llmProvider.complete = jest.fn().mockResolvedValue({
        status: 'needs_input',
        contextUpdate: {
          operation: 'waiting',
          data: {},
          reasoning: 'Waiting for user input',
          confidence: 0.9
        },
        confidence: 0.9
      });

      const requestContext: RequestContext = {
        userMessage: {
          content: ['Process'],
          role: 'user'
        },
        taskId,
        contextId
      };

      await agent.execute(requestContext, mockEventBus);

      // Should publish task update but NOT completion status
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          id: taskId,
          status: 'running' // Not completed
        })
      );

      // Should NOT publish completion status
      expect(mockEventBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          final: true
        })
      );
    });
  });

  describe('Integration with UnifiedEventBus', () => {
    it('should work with real UnifiedEventBus instance', async () => {
      // Create real UnifiedEventBus instance (still mocked)
      const realEventBus = new (UnifiedEventBus as any)(contextId, taskId);
      
      const requestContext: RequestContext = {
        userMessage: {
          content: ['Test integration'],
          role: 'user'
        },
        taskId,
        contextId
      };

      // Should not throw
      await expect(agent.execute(requestContext, realEventBus))
        .resolves.not.toThrow();
    });
  });
});