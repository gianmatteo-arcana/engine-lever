-- Fix function search path security warnings
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
SET search_path = public
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

-- Fix search path for existing functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    full_name,
    first_name,
    last_name,
    avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'given_name',
    NEW.raw_user_meta_data->>'family_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;