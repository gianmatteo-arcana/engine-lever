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
   * Add an event to a context (append-only)
   */
  async addContextEvent(event: Omit<ContextEventRecord, 'id' | 'created_at' | 'sequence_number'>): Promise<ContextEventRecord> {
    const client = this.getServiceClient();
    
    // Note: sequence_number is auto-generated by database trigger
    const { data, error } = await client
      .from('context_events')
      .insert(event)
      .select()
      .single();

    if (error) {
      logger.error('Failed to add context event', error);
      throw error;
    }

    return data;
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
   */
  async createTask(userToken: string, task: Partial<TaskRecord>): Promise<TaskRecord> {
    // Extract user ID from token
    const { data: { user } } = await this.getServiceClient().auth.getUser(userToken);
    if (!user) throw new Error('Invalid user token');
    
    // Get or create business for user
    const business = await this.getOrCreateBusiness(user.id, {
      name: task.metadata?.businessName || 'My Business',
      metadata: task.metadata
    });
    
    // Create context for the task
    const context = await this.createContext(
      business.id,
      user.id,
      task.template_id || task.task_type || 'generic',
      { taskType: task.task_type, ...task.metadata }
    );
    
    // Map context to legacy task format
    return {
      id: context.id,
      user_id: user.id,
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
   * Legacy: Get a task by ID (maps to context)
   */
  async getTask(userToken: string, taskId: string): Promise<TaskRecord | null> {
    const context = await this.getContext(taskId);
    if (!context) return null;
    
    // Extract user ID from token
    const { data: { user } } = await this.getServiceClient().auth.getUser(userToken);
    if (!user) throw new Error('Invalid user token');
    
    // Map context to legacy task format
    return {
      id: context.id,
      user_id: context.initiated_by_user_id || user.id,
      business_id: context.business_id,
      template_id: context.template_id,
      title: context.metadata?.title || 'Task',
      description: context.metadata?.description,
      task_type: context.template_id,
      status: context.current_state.status === 'created' ? 'pending' as const : 
              context.current_state.status === 'active' ? 'in_progress' as const : 
              context.current_state.status === 'completed' ? 'completed' as const : 'pending' as const,
      priority: 'medium',
      metadata: context.metadata || {},
      created_at: context.created_at,
      updated_at: context.updated_at,
      task_context: context.current_state.data
    };
  }

  /**
   * Legacy: Update a task (maps to context update via events)
   */
  async updateTask(userToken: string, taskId: string, updates: Partial<TaskRecord>): Promise<TaskRecord> {
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
    const task = await this.getTask(userToken, taskId);
    if (!task) throw new Error('Task not found');
    return task;
  }

  /**
   * Legacy: Get all tasks for a user (maps to contexts)
   */
  async getUserTasks(userToken: string, filters?: { 
    status?: string; 
    businessId?: string;
    limit?: number;
  }): Promise<TaskRecord[]> {
    // Extract user ID from token
    const { data: { user } } = await this.getServiceClient().auth.getUser(userToken);
    if (!user) throw new Error('Invalid user token');
    
    // Get user's businesses
    const businesses = await this.getUserBusinesses(user.id);
    if (businesses.length === 0) return [];
    
    // Get contexts for the businesses
    const allContexts: ContextRecord[] = [];
    for (const business of businesses) {
      const contexts = await this.getBusinessContexts(business.id, {
        status: filters?.status,
        limit: filters?.limit
      });
      allContexts.push(...contexts);
    }
    
    // Map contexts to legacy task format
    return allContexts.map(context => ({
      id: context.id,
      user_id: context.initiated_by_user_id || user.id,
      business_id: context.business_id,
      template_id: context.template_id,
      title: context.metadata?.title || 'Task',
      description: context.metadata?.description,
      task_type: context.template_id,
      status: context.current_state.status === 'created' ? 'pending' as const : 
              context.current_state.status === 'active' ? 'in_progress' as const : 'completed' as const,
      priority: 'medium' as const,
      metadata: context.metadata || {},
      created_at: context.created_at,
      updated_at: context.updated_at,
      task_context: context.current_state.data
    }));
  }

  /**
   * Legacy: Get tasks (simplified version)
   */
  async getTasks(userToken: string): Promise<TaskRecord[]> {
    return this.getUserTasks(userToken);
  }
  
  /**
   * Legacy: Get task executions (maps to context events)
   */
  async getTaskExecutions(userToken: string, taskId: string): Promise<TaskExecutionRecord[]> {
    // Map context events to execution records
    const client = this.getServiceClient();
    const { data: events } = await client
      .from('context_events')
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
   */
  async getAgentContexts(userToken: string, taskId: string): Promise<any[]> {
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
   */
  async getContextHistory(userToken: string, taskId: string, limit?: number): Promise<ContextHistoryRecord[]> {
    const client = this.getServiceClient();
    
    let query = client
      .from('context_events')
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
   */
  async createContextHistoryEntry(userToken: string, entry: Partial<ContextHistoryRecord>): Promise<ContextHistoryRecord> {
    const event = await this.addContextEvent({
      context_id: entry.task_id!,
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
      task_id: entry.task_id!,
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
      .channel(`context_events:${taskId}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'context_events',
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
}