/**
 * State Computer Service
 * PRD Lines 129-135: Current state computed from event history
 * PRD Line 45: Pure Event Sourcing - Current state derived by replaying history
 * 
 * ENGINE PRD PRINCIPLES:
 * 1. Pure Event Sourcing (PRD:45) - State is computed, never stored directly
 * 2. Append-Only (PRD:49) - History is immutable, state is derived
 * 3. Complete Traceability (PRD:16) - Can replay to any point in time
 * 
 * CRITICAL: This is THE KEY to the event sourcing architecture
 */

import { /* TaskContext, */ ContextEntry } from '../types/engine-types';

/**
 * Computed state structure - PRD Lines 130-135
 */
export interface ComputedState {
  status: string;       // From template's allowed statuses
  phase: string;        // Current execution phase  
  completeness: number; // 0-100 percentage
  data: Record<string, any>; // Accumulated data
}

/**
 * State Computer - The heart of event sourcing
 * Computes current state by replaying event history
 * 
 * PRD REQUIREMENT: State is NEVER stored, always computed
 * This ensures perfect consistency and enables time travel
 */
export class StateComputer {
  
  /**
   * Compute current state from event history
   * PRD Lines 129-135: Core state computation logic
   * 
   * This method is CRITICAL - it's how we derive truth from events
   * 
   * TODO [OPTIMIZATION]: Add memoization for repeated computations
   * TODO [POST-MVP]: Add state snapshots for performance (PRD:1675)
   */
  static computeState(history: ContextEntry[]): ComputedState {
    // Only log in development or when explicitly enabled  
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
      console.log(`[StateComputer] Computing state from ${history.length} events`);
    }
    
    // Initialize with default state
    let state: ComputedState = {
      status: 'created',
      phase: 'initialization',
      completeness: 0,
      data: {}
    };
    
