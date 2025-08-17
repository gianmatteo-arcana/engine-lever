/**
 * UnifiedEventBus Test Suite
 * 
 * Tests for Issue #54: Unified Event Bus with PostgreSQL Persistence
 * Verifies event publishing, persistence, and reconstruction functionality
 */

import { UnifiedEventBus } from '../../../src/UnifiedEventBus';
import { DatabaseService } from '../../../src/../database';
import { 
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  AgentExecutionEvent
} from '../../../src/../../types/a2a-types';

// Mock the database service
jest.mock('../../../src/../database');

// Mock the task events service  
jest.mock('../../../src/../task-events', () => ({
  emitTaskEvent: jest.fn().mockResolvedValue(undefined)
}));

describe('UnifiedEventBus', () => {
  let eventBus: UnifiedEventBus;
  let mockDbService: jest.Mocked<any>;
  const contextId = 'test-context-123';
  const taskId = 'test-task-456';

  beforeEach(() => {
    // Setup mock database service with new architecture
    mockDbService = {
      addContextEvent: jest.fn().mockResolvedValue({ 
        id: 'event-123', 
        sequence_number: 1 
      }),
      getContextHistory: jest.fn().mockResolvedValue([])
    };

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    
    // Create new event bus instance with userToken
    eventBus = new UnifiedEventBus(contextId, taskId, 'mock-user-token');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Event Publishing', () => {
    it('should publish and persist message events', async () => {
      const message: Message = {
        content: ['Test message content'],
        role: 'user'
      };

      const eventListener = jest.fn();
      eventBus.on('event', eventListener);

      await eventBus.publish(message);

      // Verify event was emitted
      expect(eventListener).toHaveBeenCalledWith(message);

      // Verify database persistence was called using established patterns
      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          actor_type: 'user',
          actor_id: 'user',
          operation: 'agent_message',
          data: {
            content: ['Test message content'],
            role: 'user'
          },
          reasoning: 'user message processed'
        })
      );
    });

    it('should publish and persist task events', async () => {
      const task: Task = {
        id: 'task-789',
        status: 'running',
        result: { data: 'test result' }
      };

      const eventListener = jest.fn();
      eventBus.on('event', eventListener);

      await eventBus.publish(task);

      // Verify event was emitted
      expect(eventListener).toHaveBeenCalledWith(task);

      // Verify database persistence with new architecture
      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          actor_type: 'agent',
          actor_id: 'agent-executor',
          operation: 'task_execution',
          data: {
            taskId: 'task-789',
            status: 'running',
            result: { data: 'test result' }
          },
          reasoning: 'Task running'
        })
      );
    });

    it('should publish and persist task status update events', async () => {
      const statusUpdate: TaskStatusUpdateEvent = {
        taskId: 'task-123',
        status: 'completed',
        final: true
      };

      await eventBus.publish(statusUpdate);

      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          actor_type: 'agent',
          actor_id: 'agent-executor',
          operation: 'status_update',
          data: {
            taskId: 'task-123',
            status: 'completed',
            final: true
          },
          reasoning: 'Task status updated to completed'
        })
      );
    });

    it('should publish and persist task artifact update events', async () => {
      const artifactUpdate: TaskArtifactUpdateEvent = {
        taskId: 'task-456',
        artifacts: [
          { type: 'document', url: 'http://example.com/doc.pdf' }
        ]
      };

      await eventBus.publish(artifactUpdate);

      expect(mockDbService.addContextEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          actor_type: 'agent',
          actor_id: 'agent-executor',
          operation: 'artifact_update',
          data: {
            taskId: 'task-456',
            artifacts: [
              { type: 'document', url: 'http://example.com/doc.pdf' }
            ]
          },
          reasoning: 'Task artifacts updated'
        })
      );
    });

    it('should increment sequence numbers for multiple events', async () => {
      const message1: Message = { content: ['First'], role: 'user' };
      const message2: Message = { content: ['Second'], role: 'assistant' };

      await eventBus.publish(message1);
      await eventBus.publish(message2);

      // Verify both events were persisted via addContextEvent
      expect(mockDbService.addContextEvent).toHaveBeenCalledTimes(2);
      
      // Verify first message
      expect(mockDbService.addContextEvent).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          operation: 'agent_message',
          data: expect.objectContaining({ content: ['First'] })
        })
      );
      
      // Verify second message  
      expect(mockDbService.addContextEvent).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          operation: 'agent_message',
          data: expect.objectContaining({ content: ['Second'] })
        })
      );
    });

    it('should handle database persistence errors', async () => {
      // Setup mock to throw error
      mockDbService.addContextEvent.mockRejectedValue(
        new Error('Database connection failed')
      );

      const message: Message = { content: ['Test'], role: 'user' };

      await expect(eventBus.publish(message))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('Event Subscription', () => {
    it('should support multiple event listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('event', listener1);
      eventBus.on('event', listener2);

      const message: Message = { content: ['Test'], role: 'user' };
      await eventBus.publish(message);

      expect(listener1).toHaveBeenCalledWith(message);
      expect(listener2).toHaveBeenCalledWith(message);
    });

    it('should support once listeners', async () => {
      const listener = jest.fn();
      eventBus.once('event', listener);

      const message1: Message = { content: ['First'], role: 'user' };
      const message2: Message = { content: ['Second'], role: 'user' };

      await eventBus.publish(message1);
      await eventBus.publish(message2);

      // Should only be called once
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(message1);
    });

    it('should support removing listeners', async () => {
      const listener = jest.fn();
      eventBus.on('event', listener);

      const message1: Message = { content: ['First'], role: 'user' };
      await eventBus.publish(message1);

      eventBus.off('event', listener);

      const message2: Message = { content: ['Second'], role: 'user' };
      await eventBus.publish(message2);

      // Should only be called for first message
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(message1);
    });

    it('should emit finished event and clean up listeners', () => {
      const eventListener = jest.fn();
      const finishedListener = jest.fn();

      eventBus.on('event', eventListener);
      eventBus.on('finished', finishedListener);

      eventBus.finished();

      expect(finishedListener).toHaveBeenCalled();

      // Verify all listeners were removed
      expect(eventBus.listenerCount('event')).toBe(0);
      expect(eventBus.listenerCount('finished')).toBe(0);
    });
  });

  describe('Historical Event Reconstruction', () => {
    it('should reconstruct events from database', async () => {
      const mockData = [
        {
          sequence_number: 1,
          operation: 'agent_message',
          data: { content: ['Hello'], role: 'user' },
          actor_type: 'user'
        },
        {
          sequence_number: 2,
          operation: 'task_execution',
          data: { taskId: 'task-1', status: 'running' },
          actor_type: 'agent'
        },
        {
          sequence_number: 3,
          operation: 'status_update',
          data: { taskId: 'task-1', status: 'completed', final: true },
          actor_type: 'agent'
        }
      ];

      // Setup mock to return data from getContextHistory
      mockDbService.getContextHistory.mockResolvedValue(mockData);

      const events = await eventBus.subscribeFromSequence(1);

      expect(events).toHaveLength(3);
      
      // Verify first event (Message)
      expect(events[0]).toEqual({
        content: ['Hello'],
        role: 'user'
      });

      // Verify second event (Task)
      expect(events[1]).toEqual({
        id: 'task-1',
        status: 'running'
      });

      // Verify third event (TaskStatusUpdate)
      expect(events[2]).toEqual({
        taskId: 'task-1',
        status: 'completed',
        final: true
      });
    });

    it('should handle database query errors gracefully', async () => {
      // Setup mock to throw error from getContextHistory
      mockDbService.getContextHistory.mockRejectedValue(new Error('Query failed'));

      const events = await eventBus.subscribeFromSequence(1);

      // Should return empty array on error
      expect(events).toEqual([]);
    });

    it('should return empty array when no sequence provided', async () => {
      const events = await eventBus.subscribeFromSequence();
      expect(events).toEqual([]);
    });

    it('should reconstruct artifact update events correctly', async () => {
      const mockData = [
        {
          sequence_number: 1,
          operation: 'artifact_update',
          data: {
            taskId: 'task-123',
            artifacts: [{ type: 'doc', url: 'http://example.com' }]
          },
          actor_type: 'agent'
        }
      ];

      mockDbService.getContextHistory.mockResolvedValue(mockData);

      const events = await eventBus.subscribeFromSequence(1);

      expect(events[0]).toEqual({
        taskId: 'task-123',
        artifacts: [{ type: 'doc', url: 'http://example.com' }]
      });
    });
  });

  describe('Factory Function', () => {
    it('should create UnifiedEventBus instances', () => {
      const { createUnifiedEventBus } = require('../UnifiedEventBus');
      const bus = createUnifiedEventBus('context-789', 'task-012', 'user-token');
      
      expect(bus).toBeInstanceOf(UnifiedEventBus);
    });
    
    it('should create UnifiedEventBus instances without userToken', () => {
      const { createUnifiedEventBus } = require('../UnifiedEventBus');
      const bus = createUnifiedEventBus('context-789', 'task-012');
      
      expect(bus).toBeInstanceOf(UnifiedEventBus);
    });
  });
});