# **SmallBizAlly Engine Architecture PRD**

## **The Universal Task Orchestration Engine**

**Version**: 1.0  
**Status**: Final Draft  
**Date**: Aug 10, 2025  
**Audience**: Development Team

---

## **Executive Summary**

SmallBizAlly's Engine is a **universal, data-driven task orchestration system** that operates on pure declarative principles. The engine knows nothing about business logic—it simply reads YAML configurations, orchestrates agent execution, and maintains an immutable event-sourced history of all actions.

Key principles:

* **Everything is configuration**: All behavior defined in YAML files that can be changed without redeploying  
* **Complete traceability**: Every action is recorded with actor, timestamp, and reasoning  
* **Progressive disclosure**: Minimize user interruption through intelligent orchestration  
* **Generic engine**: Zero business logic in code—truly universal architecture

This document incorporates all architectural decisions from our planning sessions and provides the complete blueprint for implementation.

---

## **Table of Contents**

1. Core Architecture  
2. Data Models  
3. Agent System  
4. Task Templates  
5. Orchestrator Design  
6. UI Generation  
7. External Integrations  
8. Testing Strategy  
9. Implementation Roadmap

---

## **Core Architecture**

### **Fundamental Design Principles**

1. **Pure Event Sourcing**: All state changes are immutable events. Current state is computed by replaying history.  
2. **Configuration-Driven**: All behavior defined in YAML files, hot-reloadable without service restart.  
3. **Agent-Based**: Every capability is an agent with a specific role, like a human team member.  
4. **LLM-Agnostic**: Abstract LLM providers behind a common interface.  
5. **Append-Only**: Never modify or delete data. Corrections are new events.  
6. **Progressive Disclosure**: Minimize user interruption, reorder requests intelligently.

### **System Components**

```
┌─────────────────────────────────────────────────┐
│                 User Interface                   │
│        (Interprets semantic data into UI)        │
├─────────────────────────────────────────────────┤
│                  API Gateway                     │
├─────────────────────────────────────────────────┤
│              Orchestrator Agent                  │
│         (LLM-powered task coordinator)           │
├─────────────────────────────────────────────────┤
│              Agent Message Bus                   │
│         (Simplified A2A for MVP)                 │
├─────────────────────────────────────────────────┤
│                 Agent Layer                      │
│   [Data Collection] [Legal] [Payment] [etc.]     │
├─────────────────────────────────────────────────┤
│                ToolChain Layer                   │
│    (External APIs, Validators, Utilities)        │
├─────────────────────────────────────────────────┤
│             Event Store (Database)               │
│         (Immutable TaskContext history)          │
└─────────────────────────────────────────────────┘
```

### **Technology Stack**

yaml

```
# /config/system/tech_stack.yaml
infrastructure:
  database: "PostgreSQL with JSONB"
  backend: "Node.js / TypeScript"
  frontend: "React / TypeScript"
  testing: "Jest + Playwright"
  
orchestration:
  llm_providers: 
    - "OpenAI GPT-4"
    - "Anthropic Claude"
  message_bus: "In-process for MVP"
  protocol: "A2A message formats"
  
external_services:
  authentication: "Google OAuth via Supabase"
  payments: "Stripe"
  government_apis: "California Business Connect"
  
monitoring:
  tool: "Dev Toolkit (internal)"
  metrics:
    - "agent_failures"
    - "llm_token_usage"
    - "user_abandonment"
```

---

## **Data Models**

### **TaskContext: The Core Data Structure**

TaskContext is the **single source of truth** for all task execution. It's an append-only event log with computed current state.

typescript

```ts
// Core TaskContext structure - completely generic
interface TaskContext {
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

interface ContextEntry {
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
```

### **Example TaskContext Instance**

json

```json
{
  "contextId": "ctx_123e4567-e89b-12d3-a456-426614174000",
  "taskTemplateId": "user_onboarding",
  "tenantId": "tenant_987654",
  "createdAt": "2024-12-01T10:00:00Z",
  
  "currentState": {
    "status": "active",
    "phase": "collecting_business_info",
    "completeness": 35,
    "data": {
      "user": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@techstartup.com"
      },
      "business": {
        "name": "TechStartup Inc"
      }
    }
  },
  
  "history": [
    {
      "entryId": "entry_001",
      "timestamp": "2024-12-01T10:00:00Z",
      "sequenceNumber": 1,
      "actor": {
        "type": "system",
        "id": "task_creator"
      },
      "operation": "task_created",
      "data": {
        "templateId": "user_onboarding",
        "trigger": "new_user_signup"
      },
      "reasoning": "User signed up via Google OAuth"
    },
    {
      "entryId": "entry_002",
      "timestamp": "2024-12-01T10:00:05Z",
      "sequenceNumber": 2,
      "actor": {
        "type": "agent",
        "id": "orchestrator",
        "version": "1.0.0"
      },
      "operation": "execution_plan_created",
      "data": {
        "plan": {
          "phases": ["gather_user_info", "collect_business_data", "verify_entity"],
          "estimatedDuration": 180
        }
      },
      "reasoning": "Standard onboarding flow for new business owner"
    },
    {
      "entryId": "entry_003",
      "timestamp": "2024-12-01T10:00:10Z",
      "sequenceNumber": 3,
      "actor": {
        "type": "agent",
        "id": "data_collection",
        "version": "1.0.0"
      },
      "operation": "data_collected",
      "data": {
        "source": "google_oauth",
        "fields": {
          "firstName": "John",
          "lastName": "Doe",
          "email": "john@techstartup.com"
        }
      },
      "reasoning": "Extracted from Google OAuth profile"
    }
  ],
  
  "templateSnapshot": {
    "// Full task template copied here at creation time"
  }
}
```

