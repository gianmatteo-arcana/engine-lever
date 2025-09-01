/**
 * Core Type Definitions for Universal Task Orchestration Engine
 * EXACTLY matches PRD specifications for type safety and consistency
 * 
 * These types define the contract between agents, the orchestration engine,
 * and the FluidUI system for dynamic interface generation.
 */

// ============================================================================
// TASK CONTEXT TYPES (PRD lines 145-220)
// ============================================================================

/**
 * Immutable event-sourced task context that maintains complete history
 * This is the "source of truth" for all task execution state
 */
export interface TaskContext {
  contextId: string;
  taskTemplateId: string;
  tenantId: string;
  createdAt: string; // ISO 8601
  currentState: TaskState;
  history: ContextEntry[];
  
  // Computed UIRequest status - null/empty when nothing is needed from user
  pendingUserInteractions?: UIRequestSummary[];
  
  templateSnapshot?: TaskTemplateSnapshot; // Optional - agents should use task data only
  metadata?: Record<string, any>;
}

/**
 * Current state of task execution
 * 
 * Status Semantics:
 * - pending: Task created but not started
 * - in_progress: Actively being processed by system
 * - waiting_for_input: Paused, requires user action to continue
 * - completed: Successfully finished all work
 * - failed: Unrecoverable error occurred
 * - cancelled: Explicitly stopped by user/system
 * 
 * @see docs/TASK_STATUS_GUIDE.md for detailed usage
 */
export interface TaskState {
  status: 'pending' | 'in_progress' | 'waiting_for_input' | 'completed' | 'failed' | 'cancelled';
  completeness: number; // 0-100
  data: Record<string, any>;
  lastUpdated?: string;
  // Additional fields from database schema
  task_type?: string;
  title?: string;
  description?: string;
}

/**
 * Event-sourced history entry for complete audit trail
 */
export interface ContextEntry {
  entryId: string;
  timestamp: string; // ISO 8601
  sequenceNumber: number;
  actor: Actor;
  operation: string;
  data: Record<string, any>;
  reasoning?: string;
  previousEntryId?: string;
  trigger?: {
    type: string;
    source: string;
    details: Record<string, any>;
  };
}

/**
 * Actor identification for audit trail
 */
export interface Actor {
  type: 'user' | 'agent' | 'system';
  id: string;
  version?: string;
  metadata?: Record<string, any>;
}

/**
 * Snapshot of task template at execution time
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
 * Task goal definition
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
// AGENT COMMUNICATION TYPES (PRD lines 221-280)
// ============================================================================

/**
 * Request sent to an agent for processing
 */
export interface AgentRequest {
  requestId?: string;
  agentRole?: string;
  instruction?: string;
  data?: Record<string, any>;
  context?: {
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    userProgress?: number;
    subtaskDescription?: string;
    expectedOutput?: string;
    successCriteria?: string;
  };
  taskContext?: TaskContext; // Optional for Agent base class
  operation?: string; // Optional for Agent base class
  parameters?: Record<string, any>; // Optional for Agent base class
  llmModel?: string; // Optional LLM model override
  timeout?: number; // milliseconds
  retryPolicy?: RetryPolicy;
}

/**
 * Response from agent processing
 */
export interface AgentResponse {
  status: 'completed' | 'needs_input' | 'delegated' | 'error';
  data: Record<string, any>;
  uiRequests?: UIRequest[];
  reasoning?: string;
  nextAgent?: string;
  confidence?: number;
  contextUpdate?: ContextEntry; // Optional context update for Agent base class
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Retry policy for agent requests
 */
export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential';
  initialDelay: number;
  maxDelay: number;
}

// ============================================================================
// FLUIDUI TYPES (PRD lines 881-914)
// ============================================================================

/**
 * UI Template Types for FluidUI system
 * Engine PRD Lines 900-914
 */
export enum UITemplateType {
  ActionPillGroup = 'action_pill_group',
  FoundYouCard = 'found_you_card',
  SmartTextInput = 'smart_text_input',
  ProgressIndicator = 'progress_indicator',
  DocumentUpload = 'document_upload',
  DataSummary = 'data_summary',
  SteppedWizard = 'stepped_wizard',
  ApprovalRequest = 'approval_request',
  ErrorDisplay = 'error_display',
  SuccessScreen = 'success_screen',
  InstructionPanel = 'instruction_panel',
  WaitingScreen = 'waiting_screen',
  ComplianceRoadmap = 'compliance_roadmap'
}

/**
 * Request for UI generation from agent
 * FluidUI interprets these to create dynamic interfaces
 */
