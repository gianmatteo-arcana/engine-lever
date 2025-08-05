-- Migration: Create task_ui_augmentations table
-- Location: This file should be created in frontend repo at:
-- biz-buddy-ally-now/supabase/migrations/[timestamp]_create_task_ui_augmentations.sql

CREATE TABLE IF NOT EXISTS task_ui_augmentations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  agent_role TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  
  -- UIAugmentationRequest fields from PRD
  presentation JSONB NOT NULL DEFAULT '{}',
  action_pills JSONB DEFAULT '[]',
  form_sections JSONB DEFAULT '[]',
  context JSONB DEFAULT '{}',
  response_config JSONB DEFAULT '{}',
  
  -- Multi-tenant context
  tenant_context JSONB DEFAULT '{}',
  
  -- Tracking fields
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'presented', 'responded', 'expired', 'error')),
  user_response JSONB,
  responded_at TIMESTAMPTZ,
  presented_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique request IDs per task
  CONSTRAINT unique_request_per_task UNIQUE(task_id, request_id)
);

-- Create indexes for performance
CREATE INDEX idx_ui_aug_task_id ON task_ui_augmentations(task_id);
CREATE INDEX idx_ui_aug_status ON task_ui_augmentations(status);
CREATE INDEX idx_ui_aug_sequence ON task_ui_augmentations(task_id, sequence_number);
CREATE INDEX idx_ui_aug_agent_role ON task_ui_augmentations(agent_role);
CREATE INDEX idx_ui_aug_created_at ON task_ui_augmentations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE task_ui_augmentations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see UI augmentations for their tasks
CREATE POLICY "Users can view their task UI augmentations"
  ON task_ui_augmentations
  FOR SELECT
  USING (
    task_id IN (
      SELECT id FROM tasks 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Backend service can manage all UI augmentations
CREATE POLICY "Service role can manage all UI augmentations"
  ON task_ui_augmentations
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_ui_augmentations_updated_at
  BEFORE UPDATE ON task_ui_augmentations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE task_ui_augmentations IS 'Stores UI augmentation requests from agents with pure semantic data';
COMMENT ON COLUMN task_ui_augmentations.presentation IS 'UI presentation hints (title, subtitle, theme, etc)';
COMMENT ON COLUMN task_ui_augmentations.action_pills IS 'Quick action buttons for common choices';
COMMENT ON COLUMN task_ui_augmentations.form_sections IS 'Dynamic form field definitions';
COMMENT ON COLUMN task_ui_augmentations.tenant_context IS 'Multi-tenant isolation context';