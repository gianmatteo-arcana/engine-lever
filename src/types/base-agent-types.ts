/**
 * BaseAgent Template Types
 * 
 * Type definitions for the consolidated BaseAgent class and its configuration system.
 * These types define the structure for:
 * - Context entries that track agent operations
 * - Agent configuration templates (base and specialized)
 * - Request/response formats for agent interactions
 */

// Standard Context Entry Schema - used by all agents
export interface ContextEntry {
  entryId: string; // Format: "entry_<timestamp>_<random>"
  sequenceNumber: number; // Previous + 1
  timestamp: string; // ISO format
  actor: {
    type: 'agent';
    id: string; // Agent ID
    version: string; // Agent version
  };
  operation: string; // Specific operation name
  data: any; // Operation results
  reasoning: string; // Detailed explanation
  confidence: number; // 0.0-1.0
  trigger: {
    type: 'orchestrator_request' | 'user_request' | 'system_event';
    source: string; // Requesting agent or system
    details: Record<string, any>; // Additional trigger details
    requestId?: string; // Optional request ID
  };
}

// Base Agent Template Structure
export interface BaseAgentTemplate {
  version: string;
  schema_version: string;
  universal_principles: {
    core_mandate: string;
    decision_priority: string;
    ethical_boundaries: string;
  };
  reasoning_framework: {
    analyze: { instruction: string; output: string };
    assess: { instruction: string; output: string };
    plan: { instruction: string; output: string };
    execute: { instruction: string; output: string };
    record: { instruction: string; output: string };
  };
  context_patterns: {
    read_pattern: string;
    write_pattern: string;
    context_entry_schema: string;
    agent_response_schema?: string;
    user_input_protocol?: string;
  };
  error_handling: {
    classification: {
      transient: { examples: string[]; response: string; max_retries: number };
      data_missing: { examples: string[]; response: string };
      authorization: { examples: string[]; response: string };
      permanent: { examples: string[]; response: string };
    };
    response_template: string;
  };
  tool_patterns: {
    discovery: string;
    invocation: string;
    result_handling: string;
  };
  communication: {
    with_orchestrator: {
      receive: string;
      respond: string;
    };
    with_other_agents: {
      protocol: string;
      delegation_format: string;
    };
    with_user: {
      principle: string;
      ui_request_format: string;
      ui_creation_guidelines: string;
    };
  };
  observability: {
    required_metrics: string[];
    logging_pattern: string;
  };
  data_acquisition_protocol?: {
    strategy?: string;
    description?: string;
    toolchain_consultation?: {
      priority?: string;
      instruction?: string;
    };
    ui_request_criteria?: {
      generate_only_when?: string;
    };
  };
}

// Specialized Agent Configuration
export interface SpecializedAgentConfig {
  agent: {
    id: string;
    name: string;
    version: string;
    role: string;
    mission: string;
    agent_card: {
      skills: string[];
      specializations?: string[];
      output_formats?: string[];
    };
    extends?: string; // Reference to base template
    a2a?: { // A2A Protocol configuration
      protocolVersion?: string;
      communicationMode?: string;
      messageFormats?: string[];
      routing?: {
        canReceiveFrom?: string[];
        canSendTo?: string[];
      };
      messageHandling?: {
        bufferSize?: number;
        timeoutMs?: number;
        retryEnabled?: boolean;
      };
    };
  };
  schemas: {
    output: any; // JSON schema for agent responses
  };
  operations?: Record<string, any>;
  tools?: string[] | Record<string, string[]>;
  examples?: Record<string, any>;
  tool_selection?: any;
  fallback_patterns?: Record<string, any>;
}

// Agent Response with Standard Schema Compliance
export interface BaseAgentResponse {
  status: 'completed' | 'needs_input' | 'delegated' | 'error';
  contextUpdate: ContextEntry;
  confidence: number; // Overall confidence (0.0-1.0)
  fallback_strategy?: string;
  uiRequests?: any[]; // UI requests batched for efficiency
  error?: {
    type: 'transient' | 'data_missing' | 'authorization' | 'permanent';
    message: string;
    technical_details: string;
    recovery_strategy: string;
    can_retry: boolean;
    user_action_required: boolean;
  };
  partial_result?: any;
}

// Agent Request Structure
export interface BaseAgentRequest {
  taskContext: any; // Current task context
  operation: string; // What to accomplish
  parameters: Record<string, any>; // Operation parameters
  constraints?: any; // Limitations or requirements
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  llmModel?: string; // Optional LLM model override
}