/**
 * Orchestrator Event Validation
 * 
 * Zod schemas for validating orchestrator event payloads
 */

import { z } from 'zod';
import { OrchestratorPayloadSchemas } from '../types/orchestrator-schemas';

// Schema for execution plan subtasks
const SubtaskSchema = z.object({
  name: z.string().min(1, 'Subtask name is required'),
  assigned_agent: z.string().min(1, 'Agent assignment is required'),
  required_capabilities: z.array(z.string()),
  dependencies: z.array(z.number()),
  rationale: z.string().min(1, 'Rationale is required')
});

// Validation schemas for each orchestrator operation
export const ORCHESTRATOR_SCHEMAS = {
  execution_plan_created: z.object({
    plan: z.object({
      subtasks: z.array(SubtaskSchema).min(1, 'At least one subtask is required'),
      coordination_strategy: z.string().min(1, 'Coordination strategy is required'),
      task_analysis: z.string().min(1, 'Task analysis is required')
    })
  }),
  
  subtask_delegated: z.object({
    agent_id: z.string().min(1, 'Agent ID is required'),
    subtask_name: z.string().min(1, 'Subtask name is required'),
    instructions: z.string().min(1, 'Instructions are required'),
    subtask_index: z.number().min(0, 'Subtask index must be non-negative')
  }),
  
  orchestration_completed: z.object({
    subtasks_completed: z.number().min(0),
    final_status: z.enum(['success', 'partial', 'failed']),
    summary: z.string().min(1, 'Summary is required')
  }),
  
  orchestration_failed: z.object({
    reason: z.string().min(1, 'Failure reason is required'),
    failed_at_subtask: z.number().optional(),
    recommendation: z.string().min(1, 'Recommendation is required')
  })
} as const;

// Type assertion to ensure our schemas match the TypeScript types
type SchemaValidation = {
  [K in keyof OrchestratorPayloadSchemas]: z.ZodType<OrchestratorPayloadSchemas[K]>
};
// This ensures compile-time checking that our schemas match the types
const _schemaCheck: SchemaValidation = ORCHESTRATOR_SCHEMAS;

/**
 * Validate orchestrator event data against its schema
 * @throws ZodError if validation fails
 */
export function validateOrchestratorPayload<T extends keyof typeof ORCHESTRATOR_SCHEMAS>(
  operation: T,
  data: unknown
): OrchestratorPayloadSchemas[T] {
  const schema = ORCHESTRATOR_SCHEMAS[operation];
  if (!schema) {
    throw new Error(`No validation schema for operation: ${operation}`);
  }
  return schema.parse(data) as OrchestratorPayloadSchemas[T];
}

/**
 * Safe validation that returns result instead of throwing
 */
export function safeValidateOrchestratorPayload<T extends keyof typeof ORCHESTRATOR_SCHEMAS>(
  operation: T,
  data: unknown
): { success: true; data: OrchestratorPayloadSchemas[T] } | { success: false; error: z.ZodError } {
  const schema = ORCHESTRATOR_SCHEMAS[operation];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{
        code: 'custom',
        message: `No validation schema for operation: ${operation}`,
        path: []
      }])
    };
  }
  
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as OrchestratorPayloadSchemas[T] };
  } else {
    return { success: false, error: result.error };
  }
}