### **Database Schema**

sql

```sql
-- Pure event sourcing schema - no business logic
CREATE TABLE task_contexts (
    context_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    task_template_id TEXT NOT NULL,
    current_state JSONB NOT NULL,
    template_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    
    INDEX idx_tenant (tenant_id),
    INDEX idx_template (task_template_id),
    INDEX idx_status ((current_state->>'status'))
);

-- Append-only event history
CREATE TABLE context_history (
    entry_id UUID PRIMARY KEY,
    context_id UUID NOT NULL REFERENCES task_contexts(context_id),
    sequence_number INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_version TEXT,
    operation TEXT NOT NULL,
    data JSONB NOT NULL,
    reasoning TEXT,
    trigger JSONB,
    
    -- Ensure append-only
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Ensure sequence integrity
    UNIQUE(context_id, sequence_number),
    
    INDEX idx_context (context_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_actor (actor_type, actor_id)
);

-- Credential vault for external services
CREATE TABLE tenant_credentials (
    credential_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    service_name TEXT NOT NULL,
    encrypted_credentials JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    
    UNIQUE(tenant_id, service_name),
    INDEX idx_tenant_creds (tenant_id)
);
```

---

## **Agent System**

### **Agent Architecture**

Agents are **role-based workers** that execute specific aspects of tasks. Each agent:

* Has a defined role and capabilities  
* Operates on TaskContext  
* Records all actions with reasoning  
* Can request user input via the Orchestrator

### **Agent Configuration**

yaml

```
# /config/agents/data_collection_agent.yaml
agent:
  id: "data_collection_agent"
  version: "1.0.0"
  name: "Business Data Collection Specialist"
  
  # A2A AgentCard format
  agent_card:
    capabilities:
      - "gather_business_data"
      - "validate_information"
      - "search_public_records"
      - "generate_data_requests"
    
    endpoints:
      execute: "/agents/data_collection/execute"
      status: "/agents/data_collection/status"
    
    constraints:
      max_execution_time: 30000  # 30 seconds
      retry_policy:
        max_retries: 3
        backoff_multiplier: 2
  
  # Agent's mission (used in LLM prompt)
  mission: |
    You are a Business Data Collection Specialist. Your role is to:
    1. Gather business information from various sources
    2. Validate data accuracy and completeness
    3. Search public records when available
    4. Request user input only when necessary
    
    Core principles:
    - Exhaust autonomous sources before requesting user input
    - Always record your reasoning in context updates
    - Validate data against known patterns
    - Respect data privacy and security
    
    You operate on TaskContext objects and contribute incremental updates.
    Never overwrite existing data, only append new information.
  
  # Expected input/output schemas
  schemas:
    input:
      type: "object"
      required: ["taskContext", "operation", "parameters"]
      properties:
        taskContext:
          $ref: "#/definitions/TaskContext"
        operation:
          type: "string"
          enum: ["gather", "validate", "search", "request_input"]
        parameters:
          type: "object"
    
    output:
      type: "object"
      required: ["status", "contextUpdate"]
      properties:
        status:
          type: "string"
          enum: ["complete", "needs_input", "failed"]
        contextUpdate:
          type: "object"
          properties:
            operation:
              type: "string"
            data:
              type: "object"
            reasoning:
              type: "string"
        uiRequest:
          $ref: "#/definitions/UIRequest"
```

### **Agent Implementation**

typescript

