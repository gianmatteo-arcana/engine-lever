-- Migration: Create task_agent_contexts table
-- Location: This file should be created in frontend repo at:
-- biz-buddy-ally-now/supabase/migrations/[timestamp]_create_task_agent_contexts.sql

CREATE TABLE IF NOT EXISTS task_agent_contexts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
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
  error_count INTEGER DEFAULT 0,
  last_error JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one context per agent per task
  CONSTRAINT unique_agent_per_task UNIQUE(task_id, agent_role)
);

-- Create indexes for performance
CREATE INDEX idx_agent_ctx_task ON task_agent_contexts(task_id);
CREATE INDEX idx_agent_ctx_role ON task_agent_contexts(agent_role);
CREATE INDEX idx_agent_ctx_complete ON task_agent_contexts(is_complete);
CREATE INDEX idx_agent_ctx_updated ON task_agent_contexts(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE task_agent_contexts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see agent contexts for their tasks
CREATE POLICY "Users can view their task agent contexts"
  ON task_agent_contexts
  FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM tasks 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Backend service can manage all agent contexts
CREATE POLICY "Service role can manage all agent contexts"
  ON task_agent_contexts
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_task_agent_contexts_updated_at
  BEFORE UPDATE ON task_agent_contexts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE task_agent_contexts IS 'Stores agent-specific contexts and deliverables for each task';
COMMENT ON COLUMN task_agent_contexts.context_data IS 'Agent-specific working memory and state';
COMMENT ON COLUMN task_agent_contexts.deliverables IS 'Array of deliverables produced by this agent';
COMMENT ON COLUMN task_agent_contexts.requirements_met IS 'Tracking of which requirements this agent has satisfied';