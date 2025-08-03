-- Create enum types for task and agent statuses
CREATE TYPE task_status AS ENUM ('pending', 'active', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE agent_role AS ENUM (
  'orchestrator',
  'legal_compliance',
  'data_collection',
  'payment',
  'agency_interaction',
  'monitoring',
  'communication'
);
CREATE TYPE message_type AS ENUM ('request', 'response', 'notification', 'error');
CREATE TYPE agent_status AS ENUM ('idle', 'working', 'waiting', 'error', 'completed');

-- Main tasks table (master record)
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  business_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status task_status DEFAULT 'pending',
  priority task_priority DEFAULT 'medium',
  deadline TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Indexes for common queries
  INDEX idx_tasks_user_id (user_id),
  INDEX idx_tasks_business_id (business_id),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_created_at (created_at DESC)
);

-- Task execution state (backend managed)
CREATE TABLE task_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  execution_id TEXT UNIQUE NOT NULL, -- Backend execution ID
  current_step TEXT,
  completed_steps TEXT[] DEFAULT '{}',
  agent_assignments JSONB DEFAULT '{}',
  variables JSONB DEFAULT '{}', -- Workflow variables/data
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  error_details JSONB,
  
  -- Pause/resume tracking
  is_paused BOOLEAN DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_by agent_role,
  pause_reason TEXT,
  resume_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_executions_task_id (task_id),
  INDEX idx_executions_status (status),
  INDEX idx_executions_is_paused (is_paused)
);

-- Agent messages and communication log
CREATE TABLE agent_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  execution_id TEXT REFERENCES task_executions(execution_id),
  message_id TEXT UNIQUE NOT NULL,
  from_agent agent_role NOT NULL,
  to_agent agent_role NOT NULL,
  message_type message_type NOT NULL,
  priority task_priority DEFAULT 'medium',
  payload JSONB DEFAULT '{}',
  correlation_id TEXT,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_messages_task_id (task_id),
  INDEX idx_messages_execution_id (execution_id),
  INDEX idx_messages_processed (processed),
  INDEX idx_messages_created_at (created_at DESC)
);

-- Workflow state snapshots for complex workflows
CREATE TABLE workflow_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  execution_id TEXT REFERENCES task_executions(execution_id),
  step_id TEXT NOT NULL,
  agent_role agent_role NOT NULL,
  state_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_workflow_task_id (task_id),
  INDEX idx_workflow_execution_id (execution_id),
  INDEX idx_workflow_step_id (step_id)
);

-- Task pause points for resume capability
CREATE TABLE task_pause_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  execution_id TEXT REFERENCES task_executions(execution_id),
  pause_type TEXT NOT NULL, -- 'user_approval', 'payment', 'external_wait', 'error'
  pause_reason TEXT,
  required_action TEXT,
  required_data JSONB,
  resume_token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  expires_at TIMESTAMPTZ,
  resumed BOOLEAN DEFAULT FALSE,
  resumed_at TIMESTAMPTZ,
  resume_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_pause_task_id (task_id),
  INDEX idx_pause_resumed (resumed),
  INDEX idx_pause_expires_at (expires_at)
);

-- Audit trail for compliance
CREATE TABLE task_audit_trail (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_role agent_role,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_audit_task_id (task_id),
  INDEX idx_audit_created_at (created_at DESC)
);

-- Agent metrics for monitoring
CREATE TABLE agent_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_role agent_role NOT NULL,
  status agent_status NOT NULL,
  active_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  avg_processing_time_ms INTEGER,
  memory_usage JSONB,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_metrics_agent_role (agent_role),
  INDEX idx_metrics_last_heartbeat (last_heartbeat DESC)
);

-- Document attachments for tasks
CREATE TABLE task_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'soi_form', 'payment_receipt', 'confirmation', etc.
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_documents_task_id (task_id),
  INDEX idx_documents_type (document_type)
);

-- Functions for updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_executions_updated_at BEFORE UPDATE ON task_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_pause_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_documents ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY "Users can view own tasks" ON tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON tasks
  FOR UPDATE USING (auth.uid() = user_id);

-- Task executions are viewable by task owner
CREATE POLICY "Users can view executions for own tasks" ON task_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_executions.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

-- Agent messages are viewable by task owner
CREATE POLICY "Users can view messages for own tasks" ON agent_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = agent_messages.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

-- Workflow states are viewable by task owner
CREATE POLICY "Users can view workflow states for own tasks" ON workflow_states
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = workflow_states.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

-- Pause points are viewable and updatable by task owner
CREATE POLICY "Users can view pause points for own tasks" ON task_pause_points
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_pause_points.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update pause points for own tasks" ON task_pause_points
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_pause_points.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

-- Audit trail is viewable by task owner
CREATE POLICY "Users can view audit trail for own tasks" ON task_audit_trail
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_audit_trail.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

-- Documents are viewable and manageable by task owner
CREATE POLICY "Users can view documents for own tasks" ON task_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_documents.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload documents for own tasks" ON task_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks 
      WHERE tasks.id = task_documents.task_id 
      AND tasks.user_id = auth.uid()
    )
  );

-- Create views for common queries
CREATE VIEW active_tasks AS
SELECT 
  t.*,
  te.current_step,
  te.completed_steps,
  te.is_paused,
  te.pause_reason
FROM tasks t
LEFT JOIN task_executions te ON t.id = te.task_id
WHERE t.status IN ('active', 'paused');

CREATE VIEW task_summary AS
SELECT 
  t.id,
  t.user_id,
  t.business_id,
  t.template_id,
  t.status,
  t.priority,
  t.created_at,
  te.current_step,
  array_length(te.completed_steps, 1) as steps_completed,
  te.is_paused,
  COUNT(DISTINCT tm.id) as message_count,
  COUNT(DISTINCT td.id) as document_count
FROM tasks t
LEFT JOIN task_executions te ON t.id = te.task_id
LEFT JOIN agent_messages tm ON t.id = tm.task_id
LEFT JOIN task_documents td ON t.id = td.task_id
GROUP BY t.id, te.current_step, te.completed_steps, te.is_paused;

-- Indexes for performance
CREATE INDEX idx_tasks_status_created ON tasks(status, created_at DESC);
CREATE INDEX idx_executions_paused ON task_executions(is_paused) WHERE is_paused = TRUE;
CREATE INDEX idx_messages_unprocessed ON agent_messages(processed) WHERE processed = FALSE;
CREATE INDEX idx_pause_active ON task_pause_points(resumed) WHERE resumed = FALSE;