```ts
// Base agent class - all agents extend this
abstract class BaseAgent {
  protected config: AgentConfig;
  protected llmProvider: LLMProvider;
  protected toolChain: ToolChain;
  
  constructor(configPath: string) {
    this.config = this.loadConfig(configPath);
    this.llmProvider = new LLMProvider();
    this.toolChain = new ToolChain();
  }
  
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Build LLM prompt from config and request
    const prompt = this.buildPrompt(request);
    
    // Call LLM with appropriate model
    const llmResponse = await this.llmProvider.complete({
      model: request.llmModel || 'gpt-4',
      prompt,
      responseFormat: 'json',
      schema: this.config.schemas.output
    });
    
    // Validate response
    const validated = this.validateResponse(llmResponse);
    
    // Create context update
    const contextUpdate: ContextEntry = {
      entryId: generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: request.taskContext.history.length + 1,
      actor: {
        type: 'agent',
        id: this.config.id,
        version: this.config.version
      },
      operation: validated.contextUpdate.operation,
      data: validated.contextUpdate.data,
      reasoning: validated.contextUpdate.reasoning,
      trigger: {
        type: 'agent_request',
        source: 'orchestrator',
        details: { operation: request.operation }
      }
    };
    
    return {
      status: validated.status,
      contextUpdate,
      uiRequest: validated.uiRequest
    };
  }
  
  protected buildPrompt(request: AgentRequest): string {
    return `
${this.config.mission}

## Current Task Context
${JSON.stringify(request.taskContext, null, 2)}

## Your Operation
${request.operation}

## Parameters
${JSON.stringify(request.parameters, null, 2)}

## Available Tools
${this.toolChain.getAvailableTools()}

## Response Format
You must respond with JSON matching this schema:
${JSON.stringify(this.config.schemas.output, null, 2)}

Remember:
- Record your reasoning
- Only append new data
- Request user input as last resort
`;
  }
}
```

### **Example Agent Execution**

typescript

```ts
// Data Collection Agent gathering business info
class DataCollectionAgent extends BaseAgent {
  async gatherBusinessInfo(context: TaskContext): Promise<AgentResponse> {
    // Try public records first
    const businessName = context.currentState.data.business?.name;
    if (businessName) {
      const publicData = await this.toolChain.searchPublicRecords(businessName);
      
      if (publicData) {
        return {
          status: 'complete',
          contextUpdate: {
            entryId: generateId(),
            timestamp: new Date().toISOString(),
            sequenceNumber: context.history.length + 1,
            actor: {
              type: 'agent',
              id: 'data_collection_agent',
              version: '1.0.0'
            },
            operation: 'public_records_found',
            data: {
              source: 'ca_sos',
              business: {
                entityType: publicData.entityType,
                formationDate: publicData.formationDate,
                status: publicData.status
              }
            },
            reasoning: 'Found business in California Secretary of State database'
          }
        };
      }
    }
    
    // Need user input
    return {
      status: 'needs_input',
      contextUpdate: {
        entryId: generateId(),
        timestamp: new Date().toISOString(),
        sequenceNumber: context.history.length + 1,
        actor: {
          type: 'agent',
          id: 'data_collection_agent',
          version: '1.0.0'
        },
        operation: 'requesting_user_input',
        data: {},
        reasoning: 'No public records found, need user to provide business details'
      },
      uiRequest: {
        agentRole: 'data_collection',
        requestId: generateId(),
        dataNeeded: [
          {
            field: 'entityType',
            dataType: 'enum',
            required: true,
            options: ['LLC', 'Corporation', 'Sole Proprietorship']
          },
          {
            field: 'formationDate',
            dataType: 'date',
            required: false
          }
        ]
      }
    };
  }
}
```

---

## **Task Templates**

### **Task Template Structure**

Task templates are **pure declarations** of what needs to be achieved. They contain no logic about how to achieve it.

yaml

```
# /config/templates/user_onboarding.yaml
task_template:
  id: "user_onboarding"
  version: "1.0.0"
  
  metadata:
    name: "New User Onboarding"
    description: "Collect business information for new users"
    category: "onboarding"
    estimatedDuration: 180  # seconds
  
  # Declarative goals - WHAT to achieve
  goals:
    primary:
      - id: "create_user_profile"
        description: "Establish user identity and preferences"
        required: true
        
      - id: "collect_business_info"
        description: "Gather essential business details"
        required: true
        
      - id: "verify_entity"
        description: "Confirm business entity status"
        required: true
    
    secondary:
      - id: "connect_accounts"
        description: "Link QuickBooks or bank accounts"
        required: false
  
  # State machine
  states:
    allowed:
      - "created"
      - "gathering_user_info"
      - "collecting_business_data"
      - "verifying_entity"
      - "completed"
      - "failed"
    
    initial: "created"
    terminal: ["completed", "failed"]
  
  # Phases of execution
  phases:
    - id: "user_info"
      description: "Gather user information"
      prerequisites: []
      next: ["business_info"]
      
    - id: "business_info"
      description: "Collect business details"
      prerequisites: ["user_info"]
      next: ["entity_verification"]
      
    - id: "entity_verification"
      description: "Verify business entity"
      prerequisites: ["business_info"]
      next: ["complete"]
  
  # Data schema for validation
  data_schema:
    type: "object"
    required: ["user", "business"]
    properties:
      user:
        type: "object"
        required: ["firstName", "lastName", "email"]
        properties:
          firstName:
            type: "string"
          lastName:
            type: "string"
          email:
            type: "string"
            format: "email"
      
      business:
        type: "object"
        required: ["name", "entityType"]
        properties:
          name:
            type: "string"
          entityType:
            type: "string"
            enum: ["LLC", "Corporation", "Sole Proprietorship", "Partnership"]
          ein:
            type: "string"
            pattern: "^[0-9]{2}-[0-9]{7}$"
  
  # Success criteria
  success_criteria:
    required:
      - "user.firstName != null"
      - "user.email != null"
      - "business.name != null"
      - "business.entityType != null"
    
    optional:
      - "business.ein != null"
      - "integrations.quickbooks == true"
  
  # Constraints
  constraints:
    maxDuration: 300  # 5 minutes
    maxUserInputRequests: 5
    requiredAgents:
      - "orchestrator"
      - "data_collection"
```

