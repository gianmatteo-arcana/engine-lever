import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { TaskPriority, AgentMessage } from '../agents/base/types';

// Database types matching our new business-centric schema
export interface BusinessRecord {
  id: string;
  name: string;
  entity_type?: 'LLC' | 'Corporation' | 'Partnership' | 'Sole Proprietorship' | 'Not Sure';
  state?: string;
  industry?: string;
  ein?: string;
  formation_date?: string;
  address?: Record<string, any>;
  contact_info?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface BusinessUserRecord {
  business_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions?: Record<string, any>;
  invited_at: string;
  joined_at?: string;
}

export interface ContextRecord {
  id: string;
  business_id: string;
  template_id: string;
  initiated_by_user_id?: string;
  current_state: {
    status: string;
    phase: string;
    completeness: number;
    data: Record<string, any>;
  };
  template_snapshot: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ContextEventRecord {
  id: string;
  context_id: string;
  sequence_number: number;
  actor_type: 'agent' | 'user' | 'system';
  actor_id: string;
  operation: string;
  data: Record<string, any>;
  reasoning?: string;
  trigger?: Record<string, any>;
  created_at: string;
}

// Legacy TaskRecord interface for compatibility during migration
export interface TaskRecord {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  task_type: string;
  business_id: string;
  template_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  task_context?: Record<string, any>;
  task_goals?: Array<any>;
  required_inputs?: Record<string, any>;
  entry_mode?: 'user_initiated' | 'system_initiated';
  orchestrator_config?: Record<string, any>;
}

// Legacy interfaces kept for compatibility during migration
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

export interface UIRequestRecord {
  id: string;
  context_id: string;
  request_type: string;
  semantic_data: Record<string, any>;
  status: 'pending' | 'presented' | 'responded' | 'cancelled';
  response_data?: Record<string, any>;
  created_at: string;
  responded_at?: string;
}

export interface AgentStateRecord {
  id: string;
  context_id: string;
  agent_role: string;
  state_data: Record<string, any>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRecord {
  id: string;
  business_id?: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export class DatabaseService {
  private serviceClient: SupabaseClient | null = null; // Service role client for system operations
  private static instance: DatabaseService; // Keep for backward compatibility (deprecated)

  constructor() {
    // Service role only - no user token support
  }

  /**
   * @deprecated Use dependency injection instead
   * Kept for backward compatibility during migration
   */
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
   * @deprecated Use service role pattern instead
   * Temporary method for backward compatibility until TaskService is refactored
   */
  public getUserClient(_userToken: string): any {
    // This is a temporary stub to make compilation work
    // TaskService needs to be refactored to use service role pattern
    throw new Error('getUserClient is deprecated - use service role pattern instead');
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

  // ========== BUSINESS OPERATIONS ==========
  
  /**
   * Get or create a business for a user
   */
  async getOrCreateBusiness(userId: string, businessData: Partial<BusinessRecord>): Promise<BusinessRecord> {
    const client = this.getServiceClient();
    
    // First check if user already has a business
    const { data: existingRelation } = await client
      .from('business_users')
      .select('business_id, businesses(*)')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .single();
    
    if (existingRelation?.businesses) {
      return existingRelation.businesses as unknown as BusinessRecord;
    }
    
    // Create new business
    const { data: newBusiness, error: bizError } = await client
      .from('businesses')
      .insert(businessData)
      .select()
      .single();
    
    if (bizError) {
      logger.error('Failed to create business', bizError);
      throw bizError;
    }
    
    // Create business-user relationship
    const { error: relError } = await client
      .from('business_users')
      .insert({
        business_id: newBusiness.id,
        user_id: userId,
        role: 'owner',
        joined_at: new Date().toISOString()
      });
    
    if (relError) {
      logger.error('Failed to create business-user relationship', relError);
      throw relError;
    }
    
    return newBusiness;
  }

  /**
   * Create a context for a business
   */
  async createContext(businessId: string, userId: string, templateId: string, templateSnapshot: Record<string, any>): Promise<ContextRecord> {
    const client = this.getServiceClient();
    
    const contextData: Partial<ContextRecord> = {
      business_id: businessId,
      template_id: templateId,
      initiated_by_user_id: userId,
      current_state: {
        status: 'created',
        phase: 'initialization',
        completeness: 0,
        data: {}
      },
      template_snapshot: templateSnapshot,
      metadata: {}
    };
    
    const { data, error } = await client
      .from('contexts')
      .insert(contextData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create context', error);
      throw error;
    }

    return data;
  }

  /**
   * Get a context by ID
   */
  async getContext(contextId: string): Promise<ContextRecord | null> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('contexts')
      .select('*')
      .eq('id', contextId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get context', error);
      throw error;
    }

    return data;
  }

  /**
   * Get all contexts for a business
   */
  async getBusinessContexts(businessId: string, filters?: { 
    status?: string; 
    templateId?: string;
    limit?: number;
  }): Promise<ContextRecord[]> {
    const client = this.getServiceClient();
    
    let query = client
      .from('contexts')
      .select('*')
      .eq('business_id', businessId);

    if (filters?.status) {
      query = query.eq('current_state->status', filters.status);
    }

    if (filters?.templateId) {
      query = query.eq('template_id', filters.templateId);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get business contexts', error);
      throw error;
    }

    return data || [];
  }

  /**
   * @deprecated Use createTaskContextEvent instead - this uses the old context_events table
   * CRITICAL: Redirecting to new unified task_context_events table
   */
  async addContextEvent(event: Omit<ContextEventRecord, 'id' | 'created_at' | 'sequence_number'>): Promise<ContextEventRecord> {
    // REDIRECT to new unified event table
    logger.warn('DEPRECATED: addContextEvent called - redirecting to createTaskContextEvent');
    
    // Map old format to new format
    const newEvent = await this.createTaskContextEvent(
      'system', // Using system as fallback userId
      event.context_id, // context_id IS the task_id in our architecture
      {
        contextId: event.context_id,
        actorType: event.actor_type,
        actorId: event.actor_id,
        operation: event.operation,
        data: event.data,
        reasoning: event.reasoning || 'Legacy event migration',
        trigger: event.trigger
      }
    );
    
    // Map back to old format for compatibility
    return {
      id: newEvent.id,
      context_id: newEvent.context_id,
      actor_type: newEvent.actor_type,
      actor_id: newEvent.actor_id,
      operation: newEvent.operation,
      data: newEvent.data,
      reasoning: newEvent.reasoning,
      trigger: newEvent.trigger,
      created_at: newEvent.created_at,
      sequence_number: newEvent.sequence_number
    } as ContextEventRecord;
  }

  // ========== SYSTEM OPERATIONS (use service role) ==========
  // These are for internal system operations that don't involve user data

  /**
   * System operation: Save agent messages for audit (using audit_log table)
   */
  async saveSystemMessage(message: AgentMessage, taskId?: string, executionId?: string): Promise<void> {
    await this.createAuditLog({
      business_id: undefined, // Will be set from context if needed
      user_id: undefined, 
      action: 'agent_message',
      resource_type: 'agent_message',
      resource_id: message.id,
      metadata: {
        from: message.from,
        to: message.to,
        type: message.type,
        priority: this.convertPriority(message.priority),
        payload: message.payload,
        taskId,
        executionId
      }
    });
  }

  /**
   * System operation: Create audit trail entry
   */
  async createSystemAuditEntry(audit: Omit<TaskAuditRecord, 'id' | 'created_at'>): Promise<void> {
    await this.createAuditLog({
      business_id: undefined, // Will be determined from task/context
      user_id: audit.user_id,
      action: audit.action,
      resource_type: 'task',
      resource_id: audit.task_id,
      metadata: {
        agentRole: audit.agent_role,
        details: audit.details
      }
    });
  }

  /**
   * System operation: Get agent metrics from audit log
   */
  async getSystemAgentMetrics(): Promise<any[]> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .eq('resource_type', 'agent_message')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('Failed to get agent metrics', error);
      throw error;
    }

    return data || [];
  }