export interface UIRequest {
  requestId: string;
  templateType: UITemplateType;
  semanticData: Record<string, any>;
  context?: {
    contextId?: string;
    userProgress?: number;
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    [key: string]: any;
  };
  actions?: FluidUIAction[];
  layoutHints?: LayoutHints;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Summary of UIRequest for computed TaskContext state
 * This represents the current status of a UIRequest without full event data
 */
export interface UIRequestSummary {
  requestId: string;
  agentId: string;
  templateType: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  status: 'pending' | 'responded';
  eventId: string; // Reference to the UI_REQUEST_CREATED event
}

/**
 * FluidUI component definition
 */
export interface FluidUIComponent {
  id: string;
  template: string;
  version: string;
  data: Record<string, any>;
  actions: Record<string, FluidUIAction>;
  validation?: ValidationRule[];
  layout?: LayoutHints;
}

/**
 * Action definition for FluidUI components
 */
export interface FluidUIAction {
  type: 'submit' | 'cancel' | 'skip' | 'help' | 'navigate' | 'custom';
  label: string;
  primary?: boolean;
  destructive?: boolean;
  handler: () => any;
  confirmation?: {
    title: string;
    message: string;
  };
}

/**
 * Validation rule for form fields
 */
export interface ValidationRule {
  field: string;
  type: 'required' | 'email' | 'phone' | 'url' | 'regex' | 'custom';
  message: string;
  pattern?: string;
  validator?: (value: any) => boolean;
}

/**
 * Layout hints for responsive design
 */
export interface LayoutHints {
  mobile?: {
    columns: number;
    stackOrder: string[];
  };
  desktop?: {
    columns: number;
    layout: 'grid' | 'flex' | 'stack';
  };
  spacing?: 'compact' | 'normal' | 'relaxed';
}

// ============================================================================
// AGENT CONFIGURATION TYPES
// ============================================================================

/**
 * Agent configuration loaded from YAML
 */
export interface AgentConfig {
  agent: {
    id: string;
    version: string;
    name: string;
    persona: string;
    capabilities: string[];
    mission?: string;
    agent_card?: string;
  };
  toolchain?: {
    required: string[];
    optional?: string[];
  };
  schemas?: {
    input?: any;
    output?: any;
  };
  successMetrics?: Record<string, string>;
  decisionRules?: string;
  promptTemplate?: string;
  [key: string]: any; // Allow additional properties from YAML
}

/**
 * Enhanced execution plan for intelligent orchestration
 * Supports detailed agent coordination and task decomposition
 */
export interface ExecutionPlan {
  id?: string; // Unique identifier for the execution plan
  phases: ExecutionPhase[];
  metadata?: Record<string, any>;
}

/**
 * Enhanced execution phase definition with detailed agent instructions
 * Supports the enhanced orchestration system's capabilities
 */
export interface ExecutionPhase {
  id?: string; // Unique identifier for the phase
  name: string;
  description?: string; // Detailed description of what this phase accomplishes
  agents: string[];
  parallel?: boolean;
  dependencies?: string[];
  operation?: string; // The operation type for this phase
  input?: Record<string, any>; // Input data and agent instructions for this phase
}

/**
 * Phase execution result
 */
export interface PhaseResult {
  phase: string | ExecutionPhase;
  status: 'completed' | 'failed' | 'partial' | 'needs_input';
  results: AgentResponse[];
  uiRequests?: UIRequest[];
  error?: any;
}

/**
 * Task template definition
 */
export interface TaskTemplate {
  id: string;
  version: string;
  metadata: {
    name: string;
    description: string;
    category: string;
    estimatedDuration?: number;
    priority?: string;
  };
  goals: {
    primary: TaskGoal[];
    secondary?: TaskGoal[];
  };
  phases?: Array<{
    id: string;
    name: string;
    description: string;
    agents: string[];
    maxDuration: number;
    canSkip: boolean;
  }>;
  requiredInputs?: {
    minimal: string[];
    recommended?: string[];
    optional?: string[];
  };
  completionCriteria?: string[];
  fallbackStrategies?: Array<{
    trigger: string;
    action: string;
    message: string;
  }>;
  
  // Legacy fields for compatibility
  name?: string;
  agents?: string[];
}

/**
 * Agent instance with configuration and state
 */
export interface AgentInstance {
  config: AgentConfig;
  status: 'ready' | 'busy' | 'error' | 'offline';
  currentRequest?: AgentRequest;
  errorCount: number;
  lastActive: string;
  metrics?: {
    requestsProcessed: number;
    averageResponseTime: number;
    successRate: number;
  };
}

// ============================================================================
// AGENT CONTEXT TYPES
// ============================================================================

/**
 * Agent-specific context stored in TaskContext metadata
 * Each agent can maintain its own state and findings within a task
 */
export interface AgentContext {
  state: Record<string, any>;
  requirements: string[];
  findings: Array<{
    type: string;
    data: any;
    timestamp: string;
  }>;
  nextActions: string[];
}

// ============================================================================
// ORCHESTRATION TYPES
// ============================================================================

/**
 * Orchestration plan for task execution
 */
export interface OrchestrationPlan {
  planId: string;
  taskId: string;
  stages: ExecutionStage[];
  dependencies: DependencyGraph;
  estimatedDuration: number; // milliseconds
  parallelizationStrategy: 'sequential' | 'parallel' | 'adaptive';
}

/**
 * Single stage in orchestration plan
 */
export interface ExecutionStage {
  stageId: string;
  name: string;
  agents: string[];
  parallel: boolean;
  timeout: number;
  requiredInputs: string[];
  expectedOutputs: string[];
  successCriteria: string[];
}

/**
 * Dependency graph for orchestration
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  type: 'agent' | 'data' | 'decision';
  required: boolean;
}

export interface DependencyEdge {
  from: string;
  to: string;
  condition?: string;
}

// ============================================================================
// BUSINESS DOMAIN TYPES
// ============================================================================

/**
 * Business entity information
 */
export interface BusinessEntity {
  id: string;
  name: string;
  entityType: 'LLC' | 'Corporation' | 'Partnership' | 'Sole Proprietorship';
  state: string;
  ein?: string;
  formationDate?: string;
  status: 'active' | 'inactive' | 'dissolved';
  industry?: string;
  website?: string;
  metadata?: Record<string, any>;
}

/**
 * User profile information
 */
export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  location?: string;
  phone?: string;
  googleId?: string;
  metadata?: Record<string, any>;
}

