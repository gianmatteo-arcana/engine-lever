# Supabase Schema Recommendations for Onboarding Task System

## Executive Summary
Based on the PRD requirements for the new user onboarding experience, here are specific schema recommendations to support the generic TaskContext architecture with pause/resume functionality, dynamic UI generation, and declarative task orchestration.

## Current Schema Analysis

### Existing Tables (from SCHEMA_ARCHITECTURE.md)
- `tasks` - Main task records  
- `task_executions` - Task execution state
- `task_pause_points` - Pause/resume points
- `workflow_states` - Workflow snapshots
- `task_audit_trail` - Audit logging
- `agent_messages` - Inter-agent communication

### Key Gaps Identified
1. No generic TaskContext storage mechanism
2. Missing UI augmentation request tracking
3. No declarative task goal storage
4. Limited support for agent-specific subcontexts

## Recommended Schema Changes

### 1. Enhance `tasks` Table

```sql
-- Add columns to support generic TaskContext
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_context JSONB DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_goals JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required_inputs JSONB DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS entry_mode TEXT DEFAULT 'user_initiated';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS orchestrator_config JSONB DEFAULT '{}';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_entry_mode ON tasks(entry_mode);
CREATE INDEX IF NOT EXISTS idx_tasks_context_gin ON tasks USING gin(task_context);
```

**Rationale:**
- `task_context`: Stores the generic TaskContext as JSONB for flexibility
- `task_goals`: Declarative goals array (not prescriptive steps)
- `required_inputs`: Tracks which inputs are required vs optional
- `entry_mode`: 'user_initiated' or 'system_initiated'
- `orchestrator_config`: LLM prompts and orchestration settings

### 2. Create `task_ui_augmentations` Table

```sql
CREATE TABLE IF NOT EXISTS task_ui_augmentations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  
  -- UIAugmentationRequest fields
  presentation JSONB NOT NULL,
  action_pills JSONB DEFAULT '[]',
  form_sections JSONB DEFAULT '[]',
  context JSONB DEFAULT '{}',
  response_config JSONB DEFAULT '{}',
  
  -- Tracking fields
  status TEXT DEFAULT 'pending',
  user_response JSONB,
  responded_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(task_id, request_id)
);

CREATE INDEX idx_ui_aug_task_id ON task_ui_augmentations(task_id);
CREATE INDEX idx_ui_aug_status ON task_ui_augmentations(status);
CREATE INDEX idx_ui_aug_sequence ON task_ui_augmentations(task_id, sequence_number);
```

**Rationale:**
- Stores pure semantic UI augmentation requests from agents
- Maintains ordered sequence of UI interactions
- Tracks user responses separately from requests
- Supports the PRD's requirement for semantic-only data

### 3. Create `task_agent_contexts` Table

```sql
CREATE TABLE IF NOT EXISTS task_agent_contexts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL,
  
  -- Agent-specific context
  context_data JSONB NOT NULL DEFAULT '{}',
  deliverables JSONB DEFAULT '[]',
  requirements_met JSONB DEFAULT '{}',
  
  -- State tracking
  last_action TEXT,
  last_action_at TIMESTAMPTZ,
  is_complete BOOLEAN DEFAULT FALSE,
  completion_summary TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(task_id, agent_role)
);

CREATE INDEX idx_agent_ctx_task ON task_agent_contexts(task_id);
CREATE INDEX idx_agent_ctx_role ON task_agent_contexts(agent_role);
```

**Rationale:**
- Stores agent-specific subcontexts
- Tracks deliverables per agent
- Supports the PRD's requirement for specialized subcontexts

### 4. Enhance `task_pause_points` Table

```sql
-- Add columns for better onboarding support
ALTER TABLE task_pause_points 
ADD COLUMN IF NOT EXISTS ui_augmentation_id UUID REFERENCES task_ui_augmentations(id),
ADD COLUMN IF NOT EXISTS pause_stage TEXT,
ADD COLUMN IF NOT EXISTS pause_context JSONB DEFAULT '{}';

-- Add index for UI augmentation lookups
CREATE INDEX IF NOT EXISTS idx_pause_ui_aug ON task_pause_points(ui_augmentation_id);
```

**Rationale:**
- Links pause points to specific UI augmentation requests
- Tracks which onboarding stage caused the pause
- Stores stage-specific context for resumption

### 5. Create `task_orchestration_plans` Table

```sql
CREATE TABLE IF NOT EXISTS task_orchestration_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- Declarative plan
  goals JSONB NOT NULL,
  constraints JSONB DEFAULT '{}',
  success_criteria JSONB DEFAULT '{}',
  
  -- Dynamic execution plan
  execution_plan JSONB NOT NULL,
  plan_version INTEGER DEFAULT 1,
  
  -- LLM metadata
  llm_model TEXT,
  llm_prompt_template TEXT,
  llm_response JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orch_plan_task ON task_orchestration_plans(task_id);
CREATE INDEX idx_orch_plan_version ON task_orchestration_plans(task_id, plan_version DESC);
```

