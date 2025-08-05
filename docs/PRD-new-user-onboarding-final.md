 # Product Requirements Document: New User Onboarding Experience (Final)

## Executive Summary
A agent-orchestrated onboarding system that operates autonomously in the background, pausing only when user input is required. The system uses a generic TaskContext with agent-specific subcontexts, enabling dynamic UI generation based on task requirements with need for user input.

## UI Journey: Two-Phase Onboarding Experience

### Phase 1: Google Authentication (Landing Page)
- **Purpose**: Create user account via Google OAuth
- **Location**: Landing/welcome page (NOT dashboard)
- **Actions**: 
  - User clicks "Sign up with Google"
  - Supabase handles OAuth flow
  - User account created automatically
  - No agent interaction yet

### Phase 2: Dashboard with Onboarding Card
- **Purpose**: Complete business profile via agent orchestration
- **Location**: Main dashboard with full-screen overlay
- **Actions**:
  - Dashboard loads after successful auth
  - Onboarding task created in backend
  - Onboarding Card appears as overlay
  - All agent interactions happen within card
  - Card dismisses when complete, revealing dashboard

**Key Insight**: The onboarding is NOT a separate flow - it's an overlay on the main dashboard. This ensures users immediately see where they'll be working while being guided through setup.

### Visual: Dashboard with Onboarding Card

```
┌─────────────────────────────────────────────────────────┐
│                    BizBuddy Dashboard                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │         🎉 Welcome to BizBuddy!                    │ │
│ │                                                     │ │
│ │         Let's set up your business profile         │ │
│ │                                                     │ │
│ │         First Name: [John        ] ← from Google   │ │
│ │         Last Name:  [Doe         ] ← from Google   │ │
│ │                                                     │ │
│ │         [👉 Continue]                               │ │
│ │                                                     │ │
│ │         ────────────────────────                    │ │
│ │         Step 1 of ~4  •  About 3 minutes           │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│  (Dashboard content visible but dimmed in background)   │
│  • Compliance Calendar (empty)                          │
│  • Tasks Widget (empty)                                 │
│  • Documents Section (empty)                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Core Architectural Pattern: Hybrid User-Initiated & Agent-Orchestrated Processing

### Fundamental Design Principle
**Tasks can be initiated either by users (UI-triggered) or system schedulers (background-triggered), but once started, agents work autonomously until user input is required.**

```
Two Entry Points:
1. User-Initiated (Onboarding, Manual Tasks)
   User Action in UI → Create Task → Agent Processing
   
2. System-Initiated (Scheduled Compliance, Renewals)  
   Scheduler/Trigger → Create Task → Agent Processing

Then both follow same pattern:
        ↓
[Autonomous Agent Processing]
        ↓
[Agent discovers need for input]
        ↓
Generate UI Prompt → Pause → User Input
        ↓
Resume Agent Processing
        ↓
[Continue until completion or next input needed]
```

### How It Works

1. **Task Initiation**
   - **User-Initiated** (Onboarding): User clicks "Sign up with Google" in UI
   - **System-Initiated** (Compliance): Scheduler triggers based on deadlines
   - Both create a TaskContext and hand off to agents

2. **Autonomous Processing Phase**
   - Agents work autonomously after task creation
   - Gather data from available sources (Google profile, public records, APIs)
   - Build context without user interaction
   - Progress until hitting input requirement

3. **Input Request Generation**
   - Agent identifies missing required data
   - Creates structured input request
   - Orchestrator translates to UI prompt
   - System pauses and waits

4. **Dynamic UI Generation**
   - Frontend receives structured prompt
   - Dynamically generates appropriate UI component
   - Collects user input
   - Returns control to agent system

5. **Resume and Continue**
   - System resumes with new data
   - Continues autonomous processing
   - Repeats cycle as needed

## Generic TaskContext Architecture

```typescript
interface TaskContext {
  // Core task identification
  taskId: string;
  taskType: string; // 'onboarding', 'soi-filing', 'renewal', etc.
  userId: string;
  userToken: string;
  
  // Task state
  status: 'active' | 'paused_for_input' | 'completed' | 'failed';
  currentPhase: string;
  completedPhases: string[];
  
  // Shared data accessible to all agents
  sharedContext: {
    user?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      googleId?: string;
    };
    business?: {
      name?: string;
      entityType?: string;
      state?: string;
      ein?: string;
      formationDate?: string; // this can be unstructured data
    };
    metadata: Record<string, any>;
  };
  
  // Agent-specific subcontexts
  agentContexts: {
    [agentRole: string]: {
      state: any;           // Agent's working memory
      requirements: any[];  // What agent needs
      findings: any[];      // What agent discovered
      nextActions: string[];
      uiAugmentation?: UIAugmentationRequest; // Agent's UI needs
    };
  };
  
  // Active UI augmentation requests from agents
  activeUIRequests: {
    [agentRole: string]: UIAugmentationRequest;
  };
  
  // Input request queue
  pendingInputRequests: InputRequest[];
  
  // Audit trail
  auditTrail: AuditEntry[];
}

interface InputRequest {
  id: string;
  requestingAgent: string;
  priority: 'required' | 'optional';
  promptType: 'text' | 'select' | 'multiselect' | 'boolean' | 'date' | 'file';
  
  // Structured prompt for UI generation
  prompt: {
    title: string;
    description?: string;
    fieldName: string;
    validation?: {
      required?: boolean;
      pattern?: string;
      minLength?: number;
      maxLength?: number;
      options?: Array<{value: string; label: string}>;
    };
    defaultValue?: any;
    helpText?: string;
    examples?: string[];
  };
  
  // Context for why this is needed
  context: {
    phase: string;
    reason: string;
    impact: 'blocking' | 'enhancing' | 'optional';
  };
  
  // Where to store the response
  targetPath: string; // e.g., "sharedContext.business.entityType"
}
```

## Agent-to-UI Communication Format

### CRITICAL DESIGN PRINCIPLE: Pure Semantic Data
**Agents provide ONLY semantic data - NO layout, styling, or presentation instructions. The UI layer owns all presentation decisions.**

### Separation of Concerns

#### What Agents Provide (Pure Data):
- **Field definitions**: Data type, constraints, relationships
- **Semantic types**: "business_name", "tax_id", "email" (not "text input" or "form field")
- **Data relationships**: Dependencies, validations, enablements
- **Business rules**: Required conditions, validation patterns
- **Context**: Why data is needed, consequences of missing data
- **Actions**: Semantic operations like "set_entity_type", not UI actions like "show_modal"

#### What Agents MUST NOT Provide:
- **Layout instructions**: No "grid", "vertical", "horizontal"
- **Visual styling**: No colors, themes, icons, badges
- **UI components**: No "modal", "sidebar", "dropdown"
- **Presentation logic**: No "collapsible", "hidden", "expanded"
- **Form structure**: No sections, groups, or pages
- **User interaction patterns**: No "onClick", "onBlur", "onHover"

#### What the UI Layer Decides:
- **How to group fields**: Based on semantic relationships
- **Visual hierarchy**: Based on requirement levels and urgency
- **Component selection**: Text input vs dropdown vs radio buttons
- **Layout strategy**: Mobile vs desktop, modal vs inline
- **Progressive disclosure**: What to show/hide based on context
- **Interaction patterns**: How users interact with the data

This separation ensures:
1. Agents remain UI-agnostic and reusable
2. UI can adapt to different platforms (web, mobile, voice)
3. A/B testing can happen without changing agent logic
4. Accessibility features can be added at the UI layer

### UIAugmentationRequest Structure
This JSON format contains pure data and semantic meaning. No layout instructions allowed.

```typescript
interface UIAugmentationRequest {
  // Identification
  agentRole: string;
  requestId: string;
  timestamp: string;
  
  // Semantic metadata (what, not how)
  metadata: {
    purpose: string; // Why this data is needed
    urgency: 'immediate' | 'high' | 'normal' | 'low';
    category: string; // Type of information: 'identity', 'legal', 'financial', 'operational'
    allowSkip: boolean; // Can user defer this
    skipConsequence?: string; // What happens if skipped
  };
  
  // Requirement classification
  requirementLevel: {
    minimumRequired: string[]; // Field IDs that MUST be filled
    recommended: string[]; // Fields that should be filled but can continue without
    optional: string[]; // Nice-to-have fields
    conditionallyRequired?: Array<{ // Fields that become required based on conditions
      fieldId: string;
      condition: string; // e.g., "entityType === 'llc'"
      reason: string;
    }>;
  };
  
  // Quick actions (semantic data only)
  quickActions?: QuickAction[];
  
  // Data fields needed (pure data structure)
  dataNeeded: DataField[];
  
  // Context (semantic information only)
  context: {
    taskPhase: string;
    dataCompleteness: number; // 0-100 percentage
    estimatedFields: number;
    reason: string; // Why this data is needed
    alternativePaths?: string[]; // Other ways to get this data
    consequences?: string; // What happens without this data
  };
  
  // Response handling (data flow only)
  responseHandling: {
    targetContextPath: string; // Where to store in TaskContext
    validationRules?: ValidationRule[];
    acceptPartialData: boolean;
    followupStrategy?: 'queue' | 'remind' | 'none';
  };
}

interface QuickAction {
  id: string;
  label: string;
  semanticAction: string; // e.g., 'set_no_employees', 'import_from_quickbooks'
  payload?: Record<string, any>; // Data only
  condition?: string; // When this action is relevant
}

interface DataField {
  id: string;
  fieldName: string;
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array' | 'object';
  semanticType?: string; // e.g., 'business_name', 'tax_id', 'email', 'phone'
  
  // Pure data constraints
  constraints?: {
    required: boolean;
    requiredCondition?: string; // When it becomes required
    pattern?: string; // Regex for validation
    minValue?: any;
    maxValue?: any;
    maxLength?: number;
    enumValues?: Array<{value: any; label: string; metadata?: any}>;
  };
  
  // Semantic relationships
  relationships?: {
    dependsOn?: string[]; // Other field IDs
    enables?: string[]; // Fields this unlocks
    validates?: string[]; // Fields this helps validate
  };
  
  // Data metadata
  metadata?: {
    reason: string; // Why this field is needed
    examples?: any[]; // Example values
    defaultValue?: any;
    dataSource?: string; // Where we might find this
    alternativeField?: string; // Another field that could substitute
  };
}

// Note: FormField interface removed - Agents use DataField for pure semantic data
// The UI layer determines how to render based on semantic types and constraints