### **SOI Filing Template Example**

yaml

```
# /config/templates/soi_filing.yaml
task_template:
  id: "soi_filing"
  version: "1.0.0"
  
  metadata:
    name: "Statement of Information Filing"
    description: "File California Statement of Information"
    category: "compliance"
    jurisdiction: "California"
    entityTypes: ["LLC", "Corporation"]
  
  goals:
    primary:
      - id: "verify_requirement"
        description: "Confirm SOI is due"
        required: true
        
      - id: "collect_current_info"
        description: "Gather current business information"
        required: true
        
      - id: "submit_filing"
        description: "Submit to California Secretary of State"
        required: true
        
      - id: "obtain_confirmation"
        description: "Get filing confirmation number"
        required: true
  
  states:
    allowed:
      - "created"
      - "checking_requirement"
      - "gathering_data"
      - "ready_to_file"
      - "submitting"
      - "completed"
      - "failed"
    
    initial: "created"
    terminal: ["completed", "failed"]
  
  phases:
    - id: "requirement_check"
      description: "Verify filing is needed"
      prerequisites: []
      next: ["data_collection", "not_required"]
      
    - id: "data_collection"
      description: "Gather current business data"
      prerequisites: ["requirement_check"]
      next: ["review"]
      
    - id: "review"
      description: "User confirmation of data"
      prerequisites: ["data_collection"]
      next: ["submission"]
      
    - id: "submission"
      description: "Submit to CA SOS"
      prerequisites: ["review"]
      next: ["complete"]
  
  data_schema:
    type: "object"
    required: ["business", "filing"]
    properties:
      business:
        type: "object"
        required: ["name", "entityType", "address"]
      filing:
        type: "object"
        required: ["formType", "dueDate", "confirmationNumber"]
  
  success_criteria:
    required:
      - "filing.confirmationNumber != null"
      - "filing.filedDate != null"
      - "currentState.status == 'completed'"
  
  constraints:
    filingFee: 25.00
    expeditedFee: 50.00
    maxRetries: 3
```

---

## **Orchestrator Design**

### **Orchestrator Configuration**

yaml

```
# /config/orchestrator/orchestrator.yaml
orchestrator:
  id: "master_orchestrator"
  version: "1.0.0"
  name: "Master Task Orchestrator"
  
  mission: |
    You are the Master Orchestrator for SmallBizAlly. Your role is to:
    1. Interpret task templates to understand goals
    2. Create execution plans based on context
    3. Coordinate agent execution
    4. Minimize user interruption
    5. Record all decisions with reasoning
    
    Critical principles:
    - PROGRESSIVE DISCLOSURE: Minimize user interruption
    - Reorder UI requests to potentially avoid later questions
    - Use pessimistic locking (agents take turns) for simplicity
    - Record EVERYTHING - all decisions, plans, reasoning
    - Never make business decisions - only follow templates
    
    You read declarative goals and determine HOW to achieve them.
    You coordinate agents but never execute business logic directly.
  
  planning_rules:
    - "Exhaust autonomous methods before user input"
    - "Batch and reorder UI requests intelligently"
    - "Simple pessimistic locking for agent coordination"
    - "Always have fallback strategies"
    - "Record execution plans in context"
  
  agent_discovery:
    method: "static_config"  # Read from agent YAML files
    path: "/config/agents/"
  
  llm_config:
    default_model: "gpt-4"
    temperature: 0.3  # Lower for consistency
    response_format: "json"
```

### **Orchestrator Execution Flow**

typescript

