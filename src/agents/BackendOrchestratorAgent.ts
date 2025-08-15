/**
 * BackendOrchestratorAgent - Migrated from OrchestratorService
 * Frontend integration layer for backend OrchestratorAgent communication
 */

import { BaseAgent } from './base/UnifiedBaseAgent';
import { AgentTaskContext as TaskContext, ensureAgentContext, createMinimalContext } from '../types/unified-agent-types';
import { logger } from '../utils/logger';

// Enhanced interfaces for A2A protocol
export interface TaskCreationRequest {
  templateId: string;
  initialData: Record<string, unknown>;
  userToken?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

export interface TaskCreationResult {
  taskId: string;
  contextId: string;
  status: 'created' | 'failed';
  message?: string;
}

export interface UIResponseSubmission {
  contextId: string;
  requestId: string;
  response: Record<string, unknown>;
  action: 'submit' | 'cancel' | 'skip';
  timestamp?: string;
}

export interface BackendTaskContext {
  contextId: string;
  taskId: string;
  status: string;
  currentPhase: string;
  completeness: number;
  uiRequests: Array<{
    requestId: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  agentStates: Record<string, unknown>;
  lastUpdated: string;
}

export class BackendOrchestratorAgent extends BaseAgent {
  private backendBaseURL: string;

  constructor() {
    super('src/agents/configs/backend-orchestrator-agent.yaml');
    this.backendBaseURL = process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001';
  }

