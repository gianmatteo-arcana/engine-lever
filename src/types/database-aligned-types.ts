/**
 * Database-Aligned Types for Multi-Repository Synchronization
 * 
 * This file defines types that EXACTLY match the database schema created by migrations.
 * It serves as the authoritative source for both backend and frontend repositories.
 * 
 * CRITICAL: This file must be kept synchronized with:
 * 1. Database migration files in frontend repo
 * 2. Frontend TypeScript interfaces
 * 3. Backend service interfaces
 * 
 * When database schema changes, this file MUST be updated first.
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
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
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
 */
export interface UpdateTaskRequest {
  id: string;
  title?: string;
  description?: string;
  status?: DatabaseTask['status'];
  priority?: DatabaseTask['priority'];
  deadline?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// FRONTEND COMPATIBILITY TYPES
// ============================================================================

/**
 * Frontend-friendly Task interface (for components)
 * Transforms database types to UI-friendly formats
 */
export interface UITask {
  id: string;
  title: string;
  description?: string;
  type: string; // task_type renamed for UI
  status: DatabaseTask['status'];
  priority: DatabaseTask['priority'];
  deadline?: Date | null; // Converted from string
  createdAt: Date; // Converted from created_at string
  updatedAt: Date; // Converted from updated_at string
  completedAt?: Date | null; // Converted from string
  lastViewedAt?: Date | null; // Converted from string
  businessId?: string; // Renamed from business_id
  templateId?: string; // Renamed from template_id
  metadata: Record<string, any>;
  notes?: string;
}

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
// TYPE TRANSFORMATION UTILITIES
// ============================================================================

/**
 * Convert database task to UI task
 */
export function databaseTaskToUI(dbTask: DatabaseTask): UITask {
  return {
    id: dbTask.id,
    title: dbTask.title,
    description: dbTask.description,
    type: dbTask.task_type,
    status: dbTask.status,
    priority: dbTask.priority,
    deadline: dbTask.deadline ? new Date(dbTask.deadline) : null,
    createdAt: new Date(dbTask.created_at),
    updatedAt: new Date(dbTask.updated_at),
    completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : null,
    lastViewedAt: dbTask.last_viewed_at ? new Date(dbTask.last_viewed_at) : null,
    businessId: dbTask.business_id,
    templateId: dbTask.template_id,
    metadata: dbTask.metadata || {},
    notes: dbTask.notes,
  };
}

/**
 * Convert UI task to database update request
 */
export function uiTaskToDatabaseUpdate(uiTask: Partial<UITask>): UpdateTaskRequest {
  const update: UpdateTaskRequest = {
    id: uiTask.id!,
  };
  
  if (uiTask.title !== undefined) update.title = uiTask.title;
  if (uiTask.description !== undefined) update.description = uiTask.description;
  if (uiTask.status !== undefined) update.status = uiTask.status;
  if (uiTask.priority !== undefined) update.priority = uiTask.priority;
  if (uiTask.deadline !== undefined) {
    update.deadline = uiTask.deadline ? uiTask.deadline.toISOString() : undefined;
  }
  if (uiTask.notes !== undefined) update.notes = uiTask.notes;
  if (uiTask.metadata !== undefined) update.metadata = uiTask.metadata;
  
  return update;
}

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

/**
 * Type guard for UITask
 */
export function isUITask(obj: any): obj is UITask {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.type === 'string' &&
    obj.createdAt instanceof Date;
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
 */
export function validateUpdateTaskRequest(obj: any): obj is UpdateTaskRequest {
  return obj &&
    typeof obj.id === 'string' &&
    obj.id.length > 0;
}