```ts
class Orchestrator {
  private llmProvider: LLMProvider;
  private agentRegistry: AgentRegistry;
  private messageBus: MessageBus;
  
  async executeTask(contextId: string): Promise<void> {
    // Load context and template
    const context = await this.loadContext(contextId);
    const template = context.templateSnapshot;
    
    // Create execution plan
    const plan = await this.createExecutionPlan(template, context);
    
    // Record plan in context
    await this.recordPlan(context, plan);
    
    // Execute plan phases
    for (const phase of plan.phases) {
      const phaseResult = await this.executePhase(phase, context);
      
      if (phaseResult.status === 'needs_input') {
        await this.handleUserInputRequest(phaseResult.uiRequests, context);
        return; // Pause execution
      }
      
      if (phaseResult.status === 'failed') {
        await this.handleFailure(phaseResult.error, context);
        return;
      }
    }
    
    // Task complete
    await this.completeTask(context);
  }
  
  private async createExecutionPlan(
    template: TaskTemplate,
    context: TaskContext
  ): Promise<ExecutionPlan> {
    const prompt = `
${this.config.mission}

## Task Template
${JSON.stringify(template, null, 2)}

## Current Context
${JSON.stringify(context.currentState, null, 2)}

## Available Agents
${JSON.stringify(this.agentRegistry.getAvailableAgents(), null, 2)}

Create an execution plan to achieve the template goals.
Consider what has already been done (in context history).
Minimize user input by using agents effectively.

Response format:
{
  "plan": {
    "phases": [
      {
        "id": "string",
        "goal": "string",
        "agents": ["agent_ids"],
        "strategy": "sequential",
        "estimatedDuration": number
      }
    ],
    "reasoning": "string",
    "userInputPoints": number,
    "estimatedTotalDuration": number
  }
}
`;
    
    const response = await this.llmProvider.complete({
      model: 'gpt-4',
      prompt,
      responseFormat: 'json'
    });
    
    return response.plan;
  }
  
  private async executePhase(
    phase: ExecutionPhase,
    context: TaskContext
  ): Promise<PhaseResult> {
    const results = [];
    
    // Execute agents sequentially (pessimistic locking for MVP)
    for (const agentId of phase.agents) {
      const agent = this.agentRegistry.getAgent(agentId);
      
      const request: AgentRequest = {
        taskContext: context,
        operation: phase.goal,
        parameters: phase.parameters || {}
      };
      
      const response = await agent.execute(request);
      
      // Append to context
      context.history.push(response.contextUpdate);
      context.currentState = this.computeState(context.history);
      
      // Save context after each agent
      await this.saveContext(context);
      
      if (response.status === 'needs_input') {
        return {
          status: 'needs_input',
          uiRequests: [response.uiRequest]
        };
      }
      
      results.push(response);
    }
    
    return {
      status: 'complete',
      results
    };
  }
  
  private async handleUserInputRequest(
    uiRequests: UIRequest[],
    context: TaskContext
  ): Promise<void> {
    // Reorder UI requests for progressive disclosure
    const optimizedRequests = await this.optimizeUIRequests(uiRequests, context);
    
    // Record in context
    const entry: ContextEntry = {
      entryId: generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'orchestrator',
        version: this.config.version
      },
      operation: 'ui_request_generated',
      data: {
        requests: optimizedRequests,
        optimization: 'reordered_for_progressive_disclosure'
      },
      reasoning: 'Requesting user input for missing required data'
    };
    
    context.history.push(entry);
    await this.saveContext(context);
    
    // Send to UI layer
    await this.sendToUI(context.contextId, optimizedRequests);
  }
  
  private async optimizeUIRequests(
    requests: UIRequest[],
    context: TaskContext
  ): Promise<UIRequest[]> {
    // Use LLM to intelligently reorder requests
    const prompt = `
You are optimizing UI requests for progressive disclosure.
Reorder these requests to:
1. Ask most important questions first
2. Group related questions
3. Questions whose answers might eliminate later questions go first

Current context data available:
${JSON.stringify(context.currentState.data, null, 2)}

UI Requests to optimize:
${JSON.stringify(requests, null, 2)}

Return the requests in optimal order with reasoning.
`;
    
    const response = await this.llmProvider.complete({
      model: 'gpt-4',
      prompt,
      responseFormat: 'json'
    });
    
    return response.optimizedRequests;
  }
}
```

### **Example Orchestrator Execution Plan**

json

```json
{
  "plan": {
    "taskId": "task_123",
    "templateId": "user_onboarding",
    "phases": [
      {
        "id": "phase_1",
        "goal": "gather_user_info",
        "agents": ["data_collection_agent"],
        "strategy": "sequential",
        "estimatedDuration": 30,
        "reasoning": "Extract from Google OAuth first"
      },
      {
        "id": "phase_2",
        "goal": "collect_business_data",
        "agents": ["data_collection_agent", "public_records_agent"],
        "strategy": "sequential",
        "estimatedDuration": 60,
        "reasoning": "Try public records before asking user"
      },
      {
        "id": "phase_3",
        "goal": "verify_entity",
        "agents": ["legal_compliance_agent"],
        "strategy": "sequential",
        "estimatedDuration": 45,
        "reasoning": "Validate entity status with state"
      }
    ],
    "reasoning": "Standard onboarding flow. Using public records to minimize user input. Total 3 phases with potential for 1-2 UI interruptions.",
    "userInputPoints": 2,
    "estimatedTotalDuration": 135
  }
}
```

