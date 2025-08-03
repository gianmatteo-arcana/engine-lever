import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper functions for background job management
export async function updateJobStatus(
  jobId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  result?: any,
  errorMessage?: string
) {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  };

  if (status === 'in_progress') {
    updateData.started_at = new Date().toISOString();
  } else if (status === 'completed') {
    updateData.completed_at = new Date().toISOString();
    if (result) updateData.result = result;
  } else if (status === 'failed') {
    updateData.completed_at = new Date().toISOString();
    if (errorMessage) updateData.error_message = errorMessage;
  }

  const { error } = await supabase
    .from('background_jobs')
    .update(updateData)
    .eq('id', jobId);

  if (error) {
    console.error('Failed to update job status:', error);
    throw error;
  }
}

export async function incrementJobRetry(jobId: string) {
  const { error } = await supabase.rpc('increment_job_retry', { job_id: jobId });
  
  if (error) {
    console.error('Failed to increment job retry:', error);
    throw error;
  }
}

export async function addJobResult(
  jobId: string,
  stepName: string,
  stepStatus: 'success' | 'error',
  stepResult?: any,
  stepError?: string,
  durationMs?: number
) {
  const { error } = await supabase
    .from('job_results')
    .insert({
      job_id: jobId,
      step_name: stepName,
      step_status: stepStatus,
      step_result: stepResult,
      step_error: stepError,
      duration_ms: durationMs
    });

  if (error) {
    console.error('Failed to add job result:', error);
    throw error;
  }
}