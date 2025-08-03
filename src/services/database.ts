import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { TaskContext, TaskPriority, AgentRole, AgentMessage } from '../agents/base/types';

// Database types matching our schema
export interface TaskRecord {
  id: string;
  user_id: string;
  business_id: string;
  template_id: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface TaskExecutionRecord {
  id: string;
  task_id: string;
  execution_id: string;
  current_step?: string;
  completed_steps: string[];
  agent_assignments: Record<string, any>;
  variables: Record<string, any>;
  status: string;
  started_at: string;
  ended_at?: string;
  error_details?: any;
  is_paused: boolean;
  paused_at?: string;
  paused_by?: string;
  pause_reason?: string;
  resume_data?: any;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageRecord {
  id: string;
  task_id?: string;
  execution_id?: string;
  message_id: string;
  from_agent: string;
  to_agent: string;
  message_type: 'request' | 'response' | 'notification' | 'error';
  priority: 'critical' | 'high' | 'medium' | 'low';
  payload: any;
  correlation_id?: string;
  processed: boolean;
  processed_at?: string;
  created_at: string;
}

export interface TaskPausePointRecord {
  id: string;
  task_id: string;
  execution_id?: string;
  pause_type: 'user_approval' | 'payment' | 'external_wait' | 'error';
  pause_reason?: string;
  required_action?: string;
  required_data?: any;
  resume_token: string;
  expires_at?: string;
  resumed: boolean;
  resumed_at?: string;
  resume_result?: any;
  created_at: string;
}

export interface WorkflowStateRecord {
  id: string;
  task_id: string;
  execution_id?: string;
  step_id: string;
  agent_role: string;
  state_data: any;
  created_at: string;
}

export interface TaskAuditRecord {
  id: string;
  task_id: string;
  agent_role?: string;
  action: string;
  details: any;
  user_id?: string;
  created_at: string;
}

export class DatabaseService {
  private client: SupabaseClient | null = null;
  private static instance: DatabaseService;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public initialize(supabaseUrl?: string, supabaseKey?: string): void {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      logger.error('Supabase credentials not provided');
      throw new Error('Missing Supabase credentials');
    }

    this.client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    logger.info('Database service initialized');
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }

  // Task operations
  async createTask(task: Omit<TaskRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TaskRecord> {
    const { data, error } = await this.getClient()
      .from('tasks')
      .insert(task)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create task', error);
      throw error;
    }

    return data;
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    const { data, error } = await this.getClient()
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      logger.error('Failed to get task', error);
      throw error;
    }

    return data;
  }

  async updateTask(taskId: string, updates: Partial<TaskRecord>): Promise<TaskRecord> {
    const { data, error } = await this.getClient()
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update task', error);
      throw error;
    }

