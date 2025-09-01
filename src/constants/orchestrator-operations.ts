/**
 * Orchestrator Operations Enum
 * 
 * Strongly-typed constants for all orchestrator operations.
 * This ensures type safety and prevents typos in operation names.
 */

/**
 * Enum of all orchestrator operations that can be recorded as events
 * These correspond to the keys in OrchestratorPayloadSchemas
 */
export enum ORCHESTRATOR_OPS {
  // Planning operations
  EXECUTION_PLAN_CREATED = 'execution_plan_created',
  
  // Delegation operations
  SUBTASK_DELEGATED = 'subtask_delegated',
  PHASE_STARTED = 'phase_started',
  PHASE_COMPLETED = 'phase_completed',
  
  // Agent coordination operations
  AGENT_EXECUTION_PAUSED = 'AGENT_EXECUTION_PAUSED',
  AGENT_EXECUTION_RESUMED = 'agent_execution_resumed',
  
  // Completion operations
  ORCHESTRATION_COMPLETED = 'orchestration_completed',
  ORCHESTRATION_FAILED = 'orchestration_failed',
  
  // User interaction operations
  UI_RESPONSE_SUBMITTED = 'UI_RESPONSE_SUBMITTED',
  USER_INPUT_RECEIVED = 'user_input_received',
  
  // Status updates
  STATUS_UPDATED = 'status_updated',
  PROGRESS_UPDATED = 'progress_updated',
}

/**
 * Type guard to check if a string is a valid orchestrator operation
 */
export function isOrchestratorOp(operation: string): operation is ORCHESTRATOR_OPS {
  return Object.values(ORCHESTRATOR_OPS).includes(operation as ORCHESTRATOR_OPS);
}

/**
 * Helper to get operation name for logging
 */
export function getOpName(operation: ORCHESTRATOR_OPS): string {
  return operation.replace(/_/g, ' ').toLowerCase();
}