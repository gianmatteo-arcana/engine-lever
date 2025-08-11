import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { TaskPriority, AgentMessage } from '../agents/base/types';

// Database types matching our schema
export interface TaskRecord {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  task_type: string;
  business_id: string;
  template_id: string;
  status: 'pending' | 'in_progress' | 'completed'; // Frontend-compatible statuses
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  // New onboarding fields
  task_context?: Record<string, any>;
  task_goals?: Array<any>;
  required_inputs?: Record<string, any>;
  entry_mode?: 'user_initiated' | 'system_initiated';
  orchestrator_config?: Record<string, any>;
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

export interface ContextHistoryRecord {
  id: string;
  task_id: string;
  sequence_number: number;
  entry_type: string;
  actor_type: 'user' | 'agent' | 'system';
  actor_id?: string;
  actor_role?: string;
  operation: string;
  data: Record<string, any>;
  reasoning?: string;
  phase?: string;
  parent_entry_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface TaskUIAugmentationRecord {
  id: string;
  task_id: string;
  agent_role: string;
  request_id: string;
  sequence_number: number;
  presentation: Record<string, any>;
  action_pills?: Array<any>;
  form_sections?: Array<any>;
  context?: Record<string, any>;
  response_config?: Record<string, any>;
  tenant_context?: Record<string, any>;
  status: 'pending' | 'presented' | 'responded' | 'expired' | 'error';
  user_response?: Record<string, any>;
  responded_at?: string;
  presented_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskAgentContextRecord {
  id: string;
  task_id: string;
  agent_role: string;
  context_data: Record<string, any>;
  deliverables?: Array<any>;
  requirements_met?: Record<string, any>;
  last_action?: string;
  last_action_at?: string;
  is_complete: boolean;
  completion_summary?: string;
  error_count: number;
  last_error?: any;
  created_at: string;
  updated_at: string;
}

export interface TaskOrchestrationPlanRecord {
  id: string;
  task_id: string;
  goals: Array<any>;
  constraints?: Record<string, any>;
  success_criteria?: Record<string, any>;
  execution_plan: Record<string, any>;
  plan_version: number;
  is_active: boolean;
  llm_model?: string;
  llm_prompt_template?: string;
  llm_response?: any;
  llm_tokens_used?: number;
  steps_completed: number;
  steps_total: number;
  created_at: string;
  updated_at: string;
}

export class DatabaseService {
  private serviceClient: SupabaseClient | null = null; // Service role client for system operations
  private userClients: Map<string, SupabaseClient> = new Map(); // User-scoped clients
  private static instance: DatabaseService;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize the service role client for system operations
   * This should only be used for operations that don't involve user data
   */
  private getServiceClient(): SupabaseClient {
    if (!this.serviceClient) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase configuration missing');
      }

      this.serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    }

    return this.serviceClient;
  }

  /**
   * Get or create a user-scoped Supabase client
   * This client will automatically respect RLS policies for the user
   */
  public getUserClient(userToken: string): SupabaseClient {
    // Check if we already have a client for this token
    if (this.userClients.has(userToken)) {
      return this.userClients.get(userToken)!;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration missing');
    }

    // Create a client with the user's JWT token
    // This will automatically enforce RLS policies
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    });

    // Cache the client (you might want to implement cache expiry)
    this.userClients.set(userToken, userClient);

