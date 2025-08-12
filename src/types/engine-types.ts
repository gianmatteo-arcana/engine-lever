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
  templateSnapshot: TaskTemplateSnapshot;
  metadata?: Record<string, any>;
}

/**
 * Current state of task execution
 */
export interface TaskState {
  status: 'pending' | 'gathering_user_info' | 'processing' | 'waiting_for_input' | 'completed' | 'failed';
  phase: string;
  completeness: number; // 0-100
  data: Record<string, any>;
  lastUpdated?: string;
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
  WaitingScreen = 'waiting_screen'
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
 * Execution plan for orchestration
 */
export interface ExecutionPlan {
  phases: ExecutionPhase[];
  metadata?: Record<string, any>;
}

/**
 * Execution phase definition
 */
export interface ExecutionPhase {
  name: string;
  agents: string[];
  parallel?: boolean;
  dependencies?: string[];
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