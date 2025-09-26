-- Add completeness column to tasks table
-- This allows OrchestratorAgent to directly persist task progress percentage

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS completeness INTEGER DEFAULT 0 CHECK (completeness >= 0 AND completeness <= 100);

-- Update existing completed tasks to have 100% completeness
UPDATE tasks 
SET completeness = 100 
WHERE status = 'completed';

-- Update existing in_progress tasks to have a reasonable default
UPDATE tasks 
SET completeness = 50 
WHERE status = 'in_progress';

-- Add index for performance when querying by completeness
CREATE INDEX IF NOT EXISTS idx_tasks_completeness ON tasks(completeness);

-- Add comment for documentation
COMMENT ON COLUMN tasks.completeness IS 'Task completion percentage (0-100), persisted by OrchestratorAgent';