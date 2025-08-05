/**
 * Base A2A Agent Class with Multi-Tenant Support
 * 
 * This base class provides:
 * - A2A protocol integration (future)
 * - Multi-tenant isolation and validation
 * - Audit logging
 * - Error handling
 * - Structured for future separation into microservices
 */

import { logger } from '../../utils/logger';
import { DatabaseService } from '../../services/database';
import { 
  TaskContext, 
  TenantContext, 
  UIAugmentationRequest,
  UIAugmentationResponse 
} from '../../types/task-context';

// A2A Task interface (compatible with future A2A protocol)
export interface A2ATask {
  id: string;
  type: string;
  input: any;
  tenantContext: TenantContext & { userToken: string }; // userToken required for tasks
  metadata?: {
    uiAugmentation?: UIAugmentationRequest;
    orchestrationContext?: any;
    auditRequired?: boolean;
  };
}

// A2A Task Result interface
export interface A2ATaskResult {
  status: 'complete' | 'pending_user_input' | 'error' | 'escalated';
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  uiAugmentation?: {
    action: 'request' | 'update' | 'complete';
    data: UIAugmentationRequest;
  };
  nextAction?: string;
}

// Agent capability declaration (for A2A discovery)
export interface AgentCapabilities {
  id: string;
  name: string;
  role: string;
  skills: string[];
  version: string;
  endpoints?: {
    tasks: string;
    status: string;
    discover?: string;
  };
}

export abstract class BaseA2AAgent {
  protected dbService: DatabaseService;
  protected agentId: string;
  protected agentRole: string;
  protected capabilities: AgentCapabilities;

  constructor(agentId: string, agentRole: string, capabilities: Partial<AgentCapabilities> = {}) {
    this.dbService = DatabaseService.getInstance();
    this.agentId = agentId;
    this.agentRole = agentRole;
    this.capabilities = {
      id: agentId,
      name: capabilities.name || agentRole,
      role: agentRole,
      skills: capabilities.skills || [],
      version: capabilities.version || '1.0.0',
      endpoints: capabilities.endpoints
    };
  }

