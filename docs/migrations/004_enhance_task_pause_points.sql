-- Migration: Enhance task_pause_points for onboarding support
-- Location: This file should be created in frontend repo at:
-- biz-buddy-ally-now/supabase/migrations/[timestamp]_enhance_task_pause_points.sql

-- Add columns for better onboarding support
ALTER TABLE task_pause_points 
ADD COLUMN IF NOT EXISTS ui_augmentation_id UUID REFERENCES task_ui_augmentations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pause_stage TEXT,
ADD COLUMN IF NOT EXISTS pause_context JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tenant_context JSONB DEFAULT '{}';

-- Add index for UI augmentation lookups
CREATE INDEX IF NOT EXISTS idx_pause_ui_aug ON task_pause_points(ui_augmentation_id);
CREATE INDEX IF NOT EXISTS idx_pause_stage ON task_pause_points(pause_stage);

-- Add comments for documentation
COMMENT ON COLUMN task_pause_points.ui_augmentation_id IS 'Links to the UI request that caused this pause';
COMMENT ON COLUMN task_pause_points.pause_stage IS 'Which onboarding stage caused the pause (e.g., user_identity, entity_type)';
COMMENT ON COLUMN task_pause_points.pause_context IS 'Stage-specific context for resumption';
COMMENT ON COLUMN task_pause_points.tenant_context IS 'Multi-tenant isolation context at time of pause';