-- Create background jobs table for Railway integration
CREATE TABLE public.background_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 1,
  payload JSONB,
  result JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create job queues table for queue management
CREATE TABLE public.job_queues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_concurrent_jobs INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create job results table for detailed results tracking
CREATE TABLE public.job_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_status TEXT NOT NULL,
  step_result JSONB,
  step_error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for background_jobs
CREATE POLICY "Users can view their own jobs" 
ON public.background_jobs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own jobs" 
ON public.background_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs" 
ON public.background_jobs 
FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS policies for job_queues (read-only for users)
CREATE POLICY "Users can view job queues" 
ON public.job_queues 
FOR SELECT 
USING (true);

-- RLS policies for job_results
CREATE POLICY "Users can view results for their jobs" 
ON public.job_results 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.background_jobs 
  WHERE id = job_results.job_id AND user_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_background_jobs_user_id ON public.background_jobs(user_id);
CREATE INDEX idx_background_jobs_status ON public.background_jobs(status);
CREATE INDEX idx_background_jobs_job_type ON public.background_jobs(job_type);
CREATE INDEX idx_background_jobs_scheduled_at ON public.background_jobs(scheduled_at);
CREATE INDEX idx_job_results_job_id ON public.job_results(job_id);

-- Create trigger for updating timestamps
CREATE TRIGGER update_background_jobs_updated_at
BEFORE UPDATE ON public.background_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_queues_updated_at
BEFORE UPDATE ON public.job_queues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default job queues
INSERT INTO public.job_queues (name, description, max_concurrent_jobs) VALUES
('llm_processing', 'Heavy LLM processing tasks', 3),
('data_sync', 'Data synchronization and batch processing', 5),
('notifications', 'Email and notification services', 10),
('maintenance', 'Scheduled maintenance tasks', 2);

-- Create function to enqueue background jobs
CREATE OR REPLACE FUNCTION public.enqueue_background_job(
  p_user_id UUID,
  p_job_type TEXT,
  p_payload JSONB DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
  p_scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_id UUID;
BEGIN
  INSERT INTO public.background_jobs (
    user_id,
    job_type,
    payload,
    priority,
    scheduled_at
  ) VALUES (
    p_user_id,
    p_job_type,
    p_payload,
    p_priority,
    p_scheduled_at
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;