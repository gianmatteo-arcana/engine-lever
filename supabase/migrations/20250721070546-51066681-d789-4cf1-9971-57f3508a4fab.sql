-- Add due_date column to tasks table
ALTER TABLE public.tasks ADD COLUMN due_date DATE;

-- Create an index for better performance when sorting by due_date
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);