interface ValidationRule {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}
```

### Example: Legal Compliance Agent UI Request (Pure Semantic Data)

```json
{
  "agentRole": "legal_compliance",
  "requestId": "req_lc_001",
  "timestamp": "2024-01-15T10:30:00Z",
  
  "metadata": {
    "purpose": "Determine applicable compliance requirements",
    "urgency": "high",
    "category": "legal_structure",
    "allowSkip": false,
    "skipConsequence": "Cannot generate compliance calendar without this information"
  },
  
  "requirementLevel": {
    "minimumRequired": ["entityType", "stateOfFormation"],
    "recommended": ["ein"],
    "optional": ["numberOfOwners", "registeredAgent"],
    "conditionallyRequired": []
  },
  
  "quickActions": [
    {
      "id": "quick_llc",
      "label": "I have an LLC",
      "semanticAction": "set_entity_type",
      "payload": { "entityType": "llc" }
    },
    {
      "id": "quick_corp",
      "label": "I have a Corporation",
      "semanticAction": "set_entity_type",
      "payload": { "entityType": "corporation" }
    },
    {
      "id": "quick_unknown",
      "label": "Not sure",
      "semanticAction": "request_guidance",
      "payload": { "helpTopic": "entity_types" }
    }
  ],
  
  "dataNeeded": [
    {
      "id": "entityType",
      "fieldName": "entityType",
      "dataType": "enum",
      "semanticType": "business_entity_type",
      "constraints": {
        "required": true,
        "enumValues": [
          {
            "value": "llc",
            "label": "Limited Liability Company (LLC)",
            "metadata": { "commonFor": "small_business", "passThrough": true }
          },
          {
            "value": "corporation",
            "label": "Corporation (Inc.)",
            "metadata": { "commonFor": "larger_business", "doubleTaxation": true }
          },
          {
            "value": "partnership",
            "label": "Partnership",
            "metadata": { "commonFor": "multiple_owners", "passThrough": true }
          },
          {
            "value": "sole_prop",
            "label": "Sole Proprietorship",
            "metadata": { "commonFor": "single_owner", "noFormalStructure": true }
          }
        ]
      },
      "metadata": {
        "reason": "Entity type determines all compliance requirements",
        "examples": ["llc", "corporation"],
        "dataSource": "user_required"
      }
    },
    {
      "id": "stateOfFormation",
      "fieldName": "stateOfFormation",
      "dataType": "string",
      "semanticType": "us_state",
      "constraints": {
        "required": true,
        "requiredCondition": "entityType !== 'sole_prop'"
      },
      "relationships": {
        "dependsOn": ["entityType"],
        "enables": ["registeredAgent", "stateFilingNumber"]
      },
      "metadata": {
        "reason": "State determines specific filing requirements",
        "examples": ["California", "Delaware", "New York"],
        "dataSource": "user_or_public_records"
      }
    },
    {
      "id": "ein",
      "fieldName": "ein",
      "dataType": "string",
      "semanticType": "federal_tax_id",
      "constraints": {
        "required": false,
        "pattern": "^\\d{2}-\\d{7}$",
        "maxLength": 10
      },
      "relationships": {
        "validates": ["businessLegitimacy"],
        "enables": ["bankAccount", "taxFilings"]
      },
      "metadata": {
        "reason": "Required for tax filings and banking",
        "examples": ["12-3456789", "98-7654321"],
        "dataSource": "irs_database",
        "alternativeField": "ssn"
      }
    }
  ],
  
  "context": {
    "taskPhase": "legal_structure_determination",
    "dataCompleteness": 35,
    "estimatedFields": 3,
    "reason": "Business structure determines all compliance requirements and filing obligations",
    "alternativePaths": ["import_from_quickbooks", "scan_formation_documents"],
    "consequences": "Cannot determine compliance requirements or generate legal documents"
  },
  
  "responseHandling": {
    "targetContextPath": "sharedContext.business",
    "validationRules": [
      {
        "field": "ein",
        "rule": "format_validation",
        "message": "EIN must be in format XX-XXXXXXX",
        "severity": "error"
      },
      {
        "field": "ein",
        "rule": "uniqueness_check",
        "message": "This EIN is already registered",
        "severity": "warning"
      }
    ],
    "acceptPartialData": true,
    "followupStrategy": "queue"
  }
}
```

### Response Format from UI

When the user completes the requested input, the frontend sends back:

```typescript
interface UIAugmentationResponse {
  requestId: string;
  taskId: string;
  agentRole: string;
  timestamp: string;
  
  // User's input data
  formData: Record<string, any>;
  
  // Which action was taken
  actionTaken: {
    type: 'submit' | 'cancel' | 'skip' | 'help';
    actionPillId?: string; // If triggered by action pill
  };
  
  // Client-side validation results
  validationStatus: {
    isValid: boolean;
    errors?: Array<{
      field: string;
      message: string;
    }>;
  };
  
  // User interaction metrics
  metrics?: {
    timeToComplete: number; // milliseconds
    fieldInteractions: Record<string, number>; // field interactions count
    abandonedFields?: string[]; // fields user started but didn't complete
  };
}
```

### Integration with TaskContext

When a response is received, the Orchestrator updates the TaskContext:

```typescript
// Orchestrator processes UIAugmentationResponse
function processUIResponse(response: UIAugmentationResponse, context: TaskContext): TaskContext {
  // 1. Update shared context with form data
  const targetPath = context.activeUIRequests[response.agentRole]?.responseConfig.targetContextPath;
  if (targetPath) {
    setNestedValue(context, targetPath, response.formData);
  }
  
  // 2. Update agent-specific context
  context.agentContexts[response.agentRole].state = {
    ...context.agentContexts[response.agentRole].state,
    lastUserInput: response.formData,
    lastInputTimestamp: response.timestamp
  };
  
  // 3. Clear the active UI request
  delete context.activeUIRequests[response.agentRole];
  
  // 4. Add to audit trail
  context.auditTrail.push({
    timestamp: response.timestamp,
    action: 'user_input_received',
    agent: response.agentRole,
    data: response.formData
  });
  
  // 5. Resume task processing
  context.status = 'active';
  
  return context;
}
```

## Declarative Task Orchestration Principle

### FUNDAMENTAL PRINCIPLE: Goals, Not Steps
**Tasks define WHAT needs to be achieved, not HOW to achieve it. The Orchestrator Agent analyzes the goals, context, and available resources to dynamically create an execution plan.**

The Orchestrator:
1. **Parses** the task declaration to understand goals and success criteria
2. **Analyzes** the current context (user type, business type, jurisdiction, etc.)
3. **Determines** which agents are needed and in what configuration
4. **Creates** an execution plan adapted to the specific context
5. **Executes** the plan, pausing for user input when necessary
6. **Resumes** with updated context when input is provided
7. **Continues** until all success criteria are met

## Onboarding Task Declaration (Declarative)

```yaml
task_type: user_onboarding
version: 1.0

# Goal declaration - WHAT we want to achieve, not HOW
goals:
  primary:
    - establish_user_identity: "Verified user account with authentication"
    - determine_business_structure: "Complete understanding of business entity and jurisdiction"
    - identify_compliance_requirements: "Full list of applicable regulations and deadlines"
    - enable_platform_features: "User can access all relevant features"
  
  secondary:
    - collect_operational_data: "Business operations information for enhanced service"
    - establish_payment_method: "Payment setup for future transactions"
    - create_document_templates: "Personalized templates based on business type"

# Success criteria - How we know we're done
success_criteria:
  required:
    - user_authenticated: true
    - business_entity_type: known
    - business_jurisdiction: known
    - compliance_calendar: generated
    - user_can_login: true
  
  optional:
    - tax_id_collected: true
    - payment_method_added: true
    - documents_generated: true

# Context that affects execution
context_factors:
  - user_type: "new_business | existing_business | consultant | accountant"
  - business_stage: "idea | forming | operating | expanding"
  - complexity: "simple | moderate | complex"
  - urgency: "immediate | standard | relaxed"

# Available data sources the Orchestrator can leverage
data_sources:
  - google_profile: "OAuth user data"
  - public_records: "State business registrations"
  - irs_database: "Federal tax registrations"
  - industry_databases: "License requirements"
  - user_input: "Direct user-provided data"

# Constraints and preferences
constraints:
  time_limit: "3_minutes_active_user_time"
  max_input_requests: 5
  privacy_level: "standard | enhanced | maximum"
  
preferences:
  minimize_user_input: true
  prioritize_speed: false
  prioritize_completeness: true
```

## How the Orchestrator Interprets This Declaration

```yaml
# Orchestrator's Dynamic Execution Plan (Generated at Runtime)
# This is NOT part of the task declaration - it's created by the Orchestrator

orchestrator_analysis:
  user_context:
    - User type detected: "new_business"
    - Location: California (from IP)
    - Email domain: techstartup.com (likely tech industry)
  
  agent_selection:
    - data_collection: "High priority - need business details"
    - legal_compliance: "Critical - CA has specific requirements"
    - payment: "Low priority - can defer"
    - agency_interaction: "Not needed yet"
  
  execution_strategy:
    phase_1:
      goal: "establish_user_identity"
      approach: "Already have Google OAuth data - COMPLETE"
    
    phase_2:
      goal: "determine_business_structure"
      approach: 
        - Try to infer from email domain
        - Check public records
        - If unknown, request user input (minimized to 2 fields)
    
    phase_3:
      goal: "identify_compliance_requirements"
      approach:
        - Once entity type known, legal_compliance agent can work autonomously
        - No user input needed for this phase
    
    phase_4:
      goal: "enable_platform_features"
      approach:
        - Generate compliance calendar
        - Create initial task queue
        - Send welcome message

# Context-Specific Adaptations
adaptations:
  for_california_llc:
    - Add SOI filing requirement
    - Check for franchise tax
    - Verify registered agent requirement
  
  for_delaware_corp:
    - Different requirements entirely
    - Annual report instead of SOI
    - Different tax structure
  
  for_sole_proprietorship:
    - Skip many corporate requirements
    - Simplify data collection
    - Focus on business licenses
