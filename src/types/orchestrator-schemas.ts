/**
 * Orchestrator Event Payload Schemas
 * 
 * Defines strict schemas for events created by the OrchestratorAgent.
 * This ensures consistency and type safety across backend and frontend.
 */

export interface OrchestratorPayloadSchemas {
  /**
   * Event fired when orchestrator creates the execution plan
   * This happens once at the beginning of task processing
   */
  'execution_plan_created': {
    plan: {
      subtasks: Array<{
        name: string;                      // Human-readable subtask name
        assigned_agent: string;             // Agent ID from registry
        required_capabilities: string[];   // Capabilities needed
        dependencies: number[];             // Indices of dependent subtasks
        rationale: string;                  // Why this agent was chosen
      }>;
      coordination_strategy: string;       // How agents will work together
      task_analysis: string;                // Analysis of the task requirements
    };
  };
  
  /**
   * Event fired when a subtask is delegated to an agent
   */
  'subtask_delegated': {
    agent_id: string;                      // Agent receiving the work
    subtask_name: string;                  // Human-readable reference
    instructions: string;                  // Specific instructions for the agent
    subtask_index: number;                 // Position in the execution plan
  };
  
  /**
   * Event fired when orchestration is complete
   */
  'orchestration_completed': {
    subtasks_completed: number;            // How many subtasks were completed
    final_status: 'success' | 'partial' | 'failed';
    summary: string;                        // Summary of what was accomplished
  };
  
  /**
   * Event fired when orchestration fails
   */
  'orchestration_failed': {
    reason: string;                         // Why orchestration failed
    failed_at_subtask?: number;            // Which subtask failed (if applicable)
    recommendation: string;                 // Suggestion for retry
  };
}

// Type helper to get the data structure for a specific operation
export type OrchestratorEventData<T extends keyof OrchestratorPayloadSchemas> = 
  OrchestratorPayloadSchemas[T];

// Union type of all valid orchestrator operations
export type OrchestratorOperation = keyof OrchestratorPayloadSchemas;