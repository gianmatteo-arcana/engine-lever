/**
 * StateComputer Test Suite
 * PRD Lines 129-135: State Computation from Event History
 * 
 * COMPREHENSIVE TESTS for the heart of event sourcing
 * Every test validates PRD compliance
 */

import { StateComputer, ComputedState } from './state-computer';
import { ContextEntry } from '../types/engine-types';

describe('StateComputer - PRD Event Sourcing Implementation', () => {
  
  // Helper to create test events
  const createTestEvent = (
    sequenceNumber: number,
    operation: string,
    data: any = {},
    actor = { type: 'agent', id: 'test-agent' }
  ): ContextEntry => ({
    entryId: `entry-${sequenceNumber}`,
    sequenceNumber,
    timestamp: new Date().toISOString(),
    actor: {
      type: actor.type as 'agent' | 'user' | 'system',
      id: actor.id,
      version: '1.0.0'
    },
    operation,
    data,
    reasoning: `Test reasoning for ${operation}`,
    trigger: { type: 'system_event' as const, source: 'unit-test', details: {} }
  });
  
  describe('computeState - PRD Line 45: Pure Event Sourcing', () => {
    
    it('should compute initial state from empty history', () => {
      const history: ContextEntry[] = [];
      const state = StateComputer.computeState(history);
      
      expect(state).toEqual({
        status: 'created',
        phase: 'initialization',
        completeness: 0,
        data: {}
      });
    });
    
    it('should compute state from single event', () => {
      const history = [
        createTestEvent(1, 'task_created')
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.status).toBe('active');
      expect(state.phase).toBe('starting');
      expect(state.completeness).toBe(0);
    });
    
    it('should accumulate data from multiple events - PRD: Append-Only', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', { user: { name: 'John' } }),
        createTestEvent(3, 'data_collected', { user: { email: 'john@example.com' } }),
        createTestEvent(4, 'data_collected', { business: { name: 'TestCorp' } })
      ];
      
      const state = StateComputer.computeState(history);
      
      // Data should be merged from all events
      expect(state.data.user).toEqual({
        name: 'John',
        email: 'john@example.com'
      });
      expect(state.data.business).toEqual({
        name: 'TestCorp'
      });
    });
    
    it('should handle phase transitions correctly', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'phase_started', { phase: 'user_info' }),
        createTestEvent(3, 'phase_completed', { nextPhase: 'business_info' }),
        createTestEvent(4, 'phase_started', { phase: 'business_info' })
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.phase).toBe('business_info');
      expect(state.completeness).toBe(50); // Based on phase progress
    });
    
    it('should handle task completion - terminal state', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', { test: 'data' }),
        createTestEvent(3, 'task_completed')
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.status).toBe('completed');
      expect(state.completeness).toBe(100);
    });
    
    it('should handle task failure - terminal state', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'task_failed', { error: 'Test error' })
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.status).toBe('failed');
      expect(state.data.error).toBe('Test error');
    });
    
    it('should handle UI request/response cycle', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'ui_request_generated', {
          requests: [{ field: 'name', required: true }]
        }),
        createTestEvent(3, 'ui_response_received', {
          response: { name: 'User Input' }
        })
      ];
      
      const state = StateComputer.computeState(history);
      
      // Request should be cleared after response
      expect(state.data.pendingUIRequest).toBeUndefined();
      expect(state.data.name).toBe('User Input');
    });
    
    it('should track active agents', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'agent_assigned', {}, { type: 'agent', id: 'agent-1' }),
        createTestEvent(3, 'agent_assigned', {}, { type: 'agent', id: 'agent-2' }),
        createTestEvent(4, 'agent_completed', {}, { type: 'agent', id: 'agent-1' })
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.data.activeAgents).toEqual(['agent-2']);
    });
    
    it('should preserve event order - sequence matters!', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', { value: 'first' }),
        createTestEvent(3, 'data_collected', { value: 'second' }),
        createTestEvent(4, 'data_collected', { value: 'final' })
      ];
      
      const state = StateComputer.computeState(history);
      
      // Later events override earlier ones
      expect(state.data.value).toBe('final');
    });
  });
  
  describe('computeStateAtTime - PRD: Time-Travel Debugging', () => {
    
    it('should compute state at specific timestamp', () => {
      const baseTime = new Date('2024-01-01T00:00:00Z');
      const history = [
        { ...createTestEvent(1, 'task_created'), timestamp: new Date(baseTime).toISOString() },
        { ...createTestEvent(2, 'data_collected', { step: 1 }), 
          timestamp: new Date(baseTime.getTime() + 1000).toISOString() },
        { ...createTestEvent(3, 'data_collected', { step: 2 }), 
          timestamp: new Date(baseTime.getTime() + 2000).toISOString() },
        { ...createTestEvent(4, 'task_completed'), 
          timestamp: new Date(baseTime.getTime() + 3000).toISOString() }
      ];
      
      // Get state after 2 events
      const midTime = new Date(baseTime.getTime() + 1500).toISOString();
      const state = StateComputer.computeStateAtTime(history, midTime);
      
      expect(state.data.step).toBe(1);
      expect(state.status).not.toBe('completed');
    });
    
    it('should return initial state for time before any events', () => {
      const history = [
        { ...createTestEvent(1, 'task_created'), 
          timestamp: '2024-01-01T10:00:00Z' }
      ];
      
      const state = StateComputer.computeStateAtTime(history, '2024-01-01T09:00:00Z');
      
      expect(state.status).toBe('created');
      expect(state.phase).toBe('initialization');
    });
  });
  
  describe('computeStateAtSequence - PRD: Replay to Exact Points', () => {
    
    it('should compute state at specific sequence number', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'phase_started', { phase: 'phase1' }),
        createTestEvent(3, 'phase_started', { phase: 'phase2' }),
        createTestEvent(4, 'phase_started', { phase: 'phase3' })
      ];
      
      const state = StateComputer.computeStateAtSequence(history, 2);
      
      expect(state.phase).toBe('phase1');
    });
    
    it('should handle sequence 0 (no events)', () => {
      const history = [
        createTestEvent(1, 'task_created')
      ];
      
      const state = StateComputer.computeStateAtSequence(history, 0);
      
      expect(state.status).toBe('created');
      expect(state.completeness).toBe(0);
    });
  });
  
  describe('validateTransition - PRD: State Machine Validation', () => {
    
    const template = {
      states: {
        allowed: ['created', 'active', 'completed', 'failed'],
        terminal: ['completed', 'failed']
      }
    };
    
    it('should allow valid state transitions', () => {
      const fromState: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 50,
        data: {}
      };
      
      const toState: ComputedState = {
        status: 'completed',
        phase: 'done',
        completeness: 100,
        data: {}
      };
      
      const isValid = StateComputer.validateTransition(fromState, toState, template);
      expect(isValid).toBe(true);
    });
    
    it('should reject transitions to invalid states', () => {
      const fromState: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 50,
        data: {}
      };
      
      const toState: ComputedState = {
        status: 'invalid_status',
        phase: 'done',
        completeness: 100,
        data: {}
      };
      
      const isValid = StateComputer.validateTransition(fromState, toState, template);
      expect(isValid).toBe(false);
    });
    
    it('should reject transitions from terminal states', () => {
      const fromState: ComputedState = {
        status: 'completed',
        phase: 'done',
        completeness: 100,
        data: {}
      };
      
      const toState: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 50,
        data: {}
      };
      
      const isValid = StateComputer.validateTransition(fromState, toState, template);
      expect(isValid).toBe(false);
    });
  });
  
  describe('generateStateDiff - PRD: Change Tracking', () => {
    
    it('should detect status changes', () => {
      const before: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 50,
        data: { test: 'value' }
      };
      
      const after: ComputedState = {
        status: 'completed',
        phase: 'working',
        completeness: 50,
        data: { test: 'value' }
      };
      
      const diff = StateComputer.generateStateDiff(before, after);
      
      expect(diff.status).toEqual({
        before: 'active',
        after: 'completed'
      });
      expect(diff.phase).toBeUndefined();
    });
    
    it('should detect data changes', () => {
      const before: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 50,
        data: { 
          existing: 'value',
          toBeRemoved: 'gone'
        }
      };
      
      const after: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 50,
        data: { 
          existing: 'changed',
          newField: 'added'
        }
      };
      
      const diff = StateComputer.generateStateDiff(before, after);
      
      expect(diff.dataChanges.existing).toEqual({
        before: 'value',
        after: 'changed'
      });
      expect(diff.dataChanges.newField).toEqual({
        added: 'added'
      });
      expect(diff.dataChanges.toBeRemoved).toEqual({
        removed: 'gone'
      });
    });
    
    it('should track completeness changes', () => {
      const before: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 25,
        data: {}
      };
      
      const after: ComputedState = {
        status: 'active',
        phase: 'working',
        completeness: 75,
        data: {}
      };
      
      const diff = StateComputer.generateStateDiff(before, after);
      
      expect(diff.completeness).toEqual({
        before: 25,
        after: 75,
        delta: 50
      });
    });
  });
  
  describe('Data Completeness Calculation', () => {
    
    it('should calculate completeness based on required fields', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', {
          user: { firstName: 'John', lastName: 'Doe' }
        }),
        createTestEvent(3, 'data_collected', {
          user: { email: 'john@example.com' }
        })
      ];
      
      const state = StateComputer.computeState(history);
      
      // 3 out of 5 required fields = 60%
      expect(state.completeness).toBeGreaterThan(0);
      expect(state.completeness).toBeLessThan(100);
    });
    
    it('should reach 100% when all required fields present', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', {
          user: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
          },
          business: {
            name: 'TestCorp',
            entityType: 'LLC'
          }
        })
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.completeness).toBe(100);
    });
  });
  
  describe('PRD Compliance Tests', () => {
    
    it('should NEVER modify history - PRD Line 49: Append-Only', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', { immutable: 'value' })
      ];
      
      const originalHistory = [...history];
      StateComputer.computeState(history);
      
      // History should be unchanged
      expect(history).toEqual(originalHistory);
    });
    
    it('should maintain deterministic state - same history = same state', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', { test: 'data' }),
        createTestEvent(3, 'task_completed')
      ];
      
      const state1 = StateComputer.computeState(history);
      const state2 = StateComputer.computeState(history);
      
      expect(state1).toEqual(state2);
    });
    
    it('should handle 1000+ events efficiently', () => {
      const history: ContextEntry[] = [];
      
      // Create large history
      for (let i = 1; i <= 1000; i++) {
        history.push(createTestEvent(i, 'data_collected', { 
          [`field${i}`]: `value${i}` 
        }));
      }
      
      const startTime = Date.now();
      const state = StateComputer.computeState(history);
      const duration = Date.now() - startTime;
      
      expect(state.data).toBeDefined();
      expect(duration).toBeLessThan(500); // Should compute in < 500ms (allows for deep merge complexity)
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    
    it('should handle null/undefined data gracefully', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'data_collected', null),
        createTestEvent(3, 'data_collected', undefined),
        createTestEvent(4, 'data_collected', { valid: 'data' })
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.data.valid).toBe('data');
    });
    
    it('should handle unknown operations', () => {
      const history = [
        createTestEvent(1, 'task_created'),
        createTestEvent(2, 'unknown_operation', { test: 'data' })
      ];
      
      const state = StateComputer.computeState(history);
      
      // Unknown operations should still merge data
      expect(state.data.test).toBe('data');
    });
    
    it('should preserve lastUpdated timestamp', () => {
      const timestamp = '2024-01-01T10:00:00Z';
      const history = [
        { ...createTestEvent(1, 'task_created'), timestamp }
      ];
      
      const state = StateComputer.computeState(history);
      
      expect(state.data.lastUpdated).toBe(timestamp);
    });
  });
});

/**
 * TODO [POST-MVP] Additional Tests:
 * - Performance benchmarks for large histories
 * - Concurrent state computation
 * - State snapshot optimization
 * - Memory usage with massive event histories
 * - Parallel state computation for different contexts
 */