---

## **UI Generation**

### **UI Request Structure**

The engine provides **pure semantic data**. The UI layer decides how to render it.

typescript

```ts
interface UIRequest {
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

interface DataField {
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

interface QuickAction {
  id: string;
  label: string;
  semanticAction: string; // What it does, not how it looks
  payload?: any;
}
```

### **UI Snippets Library**

typescript

```ts
// UI interprets semantic data into components
enum UISnippet {
  ActionPill = 'action_pill',
  TextField = 'text_field',
  SelectField = 'select_field',
  DatePicker = 'date_picker',
  FileUpload = 'file_upload'
}

// Mapping semantic types to UI components
const semanticToUIMapping = {
  'business_name': UISnippet.TextField,
  'tax_id': UISnippet.TextField, // With masking
  'entity_type': UISnippet.SelectField,
  'formation_date': UISnippet.DatePicker,
  'business_license': UISnippet.FileUpload
};
```

### **Example UI Request**

json

```json
{
  "agentRole": "data_collection",
  "requestId": "req_456",
  "timestamp": "2024-12-01T10:05:00Z",
  
  "metadata": {
    "purpose": "Complete your business profile",
    "urgency": "normal",
    "category": "business_identity",
    "allowSkip": false
  },
  
  "dataNeeded": [
    {
      "field": "businessName",
      "dataType": "string",
      "semanticType": "business_name",
      "required": true,
      "constraints": {
        "minLength": 2,
        "maxLength": 100
      }
    },
    {
      "field": "entityType",
      "dataType": "enum",
      "semanticType": "entity_type",
      "required": true,
      "constraints": {
        "options": ["LLC", "Corporation", "Sole Proprietorship"]
      }
    },
    {
      "field": "ein",
      "dataType": "string",
      "semanticType": "tax_id",
      "required": false,
      "constraints": {
        "pattern": "^[0-9]{2}-[0-9]{7}$"
      }
    }
  ],
  
  "quickActions": [
    {
      "id": "no_ein",
      "label": "I don't have an EIN yet",
      "semanticAction": "skip_ein",
      "payload": { "skipField": "ein" }
    },
    {
      "id": "help",
      "label": "What's an EIN?",
      "semanticAction": "show_help",
      "payload": { "topic": "ein_explanation" }
    }
  ],
  
  "context": {
    "taskPhase": "business_info",
    "completeness": 35,
    "reason": "We need this information to track your compliance requirements"
  }
}
```

---

## **External Integrations**

### **ToolChain Service**

typescript

```ts
// ToolChain provides all external integrations
// Will migrate to MCP Server post-MVP
class ToolChain {
  private credentials: CredentialVault;
  
  // California Business Connect API
  async searchBusinessEntity(
    businessName: string,
    state: string = 'CA'
  ): Promise<BusinessEntity | null> {
    try {
      // Use SmallBizAlly API key
      const response = await fetch('https://api.sos.ca.gov/cbc/v1/search', {
        headers: {
          'Authorization': `Bearer ${process.env.CBC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ businessName, state })
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      // Log for Q&A team
      console.error('CBC API error:', error);
    }
    
    return null;
  }
  
  // QuickBooks Integration (requires user credentials)
  async getQuickBooksData(
    tenantId: string,
    dataType: string
  ): Promise<any> {
    // Check if we have credentials
    const creds = await this.credentials.get(tenantId, 'quickbooks');
    
    if (!creds) {
      // Need to request from user
      throw new NeedCredentialsError('quickbooks');
    }
    
    // Use stored credentials
    const qbClient = new QuickBooksClient(creds);
    return await qbClient.getData(dataType);
  }
  
  // Stripe Payment Processing
  async processPayment(
    amount: number,
    description: string,
    tenantId: string
  ): Promise<PaymentResult> {
    // Use SmallBizAlly Stripe account
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Get stored payment method for tenant
    const paymentMethod = await this.credentials.get(tenantId, 'payment_method');
    
    if (!paymentMethod) {
      throw new NeedCredentialsError('payment_method');
    }
    
    return await stripe.charges.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      description,
      source: paymentMethod.id
    });
  }
  
  // Email validation
  validateEmail(email: string): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }
  
  // EIN validation
  validateEIN(ein: string): boolean {
    const pattern = /^\d{2}-\d{7}$/;
    return pattern.test(ein);
  }
  
  // TODO: Migrate to MCP Server
  // This will become: await mcp.call('searchBusinessEntity', params)
}
```

### **Credential Vault**

typescript

```ts
class CredentialVault {
  async store(
    tenantId: string,
    service: string,
    credentials: any
  ): Promise<void> {
    const encrypted = await this.encrypt(credentials);
    
    await db.query(`
      INSERT INTO tenant_credentials 
      (credential_id, tenant_id, service_name, encrypted_credentials, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, service_name) 
      DO UPDATE SET encrypted_credentials = $4, created_at = $5
    `, [generateId(), tenantId, service, encrypted, new Date()]);
  }
  
