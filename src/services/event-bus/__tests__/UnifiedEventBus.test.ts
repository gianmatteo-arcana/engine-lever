/**
 * UnifiedEventBus Test Suite
 * 
 * Tests for Issue #54: Unified Event Bus with PostgreSQL Persistence
 * Verifies event publishing, persistence, and reconstruction functionality
 */

import { UnifiedEventBus } from '../UnifiedEventBus';
import { DatabaseService } from '../../database';
import { 
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  AgentExecutionEvent
} from '../../../types/a2a-types';

// Mock the database service
jest.mock('../../database');

describe('UnifiedEventBus', () => {
  let eventBus: UnifiedEventBus;
  let mockDbService: jest.Mocked<any>;
  const contextId = 'test-context-123';
  const taskId = 'test-task-456';

  beforeEach(() => {
    // Setup mock database service
    mockDbService = {
      getUserClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [],
                  error: null
                })
              })
            })
          })
        })
      })
    };

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    
    // Create new event bus instance
    eventBus = new UnifiedEventBus(contextId, taskId);
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

      // Verify database persistence was called
      const mockFrom = mockDbService.getUserClient('service-role').from;
      expect(mockFrom).toHaveBeenCalledWith('task_context_events');
      
      const mockInsert = mockFrom('task_context_events').insert;
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          context_id: contextId,
          task_id: taskId,
          sequence_number: 1,
          operation: 'message_received',
          data: {
            content: 'Test message content',
            role: 'user'
          },
          reasoning: 'User message received'
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

      // Verify database persistence
      const mockInsert = mockDbService.getUserClient('service-role')
        .from('task_context_events').insert;
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'task_created',
          data: {
            id: 'task-789',
            status: 'running',
            result: { data: 'test result' }
          }
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

      const mockInsert = mockDbService.getUserClient('service-role')
        .from('task_context_events').insert;
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'task_status_updated',
          data: {
            taskId: 'task-123',
            status: 'completed',
            final: true
          },
          reasoning: 'Task status changed to completed'
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

      const mockInsert = mockDbService.getUserClient('service-role')
        .from('task_context_events').insert;
      
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'task_artifact_updated',
          data: {
            taskId: 'task-456',
            artifacts: [
              { type: 'document', url: 'http://example.com/doc.pdf' }
            ]
          }
        })
      );
    });

    it('should increment sequence numbers for multiple events', async () => {
      const message1: Message = { content: ['First'], role: 'user' };
      const message2: Message = { content: ['Second'], role: 'assistant' };

      await eventBus.publish(message1);
      await eventBus.publish(message2);

      const mockInsert = mockDbService.getUserClient('service-role')
        .from('task_context_events').insert;
      
      // First call should have sequence_number: 1
      expect(mockInsert).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({ sequence_number: 1 })
      );
      
      // Second call should have sequence_number: 2
      expect(mockInsert).toHaveBeenNthCalledWith(2, 
        expect.objectContaining({ sequence_number: 2 })
      );
    });

    it('should handle database persistence errors', async () => {
      // Setup mock to return error
      mockDbService.getUserClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue({
            error: { message: 'Database error' }
          })
        })
      });

      const message: Message = { content: ['Test'], role: 'user' };

      await expect(eventBus.publish(message))
        .rejects.toThrow('Failed to persist event: Database error');
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
          operation: 'message_received',
          data: { content: 'Hello', role: 'user' }
        },
        {
          operation: 'task_created',
          data: { id: 'task-1', status: 'running' }
        },
        {
          operation: 'task_status_updated',
          data: { taskId: 'task-1', status: 'completed', final: true }
        }
      ];

      // Setup mock to return data
      mockDbService.getUserClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockData,
                  error: null
                })
              })
            })
          })
        })
      });

      const events = await eventBus.subscribeFromSequence(1);

      expect(events).toHaveLength(3);
      
      // Verify first event (Message)
      expect(events[0]).toEqual({
        content: 'Hello',
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
      // Setup mock to return error
      mockDbService.getUserClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Query failed' }
                })
              })
            })
          })
        })
      });

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
          operation: 'task_artifact_updated',
          data: {
            taskId: 'task-123',
            artifacts: [{ type: 'doc', url: 'http://example.com' }]
          }
        }
      ];

      mockDbService.getUserClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockData,
                  error: null
                })
              })
            })
          })
        })
      });

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
      const bus = createUnifiedEventBus('context-789', 'task-012');
      
      expect(bus).toBeInstanceOf(UnifiedEventBus);
    });
  });
});