    return data;
  }

  async getUserTasks(userId: string, status?: string): Promise<TaskRecord[]> {
    let query = this.getClient()
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get user tasks', error);
      throw error;
    }

    return data || [];
  }

  // Task execution operations
  async createExecution(execution: Omit<TaskExecutionRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TaskExecutionRecord> {
    const { data, error } = await this.getClient()
      .from('task_executions')
      .insert(execution)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create execution', error);
      throw error;
    }

    return data;
  }

  async getExecution(executionId: string): Promise<TaskExecutionRecord | null> {
    const { data, error } = await this.getClient()
      .from('task_executions')
      .select('*')
      .eq('execution_id', executionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get execution', error);
      throw error;
    }

    return data;
  }

  async updateExecution(executionId: string, updates: Partial<TaskExecutionRecord>): Promise<TaskExecutionRecord> {
    const { data, error } = await this.getClient()
      .from('task_executions')
      .update(updates)
      .eq('execution_id', executionId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update execution', error);
      throw error;
    }

    return data;
  }

  async getPausedExecutions(): Promise<TaskExecutionRecord[]> {
    const { data, error } = await this.getClient()
      .from('task_executions')
      .select('*')
      .eq('is_paused', true)
      .order('paused_at', { ascending: true });

    if (error) {
      logger.error('Failed to get paused executions', error);
      throw error;
    }

    return data || [];
  }

  // Agent message operations
  async saveMessage(message: AgentMessage, taskId?: string, executionId?: string): Promise<void> {
    const record: Omit<AgentMessageRecord, 'id' | 'created_at'> = {
      task_id: taskId,
      execution_id: executionId,
      message_id: message.id,
      from_agent: message.from,
      to_agent: message.to,
      message_type: message.type,
      priority: this.convertPriority(message.priority),
      payload: message.payload,
      correlation_id: message.correlationId,
      processed: false
    };

    const { error } = await this.getClient()
      .from('agent_messages')
      .insert(record);

    if (error) {
      logger.error('Failed to save message', error);
      throw error;
    }
  }

  async getUnprocessedMessages(limit = 100): Promise<AgentMessageRecord[]> {
    const { data, error } = await this.getClient()
      .from('agent_messages')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('Failed to get unprocessed messages', error);
      throw error;
    }

    return data || [];
  }

  async markMessageProcessed(messageId: string): Promise<void> {
    const { error } = await this.getClient()
      .from('agent_messages')
      .update({ 
        processed: true, 
        processed_at: new Date().toISOString() 
      })
      .eq('message_id', messageId);

    if (error) {
      logger.error('Failed to mark message as processed', error);
      throw error;
    }
  }

  // Pause point operations
  async createPausePoint(pausePoint: Omit<TaskPausePointRecord, 'id' | 'created_at' | 'resume_token'>): Promise<string> {
    const { data, error } = await this.getClient()
      .from('task_pause_points')
      .insert(pausePoint)
      .select('resume_token')
      .single();

    if (error) {
      logger.error('Failed to create pause point', error);
      throw error;
    }

    return data.resume_token;
  }

  async resumeFromPausePoint(resumeToken: string, resumeResult?: any): Promise<TaskPausePointRecord | null> {
    const { data, error } = await this.getClient()
      .from('task_pause_points')
      .update({
        resumed: true,
        resumed_at: new Date().toISOString(),
        resume_result: resumeResult
      })
      .eq('resume_token', resumeToken)
      .eq('resumed', false)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found or already resumed
      }
      logger.error('Failed to resume from pause point', error);
      throw error;
    }

    return data;
  }

  async getActivePausePoints(taskId: string): Promise<TaskPausePointRecord[]> {
    const { data, error } = await this.getClient()
      .from('task_pause_points')
      .select('*')
      .eq('task_id', taskId)
      .eq('resumed', false)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get active pause points', error);
      throw error;
    }

    return data || [];
  }

  // Workflow state operations
  async saveWorkflowState(taskId: string, executionId: string, stepId: string, agentRole: AgentRole, stateData: any): Promise<void> {
    const { error } = await this.getClient()
      .from('workflow_states')
      .insert({
        task_id: taskId,
        execution_id: executionId,
        step_id: stepId,
        agent_role: agentRole,
        state_data: stateData
      });

    if (error) {
      logger.error('Failed to save workflow state', error);
      throw error;
    }
  }

  async getLatestWorkflowState(taskId: string, stepId?: string): Promise<WorkflowStateRecord | null> {
    let query = this.getClient()
      .from('workflow_states')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (stepId) {
      query = query.eq('step_id', stepId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get workflow state', error);
      throw error;
    }

    return data?.[0] || null;
  }

  // Audit trail operations
  async addAuditEntry(taskId: string, action: string, details: any, agentRole?: AgentRole, userId?: string): Promise<void> {
    const { error } = await this.getClient()
      .from('task_audit_trail')
      .insert({
        task_id: taskId,
        agent_role: agentRole,
        action,
        details,
        user_id: userId
      });

    if (error) {
      logger.error('Failed to add audit entry', error);
      throw error;
    }
  }

  async getTaskAuditTrail(taskId: string): Promise<TaskAuditRecord[]> {
    const { data, error } = await this.getClient()
      .from('task_audit_trail')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get audit trail', error);
      throw error;
    }

    return data || [];
  }

  // Helper methods
  private convertPriority(priority: TaskPriority): 'critical' | 'high' | 'medium' | 'low' {
    const mapping: Record<TaskPriority, 'critical' | 'high' | 'medium' | 'low'> = {
      [TaskPriority.CRITICAL]: 'critical',
      [TaskPriority.HIGH]: 'high',
      [TaskPriority.MEDIUM]: 'medium',
      [TaskPriority.LOW]: 'low'
    };
    return mapping[priority];
  }

  // Convert TaskContext to database format
  convertTaskContextToRecord(context: TaskContext, userId: string): Omit<TaskRecord, 'id' | 'created_at' | 'updated_at'> {
    return {
      user_id: userId,
      business_id: context.businessId,
      template_id: context.templateId || '',
      status: 'pending',
      priority: this.convertPriority(context.priority),
      deadline: context.deadline?.toISOString(),
      metadata: context.metadata,
      completed_at: undefined
    };
  }

  // Cleanup and testing helpers
  async cleanup(): Promise<void> {
    // Clean up old completed tasks (for testing)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await this.getClient()
      .from('tasks')
      .delete()
      .eq('status', 'completed')
      .lt('completed_at', thirtyDaysAgo.toISOString());
  }

  // For testing - reset the client
  reset(): void {
    this.client = null;
  }
}

// Export singleton instance
export const dbService = DatabaseService.getInstance();