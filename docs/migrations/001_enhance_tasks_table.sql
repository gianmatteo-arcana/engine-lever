-- Migration: Enhance tasks table for onboarding support
-- Location: This file should be created in frontend repo at:
-- biz-buddy-ally-now/supabase/migrations/[timestamp]_enhance_tasks_onboarding.sql

-- Add columns to support generic TaskContext and onboarding
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS task_context JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS task_goals JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS required_inputs JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS entry_mode TEXT DEFAULT 'user_initiated' CHECK (entry_mode IN ('user_initiated', 'system_initiated')),
ADD COLUMN IF NOT EXISTS orchestrator_config JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN tasks.task_context IS 'Generic context storage for all task data including user, business, and agent-specific contexts';
COMMENT ON COLUMN tasks.task_goals IS 'Declarative goals array - what the task should achieve, not how';
COMMENT ON COLUMN tasks.required_inputs IS 'Tracks which inputs are required vs optional with metadata';
COMMENT ON COLUMN tasks.entry_mode IS 'How the task was initiated - by user action or system scheduler';
COMMENT ON COLUMN tasks.orchestrator_config IS 'LLM configuration and orchestration settings';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_entry_mode ON tasks(entry_mode);
CREATE INDEX IF NOT EXISTS idx_tasks_context_gin ON tasks USING gin(task_context);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks(created_at DESC);

-- Add constraint to ensure one business per user (MVP requirement)
-- This enforces the "no multiple businesses" rule at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_one_business_per_user 
ON tasks(user_id) 
WHERE task_type = 'onboarding' AND status = 'completed';