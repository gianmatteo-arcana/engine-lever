/**
 * Database Schema Types
 * 
 * Types that match the database schema exactly.
 * These serve as the contract between backend services and database.
 */

// ============================================================================
// CORE DATABASE TASK INTERFACE
// ============================================================================

/**
 * Complete Task interface matching database schema
 * Based on migrations in frontend/supabase/migrations/
 */
export interface DatabaseTask {
  // Core fields
  id: string;
  user_id: string;
  title: string;
  description?: string;
  task_type: string;
  
  // Business context  
  business_id?: string;
  template_id?: string;
  
  // Status and priority (from enums)
  status: 'pending' | 'in_progress' | 'waiting_for_input' | 'completed' | 'failed' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  
  // Temporal fields
  deadline?: string; // ISO 8601 timestamp
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
  completed_at?: string; // ISO 8601 timestamp
  last_viewed_at?: string; // ISO 8601 timestamp
  
  // Data fields
  metadata: Record<string, any>; // JSONB field
  data?: Record<string, any>; // Additional data field from migrations
  
  // User annotations
  notes?: string;
}

/**
 * Task Creation Request (what frontend sends to backend)
 */
export interface CreateTaskRequest {
  title: string;
  description?: string;
  task_type: string;
  business_id?: string;
  template_id?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  deadline?: string;
  metadata?: Record<string, any>;
  initialData?: Record<string, any>;
}

/**
 * Task Update Request
 * Per PRD: Only status and certain metadata fields are mutable
 */
export interface UpdateTaskRequest {
  id: string;
  status?: DatabaseTask['status'];
  // Only specific metadata updates allowed
  metadata?: {
    lastViewedAt?: string;
    notes?: string;
  };
}

// ============================================================================
// TASK CONTEXT TYPES (Engine Integration)
// ============================================================================

/**
 * Task Context for Engine compliance
 * Matches the existing TaskContext interface
 */
export interface TaskContextData {
  contextId: string;
  taskId: string; // Links to DatabaseTask.id
  task: DatabaseTask; // Full task data
  currentState: TaskState;
  history: ContextEntry[];
  templateSnapshot?: TaskTemplateSnapshot;
  metadata?: Record<string, any>;
}

/**
 * Task State (from engine-types.ts)
 */
export interface TaskState {
  status: DatabaseTask['status'];
  phase: string;
  completeness: number; // 0-100
  data: Record<string, any>;
  lastUpdated?: string;
}

/**
 * Context Entry for event sourcing
 */
export interface ContextEntry {
  entryId: string;
  timestamp: string; // ISO 8601
  sequenceNumber: number;
  actor: {
    type: 'user' | 'agent' | 'system';
    id: string;
    version?: string;
  };
  operation: string;
  data: Record<string, any>;
  reasoning?: string;
  trigger?: {
    type: string;
    source: string;
    details: Record<string, any>;
  };
}

/**
 * Task Template Snapshot
 */
export interface TaskTemplateSnapshot {
  id: string;
  version: string;
  metadata: {
    name: string;
    description: string;
    category: string;
  };
  goals: {
    primary: TaskGoal[];
    secondary?: TaskGoal[];
  };
}

/**
 * Task Goal
 */
export interface TaskGoal {
  id: string;
  description: string;
  required: boolean;
  completed?: boolean;
  completedBy?: string;
  completedAt?: string;
  successCriteria?: string[];
  metadata?: Record<string, any>;
}

// ============================================================================
// VALIDATION AND GUARDS
// ============================================================================

/**
 * Type guard for DatabaseTask
 */
export function isDatabaseTask(obj: any): obj is DatabaseTask {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.task_type === 'string' &&
    typeof obj.created_at === 'string';
}


// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface TaskApiResponse {
  success: boolean;
  data?: DatabaseTask;
  error?: string;
  message?: string;
}

export interface TaskListApiResponse {
  success: boolean;
  data?: DatabaseTask[];
  error?: string;
  total?: number;
  page?: number;
  limit?: number;
}

export interface TaskCreateApiResponse {
  success: boolean;
  data?: {
    task: DatabaseTask;
    contextId?: string;
  };
  error?: string;
  message?: string;
}

// ============================================================================
// VALIDATION SCHEMAS (for runtime validation)
// ============================================================================

/**
 * Runtime validation for CreateTaskRequest
 */
export function validateCreateTaskRequest(obj: any): obj is CreateTaskRequest {
  return obj &&
    typeof obj.title === 'string' &&
    obj.title.length > 0 &&
    typeof obj.task_type === 'string' &&
    obj.task_type.length > 0 &&
    (!obj.priority || ['critical', 'high', 'medium', 'low'].includes(obj.priority));
}

/**
 * Runtime validation for UpdateTaskRequest
 * Enforces immutability rules per PRD
 */
export function validateUpdateTaskRequest(obj: any, logger?: any): obj is UpdateTaskRequest {
  if (!obj || typeof obj.id !== 'string' || obj.id.length === 0) {
    return false;
  }
  
  // Warn if trying to update immutable fields
  const immutableFields = ['title', 'description', 'task_type', 'business_id', 'template_id', 'priority', 'deadline'];
  const violations = immutableFields.filter(field => field in obj);
  
  if (violations.length > 0 && logger) {
    logger.warn('Attempted to update immutable task fields', {
      taskId: obj.id,
      violations,
      message: 'Per PRD, these fields are immutable after task creation'
    });
  }
  
  // Only allow status and specific metadata updates
  const allowedFields = ['id', 'status', 'metadata'];
  const providedFields = Object.keys(obj);
  const invalidFields = providedFields.filter(field => !allowedFields.includes(field));
  
  if (invalidFields.length > 0) {
    if (logger) {
      logger.error('Invalid task update fields provided', {
        taskId: obj.id,
        invalidFields,
        allowedFields
      });
    }
    return false;
  }
  
  return true;
}