  protected async executeTaskLogic(
    taskId: string, 
    context: TaskContext, 
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    // Ensure context has all required fields
    const safeContext = ensureAgentContext(context);
    const operation = parameters.operation as string;
    
    try {
      switch (operation) {
        case 'createTask':
          return await this.handleTaskCreation(taskId, safeContext, parameters);
        case 'getTaskContext':
          return await this.handleContextRetrieval(taskId, safeContext, parameters);
        case 'submitUIResponse':
          return await this.handleUIResponseSubmission(taskId, safeContext, parameters);
        case 'monitorTaskProgress':
          return await this.handleTaskProgressMonitoring(taskId, safeContext, parameters);
        case 'cancelTask':
          return await this.handleTaskCancellation(taskId, safeContext, parameters);
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      logger.error('BackendOrchestratorAgent: Task execution failed', {
        taskId,
        operation,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Update context with error information
      safeContext.agentContexts[this.agentId] = {
        ...safeContext.agentContexts[this.agentId],
        state: {
          ...safeContext.agentContexts[this.agentId]?.state,
          error: error instanceof Error ? error.message : String(error),
          lastOperation: operation,
          failedAt: new Date().toISOString()
        }
      };
      
      return safeContext;
    }
  }

  private async handleTaskCreation(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const request = parameters.request as TaskCreationRequest;
    
    if (!request || !request.templateId) {
      throw new Error('Task creation request with templateId is required');
    }

    // Validate user session
    const userToken = request.userToken || context.userToken;
    if (!userToken) {
      throw new Error('User authentication token is required');
    }

    // Use backend_api tool to create task
    const createTaskResult = await this.toolChain.executeTool('backend_api', {
      endpoint: '/api/tasks/create',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        templateId: request.templateId,
        initialData: request.initialData,
        priority: request.priority || 'normal'
      }
    });

    if (!createTaskResult.success) {
      throw new Error(`Task creation failed: ${createTaskResult.error || 'Unknown error'}`);
    }

    const result: TaskCreationResult = {
      taskId: createTaskResult.data.taskId,
      contextId: createTaskResult.data.contextId,
      status: 'created',
      message: 'Task created successfully'
    };

    // Update context with task creation results
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        taskCreationResult: result,
        activeContextId: result.contextId,
        backendTaskId: result.taskId
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_creation',
          data: result,
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('BackendOrchestratorAgent: Task created successfully', {
      taskId,
      contextId: result.contextId,
      templateId: request.templateId
    });

    return context;
  }

  private async handleContextRetrieval(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const contextId = parameters.contextId as string;
    
    if (!contextId) {
      throw new Error('Context ID is required for context retrieval');
    }

    const userToken = context.userToken;
    if (!userToken) {
      throw new Error('User authentication token is required');
    }

    // Fetch context from backend
    const getContextResult = await this.toolChain.executeTool('backend_api', {
      endpoint: `/api/tasks/context/${contextId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (!getContextResult.success) {
      throw new Error(`Context retrieval failed: ${getContextResult.error || 'Unknown error'}`);
    }

    const backendContext: BackendTaskContext = getContextResult.data;

    // Transform backend context to frontend TaskContext format
    const updatedContext = this.transformBackendContext(context, backendContext);

    // Update agent state with retrieved context
    updatedContext.agentContexts![this.agentId] = {
      ...updatedContext.agentContexts![this.agentId],
      state: {
        ...updatedContext.agentContexts![this.agentId]?.state,
        lastContextRetrieval: new Date().toISOString(),
        backendContext,
        contextSyncStatus: 'synced'
      },
      findings: [
        ...(updatedContext.agentContexts![this.agentId]?.findings || []),
        {
          type: 'context_retrieval',
          data: {
            contextId,
            completeness: backendContext.completeness,
            phase: backendContext.currentPhase
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('BackendOrchestratorAgent: Context retrieved successfully', {
      taskId,
      contextId,
      completeness: backendContext.completeness,
      phase: backendContext.currentPhase
    });

    return updatedContext;
  }

  private async handleUIResponseSubmission(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const submission = parameters.submission as UIResponseSubmission;
    
    if (!submission || !submission.contextId || !submission.requestId) {
      throw new Error('UI response submission requires contextId and requestId');
    }

    const userToken = context.userToken;
    if (!userToken) {
      throw new Error('User authentication token is required');
    }

    // Submit UI response to backend
    const submitResult = await this.toolChain.executeTool('backend_api', {
      endpoint: '/api/tasks/ui-response',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        contextId: submission.contextId,
        requestId: submission.requestId,
        response: submission.response,
        action: submission.action,
        timestamp: submission.timestamp || new Date().toISOString()
      }
    });

    if (!submitResult.success) {
      throw new Error(`UI response submission failed: ${submitResult.error || 'Unknown error'}`);
    }

    // Update context with submission results
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        lastUISubmission: {
          requestId: submission.requestId,
          action: submission.action,
          submittedAt: new Date().toISOString(),
          status: 'submitted'
        }
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'ui_response_submission',
          data: {
            requestId: submission.requestId,
            action: submission.action,
            responseSize: JSON.stringify(submission.response).length
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    // Clear the submitted UI request from pending requests
    if (context.pendingInputRequests) {
      context.pendingInputRequests = context.pendingInputRequests.filter(
        req => req.id !== submission.requestId
      );
    }

    logger.info('BackendOrchestratorAgent: UI response submitted successfully', {
      taskId,
      contextId: submission.contextId,
      requestId: submission.requestId,
      action: submission.action
    });

    return context;
  }

  private async handleTaskProgressMonitoring(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const contextId = parameters.contextId as string || 
                    context.agentContexts![this.agentId]?.state?.activeContextId;
    
    if (!contextId) {
      throw new Error('Context ID is required for progress monitoring');
    }

    // Fetch latest context to monitor progress
    const updatedContext = await this.handleContextRetrieval(taskId, context, { contextId });
    
    const backendContext = updatedContext.agentContexts![this.agentId]?.state?.backendContext;
    
    if (backendContext) {
      // Check for completion
      if (backendContext.completeness >= 100 || backendContext.status === 'completed') {
        // Emit completion event
        await this.emitTaskCompletionEvent(taskId, contextId, backendContext);
      }
      
      // Check for new UI requests
      if (backendContext.uiRequests && backendContext.uiRequests.length > 0) {
        // Process new UI requests
        if (!updatedContext.pendingInputRequests) {
          updatedContext.pendingInputRequests = [];
        }
        updatedContext.pendingInputRequests.push(
          ...backendContext.uiRequests.map((uiReq: any) => ({
            id: uiReq.requestId,
            requestingAgent: 'backend',
            priority: 'required' as const,
            promptType: uiReq.type as any,
            prompt: {
              title: uiReq.data.title || 'Additional Information Required',
              description: uiReq.data.description || '',
              fieldName: uiReq.data.fieldName || 'input',
              validation: uiReq.data.validation,
              defaultValue: uiReq.data.defaultValue,
              helpText: uiReq.data.helpText
            },
            context: {
              phase: backendContext.currentPhase,
              reason: uiReq.data.reason || 'Backend agent requires additional information',
              impact: 'blocking' as const
            },
            targetPath: uiReq.data.targetPath || `sharedContext.${uiReq.data.fieldName}`
          }))
        );
      }
    }

    logger.info('BackendOrchestratorAgent: Progress monitoring completed', {
      taskId,
      contextId,
      completeness: backendContext?.completeness || 0,
      pendingUIRequests: (updatedContext.pendingInputRequests || []).length
    });

    return updatedContext;
  }

  private async handleTaskCancellation(
    taskId: string,
    context: TaskContext,
    parameters: Record<string, unknown>
  ): Promise<TaskContext> {
    const contextId = parameters.contextId as string;
    const reason = parameters.reason as string || 'User requested cancellation';
    
    if (!contextId) {
      throw new Error('Context ID is required for task cancellation');
    }

    const userToken = context.userToken;
    if (!userToken) {
      throw new Error('User authentication token is required');
    }

    // Cancel task via backend API
    const cancelResult = await this.toolChain.executeTool('backend_api', {
      endpoint: `/api/tasks/${contextId}/cancel`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        reason
      }
    });

    if (!cancelResult.success) {
      throw new Error(`Task cancellation failed: ${cancelResult.error || 'Unknown error'}`);
    }

    // Update context with cancellation
    // Update context status
    if (context.status) {
      context.status = 'failed';
    }
    context.agentContexts![this.agentId] = {
      ...context.agentContexts![this.agentId],
      state: {
        ...context.agentContexts![this.agentId]?.state,
        cancelled: true,
        cancellationReason: reason,
        cancelledAt: new Date().toISOString()
      },
      findings: [
        ...(context.agentContexts![this.agentId]?.findings || []),
        {
          type: 'task_cancellation',
          data: { reason, contextId },
          timestamp: new Date().toISOString()
        }
      ]
    };

    logger.info('BackendOrchestratorAgent: Task cancelled successfully', {
      taskId,
      contextId,
      reason
    });

    return context;
  }

  private transformBackendContext(
    frontendContext: TaskContext, 
    backendContext: BackendTaskContext
  ): TaskContext {
    // Transform backend context format to frontend TaskContext format
    return {
      ...frontendContext,
      status: this.mapBackendStatus(backendContext.status),
      currentPhase: backendContext.currentPhase,
      completedPhases: this.extractCompletedPhases(backendContext),
      sharedContext: {
        ...frontendContext.sharedContext,
        metadata: {
          ...(frontendContext.sharedContext?.metadata || {}),
          completeness: backendContext.completeness,
          lastBackendSync: new Date().toISOString()
        }
      }
    };
  }

  private mapBackendStatus(backendStatus: string): TaskContext['status'] {
    switch (backendStatus.toLowerCase()) {
      case 'active':
      case 'running':
        return 'active';
      case 'paused':
      case 'waiting_for_input':
        return 'active' as any; // paused_for_input is not a valid status
      case 'completed':
      case 'finished':
        return 'completed';
      case 'failed':
      case 'error':
        return 'failed';
      default:
        return 'active';
    }
  }

  private extractCompletedPhases(_backendContext: BackendTaskContext): string[] {
    // Extract completed phases from backend context
    // This would depend on the backend context structure
    return [];
  }

  private async emitTaskCompletionEvent(
    taskId: string, 
    contextId: string, 
    backendContext: BackendTaskContext
  ): Promise<void> {
    try {
      // Emit completion event to EventsAgent
      await this.sendA2AMessage('EventsAgent', {
        type: 'task_completion',
        payload: {
          taskId,
          contextId,
          completeness: backendContext.completeness,
          completedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.warn('BackendOrchestratorAgent: Failed to emit completion event', {
        taskId,
        contextId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Public convenience methods for frontend integration
  async createTask(request: TaskCreationRequest): Promise<TaskCreationResult> {
    const dummyContext = createMinimalContext({
      taskId: 'temp',
      taskType: 'creation',
      userId: 'temp',
      userToken: request.userToken || '',
      status: 'active',
      currentPhase: 'creation'
    });

    const result = await this.executeTask('create-task', dummyContext, {
      operation: 'createTask',
      request
    });

    const creationResult = result.agentContexts![this.agentId]?.state?.taskCreationResult;
    if (!creationResult) {
      throw new Error('Task creation failed - no result returned');
    }

    return creationResult;
  }

  async getTaskContext(contextId: string, userToken: string): Promise<BackendTaskContext> {
    const dummyContext = createMinimalContext({
      taskId: 'temp',
      taskType: 'retrieval',
      userId: 'temp',
      userToken,
      status: 'active',
      currentPhase: 'retrieval'
    });

    const result = await this.executeTask('get-context', dummyContext, {
      operation: 'getTaskContext',
      contextId
    });

    const backendContext = result.agentContexts![this.agentId]?.state?.backendContext;
    if (!backendContext) {
      throw new Error('Context retrieval failed - no context returned');
    }

    return backendContext;
  }

  async submitUIResponse(submission: UIResponseSubmission, userToken: string): Promise<void> {
    const dummyContext = createMinimalContext({
      taskId: 'temp',
      taskType: 'submission',
      userId: 'temp',
      userToken,
      status: 'active',
      currentPhase: 'submission'
    });

    await this.executeTask('submit-response', dummyContext, {
      operation: 'submitUIResponse',
      submission
    });
  }
}

// Factory function for creating OrchestratorService instances (backward compatibility)
export function createOrchestratorService(userToken: string) {
  const agent = new BackendOrchestratorAgent();
  
  return {
    async createTask(request: Omit<TaskCreationRequest, 'userToken'>) {
      return agent.createTask({ ...request, userToken });
    },
    
    async getTaskContext(contextId: string) {
      return agent.getTaskContext(contextId, userToken);
    },
    
    async submitUIResponse(submission: UIResponseSubmission) {
      return agent.submitUIResponse(submission, userToken);
    }
  };
}

export default { createOrchestratorService };