```

## Key Differences from Prescriptive Approach

### Old (Prescriptive) Approach:
- Step 1: Do X
- Step 2: Do Y
- Step 3: If A then B else C
- Hard-coded sequence regardless of context

### New (Declarative) Approach:
- Goal: Achieve X, Y, Z
- Success: When criteria A, B, C are met
- Let Orchestrator determine optimal path based on:
  - User's specific context
  - Available data sources
  - Current system capabilities
  - Business rules and regulations

## Benefits of Declarative Task Orchestration

1. **Adaptive Execution**: Same task declaration works for CA LLC, DE Corp, or NY Sole Prop
2. **Intelligent Optimization**: Orchestrator can skip unnecessary steps if data already available
3. **Context Awareness**: Different execution for new vs existing businesses
4. **Maintainability**: Add new capabilities without changing task declarations
5. **Reusability**: Same goals can be achieved through different paths as system evolves

## Orchestrator's Dynamic Execution Management

### The Orchestrator as Intelligent Task Manager

The Orchestrator Agent is the **sole interpreter** of task declarations. It:

1. **Reads** the declarative task definition
2. **Evaluates** the current context and available resources
3. **Plans** an execution strategy specific to this instance
4. **Instantiates** only the agents needed for this context
5. **Manages** the execution flow, including pauses and resumes
6. **Adapts** the plan as new information becomes available

### Dynamic Agent Instantiation

```typescript
interface OrchestratorExecutionPlan {
  taskId: string;
  taskType: string;
  
  // Analyzed from task declaration + context
  executionStrategy: {
    requiredAgents: AgentRole[];
    optionalAgents: AgentRole[];
    sequencing: 'parallel' | 'sequential' | 'mixed';
    estimatedDuration: number;
    userInputPoints: number;
  };
  
  // Runtime state
  activeAgents: Map<AgentRole, AgentInstance>;
  completedGoals: string[];
  pendingGoals: string[];
  currentPhase: string;
  
  // Adaptation rules
  adaptationTriggers: Array<{
    condition: string; // e.g., "business.entityType === 'sole_prop'"
    action: string; // e.g., "skip_corporate_requirements"
    affectedAgents: AgentRole[];
  }>;
}
```

### Example: Orchestrator Interpreting Onboarding Task

```typescript
// When user initiates onboarding
orchestrator.interpretTask({
  taskType: 'user_onboarding',
  initialContext: {
    user: { email: 'john@techstartup.com', name: 'John Doe' },
    source: 'google_oauth',
    timestamp: '2024-01-15T10:00:00Z'
  }
});

// Orchestrator's internal process (not visible to task declaration)
function interpretTask(task: TaskDeclaration, context: TaskContext) {
  // 1. Analyze goals
  const goals = parseGoals(task.goals);
  const critical = goals.filter(g => g.priority === 'primary');
  
  // 2. Evaluate context
  const userProfile = analyzeUserProfile(context.user);
  // Detected: Tech domain, likely startup, probably Delaware corp
  
  // 3. Create execution plan
  const plan = {
    phase1: {
      goal: 'determine_business_structure',
      agents: [AgentRole.DATA_COLLECTION],
      strategy: 'Try inference first, minimal user input if needed',
      expectedData: ['entityType', 'state']
    },
    phase2: {
      goal: 'identify_compliance_requirements',
      agents: [AgentRole.LEGAL_COMPLIANCE],
      strategy: 'Autonomous once entity type known',
      expectedData: ['requirements', 'deadlines']
    },
    phase3: {
      goal: 'enable_platform_features',
      agents: [AgentRole.ORCHESTRATOR],
      strategy: 'Generate deliverables',
      expectedData: ['calendar', 'templates']
    }
  };
  
  // 4. Begin execution
  executePhase(plan.phase1);
}

// Dynamic adaptation during execution
function handleNewInformation(info: any) {
  if (info.entityType === 'sole_prop') {
    // Adapt: Remove corporate-focused agents
    plan.removeAgent(AgentRole.AGENCY_INTERACTION);
    plan.simplifyPhase('data_collection');
  } else if (info.entityType === 'delaware_corp') {
    // Adapt: Add specialized Delaware agent
    plan.addAgent(AgentRole.DELAWARE_SPECIALIST);
    plan.addPhase('delaware_specific_requirements');
  }
}
```

### Pause and Resume Mechanism

```typescript
interface PauseContext {
  reason: 'user_input_needed' | 'approval_required' | 'external_wait';
  pausedAt: string;
  executionState: {
    completedGoals: string[];
    activeAgents: AgentRole[];
    pendingUIRequests: UIAugmentationRequest[];
  };
  resumeStrategy: {
    triggerCondition: string; // e.g., "requiredFields.received"
    resumePoint: string; // Where to continue
    timeout?: number; // Auto-resume or expire
  };
}

// When agent needs input
function pauseExecution(reason: string, dataNeeded: DataField[]) {
  const pauseContext: PauseContext = {
    reason: 'user_input_needed',
    pausedAt: new Date().toISOString(),
    executionState: captureCurrentState(),
    resumeStrategy: {
      triggerCondition: 'all_required_fields_provided',
      resumePoint: 'current_phase',
      timeout: 86400000 // 24 hours
    }
  };
  
  // Save to persistent storage
  await saveExecutionState(taskId, pauseContext);
  
  // Send UI request
  await sendUIAugmentationRequest(createPureDataRequest(dataNeeded));
}

// When user provides input
function resumeExecution(taskId: string, userInput: any) {
  const pauseContext = await loadExecutionState(taskId);
  
  // Update context with new data
  const updatedContext = mergeUserInput(pauseContext.executionState, userInput);
  
  // Resume from where we left off
  continueExecution(pauseContext.resumePoint, updatedContext);
}
```

## Orchestrated UI Request Coordination

### Multi-Agent UI Request Pattern

The Orchestrator collects UI needs from all agents, then intelligently sequences and optimizes them before presenting to the UI layer. A specialized **User Experience Agent** handles the optimization.

```typescript
interface OrchestratedUIRequest {
  orchestrationId: string;
  taskId: string;
  timestamp: string;
  
  // Collected from all agents
  agentRequests: Map<AgentRole, UIAugmentationRequest>;
  
  // Optimized sequence determined by UX Agent
  optimizedSequence: UISequence[];
  
  // Dependencies between fields
  fieldDependencies: FieldDependencyGraph;
  
  // Consolidation opportunities identified
  consolidations: Array<{
    fields: string[];
    reason: string;
    savings: number; // estimated time saved in seconds
  }>;
}

interface UISequence {
  sequenceId: string;
  priority: number;
  groupTitle: string;
  
  // Merged sections from multiple agents
  sections: Array<{
    originalAgent: AgentRole;
    section: FormSection;
    canDefer: boolean;
    impact: 'critical' | 'important' | 'nice-to-have';
  }>;
  
  // Combined action pills
  actionPills: ActionPill[];
  
  // Estimated completion time
  estimatedTime: number;
  
  // Skip conditions
  skipIf?: string; // e.g., "sharedContext.business.entityType === 'sole_prop'"
}

interface FieldDependencyGraph {
  nodes: Map<string, FieldNode>;
  edges: Array<{
    from: string;
    to: string;
    type: 'requires' | 'enhances' | 'validates';
  }>;
}
```

### User Experience Agent

A specialized agent that optimizes the UI flow:

```typescript
interface UserExperienceAgent {
  role: 'user_experience';
  
  responsibilities: [
    'Analyze all agent UI requests',
    'Identify field dependencies and redundancies',
    'Optimize question sequence for minimal cognitive load',
    'Merge compatible sections from different agents',
    'Eliminate questions through inference',
    'Generate progressive disclosure strategy'
  ];
  
  optimizationStrategies: [
    'Group related fields together',
    'Place high-impact fields first',
    'Defer optional fields to later sequences',
    'Use previous answers to skip unnecessary questions',
    'Batch validations to reduce round-trips'
  ];
}
```

## Agent Prompt Language Specification

### Base Agent Prompt Template

All agents receive a structured prompt that defines their role and current context:

```yaml
# Agent System Prompt
role: {{agent_role}}
task_type: {{task_type}}
phase: {{current_phase}}

## Your Responsibilities
{{responsibilities_list}}

## Current Context
task_id: {{task_id}}
user_context:
  - Name: {{user.firstName}} {{user.lastName}}
  - Email: {{user.email}}
  - Previous interactions: {{interaction_count}}

business_context:
  - Entity Type: {{business.entityType | 'unknown'}}
  - State: {{business.state | 'unknown'}}
  - Industry: {{business.industry | 'unknown'}}

## Available Data Sources
{{available_data_sources}}

## Your Deliverables
For this phase, you must:
{{phase_specific_deliverables}}

## Information Gathering Rules
1. Exhaust all autonomous data sources before requesting user input
2. When user input is needed, generate a UIAugmentationRequest
3. Batch related fields together
4. Provide clear context for why information is needed
5. Include quick-action pills for common scenarios

## Output Format
Return your response as:
{
  "status": "complete|needs_input|blocked",
  "findings": {...},
  "uiRequest": {...} // if status is needs_input
}
```

### Example: Legal Compliance Agent Prompt

```yaml
role: legal_compliance
task_type: onboarding
phase: requirement_analysis

## Your Responsibilities
- Determine all applicable compliance requirements
- Identify required business licenses
- Calculate filing deadlines
- Generate compliance calendar

## Current Context
task_id: task_20240115_001
user_context:
  - Name: John Doe
  - Email: john@techstartup.com
  - Previous interactions: 0

business_context:
  - Entity Type: llc
  - State: California
  - Industry: unknown

## Available Data Sources
- California Secretary of State API
- IRS Business Database
- City Business License Database
- Industry Regulation Database

## Your Deliverables
For this phase, you must:
1. Query CA SOS for LLC requirements
2. Determine if Statement of Information is due
3. Check for required business licenses based on location
4. If industry is unknown, request user input
5. Generate preliminary compliance calendar

## Information Gathering Rules
1. Try to infer industry from business name
2. Check public records for existing licenses
3. Only ask user if critical information missing
4. Provide examples and common selections

## Conditional Logic
IF entity_type == "llc" AND state == "California":
  - Add SOI filing requirement (biennial)
  - Check for LLC-12 filing requirement
  - Verify registered agent requirement
  
IF industry == "food_service":
  - Add health permit requirement
  - Add seller's permit requirement
  - Check for alcohol license needs

## Output Format
{
  "status": "needs_input",
  "findings": {
    "requirements": ["SOI filing", "Business License", "Seller's Permit"],
    "deadlines": {...},
    "missing_data": ["industry", "business_activities"]
  },
  "uiRequest": {
    // UIAugmentationRequest for missing industry/activity data
  }
}
```

### Orchestrator Coordination Prompt

```yaml
role: orchestrator
task_type: onboarding
phase: coordinate_ui_requests

## Your Task
You have received UI requests from multiple agents. Coordinate with the User Experience Agent to optimize the presentation sequence.