  // ========== UI REQUEST OPERATIONS ==========

  /**
   * Create a UI request (system operation)
   */
  async createUIRequest(request: Omit<UIRequestRecord, 'id' | 'created_at'>): Promise<UIRequestRecord> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('ui_requests')
      .insert(request)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create UI request', error);
      throw error;
    }

    return data;
  }

  /**
   * Get UI requests for a context
   */
  async getContextUIRequests(contextId: string): Promise<UIRequestRecord[]> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('ui_requests')
      .select('*')
      .eq('context_id', contextId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to get UI requests', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Update UI request status (system operation)
   */
  async updateUIRequestStatus(
    requestId: string, 
    status: UIRequestRecord['status'],
    responseData?: Record<string, any>
  ): Promise<void> {
    const client = this.getServiceClient();
    
    const updates: Partial<UIRequestRecord> = {
      status
    };

    if (status === 'responded' && responseData) {
      updates.response_data = responseData;
      updates.responded_at = new Date().toISOString();
    }

    const { error } = await client
      .from('ui_requests')
      .update(updates)
      .eq('id', requestId);

    if (error) {
      logger.error('Failed to update UI request status', error);
      throw error;
    }
  }

  // ========== AGENT STATE OPERATIONS ==========

  /**
   * Create or update agent state (system operation)
   */
  async upsertAgentState(
    contextId: string,
    agentRole: string,
    stateData: Record<string, any>
  ): Promise<AgentStateRecord> {
    const client = this.getServiceClient();
    
    // Get current version if exists
    const { data: existing } = await client
      .from('agent_states')
      .select('version')
      .eq('context_id', contextId)
      .eq('agent_role', agentRole)
      .single();
    
    const record = {
      context_id: contextId,
      agent_role: agentRole,
      state_data: stateData,
      version: (existing?.version || 0) + 1,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from('agent_states')
      .upsert(record, {
        onConflict: 'context_id,agent_role',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to upsert agent state', error);
      throw error;
    }

    return data;
  }

  /**
   * Get agent states for a context
   */
  async getContextAgentStates(contextId: string): Promise<AgentStateRecord[]> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('agent_states')
      .select('*')
      .eq('context_id', contextId);

    if (error) {
      logger.error('Failed to get agent states', error);
      throw error;
    }

    return data || [];
  }

  // ========== AUDIT OPERATIONS ==========

  /**
   * Create audit log entry (system operation)
   */
  async createAuditLog(
    entry: Omit<AuditLogRecord, 'id' | 'created_at'>
  ): Promise<AuditLogRecord> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('audit_log')
      .insert(entry)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create audit log', error);
      throw error;
    }

    return data;
  }

