-- Migration: Add waiting_for_input and other missing task statuses
-- Purpose: Support proper task state tracking when user input is required
-- Author: System
-- Date: 2025-08-21

-- Drop the old constraint
ALTER TABLE tasks 
DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Add the new constraint with additional statuses
-- These match the TaskStatus type in the backend (engine-types.ts)
ALTER TABLE tasks 
ADD CONSTRAINT tasks_status_check 
CHECK (status IN (
  'pending',           -- Task created but not started
  'in_progress',       -- Task actively being processed
  'processing',        -- Alias for in_progress (actively working)
  'waiting_for_input', -- Task paused, waiting for user response
  'gathering_user_info', -- Specifically collecting user data
  'completed',         -- Task finished successfully
  'failed',           -- Task failed with error
  'cancelled'         -- Task cancelled by user or system
));

-- Add comment explaining the statuses
COMMENT ON COLUMN tasks.status IS 'Task execution status. waiting_for_input indicates the task is paused and requires user action to continue.';