## Agent UI Requests Received
legal_compliance:
  needs: [industry, business_activities, has_employees]
  priority: high
  
data_collection:
  needs: [ein, business_address, phone_number]
  priority: medium
  
payment_agent:
  needs: [preferred_payment_method, bank_account]
  priority: low
  
agency_interaction:
  needs: [ca_sos_credentials, authorized_signer]
  priority: high

## Optimization Directives
1. Group related fields (e.g., all address fields together)
2. Prioritize fields that unlock other agents
3. Defer payment setup if possible
4. Check if any fields can be inferred from others
5. Identify quick-action opportunities

## Coordination Instructions
SEND TO user_experience_agent:
{
  "action": "optimize_ui_flow",
  "agent_requests": [...],
  "optimization_goals": {
    "minimize_sequences": true,
    "target_time": "3_minutes",
    "prioritize_critical": true
  }
}

EXPECT RESPONSE:
{
  "optimized_sequences": [...],
  "eliminated_fields": [...],
  "consolidations": [...],
  "estimated_completion_time": "2.5_minutes"
}

THEN:
- Review optimized sequence
- Validate no critical fields were eliminated
- Package as OrchestratedUIRequest
- Send to UI layer
```

### User Experience Agent Optimization Prompt

```yaml
role: user_experience_agent
task: optimize_ui_flow

## Input Analysis
You received UI requests from 4 agents totaling 15 fields.

## Optimization Strategy
1. DEPENDENCY ANALYSIS
   - industry → determines business_activities options
   - has_employees → determines if ein required
   - business_address → can infer city/state

2. FIELD GROUPING
   Group A: Business Identity (Critical)
   - industry + business_activities + has_employees
   
   Group B: Location & Tax (Important)
   - business_address + ein
   
   Group C: Operations (Deferrable)
   - phone_number + authorized_signer
   
   Group D: Payment (Optional - can defer)
   - preferred_payment_method + bank_account

3. ELIMINATION OPPORTUNITIES
   - ca_sos_credentials: ELIMINATE - we can use service account
   - city/state: INFER from business_address
   - ein: MAKE OPTIONAL if no employees

4. QUICK ACTIONS
   - "I don't have employees" → Skip EIN, payroll questions
   - "Home-based business" → Pre-fill with user's address
   - "Tech startup" → Auto-select common requirements

## Output Sequence
Sequence 1: "Let's understand your business" (Critical)
- Industry selection with smart suggestions
- Business activities (conditional based on industry)
- Employee question with quick-action pill

Sequence 2: "Business details" (Important)
- Address with home-based quick action
- EIN (only if has employees)
- Phone number

Sequence 3: "Setup payment" (Deferrable)
- Show only if user doesn't select "Set up later"

ESTIMATED TIME: 2.5 minutes (down from 4.5 minutes)
FIELDS ELIMINATED: 3
FIELDS MADE OPTIONAL: 2
```

## Agent Communication Protocol

### Inter-Agent Messages
```typescript
interface AgentMessage {
  from: AgentRole;
  to: AgentRole;
  type: 'data_request' | 'data_response' | 'input_needed' | 'phase_complete' | 'optimize_ui';
  payload: any;
  context: TaskContext;
}
```

### Input Request Flow
```typescript
// 1. Agent identifies need
const inputNeeded: AgentMessage = {
  from: AgentRole.DATA_COLLECTION,
  to: AgentRole.ORCHESTRATOR,
  type: 'input_needed',
  payload: {
    field: 'business.ein',
    reason: 'Required for tax compliance verification',
    prompt: buildEINPrompt()
  },
  context: currentTaskContext
};

// 2. Orchestrator processes and pauses task
orchestrator.handleInputRequest(inputNeeded);
// → Generates UI prompt
// → Updates task status to 'paused_for_input'
// → Sends to frontend

// 3. Frontend dynamically generates UI
// Based on InputRequest structure

// 4. User provides input
// → Frontend sends response

// 5. Orchestrator resumes
orchestrator.resumeWithInput(taskId, userInput);
// → Updates context
// → Notifies requesting agent
// → Continues processing
```

## Dynamic UI Generation from Semantic Data

### UI Layer Interprets Pure Data and Makes All Presentation Decisions:

```typescript
// UI Layer interprets semantic data and decides presentation
function DynamicTaskCard({ uiRequest }: { uiRequest: UIAugmentationRequest }) {
  const { metadata, dataNeeded, quickActions, context, requirementLevel } = uiRequest;
  
  // UI LAYER DECISION: How to present based on semantic data
  const presentationStrategy = determinePresentationStrategy(metadata, context);
  const [showOptional, setShowOptional] = useState(false);
  
  // Check if minimum requirements are met
  const canContinue = () => {
    return requirementLevel.minimumRequired.every(fieldId => 
      formData[fieldId] !== undefined && formData[fieldId] !== ''
    );
  };
  
  // Visual indicator for completion status
  const getCompletionStatus = () => {
    const required = requirementLevel.minimumRequired.filter(id => formData[id]).length;
    const recommended = requirementLevel.recommended.filter(id => formData[id]).length;
    const optional = requirementLevel.optional.filter(id => formData[id]).length;
    
    return {
      required: `${required}/${requirementLevel.minimumRequired.length}`,
      recommended: `${recommended}/${requirementLevel.recommended.length}`,
      optional: `${optional}/${requirementLevel.optional.length}`,
      canProceed: required === requirementLevel.minimumRequired.length
    };
  };
  
  return (
    <TaskCard theme={presentation.theme} position={presentation.position}>
      {/* Header with context and completion status */}
      <CardHeader>
        <Icon name={presentation.icon} />
        <Title>{presentation.title}</Title>
        {presentation.subtitle && <Subtitle>{presentation.subtitle}</Subtitle>}
        <CompletionIndicator status={getCompletionStatus()} />
        <ProgressBar value={context.progressPercentage} />
      </CardHeader>
      
      {/* Skip option if allowed */}
      {presentation.allowSkip && (
        <SkipOption onClick={handleSkip}>
          {presentation.skipLabel || "I'll do this later"}
        </SkipOption>
      )}
      
      {/* Action Pills for quick actions */}
      {actionPills && (
        <ActionPillContainer>
          {actionPills.map(pill => (
            <ActionPill
              key={pill.id}
              type={pill.type}
              icon={pill.icon}
              onClick={() => handlePillAction(pill.action)}
              visible={evaluateVisibility(pill.visibility)}
            >
              {pill.label}
            </ActionPill>
          ))}
        </ActionPillContainer>
      )}
      
      {/* Dynamic form sections with requirement indicators */}
      {formSections && (
        <FormContainer>
          {/* Required fields section */}
          <RequiredFieldsSection>
            <SectionHeader>
              <RequiredIcon /> Required Information
            </SectionHeader>
            {renderFieldsByRequirement('required')}
          </RequiredFieldsSection>
          
          {/* Recommended fields section */}
          {requirementLevel.recommended.length > 0 && (
            <RecommendedFieldsSection>
              <SectionHeader>
                <RecommendedIcon /> Recommended (helps us serve you better)
              </SectionHeader>
              {renderFieldsByRequirement('recommended')}
            </RecommendedFieldsSection>
          )}
          
          {/* Optional fields - collapsible */}
          {requirementLevel.optional.length > 0 && (
            <OptionalFieldsSection collapsed={!showOptional}>
              <SectionHeader onClick={() => setShowOptional(!showOptional)}>
                <OptionalIcon /> Optional Information
                <Badge>{requirementLevel.optional.length} fields</Badge>
                <ExpandIcon rotated={showOptional} />
              </SectionHeader>
              {showOptional && renderFieldsByRequirement('optional')}
            </OptionalFieldsSection>
          )}
        </FormContainer>
      )}
      
      {/* Context help with skip impact */}
      <HelpSection>
        <WhyNeeded>{context.whyNeeded}</WhyNeeded>
        {context.impactOfSkipping && (
          <SkipImpact>
            <InfoIcon /> If you skip optional fields: {context.impactOfSkipping}
          </SkipImpact>
        )}
        {context.helpText && <HelpText>{context.helpText}</HelpText>}
        <TimeEstimate>{context.estimatedTimeRemaining} remaining</TimeEstimate>
      </HelpSection>
      
      {/* Submit buttons with different states */}
      <CardActions>
        {!canContinue() && (
          <WarningMessage>
            Please complete required fields to continue
          </WarningMessage>
        )}
        
        <Button 
          onClick={handleSubmit} 
          variant="primary"
          disabled={!canContinue()}
        >
          Continue
        </Button>
        
        {responseConfig.partialSubmitAllowed && canContinue() && (
          <Button 
            onClick={handlePartialSubmit} 
            variant="secondary"
          >
            Continue with minimum info
          </Button>
        )}
      </CardActions>
    </TaskCard>
  );
}

// UI Layer decides how to render based on semantic type
function renderDataField(dataField: DataField) {
  // UI DECISION: Choose component based on semantic type and constraints
  const component = selectComponentForSemanticType(dataField.semanticType, dataField.dataType);
  
  // UI DECISION: Determine visual treatment
  const visualTreatment = {
    showAsRequired: dataField.constraints?.required,
    emphasize: requirementLevel.minimumRequired.includes(dataField.id),
    deemphasize: requirementLevel.optional.includes(dataField.id)
  };
  
  // UI DECISION: Choose input method
  switch (dataField.semanticType) {
    case 'business_entity_type':
      // UI decides: Radio buttons for < 5 options, dropdown for more
      return dataField.constraints?.enumValues?.length < 5 
        ? <RadioGroup options={dataField.constraints.enumValues} />
        : <Dropdown options={dataField.constraints.enumValues} />;
    
    case 'federal_tax_id':
      // UI decides: Masked input with formatting
      return <MaskedInput pattern={dataField.constraints?.pattern} />;
    
    case 'us_state':
      // UI decides: Autocomplete for better UX
      return <StateAutocomplete />;
    
    default:
      // UI decides: Simple text input
      return <TextInput constraints={dataField.constraints} />;
  }
}

// UI interprets relationships to determine field grouping
function groupFieldsByRelationships(dataFields: DataField[]) {
  // UI DECISION: Group dependent fields together
  const groups = [];
  dataFields.forEach(field => {
    if (field.relationships?.dependsOn) {
      // Place near dependencies
      const dependencyGroup = findOrCreateGroup(field.relationships.dependsOn[0]);
      dependencyGroup.push(field);
    }
  });
  return groups;
}
```

## Generic Task Template Structure (Declarative)

```yaml
# templates/task_template.yaml
task_type: {task_type}
version: 1.0