    // Replay each event in sequence to build current state
    // PRD Line 45: "Current state is computed by replaying history"
    history.forEach((entry, index) => {
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
        console.log(`[StateComputer] Replaying event ${index + 1}: ${entry.operation}`);
      }
      state = this.applyEvent(state, entry);
    });
    
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
      console.log('[StateComputer] Final computed state:', state);
    }
    return state;
  }
  
  /**
   * Apply a single event to state
   * Pure function - returns new state without mutation
   * 
   * PRD PRINCIPLE: Append-Only (Line 49) - Never modify, only derive
   */
  private static applyEvent(
    currentState: ComputedState, 
    event: ContextEntry
  ): ComputedState {
    // Clone state to ensure immutability
    const newState = {
      ...currentState,
      data: { ...currentState.data }
    };
    
    // Apply event based on operation type
    switch (event.operation) {
      // Task lifecycle operations
      case 'task_created':
        newState.status = 'active';
        newState.phase = 'starting';
        newState.completeness = 0;
        break;
        
      case 'task_completed':
        newState.status = 'completed';
        newState.completeness = 100;
        break;
        
      case 'task_failed':
        newState.status = 'failed';
        if (event.data.error) {
          newState.data.error = event.data.error;
        }
        break;
        
      case 'task_paused':
        newState.status = 'paused';
        break;
        
      case 'task_resumed':
        newState.status = 'active';
        break;
        
      // Phase transitions
      case 'phase_started':
        newState.phase = event.data.phase || newState.phase;
        // Update completeness based on phase
        newState.completeness = this.calculatePhaseProgress(event.data.phase);
        break;
        
      case 'phase_completed':
        if (event.data.nextPhase) {
          newState.phase = event.data.nextPhase;
        }
        break;
        
      // Data collection operations
      case 'data_collected':
      case 'user_data_provided':
      case 'public_records_found':
        // Deep merge new data into state
        this.deepMerge(newState.data, event.data);
        newState.completeness = this.calculateDataCompleteness(newState.data);
        break;
        
      case 'business_search_initiated':
        newState.data.searchQuery = event.data.searchQuery;
        newState.data.email = event.data.email;
        newState.phase = 'discovery';
        newState.completeness = this.calculateDataCompleteness(newState.data);
        break;
        
      case 'business_found':
        // Deep merge new data into state
        this.deepMerge(newState.data, event.data);
        newState.phase = 'profile_collection';
        // Update completeness based on data
        newState.completeness = this.calculateDataCompleteness(newState.data);
        break;
        
      case 'profile_collected':
        // Deep merge new data into state
        this.deepMerge(newState.data, event.data);
        newState.phase = 'compliance_analysis';
        // Update completeness based on data
        newState.completeness = this.calculateDataCompleteness(newState.data);
        break;
        
      case 'requirements_identified':
        // Deep merge new data into state
        this.deepMerge(newState.data, event.data);
        newState.phase = 'completion';
        // Update completeness based on data
        newState.completeness = this.calculateDataCompleteness(newState.data);
        break;
        
      // UI operations
      case 'ui_request_generated':
        newState.data.pendingUIRequest = event.data.requests;
        break;
        
      case 'ui_response_received':
        // Remove pending request and merge response
        delete newState.data.pendingUIRequest;
        Object.assign(newState.data, event.data.response);
        break;
        
      // Agent operations
      case 'agent_assigned':
        if (!newState.data.activeAgents) {
          newState.data.activeAgents = [];
        }
        newState.data.activeAgents.push(event.actor.id);
        break;
        
      case 'agent_completed':
        if (newState.data.activeAgents) {
          newState.data.activeAgents = newState.data.activeAgents.filter(
            (id: string) => id !== event.actor.id
          );
        }
        break;
        
      // Planning operations
      case 'execution_plan_created':
        newState.data.executionPlan = event.data.plan;
        break;
        
      // Default: Just merge data
      default:
        Object.assign(newState.data, event.data);
    }
    
    // Record last update time
    newState.data.lastUpdated = event.timestamp;
    
    return newState;
  }
  
  /**
   * Calculate progress based on phase
   * This is template-specific logic that should be configurable
   * 
   * TODO [OPTIMIZATION]: Move to template configuration
   */
  private static calculatePhaseProgress(phase: string): number {
    const phaseProgress: Record<string, number> = {
      'initialization': 0,
      'starting': 5,
      'user_info': 25,
      'business_info': 50,
      'entity_verification': 75,
      'complete': 100
    };
    
    return phaseProgress[phase] || 0;
  }

  /**
   * Deep merge objects without overwriting existing nested objects
   */
  private static deepMerge(target: Record<string, any>, source: Record<string, any>): void {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          // If target doesn't have this key or it's not an object, create empty object
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = {};
          }
          // Recursively merge nested objects
          this.deepMerge(target[key], source[key]);
        } else {
          // For primitive values, arrays, or null, just assign
          target[key] = source[key];
        }
      }
    }
  }
  
  /**
   * Calculate completeness based on collected data
   * Checks required fields from template
   * 
   * TODO [OPTIMIZATION]: Cache template requirements
   */
  private static calculateDataCompleteness(data: Record<string, any>): number {
    // Required fields for onboarding (from template)
    const requiredFields = [
      'user.firstName',
      'user.lastName',
      'user.email',
      'business.name',
      'business.entityType'
    ];
    
    let completed = 0;
    requiredFields.forEach(field => {
      const value = this.getNestedValue(data, field);
      if (value !== null && value !== undefined && value !== '') {
        completed++;
      }
    });
    
    return Math.round((completed / requiredFields.length) * 100);
  }
  
  /**
   * Get nested value from object using dot notation
   * Helper for checking nested fields
   */
  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  /**
   * Compute state at a specific point in time
   * Enables time-travel debugging and audit trails
   * 
   * PRD BENEFIT: Complete traceability and debugging
   */
  static computeStateAtTime(
    history: ContextEntry[], 
    timestamp: string
  ): ComputedState {
    // Filter events up to the specified time
    const historyUpToTime = history.filter(
      entry => new Date(entry.timestamp) <= new Date(timestamp)
    );
    
    return this.computeState(historyUpToTime);
  }
  
  /**
   * Compute state at a specific sequence number
   * Useful for replaying to exact points
   */
  static computeStateAtSequence(
    history: ContextEntry[],
    sequenceNumber: number
  ): ComputedState {
    // Filter events up to sequence number
    const historyUpToSequence = history.filter(
      entry => entry.sequenceNumber <= sequenceNumber
    );
    
    return this.computeState(historyUpToSequence);
  }
  
  /**
   * Validate state transitions
   * Ensures state changes follow template rules
   * 
   * TODO [POST-MVP]: Add template-driven validation rules
   */
  static validateTransition(
    fromState: ComputedState,
    toState: ComputedState,
    template: any
  ): boolean {
    // Check if status transition is allowed
    if (template.states?.allowed) {
      if (!template.states.allowed.includes(toState.status)) {
        console.error(`[StateComputer] Invalid status: ${toState.status}`);
        return false;
      }
    }
    
    // Check if we can transition from terminal state
    if (template.states?.terminal?.includes(fromState.status)) {
      console.error(`[StateComputer] Cannot transition from terminal state: ${fromState.status}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Generate state diff between two points
   * Useful for understanding what changed
   */
  static generateStateDiff(
    beforeState: ComputedState,
    afterState: ComputedState
  ): Record<string, any> {
    const diff: Record<string, any> = {};
    
    // Check status change
    if (beforeState.status !== afterState.status) {
      diff.status = {
        before: beforeState.status,
        after: afterState.status
      };
    }
    
    // Check phase change
    if (beforeState.phase !== afterState.phase) {
      diff.phase = {
        before: beforeState.phase,
        after: afterState.phase
      };
    }
    
    // Check completeness change
    if (beforeState.completeness !== afterState.completeness) {
      diff.completeness = {
        before: beforeState.completeness,
        after: afterState.completeness,
        delta: afterState.completeness - beforeState.completeness
      };
    }
    
    // Check data changes (simplified)
    diff.dataChanges = this.getDataDiff(beforeState.data, afterState.data);
    
    return diff;
  }
  
  /**
   * Get differences in data objects
   */
  private static getDataDiff(before: any, after: any): any {
    const diff: any = {};
    
    // Check for new keys in after
    Object.keys(after).forEach(key => {
      if (!(key in before)) {
        diff[key] = { added: after[key] };
      } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        diff[key] = {
          before: before[key],
          after: after[key]
        };
      }
    });
    
    // Check for removed keys
    Object.keys(before).forEach(key => {
      if (!(key in after)) {
        diff[key] = { removed: before[key] };
      }
    });
    
    return diff;
  }
}

/**
 * TODO [POST-MVP] OPTIMIZATIONS (PRD:1673-1676):
 * - Implement state snapshots at intervals for faster computation
 * - Add Redis caching for frequently accessed states
 * - Implement parallel state computation for large histories
 * - Add state computation benchmarking
 * - Implement incremental state updates instead of full replay
 */

/**
 * TODO [FEATURE] ENHANCEMENTS:
 * - Add state prediction based on historical patterns
 * - Implement state branching for what-if scenarios
 * - Add state validation against business rules
 * - Implement state compression for storage efficiency
 */