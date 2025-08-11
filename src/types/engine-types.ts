/**
 * Engine Type Definitions
 * EXACTLY matches the PRD specifications
 */

/**
 * TaskContext - The Core Data Structure
 * PRD lines 119-169
 */
export interface TaskContext {
  // Immutable identity
  readonly contextId: string;          // UUID
  readonly taskTemplateId: string;     // References task template
  readonly tenantId: string;           // Business isolation
  readonly createdAt: string;          // ISO timestamp
  
  // Computed current state (derived from history)
  currentState: {
    status: string;       // From template's allowed statuses
    phase: string;        // Current execution phase
    completeness: number; // 0-100 percentage
    data: Record<string, any>; // Accumulated data
  };
  
  // The immutable event history - THIS IS THE KEY
  history: ContextEntry[];
  
  // Template snapshot (copied at creation)
  templateSnapshot: TaskTemplate;
}

/**
 * Context Entry - Immutable event in history
 * PRD lines 144-168
 */
export interface ContextEntry {
  // Immutable metadata
  readonly entryId: string;
  readonly timestamp: string;
  readonly sequenceNumber: number;
  
  // Actor information
  actor: {
    type: 'agent' | 'user' | 'system';
    id: string;
    version?: string;
  };
  
  // The actual change
  operation: string;              // What was done
  data: Record<string, any>;      // Data added/modified
  reasoning?: string;              // Why this was done
  
  // Traceability
  trigger?: {
    type: 'user_action' | 'agent_request' | 'system_event';
    source: string;
    details?: Record<string, any>;
  };
}

/**
 * Task Template Structure
 * PRD lines 586-699
 */
export interface TaskTemplate {
  id: string;
  version: string;
  
  metadata: {
    name: string;
    description: string;
    category: string;
    estimatedDuration?: number;
  };
  
  // Declarative goals - WHAT to achieve
  goals: {
    primary: Goal[];
    secondary?: Goal[];
  };
  
  // State machine
  states: {
    allowed: string[];
    initial: string;
    terminal: string[];
  };
  
  // Phases of execution
  phases: Phase[];
  
  // Data schema for validation
  data_schema: any; // JSON Schema
  
  // Success criteria
  success_criteria: {
    required: string[];
    optional?: string[];
  };
  
  // Constraints
  constraints?: {
    maxDuration?: number;
    maxUserInputRequests?: number;
    requiredAgents?: string[];
  };
}

export interface Goal {
  id: string;
  description: string;
  required: boolean;
}

export interface Phase {
  id: string;
  description: string;
  prerequisites: string[];
  next: string[];
}

/**
 * Agent Configuration (from YAML)
 * PRD lines 334-410
 */
export interface AgentConfig {
  agent: {
    id: string;
    version: string;
    name: string;
    mission: string;
    agent_card: {
      capabilities: string[];
      endpoints?: {
        execute: string;
        status: string;
      };
      constraints?: {
        max_execution_time?: number;
        retry_policy?: {
          max_retries: number;
          backoff_multiplier: number;
        };
      };
    };
  };
  schemas: {
    input: any;  // JSON Schema
    output: any; // JSON Schema
  };
}

/**
 * Agent Request/Response
 */
export interface AgentRequest {
  taskContext: TaskContext;
  operation: string;
  parameters: Record<string, any>;
  llmModel?: string;
}

export interface AgentResponse {
  status: 'complete' | 'needs_input' | 'failed';
  contextUpdate: ContextEntry;
  uiRequest?: UIRequest;
}

/**
 * UI Request Structure
 * PRD lines 1089-1136
 */
export interface UIRequest {
  agentRole: string;
  requestId: string;
  timestamp: string;
  
  // Pure semantic metadata - no UI instructions
  metadata: {
    purpose: string;
    urgency: 'immediate' | 'high' | 'normal' | 'low';
    category: string;
    allowSkip: boolean;
    skipConsequence?: string;
  };
  
  // Data requirements only
  dataNeeded: DataField[];
  
  // Quick actions (semantic, not visual)
  quickActions?: QuickAction[];
  
  // Context for the UI
  context: {
    taskPhase: string;
    completeness: number;
    reason: string;
  };
}

export interface DataField {
  field: string;
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  semanticType?: string; // 'business_name', 'tax_id', etc.
  required: boolean;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options?: any[];
  };
}

export interface QuickAction {
  id: string;
  label: string;
  semanticAction: string; // What it does, not how it looks
  payload?: any;
}

/**
 * Execution Plan (created by Orchestrator)
 * PRD lines 1038-1076
 */
export interface ExecutionPlan {
  taskId: string;
  templateId: string;
  phases: ExecutionPhase[];
  reasoning: string;
  userInputPoints: number;
  estimatedTotalDuration: number;
}

export interface ExecutionPhase {
  id: string;
  goal: string;
  agents: string[];
  strategy: 'sequential' | 'parallel';
  estimatedDuration: number;
  reasoning?: string;
  parameters?: Record<string, any>;
}

/**
 * Phase execution results
 */
export interface PhaseResult {
  status: 'complete' | 'needs_input' | 'failed';
  results?: any[];
  uiRequests?: UIRequest[];
  error?: string;
}