# WHAT to achieve, not HOW
goals:
  primary:
    - {goal_id}: "{description_of_desired_outcome}"
  secondary:
    - {goal_id}: "{nice_to_have_outcome}"

# How we know we succeeded
success_criteria:
  required:
    - {criterion}: {measurable_condition}
  optional:
    - {criterion}: {additional_condition}

# Context that affects execution
context_factors:
  - {factor_name}: "{possible_values}"

# Resources available
data_sources:
  - {source_name}: "{description}"

# Boundaries
constraints:
  {constraint_name}: {value}

# Optimization hints
preferences:
  {preference_name}: {boolean_or_value}
```

## Example: SOI Filing Task (Declarative)

```yaml
task_type: soi_filing
version: 1.0

goals:
  primary:
    - file_statement_of_information: "Submit SOI to CA Secretary of State"
    - update_business_records: "Ensure all business info is current"
    - obtain_confirmation: "Get filing confirmation number"
  
  secondary:
    - minimize_filing_fee: "Use most cost-effective filing method"
    - archive_documents: "Store copies for record keeping"

success_criteria:
  required:
    - soi_filed: true
    - confirmation_number: received
    - filing_deadline_met: true
  
  optional:
    - fee_minimized: true
    - documents_archived: true

context_factors:
  - entity_type: "llc | corporation"
  - filing_status: "initial | biennial"
  - business_changes: "none | address | officers | ownership"
  - urgency: "standard | expedited"

data_sources:
  - business_records: "Internal database"
  - ca_sos_api: "California Secretary of State"
  - quickbooks: "Financial records"
  - user_confirmation: "User verification of data"

constraints:
  deadline: "{calculated_based_on_formation_date}"
  max_attempts: 3
  budget: "$25_standard_or_$50_expedited"

preferences:
  auto_file_if_no_changes: true
  request_user_review: true
  use_existing_credentials: true
```

## How Tasks Adapt to Context

The same task declaration produces different execution plans:

### For a Simple CA LLC with No Changes:
```yaml
orchestrator_decision:
  - Agents needed: [legal_compliance, agency_interaction]
  - User input needed: None (auto-file)
  - Estimated time: 2 minutes
  - Steps: Verify data → Submit → Confirm
```

### For a CA Corp with Officer Changes:
```yaml
orchestrator_decision:
  - Agents needed: [data_collection, legal_compliance, agency_interaction, communication]
  - User input needed: New officer details
  - Estimated time: 10 minutes
  - Steps: Collect changes → Verify → Review with user → Submit → Confirm
```

### For an Expedited Filing Near Deadline:
```yaml
orchestrator_decision:
  - Agents needed: [legal_compliance, payment, agency_interaction, monitoring]
  - User input needed: Payment authorization
  - Estimated time: 5 minutes
  - Steps: Expedited payment → Priority submission → Real-time monitoring
```

## Task Initiation Patterns

### User-Initiated Tasks (Frontend → Backend)
Examples: Onboarding, Manual filing requests, Document generation
```
User Action → Frontend API Call → Task Creation → Agent Processing
```

### System-Initiated Tasks (Scheduler → Backend)
Examples: Compliance deadlines, Renewal reminders, Periodic checks
```
Cron/Scheduler → Task Creation → Agent Processing → Notify User if Input Needed
```

Both patterns converge into the same agent orchestration flow once the task is created.

## Critical Design Principles

### 1. Maximize Autonomous Operation
- Agents should exhaust all autonomous options before requesting input
- Use inference, public data, and defaults where possible
- Batch input requests to minimize interruptions

### 2. Progressive Context Building
- Each phase builds on previous context
- Agents share discoveries through sharedContext
- No redundant data requests

### 3. Dynamic UI from Structured Data
- Frontend never has hardcoded onboarding screens
- All UI generated from InputRequest structures
- Enables A/B testing and personalization

### 4. Pauseable and Resumable
- Task can pause at any point for input
- State fully preserved in TaskContext
- Can resume days later from exact same point

### 5. Agent Independence
- Agents don't know about UI implementation
- They only generate structured input needs
- Orchestrator translates to UI prompts

## Implementation Requirements (MVP)

### Technology Stack
1. **Agent Communication**: A2A Protocol by Google (https://github.com/a2aproject/a2a-js)
   - Each agent runs as separate network service
   - Built-in tenant isolation support
   - Dynamic agent discovery
   - Streaming updates via SSE
2. **Authentication**: Google OAuth via Supabase (ALREADY IMPLEMENTED in frontend)
   - JWT tokens for RLS enforcement
   - Session user tracking
3. **Orchestrator**: LLM-powered (GPT-4 or Claude) with structured prompts
   - Dynamic execution planning
   - Tenant-aware agent selection
4. **External APIs**: 
   - California Business Connect (CBC) API for entity lookups
   - Google OAuth/Supabase for authentication
5. **Task Atomicity**: Tasks are atomic - complete or fail (no partial states)
6. **Multi-Tenant Security**:
   - Supabase RLS for data isolation
   - A2A protocol tenant validation
   - Comprehensive audit logging

### Backend (MVP Implementation with Multi-Tenant Security)
```typescript
// STUB: Onboarding Task Engine with Tenant Isolation
class OnboardingTaskEngine {
  // TODO: Implement A2A protocol integration
  private a2aClient: any; // STUB - integrate a2a-js
  
  // TODO: Connect to Supabase auth with tenant isolation
  async createOnboardingTask(googleAuthData: any, businessId?: string) {
    // STUB: Create task from Google/Supabase auth data with tenant context
    const taskContext: TaskContext = {
      taskId: generateTaskId(),
      taskType: 'onboarding',
      userId: googleAuthData.sub,
      userToken: googleAuthData.access_token,
      status: 'active',
      
      // Multi-tenant context
      tenantContext: {
        businessId: businessId || generateBusinessId(),
        sessionUserId: googleAuthData.sub,
        dataScope: 'user', // During onboarding, scope to user
        allowedAgents: ['orchestrator', 'data_collection', 'legal_compliance'],
        tenantName: `${googleAuthData.given_name}'s Business`,
        isolationLevel: 'strict'
      },
      
      sharedContext: {
        user: {
          email: googleAuthData.email,
          firstName: googleAuthData.given_name,
          lastName: googleAuthData.family_name,
          googleId: googleAuthData.sub
        }
      },
      agentContexts: {}
    };
    
    // Audit task creation
    await this.auditLog('onboarding_started', taskContext);
    
    return taskContext;
  }
  
  // STUB: CBC API Integration
  async lookupBusinessEntity(businessName: string, state: string = 'CA') {
    // TODO: Implement actual CBC API call
    // https://calicodev.sos.ca.gov/api-details#api=cbc-apis-prod-v1&operation=entity-details
    console.log('STUB: Would call CBC API for entity lookup');
    return null;
  }
  
  // STUB: Error escalation
  async escalateToSupport(taskId: string, error: any) {
    // TODO: Implement escalation to Allyn.ai support staff
    console.log('STUB: Escalating to human support at Allyn.ai', { taskId, error });
    // TODO: Send notification to support dashboard
    // TODO: Create support ticket
    // TODO: Pause task and mark for human review
  }
}
```

### Frontend Integration Points (MVP)
```typescript
// STUB: Connect existing Google Auth to Onboarding
interface GoogleAuthToOnboarding {
  // This already exists in frontend/Supabase
  googleProfile: {
    sub: string;
    email: string;
    given_name: string;
    family_name: string;
    picture?: string;
  };
  
  // TODO: Add onboarding trigger after successful Google auth
  async initiateOnboarding() {
    // STUB: Call backend to create onboarding task
    const response = await fetch('/api/v2/tasks', {
      method: 'POST',
      body: JSON.stringify({
        taskType: 'onboarding',
        googleProfile: this.googleProfile
      })
    });
    
    // TODO: Handle task creation response
    // TODO: Show onboarding UI
  }
}
```

### Missing Components to Implement (MVP STUBS)

#### 1. LLM-Powered Orchestrator with A2A (MVP)
```typescript
// STUB: A2A Orchestrator Agent with LLM and Tenant Isolation
class A2AOrchestratorAgent extends BaseA2AAgent {
  private llm: any; // TODO: Integrate OpenAI/Claude API
  
  async interpretTask(taskDeclaration: any, context: TaskContext) {
    // Validate tenant access first
    this.validateTenantAccess(context.tenantContext);
    
    // STUB: Generate LLM prompt with tenant awareness
    const prompt = `
      Given this onboarding task declaration:
      ${JSON.stringify(taskDeclaration)}
      
      And current context for tenant ${context.tenantContext.businessId}:
      ${JSON.stringify(context)}
      
      Determine:
      1. Which agents are needed (from allowed: ${context.tenantContext.allowedAgents})
      2. What data to gather first
      3. Whether to request user input or try CBC API first
      
      IMPORTANT: All data access must be scoped to businessId: ${context.tenantContext.businessId}
      
      Response format: { agents: [], nextAction: '', dataNeeded: [] }
    `;
    
    // TODO: Call LLM API
    console.log('STUB: Would send prompt to LLM', prompt);
    
    // MVP: Hardcoded response for testing
    return {
      agents: ['data_collection', 'legal_compliance'].filter(
        agent => context.tenantContext.allowedAgents.includes(agent)
      ),
      nextAction: 'check_cbc_api',
      dataNeeded: ['businessName', 'entityType']
    };
  }
  
  // STUB: Handle task failure
  async handleTaskFailure(taskId: string, error: any) {
    // MVP: Always escalate to human support
    await this.escalateToSupport(taskId, error);
  }
}
```

#### 2. A2A Data Collection Agent with CBC Integration (MVP)
```typescript
// STUB: A2A Data Collection Agent with Tenant Isolation
class A2ADataCollectionAgent extends BaseA2AAgent {
  // STUB: Try CBC API first, fall back to user input
  async gatherBusinessData(task: A2ATask) {
    // Validate tenant access
    this.validateTenantAccess(task.tenantContext);
    
    const businessName = task.input.businessName;
    const { businessId, sessionUserId } = task.tenantContext;
    
    if (businessName) {
      // TODO: Try CBC API lookup with audit
      const cbcData = await this.searchCBC(businessName, businessId);
      if (cbcData) {
        // Audit successful data collection
        await this.auditLog('cbc_data_retrieved', { 
          businessId, 
          source: 'cbc_api' 
        });
        
        return {
          status: 'complete',
          data: cbcData,
          tenantId: businessId
        };
      }
    }
    
    // STUB: Need user input - create tenant-scoped request
    return {
      status: 'needs_input',
      uiRequest: this.createBusinessInfoRequest(task.tenantContext)
    };
  }
  
