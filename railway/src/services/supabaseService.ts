import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

// Initialize Supabase client for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database operations for job management
export class SupabaseService {
  // Update task status in database
  static async updateTaskStatus(taskId: string, status: string, metadata?: any) {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
          ...(metadata && { metadata })
        })
        .eq('id', taskId);

      if (error) {
        logger.error('Failed to update task status:', error);
        throw error;
      }

      logger.info(`✅ Task ${taskId} status updated to: ${status}`);
    } catch (error) {
      logger.error('Error updating task status:', error);
      throw error;
    }
  }

  // Create background job record
  static async createJobRecord(data: {
    type: string;
    status: string;
    userId: string;
    taskId?: string;
    payload: any;
    priority?: number;
  }) {
    try {
      const { data: jobRecord, error } = await supabase
        .from('background_jobs')
        .insert({
          job_type: data.type,
          status: data.status,
          user_id: data.userId,
          task_id: data.taskId,
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

      logger.info(`✅ Job record created: ${jobRecord.id}`);
      return jobRecord;
    } catch (error) {
      logger.error('Error creating job record:', error);
      throw error;
    }
  }

  // Update job record
  static async updateJobRecord(jobId: string, updates: {
    status?: string;
    result?: any;
    error_message?: string;
    completed_at?: string;
  }) {
    try {
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

      logger.info(`✅ Job record ${jobId} updated`);
    } catch (error) {
      logger.error('Error updating job record:', error);
      throw error;
    }
  }

  // Get user profile
  static async getUserProfile(userId: string) {
    try {
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
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  // Get business profile
  static async getBusinessProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        logger.error('Failed to get business profile:', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error getting business profile:', error);
      throw error;
    }
  }

  // Store generated report
  static async storeReport(data: {
    userId: string;
    title: string;
    content: any;
    type: string;
    metadata?: any;
  }) {
    try {
      const { data: report, error } = await supabase
        .from('reports')
        .insert({
          user_id: data.userId,
          title: data.title,
          content: data.content,
          report_type: data.type,
          metadata: data.metadata,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to store report:', error);
        throw error;
      }

      logger.info(`✅ Report stored: ${report.id}`);
      return report;
    } catch (error) {
      logger.error('Error storing report:', error);
      throw error;
    }
  }

  // Send notification to user
  static async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: string;
    actionUrl?: string;
  }) {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: data.userId,
          title: data.title,
          message: data.message,
          notification_type: data.type,
          action_url: data.actionUrl,
          is_read: false,
          created_at: new Date().toISOString()
        });

      if (error) {
        logger.error('Failed to create notification:', error);
        throw error;
      }

      logger.info(`✅ Notification created for user: ${data.userId}`);
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }
}

export default SupabaseService;