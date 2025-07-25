-- Remove duplicate migration - consolidate due_date column addition
-- First migration already added due_date, so we drop and recreate to avoid conflicts

-- Drop index if exists (from the duplicate migration)
DROP INDEX IF EXISTS public.idx_tasks_due_date;

-- Recreate index with proper name
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);