  async get(
    tenantId: string,
    service: string
  ): Promise<any | null> {
    const result = await db.query(`
      SELECT encrypted_credentials 
      FROM tenant_credentials
      WHERE tenant_id = $1 AND service_name = $2
    `, [tenantId, service]);
    
    if (result.rows.length > 0) {
      return await this.decrypt(result.rows[0].encrypted_credentials);
    }
    
    return null;
  }
  
  private async encrypt(data: any): Promise<string> {
    // Use environment encryption key
    const key = process.env.ENCRYPTION_KEY;
    // Implementation details...
    return encrypted;
  }
  
  private async decrypt(encrypted: string): Promise<any> {
    // Decrypt using same key
    const key = process.env.ENCRYPTION_KEY;
    // Implementation details...
    return decrypted;
  }
}
```

---

## **Testing Strategy**

### **Test Architecture**

typescript

```ts
// Unit test example for agent
describe('DataCollectionAgent', () => {
  let agent: DataCollectionAgent;
  let mockLLM: MockLLMProvider;
  let mockToolChain: MockToolChain;
  
  beforeEach(() => {
    // Use REAL LLM for reasoning tests
    mockLLM = new MockLLMProvider({
      useRealLLM: true, // Critical: Don't mock reasoning
      model: 'gpt-4'
    });
    
    // Mock external data sources
    mockToolChain = new MockToolChain({
      searchBusinessEntity: jest.fn().mockResolvedValue(null)
    });
    
    agent = new DataCollectionAgent({
      llmProvider: mockLLM,
      toolChain: mockToolChain
    });
  });
  
  test('should request user input when public records not found', async () => {
    const context = createTestContext({
      business: { name: 'Test Company' }
    });
    
    const response = await agent.execute({
      taskContext: context,
      operation: 'gather_business_data',
      parameters: {}
    });
    
    // Verify reasoning is reasonable despite LLM variability
    expect(response.status).toBe('needs_input');
    expect(response.contextUpdate.reasoning).toContain('public records');
    expect(response.uiRequest.dataNeeded).toContainEqual(
      expect.objectContaining({
        field: 'entityType',
        required: true
      })
    );
  });
});
```

### **E2E Test with Playwright**

typescript

```ts
// E2E test for complete onboarding flow
test.describe('User Onboarding Flow', () => {
  test('should complete onboarding with minimal input', async ({ page }) => {
    // Start at landing page
    await page.goto('/');
    
    // Sign in with Google
    await page.click('button:has-text("Sign in with Google")');
    
    // Mock Google OAuth response
    await mockGoogleAuth(page, {
      email: 'test@example.com',
      name: 'Test User'
    });
    
    // Should see onboarding overlay
    await expect(page.locator('.onboarding-overlay')).toBeVisible();
    
    // System should extract Google data automatically
    await expect(page.locator('input[name="firstName"]')).toHaveValue('Test');
    
    // Enter business name
    await page.fill('input[name="businessName"]', 'Test Business LLC');
    
    // Select entity type using quick action
    await page.click('button:has-text("LLC")');
    
    // Continue
    await page.click('button:has-text("Continue")');
    
    // Wait for completion
    await expect(page.locator('.onboarding-complete')).toBeVisible();
    
    // Verify context was created correctly
    const context = await getTaskContext(page);
    expect(context.currentState.status).toBe('completed');
    expect(context.currentState.data.business.name).toBe('Test Business LLC');
    expect(context.currentState.data.business.entityType).toBe('LLC');
    
    // Verify all agent actions were recorded
    expect(context.history.length).toBeGreaterThan(5);
    expect(context.history.every(e => e.reasoning)).toBe(true);
  });
});
```

### **Test Configuration**

yaml

```
# /config/test/test_config.yaml
testing:
  unit_tests:
    coverage_threshold: 90
    use_real_llm: true
    llm_model: "gpt-4"
    mock_external_apis: true
  
  e2e_tests:
    framework: "playwright"
    browser: "chromium"
    headless: true
    base_url: "http://localhost:3000"
    
  data:
    use_test_database: true
    seed_data: "/test/fixtures/seed_data.json"
    
  monitoring:
    track_llm_costs: true
    track_test_duration: true
    failure_screenshots: true