  // STUB: CBC API Search
  async searchCBC(businessName: string) {
    // TODO: Implement actual CBC API call
    // API: https://calicodev.sos.ca.gov/api-details
    console.log('STUB: Searching CBC for', businessName);
    
    // MVP: Return null to trigger user input
    return null;
    
    /* TODO: Real implementation
    const response = await fetch('https://api.sos.ca.gov/cbc/v1/entities/search', {
      headers: {
        'Authorization': 'Bearer ' + CBC_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ businessName, state: 'CA' })
    });
    */
  }
  
  // STUB: Create UI request for missing data with tenant context
  createBusinessInfoRequest(tenantContext: TenantContext): UIAugmentationRequest {
    return {
      agentRole: 'data_collection',
      requestId: generateId(),
      timestamp: new Date().toISOString(),
      
      // Tenant-specific context
      tenantContext: {
        businessId: tenantContext.businessId,
        sessionUserId: tenantContext.sessionUserId
      },
      
      metadata: {
        purpose: 'Collect business information for onboarding',
        urgency: 'high',
        category: 'business_identity',
        allowSkip: false,
        skipConsequence: 'Cannot complete onboarding without business info',
        tenantName: tenantContext.tenantName
      },
      requirementLevel: {
        minimumRequired: ['businessName', 'entityType'],
        recommended: ['ein'],
        optional: ['website'],
        conditionallyRequired: []
      },
      dataNeeded: [
        // Business name and entity type fields...
      ],
      // ... rest of UI request
    };
  }
}
```

#### 3. A2A Protocol Integration with Multi-Tenant Support (MVP STUB)
```typescript
// STUB: A2A Protocol wrapper with tenant isolation
import { A2A } from 'a2a-js'; // TODO: Install and configure

class TenantAwareA2ACommunication {
  private a2a: any;
  
  constructor() {
    // TODO: Initialize A2A protocol
    // this.a2a = new A2A({ ... });
    console.log('STUB: A2A protocol would be initialized here');
  }
  
  // STUB: Send message between agents with tenant validation
  async sendMessage(from: string, to: string, message: any, tenantContext: TenantContext) {
    // Validate both agents are allowed for this tenant
    if (!tenantContext.allowedAgents.includes(from) || 
        !tenantContext.allowedAgents.includes(to)) {
      throw new Error('Agent not authorized for tenant');
    }
    
    // TODO: Implement actual A2A message sending with tenant context
    console.log(`STUB: A2A message from ${from} to ${to} for tenant ${tenantContext.businessId}:`, message);
    
    /* TODO: Real implementation with tenant isolation
    await this.a2a.send({
      from: from,
      to: to,
      payload: message,
      tenantContext: tenantContext, // A2A protocol includes tenant context
      protocol: 'a2a',
      headers: {
        'X-Tenant-ID': tenantContext.businessId,
        'X-Session-User': tenantContext.sessionUserId
      }
    });
    */
    
    // Audit inter-agent communication
    await this.auditLog('agent_communication', {
      from, to,
      tenantId: tenantContext.businessId,
      messageType: message.type
    });
  }
}
```

#### 4. Task Persistence (MVP)
```typescript
// STUB: Task storage in Supabase
class TaskPersistence {
  // TODO: Connect to Supabase
  async saveTaskContext(context: TaskContext) {
    // STUB: Save to Supabase
    console.log('STUB: Would save task to Supabase', context.taskId);
    
    /* TODO: Real implementation
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        id: context.taskId,
        user_id: context.userId,
        type: context.taskType,
        status: context.status,
        context: context
      });
    */
  }
  
  // STUB: Load task for resume
  async loadTaskContext(taskId: string): Promise<TaskContext | null> {
    // TODO: Load from Supabase
    console.log('STUB: Would load task from Supabase', taskId);
    return null;
  }
}
```

#### 5. Support Escalation (MVP)
```typescript
// STUB: Escalation to Allyn.ai support
class SupportEscalation {
  async escalate(taskId: string, reason: string, context: any) {
    // TODO: Implement actual escalation
    console.log('STUB: Escalating to Allyn.ai support', {
      taskId,
      reason,
      timestamp: new Date().toISOString()
    });
    
    // MVP: Log error and mark task as failed
    // TODO: Send to support dashboard
    // TODO: Create Zendesk/Intercom ticket
    // TODO: Send Slack notification to support team
    
    return {
      escalationId: generateId(),
      status: 'escalated',
      supportTeam: 'allyn.ai'
    };
  }
}
```

### MVP Implementation Checklist

#### Phase 1: Core Infrastructure (Week 1)
- [ ] Install and configure a2a-js
- [ ] Set up LLM API (OpenAI/Claude)
- [ ] Connect to existing Supabase auth
- [ ] Create task persistence schema

#### Phase 2: Basic Agents (Week 2)
- [ ] Implement Orchestrator with LLM prompts
- [ ] Create Data Collection agent stub
- [ ] Set up CBC API integration (sandbox)
- [ ] Build error escalation to Allyn.ai

#### Phase 3: Integration (Week 3)
- [ ] Connect Google Auth to onboarding flow
- [ ] Implement pause/resume with Supabase
- [ ] Create basic UI request/response flow
- [ ] Add support escalation triggers

### TODOs for Post-MVP

1. **Scale Agent Communication**
   - TODO: Implement full A2A protocol features
   - TODO: Add message queuing for reliability
   - TODO: Implement agent discovery mechanism

2. **Enhance External Integrations**
   - TODO: Add more state APIs beyond California
   - TODO: Integrate QuickBooks for business data
   - TODO: Add IRS database lookups

3. **Improve Error Handling**
   - TODO: Add retry logic before escalation
   - TODO: Implement partial task recovery
   - TODO: Add automated error resolution

4. **Optimize LLM Usage**
   - TODO: Cache common LLM responses
   - TODO: Fine-tune prompts for efficiency
   - TODO: Add fallback to rule-based logic

5. **Production Readiness**
   - TODO: Add comprehensive logging
   - TODO: Implement monitoring/alerting
   - TODO: Add performance metrics
   - TODO: Set up A/B testing framework

### Data Flow
```
1. User triggers task → Backend creates TaskContext
2. Agents work autonomously → Build context
3. Agent needs input → Creates InputRequest
4. Orchestrator pauses task → Sends prompt to frontend
5. Frontend shows UI → User provides input
6. Input sent to backend → Task resumes
7. Repeat until complete
```

## Success Metrics

### Efficiency Metrics
- **Autonomous Completion Rate**: % of data gathered without user input
- **Input Requests per Task**: Target < 5
- **Time in Headless Mode**: > 80% of total task time
- **Pause Duration**: < 2 minutes average

### User Experience Metrics
- **Task Completion Rate**: > 90%
- **Abandonment at Input**: < 10%
- **Time to Complete**: < 3 minutes active user time
- **Return Rate**: < 15% (most complete in one session)

## Example: Complete Onboarding Flow

```
1. User clicks "Sign up with Google" in UI
   → Frontend initiates OAuth flow
   → Google returns: John Doe, john@techstartup.com
   → Frontend calls: POST /api/v2/tasks with user data
   → Backend creates task, returns taskId
   → Frontend shows "Setting up your account..." spinner

2. Backend agents work autonomously:
   → System extracts: John Doe, john@techstartup.com
   → Searches for "techstartup" in business databases
   → Finds nothing definitive
   → Status: Need more info

3. System pauses with InputRequest:
   "What type of business is TechStartup?"
   → User selects: "LLC"
   → System resumes

4. Background processing:
   → Legal agent identifies CA LLC requirements
   → Data agent checks for EIN in public records
   → Finds formation date in CA SOS database
   → Identifies missing: EIN, registered agent

5. System pauses with InputRequest:
   "Complete your business profile"
   - EIN/Tax ID
   - Registered Agent Name
   → User provides both
   → System resumes

6. Background finalization:
   → Generates compliance calendar
   → Creates LLC operating agreement template
   → Sets up SOI filing reminder
   → Sends welcome email
   → Task complete