/**
 * Compliance requirement
 */
export interface ComplianceRequirement {
  id: string;
  name: string;
  description: string;
  category: 'filing' | 'license' | 'tax' | 'governance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline: string;
  frequency: 'once' | 'annual' | 'quarterly' | 'monthly';
  estimatedCost: number;
  consequences: string;
  forms?: string[];
  dependencies?: string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Standard error format for agent system
 */
export interface AgentError extends Error {
  code: string;
  agentId: string;
  requestId: string;
  recoverable: boolean;
  context?: Record<string, any>;
  suggestedAction?: string;
}

// ============================================================================
// EXPORT CONVENIENCE TYPES
// ============================================================================

export type AgentRole = 
  | 'orchestrator'
  | 'business_discovery_agent'
  | 'profile_collection_agent'
  | 'entity_compliance_agent'
  | 'ux_optimization_agent'
  | 'celebration_agent';

export type TaskStatus = TaskState['status'];

export type Priority = ComplianceRequirement['priority'];

export type EntityType = BusinessEntity['entityType'];

// ============================================================================
// AGENT-TO-ORCHESTRATOR COMMUNICATION SCHEMAS (MVP MESSAGE-PASSING)
// ============================================================================

/**
 * Structured request schema for agents to request additional assistance
 * from the orchestrator. This implements the MVP message-passing approach
 * where agents communicate what they need dynamically instead of relying
 * on pre-computed constraints and metadata.
 */
export interface OrchestratorRequest {
  // Request identification
  type: 'agent_capabilities' | 'tool_access' | 'user_interaction' | 'constraint_resolution' | 'resource_allocation';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reason: string; // Human-readable explanation of why this request is needed
  
  // Optional request data based on type
  capabilities?: Array<{
    agentId: string;
    required: boolean;
    reason?: string;
  }>;
  
  tools?: Array<{
    toolId: string;
    required: boolean;
    parameters?: Record<string, any>;
  }>;
  
  userInteraction?: {
    type: string;
    details: any;
    blocking: boolean;
  };
  
  constraints?: Array<{
    type: 'discovered_constraint' | 'performance_limit' | 'data_requirement' | 'external_dependency';
    description: string;
    impact: string;
    suggestedResolution?: string;
  }>;
  
  resources?: Array<{
    type: 'memory' | 'processing' | 'storage' | 'network';
    amount: string;
    duration?: string;
  }>;
  
  // Context for the request
  context?: {
    currentPhase?: string;
    dataProcessed?: number;
    timeElapsed?: string;
    previousAttempts?: number;
  };
}

/**
 * Orchestrator response to agent requests
 * Provides structured feedback on how the request will be handled
 */
export interface OrchestratorResponse {
  // Response status
  status: 'approved' | 'denied' | 'deferred' | 'modified' | 'escalated';
  requestId: string;
  
  // Response details
  message: string; // Human-readable explanation
  
  // What was actually provided (may differ from request if modified)
  provided?: {
    agents?: string[];
    tools?: string[];
    userInteractionScheduled?: boolean;
    constraintsAddressed?: string[];
    resourcesAllocated?: Array<{type: string, amount: string}>;
  };
  
  // Next steps for the requesting agent
  nextSteps?: Array<{
    action: string;
    expectedCompletion?: string;
    dependencies?: string[];
  }>;
  
  // If request was modified or denied
  alternatives?: Array<{
    option: string;
    description: string;
    tradeoffs?: string[];
  }>;
  
  // Escalation information if needed
  escalation?: {
    reason: string;
    escalatedTo: string;
    expectedResolution?: string;
  };
  
  // Response metadata
  responseTime: string; // ISO timestamp
  confidence: number; // 0.0-1.0
}

// ============================================================================
// DATABASE SCHEMA TYPES
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
// VALIDATION FUNCTIONS
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