import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

let supabase: SupabaseClient;

export async function initializeSupabase(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Test connection
  const { error } = await supabase.from('profiles').select('id').limit(1);
  if (error) {
    logger.error('Supabase connection test failed:', error);
    throw new Error('Failed to connect to Supabase');
  }

  logger.info('Supabase connection established');
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase not initialized');
  }
  return supabase;
}

// Database operations
export class SupabaseService {
  static async createJobRecord(data: {
    type: string;
    status: string;
    userId: string;
    payload: any;
    priority?: number;
  }) {
    const { data: jobRecord, error } = await supabase
      .from('background_jobs')
      .insert({
        job_type: data.type,
        status: data.status,
        user_id: data.userId,
        payload: data.payload,
        priority: data.priority || 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create job record:', error);
      throw error;
    }

    return jobRecord;
  }

  static async updateJobRecord(jobId: string, updates: {
    status?: string;
    result?: any;
    error_message?: string;
    completed_at?: string;
  }) {
    const { error } = await supabase
      .from('background_jobs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      logger.error('Failed to update job record:', error);
      throw error;
    }
  }

  static async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('Failed to get user profile:', error);
      throw error;
    }

    return data;
  }
}