```

---

## **Implementation Roadmap**

### **Phase 1: Core Infrastructure (Week 1-2)**

yaml

```
tasks:
  - id: "setup_project"
    items:
      - "Initialize TypeScript project"
      - "Set up PostgreSQL database"
      - "Create base schema"
      - "Set up test infrastructure"
  
  - id: "implement_event_store"
    items:
      - "TaskContext data model"
      - "Context history append-only logic"
      - "State computation from history"
      - "Database persistence layer"
  
  - id: "llm_abstraction"
    items:
      - "LLMProvider class"
      - "Support for OpenAI and Claude"
      - "Response validation"
      - "Error handling"
  
  - id: "config_system"
    items:
      - "YAML config loader"
      - "Hot reload capability"
      - "Schema validation"
```

### **Phase 2: Agent System (Week 3-4)**

yaml

```
tasks:
  - id: "base_agent"
    items:
      - "BaseAgent abstract class"
      - "Agent configuration loader"
      - "LLM prompt builder"
      - "Context update mechanism"
  
  - id: "core_agents"
    items:
      - "Orchestrator Agent"
      - "Data Collection Agent"
      - "Legal Compliance Agent"
      - "Public Records Agent"
  
  - id: "message_bus"
    items:
      - "In-process message bus"
      - "A2A message format support"
      - "Agent registry"
      - "Message routing"
```

### **Phase 3: Task System (Week 5-6)**

yaml

```
tasks:
  - id: "task_templates"
    items:
      - "Template loader"
      - "Template validation"
      - "User onboarding template"
      - "SOI filing template"
  
  - id: "task_execution"
    items:
      - "Task creation from template"
      - "Execution plan generation"
      - "Phase execution logic"
      - "Pause/resume capability"
  
  - id: "orchestration"
    items:
      - "Agent coordination"
      - "UI request optimization"
      - "Progressive disclosure logic"
      - "Failure handling"
```

### **Phase 4: External Integration (Week 7-8)**

yaml

```
tasks:
  - id: "toolchain"
    items:
      - "ToolChain service class"
      - "CBC API integration"
      - "Stripe payment integration"
      - "Credential vault"
  
  - id: "ui_generation"
    items:
      - "UIRequest data structure"
      - "Semantic field mapping"
      - "UI snippet definitions"
      - "Frontend integration API"
```

### **Phase 5: Testing & Launch (Week 9-10)**

yaml

```
tasks:
  - id: "testing"
    items:
      - "Unit tests for all components"
      - "E2E tests with Playwright"
      - "LLM response validation tests"
      - "Load testing"
  
  - id: "monitoring"
    items:
      - "Dev Toolkit integration"
      - "Agent failure tracking"
      - "LLM token usage monitoring"
      - "User abandonment tracking"
  
  - id: "deployment"
    items:
      - "Production environment setup"
      - "Config management"
      - "Rollback procedures"
      - "Launch checklist"
```

### **Post-MVP TODOs**

typescript

```ts
// Performance optimizations
// TODO: Implement context pagination for large histories
// TODO: Add caching layer for LLM responses
// TODO: Optimize state computation with snapshots

// Scalability improvements
// TODO: Migrate to true microservices with A2A
// TODO: Implement parallel agent execution
// TODO: Add context archival for old tasks

// Feature enhancements
// TODO: Add MCP Server for tool management
// TODO: Implement webhook event triggers
// TODO: Add scheduled task creation
// TODO: Build admin UI in Dev Toolkit
```

---

## **Conclusion**

This Engine Architecture PRD defines a **truly universal, data-driven orchestration system** that:

1. **Operates purely on configuration** \- All behavior defined in YAML files  
2. **Maintains complete traceability** \- Every action recorded with actor and reasoning  
3. **Minimizes user interruption** \- Progressive disclosure and intelligent orchestration  
4. **Remains completely generic** \- Zero business logic in code

The system's power comes from its simplicity:

* Tasks declare WHAT needs to be achieved  
* The Orchestrator determines HOW to achieve it  
* Agents execute specific roles  
* Everything is recorded in an append-only log  
* The UI interprets semantic data into beautiful interfaces

By maintaining this pure architecture, we create a system that can handle any business task, adapt to any requirement, and scale to any complexity \- all while remaining maintainable, testable, and understandable.

The implementation roadmap provides a clear path from MVP to production, with careful attention to testing, monitoring, and operational excellence. Every architectural decision supports our core principle: **build a universal engine that knows nothing about business, but can handle any business need**.

---

**Next Steps:**

1. Review and approve this PRD with the development team  
2. Set up the project structure and development environment  
3. Begin Phase 1 implementation with core infrastructure  
4. Establish daily standups to track progress against roadmap

**Remember:** Keep the engine pure, generic, and data-driven. The moment we add business logic to the engine code, we've failed. Everything must remain configurable, traceable, and universal.