Total user interaction: ~2 minutes
Total elapsed time: ~3 minutes
Background processing: ~1 minute
```

## MVP Implementation Summary

### What's Already Done
1. **Google OAuth**: Implemented in frontend via Supabase
2. **Authentication Flow**: Users can sign in with Google

### What Needs to Be Built (MVP)
1. **Connect Google Auth to Onboarding**: Trigger task creation after auth
2. **LLM Orchestrator**: Basic GPT-4/Claude integration for task planning
3. **CBC API Integration**: Entity lookup for California businesses
4. **A2A Protocol**: Agent communication using Google's a2a-js
5. **Error Escalation**: Direct to Allyn.ai support team

### MVP Simplifications
1. **California Only**: Start with CBC API, expand states later
2. **Google Auth Only**: No email/password for MVP
3. **Atomic Tasks**: No partial states - complete or escalate
4. **Human Fallback**: Any error escalates to support
5. **Stubbed Agents**: Only Orchestrator and Data Collection for MVP

### Critical Path for MVP Onboarding
```
1. User signs in with Google (DONE)
2. Frontend calls POST /api/v2/tasks/onboarding (TODO)
3. Backend creates TaskContext from Google profile (TODO)
4. Orchestrator (LLM) determines plan (TODO)
5. Data Collection agent tries CBC API (TODO)
6. If no CBC data → Request user input (TODO)
7. Complete onboarding or escalate to support (TODO)
```

### Success Criteria (MVP)
- User can complete onboarding with Google auth
- Dashboard loads with Onboarding Card overlay
- Card handles all agent interactions seamlessly
- System attempts CBC lookup before asking user
- Failed tasks escalate to Allyn.ai support
- Task state persists in Supabase for resume
- Card dismisses smoothly when onboarding completes

### Onboarding Card Component Specifications

```typescript
interface OnboardingCardProps {
  taskId: string;                    // Backend task ID
  fullScreen: boolean;               // Always true for onboarding
  onComplete: () => void;            // Dismiss card handler
  initialData?: {                    // Pre-filled from Google
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface OnboardingCardFeatures {
  // Visual Design
  backdrop: 'blur' | 'dim';          // Dashboard visible but inactive
  animation: 'slide-up' | 'fade';    // Entry/exit animations
  responsive: true;                  // Mobile-friendly
  
  // Communication
  transport: 'websocket' | 'sse';    // Real-time updates
  reconnect: true;                   // Auto-reconnect on disconnect
  
  // User Experience
  progress: 'steps' | 'percentage';  // Progress indicator
  loading: 'spinner' | 'skeleton';   // Loading states
  errors: 'inline' | 'toast';        // Error display
  
  // State Management
  persistence: 'local' | 'session';  // Save progress locally
  resume: true;                      // Can resume if interrupted
}
```

**Card Behavior**:
1. **Entry**: Slides up or fades in over dashboard
2. **Interaction**: All agent requests shown within card
3. **Loading**: Shows contextual loading between steps
4. **Completion**: Success screen, then fades away
5. **Error**: Graceful degradation with support option

## Conclusion

This PRD defines an ambitious agent-orchestrated system with a clear MVP path. The MVP focuses on:
1. **Proven technologies**: A2A protocol, Supabase, LLM APIs
2. **Single integration**: CBC API for California entities
3. **Human safety net**: Allyn.ai support escalation
4. **Atomic simplicity**: Tasks either complete or escalate

Post-MVP iterations will add more agents, integrations, and autonomous capabilities as outlined in the TODOs. The architecture supports this growth through its declarative task system and generic TaskContext structure.

## Key Benefits of the UIAugmentationRequest Format

1. **Agent Autonomy**: Agents can request complex UI interactions without knowing implementation details
2. **Action Pills Integration**: Quick actions via pills reduce friction for common choices
3. **Progressive Disclosure**: Fields can be conditionally shown based on previous inputs
4. **Validation Flexibility**: Both client-side and server-side validation rules
5. **Context Preservation**: All responses automatically update the TaskContext
6. **Metrics Collection**: Built-in interaction tracking for optimization
7. **Theme Consistency**: Presentation metadata ensures UI consistency

This JSON-based communication format enables agents to dynamically request UI components that expand beyond simple forms, incorporating Action Pills, conditional logic, and rich interactions while maintaining a clean separation between agent logic and UI implementation.

## A2A Protocol Integration

### Industry-Standard Agent Communication

The system is built on Google's A2A (Agent-to-Agent) protocol, providing:
- **Standardized agent communication** across network boundaries
- **Dynamic agent discovery** based on required skills
- **Future-proof architecture** for third-party agent integration
- **Built-in streaming** for real-time task updates
- **Multi-tenant isolation** at the protocol level

### A2A Implementation Architecture

```typescript
// Each agent runs as a separate A2A service with tenant isolation
// orchestrator-agent/index.ts
const orchestratorAgent = new A2AServer({
  port: 3000,
  agentCard: {
    id: 'orchestrator-agent',
    name: 'Master Orchestrator',
    skills: ['task_planning', 'agent_coordination', 'ui_generation'],
    endpoints: {
      tasks: '/a2a/tasks',
      status: '/a2a/status',
      discover: '/a2a/discover'
    },
    // Multi-tenant support
    tenantIsolation: true,
    dataScoping: 'strict'
  }
});

// data-collection-agent/index.ts
const dataCollectionAgent = new A2AServer({
  port: 3001,
  agentCard: {
    id: 'data-collection-agent',
    name: 'Data Collection Specialist',
    skills: ['form_filling', 'data_validation', 'cbc_api', 'quickbooks'],
    endpoints: {
      tasks: '/a2a/tasks',
      status: '/a2a/status'
    },
    tenantIsolation: true
  }
});
```

### Dynamic Agent Discovery & LLM Orchestration

```typescript
class A2AOrchestrator {
  async executeDynamicPlan(goals: Goal[], context: TaskContext) {
    // 1. Discover available agents dynamically
    const agents = await this.a2aClient.discoverAgents({
      skills: this.llm.identifyRequiredSkills(goals),
      status: 'available',
      // Multi-tenant: Only discover agents authorized for this tenant
      tenantId: context.tenantContext.businessId
    });
    
    // 2. LLM creates execution plan based on available agents
    const plan = await this.llm.createExecutionPlan({
      goals,
      availableAgents: agents.map(a => a.agentCard),
      context,
      constraints: {
        tenantId: context.tenantContext.businessId,
        dataScope: context.tenantContext.dataScope,
        sessionUser: context.tenantContext.sessionUserId
      }
    });
    
    // 3. Execute plan with tenant isolation enforced at every step
    for (const step of plan.steps) {
      const task = {
        type: step.taskType,
        input: step.input,
        // Tenant context passed to every agent via A2A protocol
        tenantContext: context.tenantContext,
        metadata: {
          uiAugmentation: step.uiRequest,
          orchestrationContext: step.context,
          auditTrail: true
        }
      };
      
      // A2A ensures tenant isolation during execution
      const result = await this.executeA2ATask(step.agentId, task);
    }
  }
}
```

### UI Augmentation via A2A Protocol

UI augmentation requests are embedded in A2A task metadata:

```typescript
interface A2ATaskWithUIAugmentation extends A2ATask {
  // Standard A2A fields
  id: string;
  type: string;
  input: any;
  
  // Multi-tenant context (required)
  tenantContext: {
    businessId: string;
    sessionUserId?: string;
    dataScope: 'user' | 'business';
    allowedAgents: string[];
    userToken: string; // JWT for RLS
  };
  
  // UI augmentation in metadata
  metadata: {
    uiAugmentation?: UIAugmentationRequest;
    orchestrationContext?: any;
    auditRequired: boolean;
  };
}

// Agent returns UI request via A2A with tenant validation
class DataCollectionA2AAgent extends A2AAgent {
  async executeTask(task: A2ATaskWithUIAugmentation): Promise<A2ATaskResult> {
    // A2A protocol enforces tenant validation
    this.validateTenantAccess(task.tenantContext);
    
    // Generate semantic UI request scoped to tenant
    const uiRequest = this.generateUIRequest(task.input, task.tenantContext);
    
    return {
      status: 'pending_user_input',
      result: {
        uiAugmentation: {
          action: 'request',
          data: uiRequest,
          tenantId: task.tenantContext.businessId
        }
      }
    };
  }
}
```

## Multi-Tenant Security Architecture

### Core Security Principles

1. **Strict Data Isolation**: Each task operates within a tenant boundary (business)
2. **Session User Scoping**: UI interactions are scoped to the current session user
3. **Agent Access Control**: Agents can only access tasks they're authorized for
4. **Zero Trust**: Every agent validates tenant access on every operation
5. **Audit Everything**: All agent actions are logged with full tenant context

### Multi-Tenant TaskContext

```typescript
interface TaskContext {
  // Core task identification
  taskId: string;
  taskType: string;
  userId: string;      // Business owner/primary user
  userToken: string;   // JWT for RLS enforcement
  
  // Multi-tenant security context (NEW)
  tenantContext: {
    businessId: string;          // Primary tenant identifier
    sessionUserId?: string;      // Current session user (for UI interactions)
    dataScope: 'user' | 'business'; // Access boundary
    allowedAgents: string[];     // Which agents can access this task
    tenantName?: string;         // For audit trails
    isolationLevel: 'strict' | 'standard'; // Compliance requirement
  };
  
  // Rest of TaskContext remains the same...
  status: 'active' | 'paused_for_input' | 'completed' | 'failed';
  sharedContext: any;
  agentContexts: any;
}
```

### Tenant Isolation Implementation

```typescript
// Every A2A agent enforces tenant isolation
class BaseA2AAgent {
  async executeTask(task: A2ATask): Promise<A2ATaskResult> {
    // 1. Validate tenant access (enforced by A2A protocol)
    if (!this.validateTenantAccess(task.tenantContext)) {
      throw new A2ATenantAccessError('Tenant access denied');
    }
    
    // 2. Create tenant-scoped database connection
    const db = this.createTenantScopedDB(task.tenantContext);
    
    // 3. Execute with isolated context
    const result = await this.executeWithTenantContext(task, db);
    
    // 4. Audit the access
    await this.auditAccess(task, result);
    
    return result;
  }
  
  private validateTenantAccess(context: TenantContext): boolean {
    // Verify agent is in allowedAgents list
    if (!context.allowedAgents.includes(this.agentId)) {
      logger.security('Agent access denied', { 
        agent: this.agentId, 
        tenant: context.businessId 
      });
      return false;
    }
    
    // Verify session user matches if UI-initiated
    if (context.sessionUserId && !this.validateSessionUser(context)) {
      logger.security('Session user mismatch', { 
        expected: context.sessionUserId,
        tenant: context.businessId 
      });
      return false;
    }
    
    return true;
  }
  
  private createTenantScopedDB(context: TenantContext) {
    // Use Supabase RLS with user token
    // This ensures database-level isolation
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${context.userToken}`,
          'X-Tenant-ID': context.businessId, // Additional header for logging
          'X-Session-User': context.sessionUserId || 'system'
        }
      }
    });
  }
}
```

### Data Access Patterns with Tenant Isolation

```typescript
// Orchestrator ensures tenant context propagation
class TenantAwareOrchestrator {
  async createTask(request: CreateTaskRequest): Promise<TaskContext> {
    // Validate request has proper tenant context
    if (!request.businessId || !request.userId) {
      throw new Error('Tenant context required');
    }
    
    // Extract tenant context from request
    const tenantContext: TenantContext = {
      businessId: request.businessId,
      sessionUserId: request.sessionUserId || request.userId,
      dataScope: request.dataScope || 'business',
      allowedAgents: this.determineAllowedAgents(request.taskType),
      tenantName: request.businessName,
      isolationLevel: 'strict' // Always strict for MVP
    };
    
    // Create task with tenant context
    const task: TaskContext = {
      taskId: generateId(),
      taskType: request.taskType,
      userId: request.userId,
      userToken: request.userToken, // JWT from auth
      tenantContext, // This travels with the task everywhere
      status: 'active',
      sharedContext: {
        // Only data for this tenant
        business: {
          id: request.businessId,
          name: request.businessName
        }
      },
      agentContexts: {}
    };
    
    // Audit task creation
    await this.auditLog('task_created', task);
    
    return task;
  }
  
  private determineAllowedAgents(taskType: string): string[] {
    // Define which agents can access which task types
    const agentPermissions = {
      'onboarding': ['orchestrator', 'data_collection', 'legal_compliance'],
      'soi-filing': ['orchestrator', 'legal_compliance', 'payment', 'agency_interaction'],
      'renewal': ['orchestrator', 'monitoring', 'payment']
    };
    
    return agentPermissions[taskType] || ['orchestrator'];
  }
}
```

### Audit Trail for Compliance

```typescript
// All agent actions are audited with tenant context
interface AuditEntry {
  id: string;
  timestamp: Date;
  agentId: string;
  taskId: string;
  tenantContext: {
    businessId: string;
    sessionUserId?: string;
    tenantName?: string;
  };
  action: string;
  details: any;
  dataAccessed: string[]; // Which tenant data was accessed
  ipAddress?: string;
  userAgent?: string;
}

// Automatic audit logging in A2A base agent
class AuditedA2AAgent extends BaseA2AAgent {
  async executeTask(task: A2ATask): Promise<A2ATaskResult> {
    const startTime = Date.now();
    const auditEntry: AuditEntry = {
      id: generateId(),
      timestamp: new Date(),
      agentId: this.agentId,
      taskId: task.id,
      tenantContext: {
        businessId: task.tenantContext.businessId,
        sessionUserId: task.tenantContext.sessionUserId,
        tenantName: task.tenantContext.tenantName
      },
      action: 'task_execution_started',
      details: { taskType: task.type },
      dataAccessed: []
    };
    
    try {
      // Track all data access
      const dbProxy = this.createAuditedDBProxy(task.tenantContext, auditEntry);
      const result = await this.executeWithDB(task, dbProxy);
      
      auditEntry.action = 'task_execution_completed';
      auditEntry.details.duration = Date.now() - startTime;
      await this.logAudit(auditEntry);
      
      return result;
    } catch (error) {
      auditEntry.action = 'task_execution_failed';
      auditEntry.details.error = error.message;
      await this.logAudit(auditEntry);
      throw error;
    }
  }
  
  private createAuditedDBProxy(context: TenantContext, audit: AuditEntry) {
    const db = this.createTenantScopedDB(context);
    
    // Wrap DB calls to track data access
    return new Proxy(db, {
      get(target, prop) {
        if (typeof target[prop] === 'function') {
          return (...args) => {
            // Log which tables/data are accessed
            if (prop === 'from') {
              audit.dataAccessed.push(`table:${args[0]}`);
            }
            return target[prop](...args);
          };
        }
        return target[prop];
      }
    });
  }
}
```

### Preventing Cross-Tenant Data Leakage

```typescript
// Example: Data Collection Agent with strict tenant isolation
class TenantIsolatedDataCollectionAgent extends AuditedA2AAgent {
  async gatherBusinessData(task: A2ATask) {
    const { businessId, userToken } = task.tenantContext;
    
    // 1. Only query data for this specific tenant
    const db = this.createTenantScopedDB(task.tenantContext);
    
    // 2. Supabase RLS automatically filters by auth.uid()
    const { data: businessData, error } = await db
      .from('businesses')
      .select('*')
      .eq('id', businessId) // Extra safety: explicit business filter
      .single();
    
    if (error) {
      // Never expose data from error messages
      logger.error('Failed to fetch business data', { 
        businessId, 
        error: error.code // Only log error code, not message
      });
      throw new Error('Data access error');
    }
    
    // 3. Validate data belongs to requesting tenant
    if (businessData && businessData.id !== businessId) {
      // Critical security event
      logger.security('CRITICAL: Cross-tenant data returned', {
        expected: businessId,
        received: businessData.id
      });
      throw new Error('Security validation failed');
    }
    
    // 4. Only return data for this tenant
    return {
      status: 'complete',
      data: this.sanitizeTenantData(businessData, businessId)
    };
  }
  
  private sanitizeTenantData(data: any, expectedTenantId: string) {
    // Remove any fields that might contain other tenant data
    const safe = { ...data };
    delete safe.internal_notes;
    delete safe.cross_references;
    
    // Validate all IDs match expected tenant
    if (safe.business_id && safe.business_id !== expectedTenantId) {
      throw new Error('Data validation failed');
    }
    
    return safe;
  }
}
```

### Session-Specific UI Interactions

```typescript
// UI requests are scoped to session user
class SessionAwareUIGeneration {
  generateUIRequest(
    task: A2ATask,
    dataNeeded: DataField[]
  ): UIAugmentationRequest {
    const { sessionUserId, businessId } = task.tenantContext;
    
    return {
      agentRole: this.agentId,
      requestId: generateId(),
      timestamp: new Date().toISOString(),
      
      // Session-specific metadata
      sessionContext: {
        userId: sessionUserId,
        businessId: businessId,
        requestTime: new Date().toISOString()
      },
      
      // Only show data relevant to this session/business
      presentation: {
        title: `Update information for ${task.tenantContext.tenantName}`,
        subtitle: `Logged in as: ${sessionUserId}`
      },
      
      // Data fields with tenant context
      formSections: this.generateTenantScopedFields(dataNeeded, businessId),
      
      // Response must include session validation
      responseConfig: {
        validateSession: true,
        sessionUserId: sessionUserId,
        tenantId: businessId
      }
    };
  }
}
```

### Multi-Tenant Best Practices

1. **Never Trust, Always Verify**: Every agent validates tenant access
2. **Use RLS Everywhere**: Database-level isolation via Supabase RLS
3. **Audit Everything**: Complete audit trail for compliance
4. **Session Validation**: UI interactions validate session user
5. **Fail Secure**: Any validation failure = access denied
6. **No Shared Caches**: Each tenant has isolated cache space
7. **Sanitize Errors**: Never expose other tenant data in errors

## Example: Multi-Agent Orchestration Flow

### Step 1: Agents Submit Their UI Needs

```javascript
// Legal Compliance Agent submits:
{
  "agentRole": "legal_compliance",
  "needs": ["industry", "business_activities", "has_employees"],
  "reasoning": "Required to determine applicable regulations"
}

// Data Collection Agent submits:
{
  "agentRole": "data_collection", 
  "needs": ["ein", "business_address", "phone", "website"],
  "reasoning": "Core business identity data"
}

// Payment Agent submits:
{
  "agentRole": "payment",
  "needs": ["bank_routing", "bank_account", "payment_method"],
  "reasoning": "Setup for fee payments"
}
```

### Step 2: UX Agent Optimizes

```javascript
// UX Agent analyzes and returns:
{
  "optimizedSequences": [
    {
      "sequenceId": "seq_1",
      "groupTitle": "Tell us about your business",
      "sections": [
        {
          "fields": ["industry", "business_activities", "has_employees", "website"],
          "originalAgents": ["legal_compliance", "data_collection"],
          "reasoning": "Grouped related business identity fields"
        }
      ],
      "actionPills": [
        {
          "label": "No employees yet",
          "action": { "skipFields": ["ein", "payroll_info"] }
        }
      ]
    },
    {
      "sequenceId": "seq_2", 
      "groupTitle": "Where is your business?",
      "sections": [
        {
          "fields": ["business_address", "phone"],
          "originalAgents": ["data_collection"],
          "reasoning": "Location data needed for licensing"
        }
      ],
      "skipIf": "business.isHomeBased === true"
    }
  ],
  "eliminated": ["bank_routing", "bank_account"], // Deferred to later
  "inferred": ["city", "state"], // From address
  "timeSaved": 120 // seconds
}
```

### Step 3: Orchestrator Presents Final UI Request

The Orchestrator validates the optimization and sends a single, coherent UI request to the frontend, ensuring:
- Critical fields aren't eliminated
- Dependencies are respected  
- The flow is logical and user-friendly
- Total time stays under 3 minutes

The UI layer simply renders what it receives - all intelligence resides in the agent layer.

## Requirement Levels in Practice

### Example: Data Collection Agent Request with Mixed Requirements

```json
{
  "agentRole": "data_collection",
  "requirementLevel": {
    "minimumRequired": ["businessName", "entityType", "state"],
    "recommended": ["ein", "businessAddress", "phone"],
    "optional": ["website", "socialMedia", "numberOfEmployees"],
    "conditionallyRequired": [
      {
        "fieldId": "ein",
        "condition": "numberOfEmployees > 0",
        "reason": "EIN is required if you have employees"
      }
    ]
  },
  "presentation": {
    "title": "Business Information",
    "allowSkip": false, // Can't skip required fields
    "skipLabel": "Setup later"
  },
  "formSections": [
    {
      "fields": [
        {
          "id": "businessName",
          "requirementLevel": "required",
          "requirementReason": "Legal name needed for all filings",
          "label": "Business Name",
          "config": {
            "showRequirementBadge": true
          }
        },
        {
          "id": "ein",
          "requirementLevel": "recommended",
          "requirementReason": "Needed for tax filings and banking",
          "label": "EIN/Tax ID",
          "config": {
            "optionalLabel": "(recommended - needed for taxes)",
            "helpText": "We can help you apply if you don't have one"
          },
          "conditionalRequirement": {
            "condition": "numberOfEmployees > 0",
            "reason": "Required by IRS for businesses with employees"
          }
        },
        {
          "id": "website",
          "requirementLevel": "optional",
          "requirementReason": "Helps verify business legitimacy",
          "label": "Website",
          "config": {
            "optionalLabel": "(optional)",
            "placeholder": "https://..."
          },
          "behavior": {
            "skipIfEmpty": true
          }
        }
      ]
    }
  ],
  "context": {
    "canContinueWithout": ["ein", "website", "phone"],
    "impactOfSkipping": "You can add tax and contact info later, but some features will be limited until complete"
  },
  "responseConfig": {
    "partialSubmitAllowed": true,
    "onPartialAction": "queue_followup"
  }
}
```

### UI Behavior Based on Requirements

1. **Required Fields**:
   - Red asterisk indicator
   - Cannot submit form without these
   - Clear error messages if missing
   - Top visual priority

2. **Recommended Fields**:
   - Yellow dot indicator
   - Can submit without, but shows warning
   - Tooltip explains why it's recommended
   - Middle visual priority

3. **Optional Fields**:
   - No indicator or "(optional)" label
   - Can be collapsed by default
   - No validation unless filled
   - Lower visual priority

4. **Conditionally Required**:
   - Dynamically changes from optional to required
   - Visual indicator updates in real-time
   - Clear explanation when requirement triggers

### Agent Intelligence for Requirements

The User Experience Agent optimizes requirement levels:

```yaml
optimization_rules:
  - Minimize required fields to reduce friction
  - Batch optional fields together
  - Make fields required only if truly blocking
  - Use conditional requirements to adapt dynamically
  - Provide clear value proposition for recommended fields
  - Allow partial submission when possible
  
example_optimization:
  original: 15 required fields
  optimized: 
    - 3 required (business name, entity type, state)
    - 5 recommended (ein, address, phone, email, industry)
    - 7 optional (website, social, employees, revenue, etc.)
  result: 80% completion rate vs 45% with all required
```
