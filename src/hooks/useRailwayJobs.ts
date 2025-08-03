import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BackgroundJob {
  id: string;
  user_id: string;
  job_type: string;
  status: string;
  priority: number;
  payload?: any;
  result?: any;
  error_message?: string | null;
  retry_count: number;
  max_retries: number;
  scheduled_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueJobParams {
  jobType: 'llm_processing' | 'data_sync' | 'notifications' | 'maintenance';
  priority?: number;
  payload?: Record<string, any>;
  scheduledAt?: string;
}

export function useRailwayJobs() {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const { toast } = useToast();

  // Enqueue a new background job
  const enqueueJob = useCallback(async (params: EnqueueJobParams) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('railway-job-enqueue', {
        body: {
          userId: user.id,
          ...params
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Job Enqueued',
        description: `Background job ${data.jobId} has been enqueued successfully.`,
      });

      // Refresh jobs list
      await fetchJobs();

      return data;
    } catch (error) {
      console.error('Failed to enqueue job:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to enqueue job',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch user's background jobs
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setJobs(data || []);
      return data;
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch background jobs',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Get job status
  const getJobStatus = useCallback(async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get job status:', error);
      throw error;
    }
  }, []);

  // Subscribe to job updates
  const subscribeToJobUpdates = useCallback((userId: string, onUpdate: (job: BackgroundJob) => void) => {
    const channel = supabase
      .channel('background-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'background_jobs',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Job update:', payload);
          onUpdate(payload.new as BackgroundJob);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Quick actions for common job types
  const enqueueLLMJob = useCallback(async (
    provider: 'openai' | 'claude' | 'claude-mcp',
    prompt: string,
    options?: { model?: string; maxTokens?: number; temperature?: number }
  ) => {
    return enqueueJob({
      jobType: 'llm_processing',
      priority: 7, // High priority for LLM jobs
      payload: {
        provider,
        prompt,
        ...options
      }
    });
  }, [enqueueJob]);

  const enqueueNotification = useCallback(async (
    type: 'email' | 'sms' | 'push',
    recipient: string,
    message: string,
    subject?: string
  ) => {
    return enqueueJob({
      jobType: 'notifications',
      priority: 6,
      payload: {
        type,
        recipient,
        message,
        subject
      }
    });
  }, [enqueueJob]);

  const enqueueDataSync = useCallback(async (
    syncType: 'user_data' | 'task_batch' | 'analytics' | 'backup',
    filters?: Record<string, any>
  ) => {
    return enqueueJob({
      jobType: 'data_sync',
      priority: 4,
      payload: {
        syncType,
        filters
      }
    });
  }, [enqueueJob]);

  return {
    // State
    loading,
    jobs,

    // Core functions
    enqueueJob,
    fetchJobs,
    getJobStatus,
    subscribeToJobUpdates,

    // Quick actions
    enqueueLLMJob,
    enqueueNotification,
    enqueueDataSync
  };
}