  /**
   * Main task execution method - enforces tenant isolation
   */
  async executeTask(task: A2ATask): Promise<A2ATaskResult> {
    const startTime = Date.now();
    const auditEntry = {
      taskId: task.id,
      agentId: this.agentId,
      agentRole: this.agentRole,
      action: 'task_execution_started',
      tenantContext: task.tenantContext,
      timestamp: new Date().toISOString()
    };

    try {
      // 1. Validate tenant access
      if (!this.validateTenantAccess(task.tenantContext)) {
        throw new TenantAccessError('Agent not authorized for tenant');
      }

      // 2. Audit log task start
      await this.auditLog(auditEntry);

      // 3. Log task start
      logger.info(`${this.agentRole} executing task ${task.id}`, {
        taskType: task.type,
        tenant: task.tenantContext.businessId
      });

      // 4. Create tenant-scoped database connection
      const tenantDb = this.createTenantScopedDB(task.tenantContext);

      // 5. Execute agent-specific logic
      const result = await this.executeWithTenantContext(task, tenantDb);

      // 6. Update agent context
      await this.updateAgentContext(task.id, {
        last_action: task.type,
        last_action_at: new Date().toISOString(),
        is_complete: result.status === 'complete'
      });

      // 7. Audit success
      await this.auditLog({
        ...auditEntry,
        action: 'task_execution_completed',
        duration: Date.now() - startTime,
        result: result.status
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Audit failure
      await this.auditLog({
        ...auditEntry,
        action: 'task_execution_failed',
        duration: Date.now() - startTime,
        error: errorMessage
      });

      // Handle specific error types
      if (error instanceof TenantAccessError) {
        logger.error('Tenant access violation', {
          agent: this.agentId,
          tenant: task.tenantContext.businessId,
          error: errorMessage,
          security: true
        });
        
        return {
          status: 'error',
          error: {
            code: 'TENANT_ACCESS_DENIED',
            message: 'Access denied for this tenant'
          }
        };
      }

      // Generic error handling
      logger.error(`${this.agentRole} task execution failed`, error);
      
      return {
        status: 'error',
        error: {
          code: 'AGENT_EXECUTION_ERROR',
          message: errorMessage,
          details: error
        }
      };
    }
  }

  /**
   * Abstract method - agents must implement their specific logic
   */
  protected abstract executeWithTenantContext(
    task: A2ATask, 
    tenantDb: any
  ): Promise<A2ATaskResult>;

  /**
   * Validate tenant access for this agent
   */
  protected validateTenantAccess(context: TenantContext): boolean {
    // Check if agent is in allowed list
    if (!context.allowedAgents.includes(this.agentRole)) {
      logger.warn(`Agent ${this.agentRole} not in allowed list for tenant ${context.businessId}`);
      return false;
    }

    // Additional validation can be added here
    return true;
  }

  /**
   * Create tenant-scoped database connection
   */
  protected createTenantScopedDB(context: TenantContext) {
    // For now, return the user client
    // In future, this could create a more sophisticated tenant-scoped connection
    if (!context.userToken) {
      throw new Error('User token required for tenant-scoped database access');
    }
    return this.dbService.getUserClient(context.userToken);
  }

  /**
   * Update agent context in database
   */
  protected async updateAgentContext(taskId: string, updates: any): Promise<void> {
    try {
      await this.dbService.upsertAgentContext(taskId, this.agentRole, {
        context_data: updates,
        ...updates
      });
    } catch (error) {
      logger.error(`Failed to update agent context for ${this.agentRole}`, error);
      // Non-critical error - don't fail the task
    }
  }

  /**
   * Audit log helper
   */
  protected async auditLog(entry: any): Promise<void> {
    try {
      await this.dbService.createSystemAuditEntry({
        task_id: entry.taskId,
        agent_role: this.agentRole,
        action: entry.action,
        details: entry,
        user_id: entry.tenantContext?.sessionUserId
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error, entry });
      // Non-critical error - don't fail the task
    }
  }

  /**
   * Create a UI augmentation request
   */
  protected async createUIAugmentationRequest(
    taskId: string,
    request: UIAugmentationRequest
  ): Promise<string> {
    const augmentation = await this.dbService.createUIAugmentation({
      task_id: taskId,
      agent_role: this.agentRole,
      request_id: request.requestId,
      sequence_number: Date.now(), // Simple sequence for now
      presentation: request.presentation,
      action_pills: request.actionPills,
      form_sections: request.formSections,
      context: request.context,
      response_config: request.responseConfig,
      tenant_context: request.tenantContext,
      status: 'pending'
    });

    return augmentation.id;
  }

  /**
   * Handle UI augmentation response
   */
  async handleUIResponse(
    augmentationId: string,
    response: UIAugmentationResponse
  ): Promise<void> {
    await this.dbService.updateUIAugmentationStatus(
      augmentationId,
      'responded',
      response.formData
    );
  }

  /**
   * Get agent capabilities (for A2A discovery)
   */
  getCapabilities(): AgentCapabilities {
    return this.capabilities;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    agent: string;
    version: string;
    details?: any;
  }> {
    try {
      // Test database connection
      await this.dbService.getSystemAgentMetrics();
      
      return {
        healthy: true,
        agent: this.agentId,
        version: this.capabilities.version
      };
    } catch (error) {
      return {
        healthy: false,
        agent: this.agentId,
        version: this.capabilities.version,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Generate a unique ID
   */
  protected generateId(): string {
    return `${this.agentRole}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Custom error class for tenant access violations
export class TenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

// Future A2A integration point
// When we add the real A2A SDK, we'll extend this class:
// export abstract class BaseA2AAgent extends A2AAgent { ... }