    return userClient;
  }

  /**
   * Clear user client cache (call periodically or on logout)
   */
  public clearUserClient(userToken: string): void {
    this.userClients.delete(userToken);
  }

  /**
   * Clear all user clients (for cleanup)
   */
  public clearAllUserClients(): void {
    this.userClients.clear();
  }

  // Helper method to convert TaskPriority enum to string
  private convertPriority(priority: TaskPriority): 'critical' | 'high' | 'medium' | 'low' {
    switch (priority) {
      case TaskPriority.CRITICAL:
        return 'critical';
      case TaskPriority.HIGH:
        return 'high';
      case TaskPriority.MEDIUM:
        return 'medium';
      case TaskPriority.LOW:
        return 'low';
      default:
        return 'medium';
    }
  }

  // ========== USER-SCOPED OPERATIONS (use user's token) ==========
  
  /**
   * Create a task for a user
   * RLS will automatically ensure the user can only create their own tasks
   */
  async createTask(userToken: string, task: Partial<TaskRecord>): Promise<TaskRecord> {
    const client = this.getUserClient(userToken);
    
    const { data, error } = await client
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

  /**
   * Get a task by ID
   * RLS will automatically ensure the user can only see their own tasks
   */
  async getTask(userToken: string, taskId: string): Promise<TaskRecord | null> {
    const client = this.getUserClient(userToken);
    
    const { data, error } = await client
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - either doesn't exist or user doesn't have access
        return null;
      }
      logger.error('Failed to get task', error);
      throw error;
    }

    return data;
  }

  /**
   * Update a task
   * RLS will automatically ensure the user can only update their own tasks
   */
  async updateTask(userToken: string, taskId: string, updates: Partial<TaskRecord>): Promise<TaskRecord> {
    const client = this.getUserClient(userToken);
    
    const { data, error } = await client
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

  /**
   * Get all tasks for the authenticated user
   * RLS automatically filters to only the user's tasks
   */
  async getUserTasks(userToken: string, filters?: { 
    status?: string; 
    businessId?: string;
    limit?: number;
  }): Promise<TaskRecord[]> {
    const client = this.getUserClient(userToken);
    
    let query = client
      .from('tasks')
      .select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.businessId) {
      query = query.eq('business_id', filters.businessId);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get user tasks', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get task executions for a user's task
   * RLS ensures user can only see executions for their tasks
   */
  async getTaskExecutions(userToken: string, taskId: string): Promise<TaskExecutionRecord[]> {
    const client = this.getUserClient(userToken);
    
    const { data, error } = await client
      .from('task_executions')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get task executions', error);
      throw error;
    }

    return data || [];
  }

  // ========== SYSTEM OPERATIONS (use service role) ==========
  // These are for internal system operations that don't involve user data

  /**
   * System operation: Create an execution record
   * This is called by the system when processing tasks
   */
  async createSystemExecution(execution: Omit<TaskExecutionRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TaskExecutionRecord> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
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

  /**
   * System operation: Update execution status
   */
  async updateSystemExecution(executionId: string, updates: Partial<TaskExecutionRecord>): Promise<TaskExecutionRecord> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
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

  /**
   * System operation: Save agent messages for audit
   */
  async saveSystemMessage(message: AgentMessage, taskId?: string, executionId?: string): Promise<void> {
    const client = this.getServiceClient();
    
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

    const { error } = await client
      .from('agent_messages')
      .insert(record);

    if (error) {
      logger.error('Failed to save message', error);
      throw error;
    }
  }

  /**
   * System operation: Create audit trail entry
   */
  async createSystemAuditEntry(audit: Omit<TaskAuditRecord, 'id' | 'created_at'>): Promise<void> {
    const client = this.getServiceClient();
    
    const { error } = await client
      .from('task_audit_trail')
      .insert(audit);

    if (error) {
      logger.error('Failed to create audit entry', error);
      throw error;
    }
  }

  /**
   * System operation: Get agent metrics (no user data)
   */
  async getSystemAgentMetrics(): Promise<any[]> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('agent_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('Failed to get agent metrics', error);
      throw error;
    }

    return data || [];
  }

  // ========== UI AUGMENTATION OPERATIONS ==========

  /**
   * Create a UI augmentation request (system operation)
   */
  async createUIAugmentation(augmentation: Omit<TaskUIAugmentationRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TaskUIAugmentationRecord> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('task_ui_augmentations')
      .insert(augmentation)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create UI augmentation', error);
      throw error;
    }

    return data;
  }

  /**
   * Get UI augmentations for a task (user operation)
   */
  async getTaskUIAugmentations(userToken: string, taskId: string): Promise<TaskUIAugmentationRecord[]> {
    const client = this.getUserClient(userToken);
    
    const { data, error } = await client
      .from('task_ui_augmentations')
      .select('*')
      .eq('task_id', taskId)
      .order('sequence_number', { ascending: true });

    if (error) {
      logger.error('Failed to get UI augmentations', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Update UI augmentation status (system operation)
   */
  async updateUIAugmentationStatus(
    augmentationId: string, 
    status: TaskUIAugmentationRecord['status'],
    response?: Record<string, any>
  ): Promise<void> {
    const client = this.getServiceClient();
    
    const updates: Partial<TaskUIAugmentationRecord> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'responded' && response) {
      updates.user_response = response;
      updates.responded_at = new Date().toISOString();
    }

    if (status === 'presented') {
      updates.presented_at = new Date().toISOString();
    }

    const { error } = await client
      .from('task_ui_augmentations')
      .update(updates)
      .eq('id', augmentationId);

    if (error) {
      logger.error('Failed to update UI augmentation status', error);
      throw error;
    }
  }

  // ========== AGENT CONTEXT OPERATIONS ==========

  /**
   * Create or update agent context (system operation)
   */
  async upsertAgentContext(
    taskId: string,
    agentRole: string,
    contextData: Partial<TaskAgentContextRecord>
  ): Promise<TaskAgentContextRecord> {
    const client = this.getServiceClient();
    
    const record = {
      task_id: taskId,
      agent_role: agentRole,
      ...contextData,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from('task_agent_contexts')
      .upsert(record, {
        onConflict: 'task_id,agent_role',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to upsert agent context', error);
      throw error;
    }

    return data;
  }

  /**
   * Get agent contexts for a task (user operation)
   */
  async getTaskAgentContexts(userToken: string, taskId: string): Promise<TaskAgentContextRecord[]> {
    const client = this.getUserClient(userToken);
    
    const { data, error } = await client
      .from('task_agent_contexts')
      .select('*')
      .eq('task_id', taskId);

    if (error) {
      logger.error('Failed to get agent contexts', error);
      throw error;
    }

    return data || [];
  }

  // ========== ORCHESTRATION PLAN OPERATIONS ==========

  /**
   * Create orchestration plan (system operation)
   */
  async createOrchestrationPlan(
    plan: Omit<TaskOrchestrationPlanRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<TaskOrchestrationPlanRecord> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('task_orchestration_plans')
      .insert(plan)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create orchestration plan', error);
      throw error;
    }

    return data;
  }

  /**
   * Get active orchestration plan for a task (system operation)
   */
  async getActiveOrchestrationPlan(taskId: string): Promise<TaskOrchestrationPlanRecord | null> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('task_orchestration_plans')
      .select('*')
      .eq('task_id', taskId)
      .eq('is_active', true)
      .order('plan_version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get orchestration plan', error);
      throw error;
    }

    return data;
  }

  // ========== PAUSE POINT OPERATIONS ==========

  /**
   * Create pause point with UI augmentation link
   */
  async createPausePointWithUI(
    pausePoint: Omit<TaskPausePointRecord, 'id' | 'created_at'>,
    uiAugmentationId?: string
  ): Promise<TaskPausePointRecord> {
    const client = this.getServiceClient();
    
    const record = {
      ...pausePoint,
      ui_augmentation_id: uiAugmentationId
    };

    const { data, error } = await client
      .from('task_pause_points')
      .insert(record)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create pause point', error);
      throw error;
    }

    return data;
  }

  /**
   * Create a context history entry for event sourcing
   * This is used to track all events that happen during task execution
   */
  async createContextHistoryEntry(userToken: string, entry: Partial<ContextHistoryRecord>): Promise<ContextHistoryRecord> {
    const client = this.getUserClient(userToken);
    
    // Get the next sequence number
    const { data: lastEntry } = await client
      .from('context_history')
      .select('sequence_number')
      .eq('task_id', entry.task_id!)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();
    
    const nextSequence = (lastEntry?.sequence_number || 0) + 1;
    
    const { data, error } = await client
      .from('context_history')
      .insert({
        ...entry,
        sequence_number: nextSequence,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create context history entry', error);
      throw error;
    }

    return data;
  }

  /**
   * Get context history entries for a task
   * Used by the visualizer to show the complete event history
   */
  async getContextHistory(userToken: string, taskId: string, limit?: number): Promise<ContextHistoryRecord[]> {
    const client = this.getUserClient(userToken);
    
    let query = client
      .from('context_history')
      .select('*')
      .eq('task_id', taskId)
      .order('sequence_number', { ascending: true });
    
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get context history', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Subscribe to context history changes for real-time updates
   * Used by the visualizer for live event streaming
   */
  subscribeToContextHistory(taskId: string, callback: (entry: ContextHistoryRecord) => void): () => void {
    const serviceClient = this.getServiceClient();
    if (!serviceClient) {
      logger.warn('Cannot subscribe to context history - Supabase not configured');
      return () => {};
    }

    const subscription = serviceClient
      .channel(`context_history:${taskId}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'context_history',
          filter: `task_id=eq.${taskId}`
        },
        (payload: any) => {
          callback(payload.new as ContextHistoryRecord);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }
}