**Rationale:**
- Stores declarative goals separately from execution plans
- Supports dynamic plan generation by LLM orchestrator
- Maintains plan versioning for adaptability

## Implementation Examples

### Example: Onboarding Task Creation

```typescript
// Creating an onboarding task with generic TaskContext
const onboardingTask = {
  user_id: userId,
  task_type: 'user_onboarding',
  title: 'Complete Business Profile Setup',
  status: 'pending',
  priority: 'high',
  entry_mode: 'user_initiated',
  
  task_context: {
    // Generic context that all agents can access
    user: {
      email: userEmail,
      name: null, // To be collected
      googleId: googleUserId
    },
    business: {
      name: null,
      entityType: null,
      state: null
    },
    onboarding: {
      currentStage: 0,
      completedStages: [],
      startedAt: new Date().toISOString()
    }
  },
  
  task_goals: [
    {
      id: 'collect_user_identity',
      description: 'Collect user first and last name',
      required: true
    },
    {
      id: 'determine_entity_type',
      description: 'Determine business entity type',
      required: true
    },
    {
      id: 'collect_business_details',
      description: 'Collect business name and state',
      required: true
    },
    {
      id: 'generate_requirements',
      description: 'Generate compliance requirements based on entity/state',
      required: true
    }
  ],
  
  required_inputs: {
    firstName: { required: true, stage: 1 },
    lastName: { required: true, stage: 1 },
    entityType: { required: true, stage: 2 },
    businessName: { required: true, stage: 4 },
    stateOfFormation: { required: true, stage: 4 },
    ein: { required: false, stage: 5 }
  },
  
  orchestrator_config: {
    model: 'gpt-4',
    maxRetries: 3,
    timeoutMinutes: 10,
    atomicExecution: true
  }
};
```

### Example: UI Augmentation Request Storage

```typescript
// Storing a UI augmentation request from Data Collection Agent
const uiAugmentation = {
  task_id: taskId,
  agent_role: 'data_collection',
  request_id: 'dc_req_20240115_001',
  sequence_number: 1,
  
  presentation: {
    title: "Let's get to know you",
    subtitle: null,
    icon: 'user',
    theme: 'primary',
    position: 'main'
  },
  
  form_sections: [{
    id: 'user_identity',
    fields: [
      {
        id: 'firstName',
        name: 'firstName',
        type: 'text',
        label: 'First Name',
        validation: { required: true }
      },
      {
        id: 'lastName', 
        name: 'lastName',
        type: 'text',
        label: 'Last Name',
        validation: { required: true }
      }
    ]
  }],
  
  response_config: {
    targetContextPath: 'task_context.user',
    onSuccessAction: 'continue',
    validationRules: []
  }
};
```

## Benefits of This Schema Design

1. **Generic & Extensible**: JSONB columns allow storing any TaskContext shape
2. **Pause/Resume Support**: Enhanced pause points with UI context
3. **Pure Semantic Data**: UI augmentations store only data, no layout
4. **Declarative Goals**: Separate goals from execution plans
5. **Agent Autonomy**: Each agent has its own context space
6. **Audit Trail**: All changes tracked with timestamps
7. **Performance**: Strategic indexes on frequently queried fields
8. **MVP-Ready**: Supports immediate onboarding implementation

## Migration Priority

1. **Phase 1 (Immediate)**: 
   - Enhance `tasks` table with TaskContext columns
   - Create `task_ui_augmentations` table

2. **Phase 2 (Next Sprint)**:
   - Create `task_agent_contexts` table
   - Enhance `task_pause_points` table

3. **Phase 3 (Future)**:
   - Create `task_orchestration_plans` table
   - Add performance monitoring tables

## RLS Policies Required

```sql
-- Ensure users can only see their own tasks and related data
ALTER TABLE task_ui_augmentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_agent_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_orchestration_plans ENABLE ROW LEVEL SECURITY;

-- Example policy for UI augmentations
CREATE POLICY "Users can view their task UI augmentations"
  ON task_ui_augmentations
  FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM tasks 
      WHERE user_id = auth.uid()
    )
  );
```

## Next Steps

1. Review these recommendations with the team
2. Create migration files in the frontend repo (`biz-buddy-ally-now/supabase/migrations/`)
3. Apply migrations via Lovable Migration Runner
4. Update backend TypeScript interfaces to match new schema
5. Implement repository methods for new tables
6. Add integration tests for pause/resume functionality

## Notes for CBC API Integration

The California Business Connect (CBC) API will populate the TaskContext during onboarding:

- Entity search results → `task_context.business.cbcData`
- Verified entity details → `task_context.business.verified`
- Related filings → `task_context.compliance.existingFilings`

This schema design accommodates CBC data without requiring schema changes.