  /**
   * Get user's businesses
   */
  async getUserBusinesses(userId: string): Promise<BusinessRecord[]> {
    const client = this.getServiceClient();
    
    const { data, error } = await client
      .from('business_users')
      .select('businesses(*)')
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to get user businesses', error);
      throw error;
    }

    return data?.map((d: any) => d.businesses).filter(Boolean) || [];
  }

  // ========== LEGACY SYSTEM OPERATIONS (for compatibility) ==========

  /**
   * Legacy: Create an execution record (maps to context events)
   */
  async createSystemExecution(execution: Omit<TaskExecutionRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TaskExecutionRecord> {
    // Create an event to mark execution start
    await this.addContextEvent({
      context_id: execution.task_id,
      actor_type: 'system',
      actor_id: 'execution-engine',
      operation: 'execution_started',
      data: {
        executionId: execution.execution_id,
        status: execution.status
      }
    });
    
    return {
      ...execution,
      id: execution.execution_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as TaskExecutionRecord;
  }

  /**
   * Legacy: Update execution status (maps to context events)
   */
  async updateSystemExecution(executionId: string, updates: Partial<TaskExecutionRecord>): Promise<TaskExecutionRecord> {
    // Add event for execution update
    if (updates.task_id) {
      await this.addContextEvent({
        context_id: updates.task_id,
        actor_type: 'system',
        actor_id: 'execution-engine',
        operation: 'execution_updated',
        data: updates
      });
    }
    
    return {
      ...updates,
      id: executionId,
      execution_id: executionId,
      updated_at: new Date().toISOString()
    } as TaskExecutionRecord;
  }
  
  /**
   * Legacy: Create pause point (maps to UI request)
   */
  async createPausePointWithUI(
    pausePoint: Omit<TaskPausePointRecord, 'id' | 'created_at'>,
    _uiRequestId?: string
  ): Promise<TaskPausePointRecord> {
    // Create UI request if pause requires user interaction
    if (pausePoint.pause_type === 'user_approval') {
      await this.createUIRequest({
        context_id: pausePoint.task_id,
        request_type: 'pause_approval',
        semantic_data: {
          pauseReason: pausePoint.pause_reason,
          requiredAction: pausePoint.required_action,
          requiredData: pausePoint.required_data
        },
        status: 'pending'
      });
    }
    
    return {
      ...pausePoint,
      id: pausePoint.resume_token,
      created_at: new Date().toISOString()
    } as TaskPausePointRecord;
  }

  // ========== LEGACY AUGMENTATION OPERATIONS (for compatibility) ==========
  
  /**
   * Legacy: Create UI augmentation (maps to UI request)
   */
  async createUIAugmentation(augmentation: any): Promise<any> {
    const uiRequest = await this.createUIRequest({
      context_id: augmentation.task_id,
      request_type: 'ui_augmentation',
      semantic_data: {
        presentation: augmentation.presentation,
        actionPills: augmentation.action_pills,
        formSections: augmentation.form_sections,
        context: augmentation.context,
        responseConfig: augmentation.response_config
      },
      status: 'pending'
    });
    
    return {
      ...augmentation,
      id: uiRequest.id,
      created_at: uiRequest.created_at,
      updated_at: uiRequest.created_at
    };
  }
  
  /**
   * Legacy: Update UI augmentation status (maps to UI request)
   */
  async updateUIAugmentationStatus(
    augmentationId: string,
    status: string,
    response?: any
  ): Promise<void> {
    await this.updateUIRequestStatus(
      augmentationId,
      status === 'presented' ? 'presented' : 
      status === 'responded' ? 'responded' : 
      status === 'expired' ? 'cancelled' : 'pending',
      response
    );
  }
  
  /**
   * Legacy: Upsert agent context (maps to agent state)
   */
  async upsertAgentContext(
    taskId: string,
    agentRole: string,
    contextData: any
  ): Promise<any> {
    const state = await this.upsertAgentState(
      taskId, // Using taskId as contextId during migration
      agentRole,
      contextData.context_data || contextData
    );
    
    return {
      ...contextData,
      id: state.id,
      task_id: taskId,
      agent_role: agentRole,
      updated_at: state.updated_at
    };
  }
  
  // ========== COMPATIBILITY LAYER (for migration) ==========
  // These methods provide backward compatibility during migration
  
  /**
   * Legacy: Create a task (maps to context creation)
   * NOTE: userToken validation must happen at API layer - never use auth.getUser() here
   */
  async createTask(userId: string, task: Partial<TaskRecord>): Promise<TaskRecord> {
    // Get or create business for user
    const business = await this.getOrCreateBusiness(userId, {
      name: task.metadata?.businessName || 'My Business',
      metadata: task.metadata
    });
    
    // Create context for the task
    const context = await this.createContext(
      business.id,
      userId,
      task.template_id || task.task_type || 'generic',
      { taskType: task.task_type, ...task.metadata }
    );
    
    // Map context to legacy task format
    return {
      id: context.id,
      user_id: userId,
      business_id: business.id,
      template_id: context.template_id,
      title: task.title || 'Task',
      description: task.description,
      task_type: task.task_type || context.template_id,
      status: context.current_state.status === 'created' ? 'pending' as const : 
              context.current_state.status === 'active' ? 'in_progress' as const : 
              context.current_state.status === 'completed' ? 'completed' as const : 'pending' as const,
      priority: task.priority || 'medium',
      metadata: context.metadata || {},
      created_at: context.created_at,
      updated_at: context.updated_at,
      task_context: context.current_state.data,
      task_goals: task.task_goals,
      required_inputs: task.required_inputs,
      entry_mode: task.entry_mode,
      orchestrator_config: task.orchestrator_config
    };
  }

  /**
   * Get a task by ID - queries the actual tasks table
   * Note: userId must be validated at API layer before calling this method
   */
  async getTask(userId: string, taskId: string): Promise<TaskRecord | null> {
    // Use service client to query tasks table directly
    const client = this.getServiceClient();
    const result = await client
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)  // Ensure user owns this task
      .single();
    
    const { data, error } = result;
    
    if (error) {
      if (error.code === 'PGRST116') {  // Not found
        return null;
      }
      logger.error('Failed to get task', error);
      throw error;
    }
    
    const task = data;
    
    return task as TaskRecord;
  }

  /**
   * Legacy: Update a task (maps to context update via events)
   */
  async updateTask(userId: string, taskId: string, updates: Partial<TaskRecord>): Promise<TaskRecord> {
    // Add an event to record the update
    await this.addContextEvent({
      context_id: taskId,
      actor_type: 'system',
      actor_id: 'database-service',
      operation: 'task_update',
      data: updates,
      reasoning: 'Legacy task update'
    });
    
    // Return updated task
    const task = await this.getTask(userId, taskId);
    if (!task) throw new Error('Task not found');
    return task;
  }

  /**
   * Get all tasks for a user - queries the actual tasks table
   * Note: userId must be validated at API layer before calling this method
   */
  async getUserTasks(userId: string, filters?: { 
    status?: string; 
    businessId?: string;
    limit?: number;
  }): Promise<TaskRecord[]> {
    // Query tasks table directly with service client
    const client = this.getServiceClient();
    let query = client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // Apply filters if provided
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.businessId) {
      query = query.eq('business_id', filters.businessId);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    const { data: tasks, error } = await query;
    
    if (error) {
      logger.error('Failed to get user tasks', error);
      throw error;
    }
    
    return (tasks || []) as TaskRecord[];
  }

  /**
   * Legacy: Get tasks (simplified version)
   */
  async getTasks(userId: string): Promise<TaskRecord[]> {
    return this.getUserTasks(userId);
  }
  
  /**
   * Legacy: Get task executions (maps to context events)
   * Note: userId validation must happen at API layer
   */
  async getTaskExecutions(userId: string, taskId: string): Promise<TaskExecutionRecord[]> {
    // Verify user owns the task first
    const task = await this.getTask(userId, taskId);
    if (!task) return [];
    
    // Map context events to execution records
    const client = this.getServiceClient();
    const { data: events } = await client
      .from('task_context_events') // Using unified event table
      .select('*')
      .eq('context_id', taskId)
      .order('sequence_number', { ascending: true });
    
    if (!events || events.length === 0) return [];
    
    // Group events by "execution" (simplified mapping)
    return [{
      id: taskId + '-exec',
      task_id: taskId,
      execution_id: taskId + '-exec',
      current_step: events[events.length - 1].operation,
      completed_steps: events.map(e => e.operation),
      agent_assignments: {},
      variables: {},
      status: 'active',
      started_at: events[0].created_at,
      is_paused: false,
      created_at: events[0].created_at,
      updated_at: events[events.length - 1].created_at
    }];
  }
  
  /**
   * Legacy: Get agent contexts (maps to agent states)
   * Note: userId validation must happen at API layer
   */
  async getAgentContexts(userId: string, taskId: string): Promise<any[]> {
    // Verify user owns the task first
    const task = await this.getTask(userId, taskId);
    if (!task) return [];
    
    const states = await this.getContextAgentStates(taskId);
    return states.map(state => ({
      id: state.id,
      task_id: taskId,
      agent_role: state.agent_role,
      context_data: state.state_data,
      is_complete: false,
      error_count: 0,
      created_at: state.created_at,
      updated_at: state.updated_at
    }));
  }
  
  /**
   * Legacy: Get context history (maps to context events)
   * Note: userId validation must happen at API layer
   */
  async getContextHistory(userId: string, taskId: string, limit?: number): Promise<ContextHistoryRecord[]> {
    // Verify user owns the task first
    const task = await this.getTask(userId, taskId);
    if (!task) return [];
    
    const client = this.getServiceClient();
    
    let query = client
      .from('task_context_events') // Using unified event table
      .select('*')
      .eq('context_id', taskId)
      .order('sequence_number', { ascending: true });
    
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        logger.warn('Context events table does not exist yet');
        return [];
      }
      logger.error('Failed to get context events', error);
      throw error;
    }

    // Map context events to legacy history format
    return (data || []).map(event => ({
      id: event.id,
      task_id: taskId,
      sequence_number: event.sequence_number,
      entry_type: event.operation,
      actor_type: event.actor_type,
      actor_id: event.actor_id,
      actor_role: event.actor_id,
      operation: event.operation,
      data: event.data,
      reasoning: event.reasoning,
      phase: event.data?.phase,
      metadata: event.trigger,
      created_at: event.created_at
    }));
  }
  
  /**
   * Legacy: Create context history entry (maps to context event)
   * Note: This method doesn't require user validation as it's for system-generated events
   */
  async createContextHistoryEntry(taskId: string, entry: Partial<ContextHistoryRecord>): Promise<ContextHistoryRecord> {
    const event = await this.addContextEvent({
      context_id: taskId,
      actor_type: entry.actor_type || 'system',
      actor_id: entry.actor_id || 'unknown',
      operation: entry.operation || entry.entry_type || 'update',
      data: entry.data || {},
      reasoning: entry.reasoning,
      trigger: entry.metadata
    });
    
    // Map back to legacy format
    return {
      id: event.id,
      task_id: taskId,
      sequence_number: event.sequence_number,
      entry_type: event.operation,
      actor_type: event.actor_type,
      actor_id: event.actor_id,
      actor_role: event.actor_id,
      operation: event.operation,
      data: event.data,
      reasoning: event.reasoning,
      metadata: event.trigger,
      created_at: event.created_at
    };
  }
  
  /**
   * Subscribe to context events for real-time updates
   */
  subscribeToContextHistory(taskId: string, callback: (entry: ContextHistoryRecord) => void): () => void {
    const serviceClient = this.getServiceClient();
    if (!serviceClient) {
      logger.warn('Cannot subscribe to context events - Supabase not configured');
      return () => {};
    }

    const subscription = serviceClient
      .channel(`task_context_events:${taskId}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'task_context_events',
          filter: `context_id=eq.${taskId}`
        },
        (payload: any) => {
          const event = payload.new as ContextEventRecord;
          // Map to legacy format
          callback({
            id: event.id,
            task_id: taskId,
            sequence_number: event.sequence_number,
            entry_type: event.operation,
            actor_type: event.actor_type,
            actor_id: event.actor_id,
            actor_role: event.actor_id,
            operation: event.operation,
            data: event.data,
            reasoning: event.reasoning,
            metadata: event.trigger,
            created_at: event.created_at
          });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Send PostgreSQL NOTIFY to trigger SSE updates
   * 
   * ## POSTGRESQL NOTIFY/LISTEN ARCHITECTURE
   * 
   * This implements real-time communication using PostgreSQL's NOTIFY/LISTEN mechanism,
   * which provides a lightweight pub/sub system directly in the database.
   * 
   * ## HOW IT WORKS
   * 
   * 1. **Publisher (this method)**: Sends NOTIFY with task-specific channel and payload
   * 2. **Channel Naming**: `task_{taskId}` ensures messages are scoped to specific tasks
   * 3. **Subscribers**: SSE connections LISTEN on their task's channel
   * 4. **Real-time Delivery**: PostgreSQL immediately delivers to all listeners
   * 
   * ## MULTI-TENANT SAFETY
   * 
   * - Channel names include task ID, preventing cross-task contamination
   * - Only authenticated SSE connections can subscribe to channels
   * - RLS ensures users can only trigger NOTIFY for their own tasks
   * - No global channels - everything is task-scoped
   * 
   * ## COMPONENTS ON THIS CHANNEL
   * 
   * **Publishers (send NOTIFY)**:
   * - Agent context updates (when agents complete work)
   * - State transitions (when task status changes)
   * - UI response handlers (when user submits forms)
   * - Background workers (async task processing)
   * 
   * **Subscribers (LISTEN)**:
   * - SSE connections from frontend (real-time UI updates)
   * - Monitoring systems (track task progress)
   * - Analytics collectors (event aggregation)
   * - Audit loggers (compliance tracking)
   * 
   * ## EXAMPLE FLOW
   * 
   * 1. Agent completes work → adds context event to database
   * 2. This method sends NOTIFY on `task_123abc` channel
   * 3. SSE connection listening on `task_123abc` receives notification
   * 4. SSE pushes update to browser in real-time
   * 5. UI updates without polling or refresh
   * 
   * This is called when context events are added to notify SSE subscribers
   */
  async notifyTaskContextUpdate(taskId: string, eventType: string, eventData: any): Promise<void> {
    try {
      const serviceClient = this.getServiceClient();
      
      // Use PostgreSQL NOTIFY to send real-time updates
      // The channel name is task-specific to avoid cross-contamination
      const channelName = `task_${taskId.replace(/-/g, '_')}`;
      const payload = {
        type: eventType,
        taskId,
        data: eventData,
        timestamp: new Date().toISOString()
      };

      // Execute NOTIFY command via RPC function
      const { error } = await serviceClient.rpc('notify_task_update', {
        channel_name: channelName,
        payload: JSON.stringify(payload)
      });

      if (error) {
        logger.error('Failed to send NOTIFY', { taskId, channelName, error });
      } else {
        logger.debug('Sent PostgreSQL NOTIFY', { taskId, channelName, eventType });
      }
    } catch (error) {
      logger.error('Error sending task context notification', { taskId, eventType, error });
    }
  }

  /**
   * Listen for PostgreSQL NOTIFY messages on a specific task channel
   * 
   * ## SUBSCRIBER SIDE OF NOTIFY/LISTEN
   * 
   * This sets up a LISTEN subscription for real-time task updates.
   * It's the receiving end of the NOTIFY/LISTEN pub/sub system.
   * 
   * ## WHO USES THIS
   * 
   * Primary consumer: SSE endpoints (`/api/tasks/:taskId/context/stream`)
   * - Each SSE connection calls this to subscribe to their task's updates
   * - When NOTIFY fires, callback pushes data to browser via SSE
   * 
   * ## CHANNEL ISOLATION
   * 
   * - Each task has its own channel: `task_{taskId}`
   * - No global subscriptions - prevents data leakage
   * - Unsubscribe callback ensures cleanup on disconnect
   * 
   * ## LIFECYCLE
   * 
   * 1. SSE connection established → this method called
   * 2. Subscribes to `task_{taskId}` channel
   * 3. Receives all NOTIFY messages for this task only
   * 4. On SSE disconnect → unsubscribe callback invoked
   * 5. Channel subscription cleaned up
   * 
   * This is used by SSE endpoints to receive real-time updates
   */
  async listenForTaskUpdates(taskId: string, callback: (payload: any) => void): Promise<() => void> {
    try {
      const serviceClient = this.getServiceClient();
      const channelName = `task_${taskId.replace(/-/g, '_')}`;

      // Subscribe to the task-specific channel
      const subscription = serviceClient
        .channel(channelName)
        .on('broadcast', { event: 'task_update' }, (payload) => {
          try {
            const parsedPayload = typeof payload.payload === 'string' 
              ? JSON.parse(payload.payload) 
              : payload.payload;
            callback(parsedPayload);
          } catch (error) {
            logger.error('Failed to parse NOTIFY payload', { channelName, error });
          }
        })
        .subscribe();

      logger.debug('Listening for task updates', { taskId, channelName });

      return () => {
        subscription.unsubscribe();
        logger.debug('Stopped listening for task updates', { taskId, channelName });
      };
    } catch (error) {
      logger.error('Error setting up task update listener', { taskId, error });
      return () => {}; // Return empty cleanup function
    }
  }

  /**
   * Get task events from task_context_events table
   * Validates user ownership before returning events
   */
  async getTaskEvents(userId: string, taskId: string): Promise<any[]> {
    // First verify the user owns this task
    const task = await this.getTask(userId, taskId);
    if (!task) {
      // Return empty array if task not found or user doesn't own it
      return [];
    }
    
    // Now get the events using service client
    const client = this.getServiceClient();
    const { data: events, error } = await client
      .from('task_context_events')
      .select('*')
      .eq('task_id', taskId)
      .order('sequence_number', { ascending: true });
    
    if (error) {
      logger.error('Failed to fetch task events', error);
      throw error;
    }
    
    return events || [];
  }

  /**
   * Create a task context event
   * Validates user ownership before creating event
   */
  async createTaskContextEvent(userId: string, taskId: string, eventData: {
    contextId?: string;
    actorType: string;
    actorId: string;
    operation: string;
    data: any;
    reasoning: string;
    trigger?: any;
  }): Promise<any> {
    // First verify the user owns this task
    const task = await this.getTask(userId, taskId);
    if (!task) {
      throw new Error('Task not found or unauthorized');
    }
    
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contextId = eventData.contextId || taskId;
    
    // Insert event using service client
    const client = this.getServiceClient();
    const result = await client
      .from('task_context_events')
      .insert({
        id: eventId,
        context_id: contextId,
        task_id: taskId,
        actor_type: eventData.actorType,
        actor_id: eventData.actorId,
        operation: eventData.operation,
        data: eventData.data || {},
        reasoning: eventData.reasoning || 'Context event added',
        trigger: eventData.trigger || { source: 'api', timestamp: new Date().toISOString() }
      })
      .select()
      .single();
    
    const { data, error } = result;
    
    if (error) {
      logger.error('Failed to insert context event', { error, taskId });
      throw error;
    }
    
    return data;
  }

  /**
   * Listen to a generic PostgreSQL channel (not task-specific)
   * Used for system-wide events like new user registrations
   */
  async listenToChannel(channelName: string, callback: (payload: string) => void): Promise<() => void> {
    try {
      const serviceClient = this.getServiceClient();
      
      // Subscribe to the channel
      const subscription = serviceClient
        .channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: channelName // This might need adjustment based on Supabase's API
        }, (payload: any) => {
          try {
            // Extract the actual payload from the event
            const data = payload.new || payload.payload || payload;
            callback(typeof data === 'string' ? data : JSON.stringify(data));
          } catch (error) {
            logger.error('Failed to process channel payload', { channelName, error });
          }
        })
        .subscribe();

      logger.info(`Listening to channel: ${channelName}`);

      // Return unsubscribe function
      return () => {
        subscription.unsubscribe();
        logger.info(`Stopped listening to channel: ${channelName}`);
      };
    } catch (error) {
      logger.error('Error setting up channel listener', { channelName, error });
      return () => {}; // Return empty cleanup function
    }
  }
}