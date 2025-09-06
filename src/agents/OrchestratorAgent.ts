/**
 * OrchestratorAgent - Universal Task Orchestration
 * 
 * Engine PRD Compliant Implementation (Lines 847-1033)
 * The single, universal orchestrator that handles ALL task types
 * 
 * CORE PRINCIPLES:
 * 1. Everything is a task, everything is configuration
 * 2. Zero special cases - handles onboarding, SOI, any task identically
 * 3. Progressive disclosure - minimize user interruption
 * 4. Complete traceability - record all decisions with reasoning
 * 5. Resilient fallbacks - graceful degradation when automation unavailable
 * 
 * This consolidates patterns from:
 * - PRDOrchestrator: LLM-powered planning and reasoning
 * - ResilientOrchestrator: Graceful degradation patterns
 * - A2AOrchestrator: Agent coordination protocol
 * - BaseOrchestrator: Core message handling
 */

import { BaseAgent } from './base/BaseAgent';
import { ConfigurationManager } from '../services/configuration-manager';
import { DatabaseService } from '../services/database';
import { StateComputer } from '../services/state-computer';
import { TaskService } from '../services/task-service';
import { A2AEventBus } from '../services/a2a-event-bus';
import { taskPerformanceTracker } from '../services/task-performance-tracker';
import { TASK_STATUS } from '../constants/task-status';
// ExecutionPhase enum is available from '../constants/execution-phases' when needed
// Currently using ExecutionPhase type from engine-types for compatibility
import { logger } from '../utils/logger';
import {
  TaskContext,
  ExecutionPlan,
  ExecutionPhase,
  AgentRequest,
  AgentResponse,
  UIRequest,
  UITemplateType,
  OrchestratorRequest,
  OrchestratorResponse,
  TaskStatus
} from '../types/task-engine.types';
import { 
  OrchestratorOperation,
  OrchestratorEventData 
} from '../types/orchestrator-schemas';
import { validateOrchestratorPayload } from '../validation/orchestrator-validation';
import { ORCHESTRATOR_OPS } from '../constants/orchestrator-operations';

/**
 * JSON Schema templates for consistent LLM responses
 */
const _EXECUTION_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    reasoning: {
      type: "object",
      properties: {
        task_analysis: { type: "string" },
        subtask_decomposition: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              subtask: { type: "string" },
              required_capabilities: { type: "array", items: { type: "string" } },
              assigned_agent: { type: "string" },
              rationale: { type: "string" }
            }
          }
        },
        coordination_strategy: { type: "string" }
      },
      required: ["task_analysis", "subtask_decomposition", "coordination_strategy"]
    },
    phases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          subtasks: {
            type: "array",
            items: {
              type: "object", 
              properties: {
                description: { type: "string" },
                agent: { type: "string" },
                specific_instruction: { type: "string" },
                input_data: { type: "object" },
                expected_output: { type: "string" },
                success_criteria: { type: "array", items: { type: "string" } }
              },
              required: ["description", "agent", "specific_instruction"]
            }
          },
          parallel_execution: { type: "boolean" },
          dependencies: { type: "array", items: { type: "string" } }
        },
        required: ["name", "subtasks"]
      }
    },
    estimated_duration: { type: "string" },
    user_interactions: { type: "string", enum: ["none", "minimal", "guided", "extensive"] }
  },
  required: ["reasoning", "phases"]
};

/**
 * Orchestration configuration
 */
interface OrchestratorConfig {
  id: string;
  version: string;
  mission: string;
  planningRules: string[];
  progressiveDisclosure: {
    enabled: boolean;
    batchingStrategy: 'intelligent' | 'sequential' | 'priority';
    minBatchSize: number;
    maxUserInterruptions: number;
  };
  resilience: {
    fallbackStrategy: 'degrade' | 'guide' | 'fail';
    maxRetries: number;
    timeoutMs: number;
  };
}

/**
 * Agent capability definition with detailed specialization information
 * Used by the Orchestrator to understand what each agent can accomplish
 * and how to decompose complex tasks into appropriate subtasks
 */
interface AgentCapability {
  agentId: string;
  role: string;
  capabilities: string[];
  availability: 'available' | 'busy' | 'offline' | 'not_implemented';
  specialization: string; // Human-readable description of what this agent specializes in
  fallbackStrategy?: 'user_input' | 'alternative_agent' | 'defer';
}

/**
 * Universal OrchestratorAgent
 * The conductor of the SmallBizAlly symphony
 * 
 * Now extends BaseAgent to gain event emission and standard agent capabilities
 * while maintaining its special orchestration responsibilities
 */
export class OrchestratorAgent extends BaseAgent {
  private static instance: OrchestratorAgent;
  
  private config: OrchestratorConfig;
  private configManager: ConfigurationManager;
  private dbService: DatabaseService;
  private stateComputer: StateComputer;
  
  // Agent registry and coordination
  private agentRegistry: Map<string, AgentCapability>;
  private activeExecutions: Map<string, ExecutionPlan>;
  private pendingUIRequests: Map<string, UIRequest[]>;
  // NO agent tracking - use factory pattern for all agent instantiation
  // Factory handles lifecycle - we just notify when task completes/fails
  
  // Pure A2A System - Agent Lifecycle Management via DI
  // NO AGENT INSTANCES STORED - Using DI and task-centered message bus
  private agentCapabilities: Map<string, any> = new Map();
  private activeTaskSubscriptions: Map<string, Set<string>> = new Map(); // taskId -> Set of agentIds
  
  private constructor() {
    try {
      logger.info('🚀 OrchestratorAgent constructor starting...');
      
      // Call BaseAgent constructor with orchestrator config
      // Using 'system' as businessId since orchestrator works across all businesses
      logger.info('📄 Loading BaseAgent with orchestrator.yaml...');
      super('orchestrator.yaml', 'system', 'system');
      logger.info('✅ BaseAgent constructor completed successfully');
      
      logger.info('⚙️ Loading orchestrator config...');
      this.config = this.loadConfig();
      logger.info('✅ Orchestrator config loaded successfully');
      
      logger.info('🗃️ Initializing data structures...');
      this.agentRegistry = new Map();
      this.activeExecutions = new Map();
      this.pendingUIRequests = new Map();
      logger.info('✅ Data structures initialized');
      
      // Lazy initialization to avoid startup crashes
      logger.info('🔌 Setting up lazy initialization for services...');
      this.configManager = null as any;
      this.dbService = null as any;
      this.stateComputer = null as any;
      logger.info('✅ Lazy initialization configured');
      
      logger.info('📋 Agent registry will be initialized dynamically from YAML on first use');
      // Agent registry is now initialized asynchronously when needed
      // since YAML files are the ONLY source of truth
      
      // Set up event listeners for UI responses
      this.setupEventListeners();
      
      logger.info('🎉 OrchestratorAgent constructor completed successfully!');
    } catch (error) {
      console.error('ERROR: OrchestratorAgent constructor failed:', error);
      logger.error('💥 FATAL: OrchestratorAgent constructor failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * Set up event listeners for orchestrator
   * Listens for UI_RESPONSE_SUBMITTED events to resume task processing
   */
  private setupEventListeners(): void {
    try {
      logger.info('🎧 Setting up orchestrator event listeners...');
      
      // Get the A2A event bus instance
      const a2aEventBus = A2AEventBus.getInstance();
      
      // Subscribe to the global channel for UI response events
      // We use global channel because we want to hear about ALL UI responses
      a2aEventBus.on('global:event', async (event: any) => {
        // Process UI_RESPONSE_SUBMITTED events
        if (event.operation === ORCHESTRATOR_OPS.UI_RESPONSE_SUBMITTED || 
            event.type === ORCHESTRATOR_OPS.UI_RESPONSE_SUBMITTED) {
          await this.handleUIResponseEvent(event);
        }
        
        // Process AGENT_EXECUTION_FAILED events
        // Monitor subagent failures and decide how to proceed
        if (event.type === 'AGENT_EXECUTION_FAILED' || 
            event.operation === 'AGENT_EXECUTION_FAILED' ||
            (event.data && event.data.type === 'AGENT_EXECUTION_FAILED')) {
          await this.handleAgentExecutionFailed(event);
        }
      });
      
      logger.info('✅ Orchestrator event listeners configured');
    } catch (error) {
      logger.error('Failed to set up event listeners', error);
      // Don't throw - orchestrator can still work without event listeners
    }
  }
  
  /**
   * Handle UI_RESPONSE_SUBMITTED events
   * Resume task orchestration with the new user input
   * 
   * AGENT LIFECYCLE & MEMORY MANAGEMENT:
   * - Agents are EPHEMERAL - created when needed, destroyed after work
   * - When blocked: Agent saves state to DB and is garbage collected
   * - When resuming: Fresh agent created with full context from DB
   * - This ensures no memory leaks and allows horizontal scaling
   * 
   * The only persistent agent is the OrchestratorAgent (singleton)
   * All other agents are stateless workers that exist only during execution
   */
  private async handleUIResponseEvent(event: any): Promise<void> {
    const taskId = event.taskId;
    const requestId = event.data?.requestId;
    
    logger.info('📥 Orchestrator received UI_RESPONSE_SUBMITTED event', {
      taskId,
      requestId,
      operation: event.operation
    });
    
    try {
      // Use TaskService to get raw task data
      const taskService = TaskService.getInstance();
      const taskContext = await taskService.getTaskContextById(taskId);
      
      if (!taskContext) {
        logger.warn('Task context not found for UI response', { taskId });
        return;
      }
      
      // Orchestrator interprets the events to understand task state
      // Check if there are pending UI requests by looking at recent events
      const recentEvents = taskContext.history.slice(-10);
      let hasPendingUIRequest = false;
      
      for (const historyEntry of recentEvents.reverse()) {
        // This is orchestrator's domain knowledge - it knows about agent operations
        if (historyEntry.operation === ORCHESTRATOR_OPS.AGENT_EXECUTION_PAUSED && 
            historyEntry.data?.uiRequests) {
          // Check if this was already responded to
          const responseExists = taskContext.history.find(e => 
            e.operation === ORCHESTRATOR_OPS.UI_RESPONSE_SUBMITTED && 
            e.timestamp > historyEntry.timestamp &&
            e.data?.requestId === historyEntry.data?.requestId
          );
          
          if (!responseExists) {
            hasPendingUIRequest = true;
            break;
          }
        }
      }
      
      // The UI response event we just received resolves the pending request
      if (hasPendingUIRequest) {
        logger.info('UI request has been resolved by user response', { taskId });
      }
      
      // Don't modify metadata with lastUIResponse - this doesn't handle multiple cycles
      // The complete event history already contains all UI responses
      // Agents can query the history to find the responses they need
      
      // Update the current state to reflect we're resuming
      // Set task status to in_progress (using TASK_STATUS enum)
      taskContext.currentState.status = TASK_STATUS.IN_PROGRESS;
      
      // CRITICAL: Also persist this status change to the database
      await this.updateTaskStatus(taskContext, TASK_STATUS.IN_PROGRESS);
      
      // Clean up any stale execution plans to allow garbage collection
      // Agents should be ephemeral - created when needed, destroyed when done
      if (this.activeExecutions.has(taskId)) {
        logger.info('Cleaning up stale execution plan for task resumption', {
          taskId,
          hadActiveExecution: true
        });
        this.activeExecutions.delete(taskId);
      }
      
      logger.info('🔄 Resuming task orchestration after UI response', {
        taskId,
        currentStatus: taskContext.currentState.status,
        historyLength: taskContext.history.length
      });
      
      // Resume orchestration with the updated context
      // The orchestrateTask method will:
      // 1. Check the current state and context
      // 2. Identify which agents need to work next
      // 3. Continue the collaborative cycle with the new user input
      await this.orchestrateTask(taskContext);
      
      logger.info('✅ Task orchestration resumed successfully', {
        taskId,
        newStatus: taskContext.currentState.status
      });
      
    } catch (error) {
      logger.error('Failed to resume task orchestration after UI response', {
        taskId,
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - we don't want to crash the orchestrator
    }
  }

  /**
   * Handle AGENT_EXECUTION_FAILED events
   * Intelligent failure handling - determine if failure is recoverable or terminal
   * 
   * FAILURE CATEGORIES:
   * - RATE_LIMITED: Temporary, should retry with backoff
   * - TIMEOUT: May retry once or twice
   * - VALIDATION_ERROR: Terminal, needs user correction
   * - SYSTEM_ERROR: Terminal, infrastructure issue
   * - NON_CRITICAL: Log but continue (e.g., celebration_agent failure)
   */
  private async handleAgentExecutionFailed(event: any): Promise<void> {
    try {
      // Log that we're handling a failure
      logger.info('🚨 OrchestratorAgent handling agent failure event', { 
        eventType: 'AGENT_EXECUTION_FAILED',
        eventData: event 
      });
      
      // Extract failure details from event
      const taskId = event.taskId || event.data?.taskId;
      const agentId = event.agentId || event.data?.agentId;
      const error = event.error || event.data?.error || 'Unknown error';
      const requestId = event.requestId || event.data?.requestId;
      
      if (!taskId || !agentId) {
        logger.warn('⚠️ Received AGENT_EXECUTION_FAILED without taskId or agentId', { event });
        return;
      }
      
      logger.warn('🔴 Agent execution failed', {
        taskId,
        agentId,
        error,
        requestId
      });
      
      // Categorize the failure
      const failureCategory = this.categorizeFailure(error, agentId);
      
      // Determine action based on failure category and agent criticality
      const action = await this.determineFailureAction(taskId, agentId, failureCategory, error);
      
      logger.info('📊 Failure analysis complete', {
        taskId,
        agentId,
        failureCategory,
        action: action.type,
        willRetry: action.retry,
        newStatus: action.newTaskStatus
      });
      
      // Execute the determined action
      await this.executeFailureAction(taskId, agentId, action, error);
      
    } catch (error) {
      logger.error('❌ Error handling agent failure event', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - we don't want failure handling to crash the orchestrator
    }
  }
  
  /**
   * Categorize the type of failure for intelligent handling
   */
  private categorizeFailure(error: string, _agentId: string): string {
    const errorLower = error.toLowerCase();
    
    // Rate limiting errors - always recoverable
    if (errorLower.includes('rate limit') || 
        errorLower.includes('429') ||
        errorLower.includes('too many requests')) {
      return 'RATE_LIMITED';
    }
    
    // Timeout errors - sometimes recoverable
    if (errorLower.includes('timeout') || 
        errorLower.includes('timed out') ||
        errorLower.includes('deadline exceeded')) {
      return 'TIMEOUT';
    }
    
    // Validation errors - not recoverable, need user input
    if (errorLower.includes('validation') || 
        errorLower.includes('invalid') ||
        errorLower.includes('missing required')) {
      return 'VALIDATION_ERROR';
    }
    
    // Network errors - might be recoverable
    if (errorLower.includes('network') || 
        errorLower.includes('connection') ||
        errorLower.includes('econnrefused')) {
      return 'NETWORK_ERROR';
    }
    
    // Tool not found - configuration error
    if (errorLower.includes('unknown tool') || 
        errorLower.includes('tool not found') ||
        errorLower.includes('undefined') && errorLower.includes('substring')) {
      return 'CONFIGURATION_ERROR';
    }
    
    // Default to system error
    return 'SYSTEM_ERROR';
  }
  
  /**
   * Determine what action to take based on failure type and agent
   */
  private async determineFailureAction(
    taskId: string, 
    agentId: string, 
    failureCategory: string,
    error: string
  ): Promise<{
    type: 'retry' | 'continue' | 'fail' | 'pause';
    retry?: { delay: number; maxAttempts: number };
    newTaskStatus?: string;
    statusReason?: string;
  }> {
    // Check if agent is critical for task completion
    const isAgentCritical = this.isAgentCritical(agentId);
    
    // Get retry attempts for this agent if any
    const retryKey = `${taskId}-${agentId}`;
    const currentAttempts = this.retryAttempts.get(retryKey) || 0;
    
    switch (failureCategory) {
      case 'RATE_LIMITED':
        // Always retry rate limited requests with exponential backoff
        if (currentAttempts < 3) {
          const delay = Math.min(1000 * Math.pow(2, currentAttempts), 30000); // Max 30s
          return {
            type: 'retry',
            retry: { delay, maxAttempts: 3 }
          };
        } else {
          // Max retries reached, pause task for manual intervention
          return {
            type: 'pause',
            newTaskStatus: 'waiting_for_input',
            statusReason: `Agent ${agentId} rate limited after ${currentAttempts} attempts. Please wait and retry.`
          };
        }
        
      case 'TIMEOUT':
        // Retry once for timeouts
        if (currentAttempts < 1) {
          return {
            type: 'retry',
            retry: { delay: 2000, maxAttempts: 1 }
          };
        } else if (!isAgentCritical) {
          // Non-critical agent timeout - continue without it
          return {
            type: 'continue',
            statusReason: `Non-critical agent ${agentId} timed out, continuing without it`
          };
        } else {
          return {
            type: 'fail',
            newTaskStatus: 'failed',
            statusReason: `Critical agent ${agentId} timed out: ${error}`
          };
        }
        
      case 'VALIDATION_ERROR':
        // Validation errors need user input to fix
        return {
          type: 'pause',
          newTaskStatus: 'waiting_for_input',
          statusReason: `Agent ${agentId} validation error: ${error}`
        };
        
      case 'CONFIGURATION_ERROR':
        // Configuration errors are not recoverable but might not be critical
        if (!isAgentCritical || agentId === 'celebration_agent') {
          return {
            type: 'continue',
            statusReason: `Non-critical agent ${agentId} has configuration issues, skipping`
          };
        } else {
          return {
            type: 'fail',
            newTaskStatus: 'failed',
            statusReason: `Critical agent ${agentId} configuration error: ${error}`
          };
        }
        
      case 'NETWORK_ERROR':
        // Retry network errors once
        if (currentAttempts < 1) {
          return {
            type: 'retry',
            retry: { delay: 3000, maxAttempts: 1 }
          };
        } else {
          return {
            type: 'fail',
            newTaskStatus: 'failed',
            statusReason: `Network error for agent ${agentId}: ${error}`
          };
        }
        
      default:
        // Unknown errors - fail if critical, continue if not
        if (!isAgentCritical) {
          return {
            type: 'continue',
            statusReason: `Non-critical agent ${agentId} failed: ${error}`
          };
        } else {
          return {
            type: 'fail',
            newTaskStatus: 'failed',
            statusReason: `Agent ${agentId} system error: ${error}`
          };
        }
    }
  }
  
  /**
   * Execute the determined failure action
   */
  private async executeFailureAction(
    taskId: string,
    agentId: string,
    action: any,
    error: string
  ): Promise<void> {
    const execution: any = this.activeExecutions.get(taskId);
    
    switch (action.type) {
      case 'retry': {
        // Schedule retry with delay
        const retryKey = `${taskId}-${agentId}`;
        const attempts = (this.retryAttempts.get(retryKey) || 0) + 1;
        this.retryAttempts.set(retryKey, attempts);
        
        logger.info(`⏰ Scheduling retry for ${agentId}`, {
          taskId,
          delay: action.retry.delay,
          attempt: attempts
        });
        
        setTimeout(async () => {
          logger.info(`🔁 Retrying ${agentId} execution`, { taskId, attempt: attempts });
          
          // Find the failed subtask and retry it
          if (execution && execution.subtasks) {
            const failedSubtask = execution.subtasks.find((st: any) => 
              st.agentId === agentId && st.status === 'failed'
            );
            
            if (failedSubtask) {
              failedSubtask.status = 'pending';
              await this.continueExecution(taskId);
            }
          } else {
            logger.error(`Cannot retry agent "${agentId}" for task ${taskId} - execution plan or subtasks not found. The task may have been cleaned up or the execution plan was not properly stored.`, { 
              taskId, 
              agentId,
              hasExecution: !!execution,
              hasSubtasks: execution?.subtasks ? 'yes' : 'no',
              executionKeys: execution ? Object.keys(execution) : []
            });
          }
        }, action.retry.delay);
        break;
      }
        
      case 'continue':
        // Log and continue with remaining agents
        logger.info(`➡️ Continuing without ${agentId}`, {
          taskId,
          reason: action.statusReason
        });
        
        // Mark subtask as skipped and continue
        if (execution) {
          const failedSubtask = execution.subtasks.find((st: any) => 
            st.agentId === agentId
          );
          
          if (failedSubtask) {
            failedSubtask.status = 'skipped';
            failedSubtask.result = { skipped: true, reason: action.statusReason };
          }
          
          await this.continueExecution(taskId);
        }
        break;
        
      case 'pause':
        // Update task status to waiting_for_input
        logger.info(`⏸️ Pausing task for manual intervention`, {
          taskId,
          reason: action.statusReason
        });
        
        await this.updateTaskStatusWithMetadata(taskId, action.newTaskStatus || 'waiting_for_input', {
          reason: action.statusReason,
          failedAgent: agentId,
          requiresIntervention: true
        });
        break;
        
      case 'fail':
        // Update task status to failed
        logger.error(`❌ Failing task due to critical agent failure`, {
          taskId,
          agentId,
          reason: action.statusReason
        });
        
        await this.updateTaskStatusWithMetadata(taskId, action.newTaskStatus || 'failed', {
          reason: action.statusReason,
          failedAgent: agentId,
          error
        });
        
        // Clean up execution
        if (execution) {
          execution.status = 'failed';
          this.activeExecutions.delete(taskId);
        }
        break;
    }
  }
  
  /**
   * Determine if an agent is critical for task completion
   */
  private isAgentCritical(agentId: string): boolean {
    // Non-critical agents that can fail without stopping the task
    const nonCriticalAgents = [
      'celebration_agent',
      'monitoring_agent',
      'ux_optimization_agent',
      'communication_agent'  // Can fail for notifications
    ];
    
    return !nonCriticalAgents.includes(agentId);
  }
  
  /**
   * Update task status in the database with metadata
   */
  private async updateTaskStatusWithMetadata(taskId: string, status: string, metadata?: any): Promise<void> {
    try {
      const taskService = TaskService.getInstance();
      
      // Update the task status
      await taskService.updateTaskStatus(taskId, status as any);
      
      // If we have metadata, add it via a context entry
      if (metadata) {
        const task = await taskService.getTask(taskId);
        if (task) {
          const _contextEntry = {
            entryId: `status-update-${Date.now()}`,
            sequenceNumber: task.history.length + 1,
            timestamp: new Date().toISOString(),
            actor: {
              type: 'agent' as const,
              id: 'orchestrator_agent',
              version: '1.0.0'
            },
            operation: 'status_update',
            data: {
              newStatus: status,
              metadata,
              statusReason: metadata.reason || metadata.statusReason
            },
            reasoning: metadata.reason || metadata.statusReason || `Status changed to ${status}`
          };
          
          // TODO: Add context entry when method is available
          // await taskService.addContextEntry(taskId, contextEntry);
        }
      }
      
      logger.info('📝 Updated task status', {
        taskId,
        newStatus: status,
        metadata
      });
    } catch (error) {
      logger.error('Failed to update task status', {
        taskId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Continue execution of a task after handling a failure
   */
  private async continueExecution(taskId: string): Promise<void> {
    const execution: any = this.activeExecutions.get(taskId);
    
    if (!execution) {
      logger.warn('No active execution found for task', { taskId });
      return;
    }
    
    // Find next pending subtask
    const nextSubtask = execution.subtasks.find((st: any) => st.status === 'pending');
    
    if (nextSubtask) {
      logger.info('📋 Continuing with next subtask', {
        taskId,
        agentId: nextSubtask.agentId
      });
      
      // Get fresh task context
      const taskService = TaskService.getInstance();
      const context = await taskService.getTask(taskId);
      
      if (context) {
        // Execute the next subtask
        try {
          nextSubtask.status = 'in_progress';
          const result = await this.executeSubtask(
            context,
            nextSubtask,
            execution.currentPhase || { name: 'continuation', priority: 1 },
            {},
            execution.subtasks.indexOf(nextSubtask)
          );
          
          nextSubtask.status = 'completed';
          nextSubtask.result = result;
          
          // Continue with remaining subtasks
          await this.continueExecution(taskId);
        } catch (error) {
          nextSubtask.status = 'failed';
          nextSubtask.error = error instanceof Error ? error.message : String(error);
          
          // Let the failure handler deal with it
          logger.error('Subtask failed during continuation', {
            taskId,
            agentId: nextSubtask.agentId,
            error: nextSubtask.error
          });
        }
      }
    } else {
      // No more subtasks - check if we can complete the task
      const failedSubtasks = execution.subtasks.filter((st: any) => st.status === 'failed');
      const skippedSubtasks = execution.subtasks.filter((st: any) => st.status === 'skipped');
      const completedSubtasks = execution.subtasks.filter((st: any) => st.status === 'completed');
      
      if (failedSubtasks.length === 0 || failedSubtasks.every((st: any) => !this.isAgentCritical(st.agentId))) {
        // All critical tasks completed successfully
        logger.info('✅ Task execution completed with partial success', {
          taskId,
          completed: completedSubtasks.length,
          skipped: skippedSubtasks.length,
          failed: failedSubtasks.length
        });
        
        await this.updateTaskStatusWithMetadata(taskId, 'completed', {
          partialSuccess: failedSubtasks.length > 0 || skippedSubtasks.length > 0,
          skippedAgents: skippedSubtasks.map((st: any) => st.agentId),
          failedAgents: failedSubtasks.map((st: any) => st.agentId)
        });
        
        execution.status = 'completed';
        
        // Clean up agents for completed task
        this.cleanupAgentsForTask(taskId);
        this.activeExecutions.delete(taskId);
      } else {
        // Critical failures exist
        logger.error('❌ Task cannot continue due to critical failures', {
          taskId,
          criticalFailures: failedSubtasks.filter((st: any) => this.isAgentCritical(st.agentId))
        });
      }
    }
  }
  
  // Add retry attempts tracker
  private retryAttempts: Map<string, number> = new Map();
  
  /**
   * 🔑 SINGLETON PATTERN - Critical for system initialization
   * 
   * This is THE entry point where OrchestratorAgent is created.
   * Called by AgentManager.initialize() during server startup.
   * 
   * INITIALIZATION FLOW:
   * 1. First call creates the instance
   * 2. Constructor calls BaseAgent constructor
   * 3. BaseAgent loads YAML configs
   * 4. BaseAgent creates ToolChain → CredentialVault
   * 5. CredentialVault REQUIRES Supabase env vars
   * 
   * COMMON FAILURES:
   * - Missing SUPABASE_URL/KEY → CredentialVault throws
   * - Missing orchestrator.yaml → BaseAgent throws
   * - Missing base_agent.yaml → BaseAgent throws
   * 
   * @returns The single OrchestratorAgent instance
   * @throws Error if initialization fails (missing config, etc)
   */
  public static getInstance(): OrchestratorAgent {
    if (!OrchestratorAgent.instance) {
      console.log('Creating first OrchestratorAgent instance (singleton)');
      OrchestratorAgent.instance = new OrchestratorAgent();
    }
    return OrchestratorAgent.instance;
  }

  /**
   * Record orchestrator events with schema validation
   * This ensures all orchestrator events follow the defined structure
   */
  private async recordOrchestratorEvent<T extends OrchestratorOperation>(
    context: TaskContext,
    operation: T,
    data: OrchestratorEventData<T>,
    reasoning: string
  ): Promise<void> {
    try {
      // Validate the data against the schema
      const validatedData = validateOrchestratorPayload(operation, data);
      
      // Record the validated event
      await this.recordContextEntry(context, {
        operation,
        data: validatedData,
        reasoning
      });
      
      logger.info(`✅ Recorded orchestrator event: ${operation}`, {
        contextId: context.contextId,
        operation,
        dataKeys: Object.keys(validatedData)
      });
    } catch (validationError) {
      // If validation fails, record with a warning but don't duplicate
      logger.warn(`⚠️ Validation failed for orchestrator event: ${operation}`, {
        contextId: context.contextId,
        operation,
        error: validationError instanceof Error ? validationError.message : 'Unknown error'
      });
      
      // Record once with the original data and a validation warning
      await this.recordContextEntry(context, {
        operation,
        data: { ...data, validation_warning: true },
        reasoning: `${reasoning} [VALIDATION WARNING: ${validationError instanceof Error ? validationError.message : 'Schema validation failed'}]`
      });
    }
  }

  /**
   * Lazy initialize services to avoid startup crashes
   */
  private getConfigManager(): ConfigurationManager {
    if (!this.configManager) {
      this.configManager = new ConfigurationManager();
    }
    return this.configManager;
  }

  private getDBService(): DatabaseService {
    if (!this.dbService) {
      this.dbService = DatabaseService.getInstance();
    }
    return this.dbService;
  }

  private getStateComputer(): StateComputer {
    if (!this.stateComputer) {
      this.stateComputer = new StateComputer();
    }
    return this.stateComputer;
  }
  
  /**
   * Load orchestrator configuration
   * Engine PRD Lines 799-841
   */
  private loadConfig(): OrchestratorConfig {
    try {
      logger.info('📋 loadConfig() called - returning hardcoded config');
      // In production, load from YAML
      // For now, return PRD-compliant config
      return {
      id: 'universal_orchestrator',
      version: '1.0.0',
      mission: `
        You are the Universal Task Orchestrator for SmallBizAlly.
        
        Your responsibilities:
        1. Interpret task templates to understand goals
        2. Create dynamic execution plans based on context
        3. Coordinate specialist agents to achieve goals
        4. Minimize user interruption through progressive disclosure
        5. Record all decisions with complete reasoning
        
        Critical principles:
        - UNIVERSAL: Handle ANY task type identically
        - PROGRESSIVE: Batch and reorder UI requests intelligently
        - RESILIENT: Gracefully degrade when automation unavailable
        - TRACEABLE: Record everything for complete audit trail
        - DECLARATIVE: Follow templates, never hardcode business logic
      `,
      planningRules: [
        'Exhaust autonomous methods before requesting user input',
        'Batch related UI requests to minimize interruptions',
        'Reorder questions to potentially avoid later ones',
        'Always have fallback strategies for unavailable services',
        'Record execution plans in TaskContext for traceability'
      ],
      progressiveDisclosure: {
        enabled: true,
        batchingStrategy: 'intelligent',
        minBatchSize: 3,
        maxUserInterruptions: 5
      },
      resilience: {
        fallbackStrategy: 'degrade',
        maxRetries: 3,
        timeoutMs: 30000
      }
    };
    } catch (error) {
      logger.error('💥 FATAL: loadConfig() failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // Return minimal config to prevent crash
      return {
        id: 'universal_orchestrator',
        version: '1.0.0',
        mission: 'Emergency fallback orchestrator',
        planningRules: [],
        progressiveDisclosure: {
          enabled: false,
          batchingStrategy: 'sequential' as const,
          minBatchSize: 1,
          maxUserInterruptions: 10
        },
        resilience: {
          fallbackStrategy: 'degrade' as const,
          maxRetries: 3,
          timeoutMs: 30000
        }
      };
    }
  }
  
  /**
   * Initialize agent registry with available agents
   */
  private async initializeAgentRegistry(): Promise<void> {
    try {
      logger.info('🤖 Initializing agent registry dynamically from YAML files...');
      
      // Use AgentDiscoveryService singleton to discover all agents from YAML files
      // YAML files are the ONLY source of truth for agent existence
      const { agentDiscovery } = await import('../services/agent-discovery');
      const agentCapabilities = await agentDiscovery.discoverAgents();
      
      logger.info(`📊 Discovered ${agentCapabilities.size} agents from YAML configurations`);
      
      // Register each discovered agent
      agentCapabilities.forEach((agent, agentId) => {
        logger.info(`🔧 Registering agent: ${agentId} (${agent.role})`);
        this.agentRegistry.set(agentId, agent as any);
      });
      
      logger.info(`✅ Agent registry initialized with ${this.agentRegistry.size} agents`);
    } catch (error) {
      logger.error('💥 FATAL: Agent registry initialization failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * Main orchestration entry point
   * Handles ANY task type through universal flow
   * Engine PRD Lines 847-881
   */
  public async orchestrateTask(context: TaskContext): Promise<void> {
    const startTime = Date.now();
    
    logger.info('🎯 orchestrateTask() CALLED', {
      contextId: context.contextId,
      templateId: context.taskTemplateId,
      tenantId: context.tenantId,
      currentStatus: context.currentState.status,
      hasMetadata: !!context.metadata,
      hasTaskDefinition: !!context.metadata?.taskDefinition,
      taskDefinitionKeys: context.metadata?.taskDefinition ? Object.keys(context.metadata.taskDefinition) : []
    });
    
    // DEBUG: Log full context for tracing
    logger.debug('📊 Full TaskContext received', {
      context: JSON.stringify(context, null, 2)
    });
    
    // CRITICAL: Immediately mark task as in_progress for recovery
    // This ensures the task can be recovered if the process crashes
    if (context.currentState.status === TASK_STATUS.PENDING) {
      logger.info('📌 Immediately setting task status to IN_PROGRESS for recovery', {
        contextId: context.contextId,
        previousStatus: context.currentState.status
      });
      context.currentState.status = TASK_STATUS.IN_PROGRESS;
      await this.updateTaskStatus(context, TASK_STATUS.IN_PROGRESS);
    }
    
    try {
      // Determine if we're resuming based on PERSISTENT HISTORY
      // Check if we have any execution history that indicates work was started
      const hasExecutionHistory = context.history.some(entry => 
        entry.operation === ORCHESTRATOR_OPS.EXECUTION_PLAN_CREATED || 
        entry.operation === ORCHESTRATOR_OPS.SUBTASK_DELEGATED ||
        entry.operation === ORCHESTRATOR_OPS.PHASE_STARTED
      );
      
      // We're resuming if:
      // 1. We have execution history (work was started)
      // 2. Task is not in a terminal state
      
      // Recovery: Check for unresolved UIRequests and reinstantiate agents as needed
      await this.recoverAgentsForPendingUIRequests(context);
      const isResuming = hasExecutionHistory && 
                        context.currentState.status !== TASK_STATUS.COMPLETED &&
                        context.currentState.status !== TASK_STATUS.FAILED &&
                        context.currentState.status !== TASK_STATUS.CANCELLED;
      
      logger.info(isResuming ? 'Resuming task orchestration' : 'Starting universal task orchestration', {
        contextId: context.contextId,
        templateId: context.taskTemplateId,
        tenantId: context.tenantId,
        hasExecutionHistory,
        taskStatus: context.currentState.status,
        historyLength: context.history.length,
        timestamp: new Date().toISOString()
      });
      
      // Start performance tracking for this task
      if (!isResuming) {
        taskPerformanceTracker.startTask(context.contextId);
      }
      taskPerformanceTracker.recordEvent(
        context.contextId, 
        'agent_start', 
        'orchestrator',
        { isResuming, taskType: context.currentState.task_type || 'unknown' }
      );
      
      // 1. Get or create execution plan
      // Check memory cache first (optimization)
      let executionPlan = this.activeExecutions.get(context.contextId);
      
      if (!executionPlan) {
        // Try to retrieve from event history (single source of truth)
        if (isResuming) {
          // Look for the execution plan in history - this is our single source of truth
          const planEvent = context.history.find(entry => 
            entry.operation === ORCHESTRATOR_OPS.EXECUTION_PLAN_CREATED
          );
          
          if (planEvent && planEvent.data?.plan) {
            logger.info('📋 Reconstructing execution plan from history', {
              contextId: context.contextId,
              hasPhases: !!(planEvent.data.plan as any).phases,
              hasSubtasks: !!(planEvent.data.plan as any).subtasks
            });
            
            const storedPlan = planEvent.data.plan as any;
            
            // Handle different plan formats robustly
            if (storedPlan.phases && Array.isArray(storedPlan.phases)) {
              // Modern format with phases - use as-is
              executionPlan = storedPlan as ExecutionPlan;
            } else if (storedPlan.subtasks && Array.isArray(storedPlan.subtasks)) {
              // Legacy format with just subtasks - convert to phases
              logger.warn('⚠️ Legacy execution plan format detected, converting to phases', {
                contextId: context.contextId
              });
              executionPlan = {
                phases: [{
                  name: 'Task Execution',
                  subtasks: storedPlan.subtasks.map((st: any) => ({
                    description: st.name || st.subtask || 'Subtask',
                    agent: st.assigned_agent || 'DefaultAgent',
                    specific_instruction: st.instructions || '',
                    input_data: {},
                    expected_output: st.expected_output || 'Task completed'
                  }))
                }],
                reasoning: {
                  task_analysis: storedPlan.task_analysis || 'Legacy plan reconstruction',
                  subtask_decomposition: storedPlan.subtasks || [],
                  coordination_strategy: storedPlan.coordination_strategy || 'Sequential'
                }
              } as any as ExecutionPlan;
            } else {
              // Unknown format - create minimal plan
              logger.error('❌ Unknown execution plan format in history', {
                contextId: context.contextId,
                planKeys: Object.keys(storedPlan)
              });
              throw new Error('Cannot reconstruct execution plan from history - unknown format');
            }
            
            // The execution plan is already stored in the event history
            // No need for parallel storage
          } else {
            // Last resort: create new plan
            logger.warn('⚠️ Could not find execution plan, creating new one', {
              contextId: context.contextId
            });
            executionPlan = await this.createExecutionPlan(context);
            // The execution plan is stored in event history by createExecutionPlan()
          }
        } else {
          // Fresh start - create new execution plan
          logger.info('📝 Creating execution plan...');
          executionPlan = await this.createExecutionPlan(context);
          
          // The execution plan is stored in event history by createExecutionPlan()
        }
        
        // Cache in memory for this session (performance optimization)
        if (executionPlan) {
          this.activeExecutions.set(context.contextId, executionPlan);
        }
      } else {
        logger.info('📋 Using cached execution plan', {
          contextId: context.contextId,
          phases: executionPlan?.phases?.length || 0
        });
      }
      
      // Ensure we have an execution plan at this point
      if (!executionPlan) {
        throw new Error('Failed to create or retrieve execution plan');
      }
      
      logger.info('✅ Execution plan ready', {
        contextId: context.contextId,
        phases: executionPlan.phases?.length || 0,
        estimatedDuration: (executionPlan as any).estimated_duration,
        userInteractions: (executionPlan as any).user_interactions
      });
      
      // NOTE: createExecutionPlan() already records the EXECUTION_PLAN_CREATED event
      // We don't need to record it again here to avoid duplicates
      
      // 3. Determine where to start/resume execution
      let startPhaseIndex = 0;
      
      // If resuming, find the last completed phase from history
      if (isResuming) {
        // Look through history for subtask_delegated events to find completed phases
        const completedPhases = new Set<string>();
        
        const phases = executionPlan.phases || [];
        
        for (const entry of context.history) {
          if (entry.operation === ORCHESTRATOR_OPS.SUBTASK_DELEGATED && entry.data?.subtask_name) {
            // Find which phase this subtask belongs to
            for (let i = 0; i < phases.length; i++) {
              const phase = phases[i];
              const subtasks = (phase as any).subtasks || [];
              if (subtasks.some((st: any) => st.description === entry.data.subtask_name)) {
                completedPhases.add(phase.name);
                startPhaseIndex = Math.max(startPhaseIndex, i + 1);
              }
            }
          }
        }
        
        logger.info('📊 Resume analysis complete', {
          contextId: context.contextId,
          completedPhases: Array.from(completedPhases),
          startingFromPhase: startPhaseIndex + 1,
          totalPhases: phases.length
        });
      }
      
      // 4. Execute plan phases (starting from the correct index)
      // Status is already set to IN_PROGRESS at the start of orchestrateTask
      
      let allPhasesCompleted = true;
      let phaseIndex = startPhaseIndex;
      const phases = executionPlan.phases || [];
      
      for (let i = startPhaseIndex; i < phases.length; i++) {
        const phase = phases[i];
        phaseIndex = i + 1;
        
        logger.info(`📌 ${isResuming && i === startPhaseIndex ? 'Resuming' : 'Executing'} phase ${phaseIndex}/${phases.length}: ${phase.name}`, {
          contextId: context.contextId,
          phaseName: phase.name,
          phaseNumber: phaseIndex,
          totalPhases: phases.length,
          isResuming: isResuming && i === startPhaseIndex
        });
        
        const phaseResult = await this.executePhase(context, phase);
        
        // 4. Calculate and persist task completeness
        // OrchestratorAgent is the SINGLE SOURCE OF TRUTH for progress
        const completeness = Math.round((phaseIndex / phases.length) * 100);
        const taskId = context.contextId; // contextId IS the taskId in our architecture
        await this.updateTaskCompleteness(taskId, completeness);
        
        // 5. Phase completion is tracked through subtask delegations
        // No need for separate phase_completed event to avoid duplicates
        
        // 6. Handle UI requests with progressive disclosure
        if (phaseResult.uiRequests && phaseResult.uiRequests.length > 0) {
          await this.handleProgressiveDisclosure(context, phaseResult.uiRequests);
        }
        
        // 6. Check if phase needs user input - pause execution
        // CRITICAL: When ANY agent returns 'needs_input', we MUST:
        // 1. Set task status to 'waiting_for_input' (NOT 'in_progress')
        // 2. Stop execution immediately (don't process more phases)
        // 3. Wait for user to provide the required input
        // This prevents premature task completion and ensures proper UX
        if (phaseResult.status === 'needs_input') { // Agent response status
          logger.info('⏸️ Phase requires user input, pausing task execution', {
            contextId: context.contextId,
            phaseName: phase.name,
            uiRequestCount: phaseResult.uiRequests?.length || 0
          });
          
          // Update task status to waiting_for_input
          // This tells the frontend that user action is REQUIRED to continue
          // The task is NOT failed, NOT completed, just waiting
          await this.updateTaskStatus(context, TASK_STATUS.WAITING_FOR_INPUT);
          
          // TaskService will handle the status update in the database
          
          // Don't mark as complete, exit orchestration loop
          allPhasesCompleted = false;
          break;
        }
        
        // 7. Check for critical failures that should stop execution
        if (phaseResult.status === 'failed' || phaseResult.criticalError) { // Agent response status
          logger.error(`Phase ${phaseIndex} failed critically, stopping execution`, {
            contextId: context.contextId,
            phaseName: phase.name,
            error: phaseResult.error
          });
          
          // Update task status to failed
          await this.updateTaskStatus(context, TASK_STATUS.FAILED);
          
          allPhasesCompleted = false;
          break;
        }
      }
      
      // 7. Only mark task complete if all phases executed successfully
      if (allPhasesCompleted) {
        logger.info('✅ All phases completed successfully, marking task as complete', {
          contextId: context.contextId,
          phasesExecuted: phaseIndex,
          totalPhases: phases.length
        });
        await this.completeTaskContext(context);
      } else {
        // Check WHY we didn't complete all phases before logging
        const currentStatus = context.currentState.status;
        
        // DEBUG: Log what status we actually have
        logger.debug('Status check debug', {
          contextId: context.contextId,
          currentStatus,
          waitingForInputConstant: TASK_STATUS.WAITING_FOR_INPUT,
          statusMatch: currentStatus === TASK_STATUS.WAITING_FOR_INPUT
        });
        
        if (currentStatus === TASK_STATUS.WAITING_FOR_INPUT) {
          // Task is not incomplete - it's intentionally paused waiting for user
          logger.info('⏸️ Task execution paused - waiting for user input', {
            contextId: context.contextId,
            phasesExecuted: phaseIndex,
            totalPhases: phases.length,
            status: currentStatus,
            resumedFromPhase: startPhaseIndex + 1
          });
          // Don't record as incomplete when waiting for input - this is expected behavior
        } else if (currentStatus === TASK_STATUS.FAILED) {
          // Task actually failed
          logger.error('❌ Task execution failed', {
            contextId: context.contextId,
            phasesExecuted: phaseIndex,
            totalPhases: phases.length,
            status: currentStatus
          });
          await this.recordContextEntry(context, {
            operation: `task_${TASK_STATUS.FAILED}`,
            data: {
              phasesCompleted: phaseIndex,
              totalPhases: phases.length,
              status: currentStatus,
              reason: 'Phase execution failed'
            },
            reasoning: 'Task failed during phase execution'
          });
        } else {
          // Some other unexpected state
          logger.warn('⚠️ Task execution incomplete - unexpected state', {
            contextId: context.contextId,
            phasesExecuted: phaseIndex,
            totalPhases: phases.length,
            status: currentStatus
          });
          await this.recordContextEntry(context, {
            operation: 'task_incomplete', // Keep as-is since there's no TASK_STATUS.INCOMPLETE
            data: {
              phasesCompleted: phaseIndex,
              totalPhases: phases.length,
              status: currentStatus,
              reason: 'Unexpected execution state'
            },
            reasoning: 'Task could not complete all planned phases due to unexpected state'
          });
        }
      }
      
      // Final summary log
      const finalStatus = context.currentState.status;
      const duration = Date.now() - startTime;
      
      logger.info('Task orchestration ended', {
        contextId: context.contextId,
        status: finalStatus,
        duration,
        phasesCompleted: phaseIndex,
        totalPhases: executionPlan.phases.length,
        wasResumed: isResuming,
        resumedFromPhase: isResuming ? startPhaseIndex + 1 : 1
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stackTrace = error instanceof Error ? error.stack : 'No stack trace available';
      logger.error('Orchestration failed', {
        contextId: context.contextId,
        error: errorMessage,
        stack: stackTrace
      });
      
      // Apply resilience strategy
      await this.handleOrchestrationFailure(context, error);
    }
  }
  
  /**
   * Create execution plan using LLM with detailed task decomposition analysis
   * This is the core intelligence of the orchestrator - breaking down complex business
   * tasks into specific subtasks that can be executed by specialized agents
   * 
   * Engine PRD Lines 915-972: Orchestrator must reason about task requirements,
   * analyze available agent capabilities, and create a coordinated execution plan
   */
  private async createExecutionPlan(context: TaskContext): Promise<ExecutionPlan> {
    logger.info('🧠 createExecutionPlan() starting', {
      contextId: context.contextId,
      hasAgentRegistry: this.agentRegistry.size > 0,
      businessId: context.businessId
    });
    
    // NOTE: Business memory search is handled by the orchestrator's LLM reasoning
    // based on instructions in orchestrator.yaml - not hardcoded here
    
    // CRITICAL: Check for missing business data using toolchain-first approach
    const taskType = context.currentState?.data?.taskType || 'general';
    const businessProfile = (context as any).businessProfile || {};
    const config = this.agentConfig.data_acquisition_protocol;
    
    // Dynamic field validation based on task type and current data state
    const missingFields = taskType === 'user_onboarding' 
      ? ['business_name', 'business_type'].filter(field => !businessProfile[field])
      : [];
    
    if (missingFields.length > 0 && config?.strategy === 'toolchain_first_ui_fallback') {
      logger.info('🔧 BUSINESS DATA MISSING - Starting toolchain-first acquisition', {
        contextId: context.contextId,
        missingFields,
        taskType
      });
      
      // Use BaseAgent's toolchain-first approach
      const acquisitionResult = await this.acquireDataWithToolchain(missingFields, context);
      
      if (acquisitionResult.requiresUserInput) {
        // Create UIRequest for remaining missing fields
        const uiRequest = await this.createDataAcquisitionUIRequest(
          acquisitionResult.stillMissing,
          context,
          acquisitionResult.toolResults
        );
        
        // Return special plan that requests user input
        return this.createUIRequestExecutionPlan(context, uiRequest, acquisitionResult);
      } else {
        // Update business profile with acquired data
        Object.assign(businessProfile, acquisitionResult.acquiredData);
        (context as any).businessProfile = businessProfile;
        
        logger.info('✅ All required business data acquired from toolchain', {
          contextId: context.contextId,
          acquiredFields: Object.keys(acquisitionResult.acquiredData)
        });
      }
    }
    
    // Ensure agent registry is initialized from YAML files (the ONLY source of truth)
    if (this.agentRegistry.size === 0) {
      logger.info('📋 Initializing agent registry from YAML...');
      await this.initializeAgentRegistry();
      logger.info(`✅ Agent registry initialized with ${this.agentRegistry.size} agents`);
    }
    
    // Extract task information from the task data ONLY (no template references)
    // Template content should already be copied to task during creation
    const _mainTaskType = context.currentState?.data?.taskType || 'general';
    const taskTitle = context.currentState?.data?.title || 'Unknown Task';
    const taskDescription = context.currentState?.data?.description || 'No description provided';
    const taskDefinition = context.metadata?.taskDefinition || {};
    
    logger.info('📄 Task information extracted', {
      taskType,
      taskTitle,
      taskDescription: taskDescription.substring(0, 100),
      hasTaskDefinition: Object.keys(taskDefinition).length > 0
    });
    
    // Build detailed agent capability information for LLM reasoning
    const availableAgents = Array.from(this.agentRegistry.values()).map(agent => ({
      agentId: agent.agentId,
      role: agent.role,
      specialization: agent.specialization,
      capabilities: (agent as any).skills || [], // AgentDiscoveryService maps agent_card.skills to 'skills'
      availability: agent.availability,
      fallbackStrategy: agent.fallbackStrategy
    }));

    // Create comprehensive prompt for task decomposition and agent assignment
    const planPrompt = `You are the Master Orchestrator for SmallBizAlly, responsible for decomposing complex business tasks into executable subtasks for specialized AI agents.

TASK TO ORCHESTRATE:
Title: "${taskTitle}"
Type: ${taskType}
Description: "${taskDescription}"

TASK GOALS:
${(() => {
  try {
    if (taskDefinition?.goals) {
      if (Array.isArray(taskDefinition.goals)) {
        return taskDefinition.goals.map((goal: string) => `- ${goal}`).join('\n');
      } else if (taskDefinition.goals.primary && Array.isArray(taskDefinition.goals.primary)) {
        return taskDefinition.goals.primary.map((goal: any) => `- ${goal.description || goal.title || goal}`).join('\n');
      } else if (typeof taskDefinition.goals === 'string') {
        return `- ${taskDefinition.goals}`;
      }
    }
    return '- Complete the task successfully';
  } catch (error) {
    return '- Complete the task successfully (goals parsing failed)';
  }
})()}

AVAILABLE SPECIALIST AGENTS (THESE ARE THE ONLY VALID AGENTS):
${availableAgents.map(agent => `
Agent: ${agent.agentId}
Role: ${agent.role}
Specialization: ${agent.specialization}
Capabilities: ${agent.capabilities.join(', ')}
Availability: ${agent.availability}
${agent.fallbackStrategy ? `Fallback: ${agent.fallbackStrategy}` : ''}
`).join('\n')}

CRITICAL AGENT SELECTION RULES:
- You MUST use ONLY the exact agent names listed above (e.g., "profile_collection_agent", "data_collection_agent")
- DO NOT use ANY other agent names (like "ProfileCollector", "TaskCoordinatorAgent", etc.)
- If you need profile collection, use "profile_collection_agent"
- If you need task coordination, use "orchestrator_agent"
- If you need data gathering, use "data_collection_agent"

YOUR ORCHESTRATION RESPONSIBILITIES:
1. ANALYZE the task description and goals to understand what needs to be accomplished
2. DECOMPOSE the task into specific, actionable subtasks 
3. MATCH each subtask to the agent with the most appropriate capabilities FROM THE LIST ABOVE
4. CREATE specific instructions for each agent explaining exactly what they need to do
5. COORDINATE the sequence and dependencies between subtasks
6. ANTICIPATE what data each agent will need and what they should produce

ORCHESTRATION REASONING REQUIREMENTS:
- Examine the task description thoroughly to identify all necessary subtasks
- Consider the business context and compliance requirements
- Match subtask requirements to agent capabilities precisely
- Provide specific, actionable instructions for each agent
- Consider data flow between agents (what outputs become inputs)
- Plan for error handling and fallback strategies

RESPONSE FORMAT (JSON only):
{
  "reasoning": {
    "task_analysis": "Your analysis of what this task requires and the business context",
    "subtask_decomposition": [
      {
        "subtask": "Specific subtask description",
        "required_capabilities": ["capability1", "capability2"],
        "assigned_agent": "MUST be exact agent name from the list above (e.g., profile_collection_agent)",
        "rationale": "Why this agent is best suited for this subtask"
      }
    ],
    "coordination_strategy": "How the agents will work together and handle dependencies"
  },
  "phases": [
    {
      "name": "Phase Name (e.g., Data Collection, Validation, Processing)",
      "subtasks": [
        {
          "description": "Detailed description of what needs to be done",
          "agent": "MUST be exact agent name from the list above (e.g., profile_collection_agent)",
          "specific_instruction": "Exact instruction for the agent - what to do, how to do it, what to focus on",
          "input_data": {"key": "Expected input data structure"},
          "expected_output": "What this subtask should produce for the next phase",
          "success_criteria": ["How to know this subtask succeeded", "Measurable outcome"]
        }
      ],
      "parallel_execution": true/false,
      "dependencies": ["Previous phase names that must complete first"]
    }
  ],
  "estimated_duration": "Realistic time estimate (e.g., 10-15 minutes)",
  "user_interactions": "none/minimal/guided/extensive"
}

CRITICAL REQUIREMENTS:
1. AGENT NAMES: You MUST use ONLY the exact agent names from the list above. DO NOT use "ProfileCollector", "TaskCoordinatorAgent", "BusinessDiscoveryAgent" or any other names.
2. EXAMPLES: Use "profile_collection_agent", "data_collection_agent", "orchestrator_agent", etc.
3. VALIDATION: Every agent name in your response MUST appear in the available agents list above.

Respond ONLY with valid JSON. No explanatory text, no markdown, just the JSON object matching the exact schema above.`;
    
    // Log the complete prompt for tracing
    logger.info('🤖 LLM EXECUTION PLAN PROMPT', {
      contextId: context.contextId,
      prompt: planPrompt.substring(0, 500),
      promptLength: planPrompt.length,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022'
    });

    // Log before LLM request
    logger.info('🚀 Sending request to LLM...', {
      contextId: context.contextId,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.3
    });
    
    const llmStartTime = Date.now();
    const llmResponse = await this.llmProvider.complete({
      prompt: planPrompt,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      systemPrompt: this.config.mission
    });
    const llmDuration = Date.now() - llmStartTime;
    
    // Log the complete response for tracing
    logger.info('🎯 LLM EXECUTION PLAN RESPONSE', {
      contextId: context.contextId,
      response: llmResponse.content.substring(0, 500),
      responseLength: llmResponse.content.length,
      duration: `${llmDuration}ms`,
      isValidJSON: (() => {
        try { JSON.parse(llmResponse.content); return true; } catch { return false; }
      })()
    });
    
    // DEBUG: Log full response if needed
    logger.debug('📄 Full LLM response', {
      contextId: context.contextId,
      fullResponse: llmResponse.content
    });
    
    // Parse JSON response with comprehensive error handling and validation
    let plan: ExecutionPlan;
    try {
      const parsedPlan = JSON.parse(llmResponse.content);
      
      // Validate the plan structure matches our enhanced schema
      if (!parsedPlan.reasoning || !parsedPlan.phases) {
        throw new Error('Invalid plan structure: missing reasoning or phases');
      }
      
      // CRITICAL: Validate ALL agent names against YAML-discovered agents
      const validAgentIds = new Set(availableAgents.map(agent => agent.agentId));
      const invalidAgentNames = new Set<string>();
      
      // Check agent names in reasoning.subtask_decomposition
      if (parsedPlan.reasoning.subtask_decomposition) {
        parsedPlan.reasoning.subtask_decomposition.forEach((subtask: any) => {
          if (subtask.assigned_agent && !validAgentIds.has(subtask.assigned_agent)) {
            invalidAgentNames.add(subtask.assigned_agent);
          }
        });
      }
      
      // Check agent names in phases.subtasks
      parsedPlan.phases.forEach((phase: any) => {
        if (phase.subtasks) {
          phase.subtasks.forEach((subtask: any) => {
            if (subtask.agent && !validAgentIds.has(subtask.agent)) {
              invalidAgentNames.add(subtask.agent);
            }
          });
        }
      });
      
      // ENFORCE YAML COMPLIANCE: Reject plans with invalid agent names
      if (invalidAgentNames.size > 0) {
        const invalidNames = Array.from(invalidAgentNames);
        const validNames = Array.from(validAgentIds);
        
        logger.error('🚨 AGENT NAME VALIDATION FAILED', {
          contextId: context.contextId,
          invalidAgentNames: invalidNames,
          validAgentNames: validNames,
          llmResponse: llmResponse.content.substring(0, 200)
        });
        
        // Apply agent name correction mapping
        const correctedPlan = this.correctAgentNames(parsedPlan, invalidNames, validNames);
        
        logger.info('🔧 APPLIED AGENT NAME CORRECTIONS', {
          contextId: context.contextId,
          corrections: this.getAgentNameCorrections(),
          correctedPlan: JSON.stringify(correctedPlan, null, 2).substring(0, 300)
        });
        
        plan = correctedPlan as ExecutionPlan;
      } else {
        plan = parsedPlan as ExecutionPlan;
      }
      
      // Log the orchestrator's reasoning for debugging and audit trail
      logger.info('🧠 ORCHESTRATOR REASONING', {
        contextId: context.contextId,
        taskAnalysis: (plan as any).reasoning.task_analysis,
        subtaskCount: (plan as any).reasoning.subtask_decomposition?.length || 0,
        coordinationStrategy: (plan as any).reasoning.coordination_strategy
      });
      
      // Log detailed subtask decomposition for traceability
      if ((plan as any).reasoning.subtask_decomposition) {
        (plan as any).reasoning.subtask_decomposition.forEach((subtask: any, index: number) => {
          logger.info(`📋 SUBTASK ${index + 1}: ${subtask.subtask}`, {
            contextId: context.contextId,
            assignedAgent: subtask.assigned_agent,
            requiredCapabilities: subtask.required_capabilities,
            rationale: subtask.rationale
          });
        });
      }
      
    } catch (error) {
      logger.error('Failed to parse LLM execution plan response', {
        response: llmResponse.content.substring(0, 300),
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create a robust fallback plan that still follows the enhanced structure
      plan = {
        reasoning: {
          task_analysis: `Fallback analysis for ${taskType} task due to LLM parsing failure`,
          subtask_decomposition: [{
            subtask: 'Manual task completion with user guidance',
            required_capabilities: ['user_profile_collection', 'guided_form_generation'],
            assigned_agent: 'profile_collection_agent',
            rationale: 'profile_collection_agent can handle user interaction when automation fails'
          }],
          coordination_strategy: 'Single-agent fallback with user guidance and manual completion'
        },
        phases: [{
          name: 'Manual Task Processing',
          subtasks: [{
            description: 'Guide user through manual task completion',
            agent: 'profile_collection_agent',
            specific_instruction: 'Create guided forms and collect necessary information from user to complete the task manually',
            input_data: { taskType, taskTitle, fallback: true },
            expected_output: 'Completed task data collected from user',
            success_criteria: ['User has provided all required information', 'Task marked as completed']
          }],
          parallel_execution: false,
          dependencies: []
        }],
        estimated_duration: '15-20 minutes',
        user_interactions: 'extensive'
      } as any;
    }
    
    // Store the COMPLETE execution plan for proper resumption
    // This ensures we can recover the full plan structure after restarts
    await this.recordOrchestratorEvent(
      context,
      ORCHESTRATOR_OPS.EXECUTION_PLAN_CREATED,
      {
        plan: plan as any  // Store the entire ExecutionPlan object (validation may warn but data is preserved)
      },
      'Created execution plan with detailed subtask decomposition'
    );
    
    // Validate and optimize plan before execution
    return this.optimizePlan(plan, context);
  }
  
  /**
   * Execute a phase of the execution plan
   * 
   * PHASES represent workflow steps in the orchestration, NOT task status.
   * Each phase is a logical grouping of work that needs to be done:
   * - May contain multiple subtasks to be executed
   * - Can be run in parallel or sequence based on dependencies
   * - Is tracked for resumption purposes
   * - Has specific goals and success criteria
   * 
   * Common phases include:
   * - Initialization: Setup and context gathering
   * - Discovery: Finding required information
   * - Data Collection: Gathering user/business data
   * - Validation: Checking data completeness
   * - Processing: Running business logic
   * - Generation: Creating outputs
   * - Completion: Finalizing results
   * 
   * @param context - The task context with full history
   * @param phase - The execution phase containing subtasks to execute
   * @returns Phase results including any UI requests generated
   */
  private async executePhase(
    context: TaskContext,
    phase: ExecutionPhase
  ): Promise<any> {
    logger.info('🚀 Executing enhanced phase with subtask coordination', {
      contextId: context.contextId,
      phaseName: phase.name,
      subtaskCount: (phase as any).subtasks?.length || 0,
      parallelExecution: (phase as any).parallel_execution || false
    });
    
    const phaseStart = Date.now();
    const results: any[] = [];
    const uiRequests: UIRequest[] = [];
    const subtasks = (phase as any).subtasks || [];
    
    // Enhanced execution: Handle subtasks with specific instructions
    if (subtasks.length > 0) {
      logger.info('📋 Processing subtasks with detailed agent instructions', {
        contextId: context.contextId,
        subtasks: subtasks.map((st: any) => ({
          description: st.description,
          agent: st.agent,
          instruction: st.specific_instruction?.substring(0, 100) + '...'
        }))
      });
      
      // Execute subtasks (parallel or sequential based on phase configuration)
      if ((phase as any).parallel_execution) {
        // Execute all subtasks in parallel for efficiency
        const subtaskPromises = subtasks.map((subtask: any, index: number) => 
          this.executeSubtask(context, subtask, phase, {}, index)
        );
        const subtaskResults = await Promise.allSettled(subtaskPromises);
        
        // Process results and collect UI requests
        for (let index = 0; index < subtaskResults.length; index++) {
          const result = subtaskResults[index];
          if (result.status === 'fulfilled') {
            results.push(result.value);
            // Collect UIRequests as-is (no modification)
            if (result.value.uiRequests && result.value.uiRequests.length > 0) {
              uiRequests.push(...result.value.uiRequests);
            }
          } else {
            logger.error(`Subtask ${index + 1} failed`, {
              contextId: context.contextId,
              subtask: subtasks[index].description,
              error: result.reason
            });
            
            // CRITICAL: Apply fallback for failed subtask and add to results
            // Without this, failed subtasks are ignored and phases incorrectly marked as completed
            const fallbackResult = await this.handleSubtaskFailure(
              context, 
              subtasks[index], 
              result.reason
            );
            results.push(fallbackResult);
            
            // Collect UI requests from fallback
            if (fallbackResult.uiRequests) {
              uiRequests.push(...fallbackResult.uiRequests);
            }
          }
        }
      } else {
        // Execute subtasks sequentially, passing data between them
        let phaseData = {};
        
        // CRITICAL FIX: Extract all UI response data from context history
        // This ensures that data collected via UIRequests is available to subsequent agents
        const uiResponseData = this.extractUIResponseData(context);
        if (Object.keys(uiResponseData).length > 0) {
          logger.info('📊 Extracted UI response data from context history', {
            contextId: context.contextId,
            dataKeys: Object.keys(uiResponseData),
            sampleData: JSON.stringify(uiResponseData).substring(0, 200)
          });
          phaseData = { ...phaseData, ...uiResponseData };
        }
        
        for (let index = 0; index < subtasks.length; index++) {
          const subtask = subtasks[index];
          try {
            const subtaskResult = await this.executeSubtask(context, subtask, phase, phaseData, index);
            results.push(subtaskResult);
            
            // Pass output data to next subtask
            if (subtaskResult.outputData) {
              phaseData = { ...phaseData, ...subtaskResult.outputData };
            }
            
            // Collect UIRequests from subtasks, adding source agent info
            if (subtaskResult.uiRequests && subtaskResult.uiRequests.length > 0) {
              for (const uiRequest of subtaskResult.uiRequests) {
                uiRequests.push({
                  ...uiRequest,
                  semanticData: {
                    ...uiRequest.semanticData,
                    sourceAgent: subtaskResult.agent || subtask.agent
                  }
                } as UIRequest);
              }
            }
            
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Subtask execution failed for "${subtask.description}" using agent "${subtask.agent}": ${errorMsg}`, {
              contextId: context.contextId,
              subtask: subtask.description,
              agent: subtask.agent,
              error: errorMsg
            });
            
            // Apply fallback strategy for failed subtask
            const fallbackResult = await this.handleSubtaskFailure(context, subtask, error);
            results.push(fallbackResult);
          }
        }
      }
    } else {
      // Fallback to legacy agent execution for backward compatibility
      logger.warn('⚠️ Phase has no subtasks, falling back to legacy agent execution', {
        contextId: context.contextId,
        phaseName: phase.name
      });
      
      for (const agentId of (phase.agents || [])) {
        const agent = this.agentRegistry.get(agentId);
        
        if (!agent) {
          logger.warn('Agent not found in registry', { agentId });
          continue;
        }
        
        if (agent.availability === 'available') {
          const agentResult = await this.executeAgent(context, agent, phase);
          results.push(agentResult);
          
          if (agentResult.uiRequests) {
            uiRequests.push(...agentResult.uiRequests);
          }
        } else {
          const fallbackResult = await this.applyFallbackStrategy(context, agent, phase);
          results.push(fallbackResult);
          
          if ((fallbackResult as any).uiRequests) {
            uiRequests.push(...(fallbackResult as any).uiRequests);
          }
        }
      }
    }
    
    // Log phase completion with enhanced metrics
    const duration = Date.now() - phaseStart;
    
    // Determine phase status based on subtask results
    // IMPORTANT: Phase status determination hierarchy:
    // 1. If ANY subtask needs input -> phase status = 'needs_input' (highest priority)
    // 2. Else if ANY subtask failed -> phase status = 'failed'
    // 3. Else all completed -> phase status = 'completed'
    // This ensures we NEVER mark a phase as complete when user input is needed
    
    // DEBUG: Log what statuses we actually have in results
    logger.debug('🔍 Phase status determination', {
      contextId: context.contextId,
      phaseName: phase.name,
      resultStatuses: results.map((r: any) => ({ 
        subtask: r.subtaskId || 'unknown',
        status: r.status 
      }))
    });
    
    const needsInput = results.some((r: any) => r.status === 'needs_input');
    const hasFailed = results.some((r: any) => r.status === 'failed' || r.status === 'error');
    const phaseStatus = needsInput ? 'needs_input' : (hasFailed ? 'failed' : 'completed');
    
    logger.info('✅ Phase execution completed', {
      contextId: context.contextId,
      phaseName: phase.name,
      subtaskCount: subtasks.length,
      resultsCount: results.length,
      uiRequestCount: uiRequests.length,
      duration,
      successRate: results.filter((r: any) => r.status === 'completed').length / results.length,
      phaseStatus
    });
    
    return {
      phaseId: (phase as any).id || phase.name,
      phaseName: phase.name,
      status: phaseStatus,
      results,
      uiRequests,
      duration,
      subtaskResults: results
    };
  }
  
  /**
   * Execute a specific subtask with detailed agent instructions
   * This is where the orchestrator's decomposition gets translated into concrete agent actions
   * 
   * @param context - The task context
   * @param subtask - The specific subtask with detailed instructions
   * @param phase - The parent phase for context
   * @param inputData - Data passed from previous subtasks
   */
  private async executeSubtask(
    context: TaskContext,
    subtask: any,
    phase: ExecutionPhase,
    inputData: any = {},
    subtaskIndex: number = 0
  ): Promise<any> {
    logger.info('🎯 Executing subtask with specific agent instruction', {
      contextId: context.contextId,
      subtaskDescription: subtask.description,
      assignedAgent: subtask.agent,
      specificInstruction: subtask.specific_instruction?.substring(0, 150) + '...'
    });
    
    // Try to find the agent in our registry first
    let agent = Array.from(this.agentRegistry.values())
      .find(a => a.agentId === subtask.agent);
    
    // If not in registry, try to discover it via discovery service
    if (!agent) {
      try {
        // Import and use the agent discovery service to find the agent
        const { agentDiscovery } = await import('../services/agent-discovery');
        
        // Ensure agents are discovered
        await agentDiscovery.discoverAgents();
        
        // Get capabilities (returns an array, not a Map)
        const capabilities = agentDiscovery.getCapabilities();
        
        // Find the agent in discovered capabilities
        const agentCapability = capabilities.find(cap => cap.agentId === subtask.agent);
        if (agentCapability) {
          // Add to registry for future use - properly typed as AgentCapability
          agent = {
            agentId: subtask.agent,
            role: agentCapability.role,
            capabilities: agentCapability.skills || [],
            availability: agentCapability.availability || 'available',
            specialization: agentCapability.name || subtask.agent,
            fallbackStrategy: 'user_input'
          } as AgentCapability;
          
          this.agentRegistry.set(subtask.agent, agent);
          
          logger.info('✅ Agent discovered and registered via discovery service', {
            agentId: subtask.agent,
            role: agentCapability.role,
            availability: agentCapability.availability
          });
        }
      } catch (error) {
        logger.warn('Failed to discover agent via discovery service', {
          agentId: subtask.agent,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // If still not found, throw error
    if (!agent) {
      throw new Error(`Agent ${subtask.agent} not found in registry or discovery service`);
    }
    
    if (agent.availability !== 'available') {
      throw new Error(`Agent ${subtask.agent} is not available (${agent.availability})`);
    }
    
    // CRITICAL: Extract both UI response data and agent execution data 
    // This ensures agents have access to all previously collected information
    const allUIResponseData = this.extractUIResponseData(context);
    const allAgentExecutionData = this.extractAgentExecutionData(context);
    
    // Combine all available data, with agent execution data taking precedence over UI data
    const combinedData = {
      ...allUIResponseData,
      ...allAgentExecutionData // Agent execution data (like CA search results) takes precedence
    };
    
    logger.debug('📋 Preparing agent request with combined data', {
      contextId: context.contextId,
      agentRole: agent.role,
      uiDataKeys: Object.keys(allUIResponseData),
      agentDataKeys: Object.keys(allAgentExecutionData),
      combinedDataKeys: Object.keys(combinedData)
    });
    
    // Create comprehensive agent request with specific instructions
    const request: AgentRequest = {
      requestId: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentRole: agent.role,
      instruction: subtask.specific_instruction, // This is the key enhancement - specific instructions!
      data: {
        // Combine expected input data structure with actual input data
        ...subtask.input_data,
        ...inputData,
        ...combinedData, // Include all UI response data AND agent execution data
        taskContext: {
          contextId: context.contextId,
          taskType: context.currentState?.task_type,
          taskTitle: context.currentState?.title
        }
      },
      context: { 
        urgency: 'medium' as const,
        subtaskDescription: subtask.description,
        expectedOutput: subtask.expected_output,
        successCriteria: subtask.success_criteria
      },
      taskContext: context
    };
    
    // Log the detailed agent instruction for traceability
    logger.info('📝 AGENT INSTRUCTION DISPATCH', {
      contextId: context.contextId,
      agentId: agent.agentId,
      requestId: request.requestId,
      instruction: subtask.specific_instruction,
      expectedOutput: subtask.expected_output,
      successCriteria: subtask.success_criteria
    });
    
    // Execute the agent with specific instructions
    // Get the real agent instance from the discovery service singleton
    const { agentDiscovery } = await import('../services/agent-discovery');
    const agentInstance = await agentDiscovery.instantiateAgent(
      agent.agentId,
      context.tenantId,
(context.currentState as any)?.user_id
    );
    
    // Record that we're delegating this subtask (structured event)
    await this.recordOrchestratorEvent(
      context,
      ORCHESTRATOR_OPS.SUBTASK_DELEGATED,
      {
        agent_id: subtask.agent,
        subtask_name: subtask.description,
        instructions: subtask.specific_instruction || 'Execute subtask as defined',
        subtask_index: subtaskIndex
      },
      `Delegating subtask "${subtask.description}" to ${subtask.agent}`
    );
    
    // Execute the real agent using the AgentExecutor service (dependency injection)
    const { AgentExecutor } = await import('../services/agent-executor');
    const agentResponse = await AgentExecutor.execute(agentInstance, request);
    
    return {
      subtaskId: subtask.description,
      agent: subtask.agent,
      status: agentResponse.status,
      data: agentResponse.data,
      outputData: agentResponse.data, // Data to pass to next subtask
      uiRequests: agentResponse.uiRequests || [],
      reasoning: agentResponse.reasoning,
      duration: Date.now() - Date.now() // Placeholder timing
    };
  }
  
  
  /**
   * Handle subtask execution failure with appropriate fallback strategies
   * 
   * @param context - The task context
   * @param subtask - The failed subtask
   * @param error - The error that occurred
   */
  private async handleSubtaskFailure(
    context: TaskContext,
    subtask: any,
    error: any
  ): Promise<any> {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`🚨 Applying fallback strategy for failed subtask "${subtask.description}" (agent: ${subtask.agent}) - Error: ${errorMsg}`, {
      contextId: context.contextId,
      subtask: subtask.description,
      agent: subtask.agent,
      error: errorMsg
    });
    
    // Record the failure for audit trail
    await this.recordContextEntry(context, {
      operation: 'subtask_failed',
      data: {
        subtask: subtask.description,
        agent: subtask.agent,
        error: error instanceof Error ? error.message : String(error),
        fallback_applied: true
      },
      reasoning: `Subtask "${subtask.description}" failed, applying fallback strategy`
    });
    
    // Create an error report UIRequest
    // This should rarely happen if agents are properly configured
    // The real fix is to ensure agents always return proper UIRequests
    const errorUIRequest = {
      requestId: `error_${Date.now()}`,
      templateType: 'error_notification' as any,
      semanticData: {
        title: `Agent Error: ${subtask.agent}`,
        description: `The ${subtask.agent} encountered an error and needs configuration improvement.`,
        instruction: `Error: ${error instanceof Error ? error.message : String(error)}`,
        expectedOutput: subtask.expected_output,
        debugInfo: {
          subtask: subtask.description,
          agent: subtask.agent,
          error: error instanceof Error ? error.message : String(error)
        }
      },
      context: {
        isError: true,
        originalSubtask: subtask.description,
        agent: subtask.agent,
        agentInstruction: subtask.specific_instruction,
        expectedAgentOutput: subtask.expected_output
      }
    };
    
    // CRITICAL: Record UI_REQUEST_CREATED event so StateComputer can detect it
    await this.recordContextEntry(context, {
      operation: 'UI_REQUEST_CREATED',
      data: {
        uiRequest: errorUIRequest,
        source: 'orchestrator_error',
        subtask: subtask.description,
        agent: subtask.agent,
        isError: true
      },
      reasoning: `Agent ${subtask.agent} failed validation - needs proper UIRequest implementation`
    });
    
    // Return a fallback result that allows the process to continue
    return {
      subtaskId: subtask.description,
      agent: subtask.agent,
      status: 'needs_input' as const,
      data: {
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
        manual_completion_required: true
      },
      uiRequests: [errorUIRequest],
      reasoning: `Subtask failed, requesting manual user input as fallback`
    };
  }
  
  /**
   * Extract all UI response data from the task context history
   * This method aggregates all user-submitted data from UI_RESPONSE_SUBMITTED events
   * to ensure data persistence across agent transitions
   * 
   * @param context - The task context containing history
   * @returns Aggregated data from all UI responses
   */
  private extractUIResponseData(context: TaskContext): Record<string, any> {
    const aggregatedData: Record<string, any> = {};
    
    // Iterate through history to find all UI_RESPONSE_SUBMITTED events
    for (const event of context.history) {
      if (event.operation === 'UI_RESPONSE_SUBMITTED' && event.data?.response) {
        // Merge the response data into our aggregated data
        Object.assign(aggregatedData, event.data.response);
        
        logger.debug('📝 Found UI response data in history', {
          contextId: context.contextId,
          requestId: event.data.requestId,
          dataKeys: Object.keys(event.data.response),
          timestamp: event.timestamp
        });
      }
    }
    
    // Also check for any user-provided data in the current state
    if (context.currentState?.data) {
      // Extract business-relevant data from current state
      const stateData = context.currentState.data;
      const businessData: Record<string, any> = {};
      
      // Extract known business fields
      const businessFields = [
        'business_name', 'businessName', 'entity_type', 'entityType',
        'formation_state', 'formationState', 'ein', 'address',
        'city', 'state', 'zip', 'phone', 'email', 'website'
      ];
      
      for (const field of businessFields) {
        if (stateData[field]) {
          // Normalize field names to snake_case for consistency
          const normalizedField = field.replace(/([A-Z])/g, '_$1').toLowerCase()
            .replace(/^_/, '').replace(/__/g, '_');
          businessData[normalizedField] = stateData[field];
        }
      }
      
      if (Object.keys(businessData).length > 0) {
        Object.assign(aggregatedData, businessData);
        logger.debug('📝 Extracted business data from current state', {
          contextId: context.contextId,
          dataKeys: Object.keys(businessData)
        });
      }
    }
    
    return aggregatedData;
  }

  /**
   * Extract all agent execution data from task context history
   * This method aggregates all data from agent responses (contextUpdate.data)
   * to ensure tool results and agent findings are available to subsequent agents
   * 
   * @param context - The task context containing history
   * @returns Aggregated data from all agent execution results
   */
  private extractAgentExecutionData(context: TaskContext): Record<string, any> {
    const aggregatedData: Record<string, any> = {};
    
    // Iterate through history to find agent execution results
    for (const event of context.history) {
      // Look for agent responses with contextUpdate.data
      if (event.operation?.includes('agent.') && event.data?.contextUpdate?.data) {
        const agentData = event.data.contextUpdate.data;
        
        // Merge agent execution data, prioritizing more recent results
        Object.assign(aggregatedData, agentData);
        
        logger.debug('📋 Found agent execution data in history', {
          contextId: context.contextId,
          operation: event.operation,
          dataKeys: Object.keys(agentData),
          timestamp: event.timestamp
        });
      }
    }
    
    logger.debug('📊 Aggregated agent execution data', {
      contextId: context.contextId,
      totalKeys: Object.keys(aggregatedData).length,
      keys: Object.keys(aggregatedData)
    });
    
    return aggregatedData;
  }

  /**
   * Execute a specific agent (legacy method for backward compatibility)
   */
  private async executeAgent(
    context: TaskContext,
    agent: AgentCapability,
    phase: ExecutionPhase
  ): Promise<AgentResponse> {
    // Create agent request
    const request: AgentRequest = {
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentRole: agent.role,
      instruction: (phase as any).operation || 'execute',
      data: (phase as any).input || {},
      context: { urgency: 'medium' as const },
      taskContext: context
    };
    
    // Use real agent execution via AgentDiscoveryService singleton
    const { agentDiscovery: discoveryService } = await import('../services/agent-discovery');
    
    try {
      logger.info('Executing real agent (legacy mode)', {
        agentId: agent.agentId,
        requestId: request.requestId
      });
      
      // Instantiate the real agent
      const agentInstance = await discoveryService.instantiateAgent(
        agent.agentId,
        context.tenantId,
  (context.currentState as any)?.user_id
      );
      
      // Execute the real agent with the request (with performance tracking)
      const agentResponse = await taskPerformanceTracker.measureOperation(
        context.contextId,
        'agent_complete',
        agent.agentId,
        async () => (agentInstance as any).executeInternal(request),
        { phase: phase.name, role: agent.role }
      );
      
      return agentResponse;
    } catch (error) {
      logger.error('Failed to execute real agent in legacy mode, returning fallback', {
        agentId: agent.agentId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return basic success response as fallback
      return {
        status: 'completed' as const,
        data: {
          message: `Agent ${agent.agentId} execution attempted`,
          agentId: agent.agentId,
          fallback: true
        },
        reasoning: `Executed ${agent.role} for ${phase.name} (with fallback)`
      };
    }
  }
  
  /**
   * Apply fallback strategy when agent unavailable
   * Implements resilient degradation pattern
   */
  private async applyFallbackStrategy(
    context: TaskContext,
    agent: AgentCapability,
    phase: ExecutionPhase
  ): Promise<AgentResponse> {
    logger.warn('Applying fallback strategy', {
      agentId: agent.agentId,
      strategy: agent.fallbackStrategy || this.config.resilience.fallbackStrategy
    });
    
    const strategy = agent.fallbackStrategy || this.config.resilience.fallbackStrategy;
    
    switch (strategy) {
      case 'user_input':
        // Request data from user
        return {
          status: 'needs_input' as const,
          data: {
            agentId: agent.agentId
          },
          uiRequests: [this.createUserInputRequest(agent, phase)],
          reasoning: `Agent ${agent.agentId} unavailable, requesting user input`
        };
        
      case 'alternative_agent': {
        // Find alternative agent with similar capabilities
        const alternative = this.findAlternativeAgent(agent);
        if (alternative) {
          return this.executeAgent(context, alternative, phase);
        }
        // Fall through to defer if no alternative
      }
        
      case 'defer':
      default:
        // Defer this step for later
        return {
          status: 'delegated' as const,
          data: {
            message: `Step deferred: ${agent.role} unavailable`,
            canProceed: true,
            agentId: agent.agentId
          },
          reasoning: `Deferring ${agent.role} due to unavailability`
        };
    }
  }
  
  /**
   * Create UI request for user input fallback
   */
  private createUserInputRequest(
    agent: AgentCapability,
    phase: ExecutionPhase
  ): UIRequest {
    return {
      requestId: `ui_${Date.now()}`,
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        title: `Information Needed: ${phase.name}`,
        description: `We need your help to complete this step since our automated service is temporarily unavailable.`,
        fields: [
          {
            id: 'user_input',
            label: `Please provide ${agent.role} information`,
            type: 'text',
            required: true,
            help: `This information is typically obtained through ${agent.agentId}, but we need you to provide it manually.`
          }
        ],
        guidance: [
          'You can find this information in your business documents',
          'If unsure, you can upload relevant documents instead',
          'We\'ll guide you through each required field'
        ]
      },
      context: {
        agentId: agent.agentId,
        phaseId: (phase as any).id || phase.name,
        fallbackReason: 'service_unavailable'
      }
    };
  }
  
  /**
   * Handle progressive disclosure of UI requests
   * Engine PRD Lines 50, 83-85
   * Orchestrator only sends UIRequests - UXOptimizationAgent handles its own lifecycle
   */
  private async handleProgressiveDisclosure(
    context: TaskContext,
    uiRequests: UIRequest[]
  ): Promise<void> {
    if (!this.config.progressiveDisclosure.enabled) {
      // Send all requests immediately
      await this.sendUIRequests(context, uiRequests);
      return;
    }
    
    // Just send UIRequests - UXOptimizationAgent will auto-detect via SSE if needed
    logger.info('📤 Sending UIRequests to frontend', {
      contextId: context.contextId,
      requestCount: uiRequests.length
    });
    
    await this.sendUIRequests(context, uiRequests);
  }
  
  
  
  /**
   * Send UI requests to frontend
   */
  private async sendUIRequests(context: TaskContext, requests: UIRequest[]): Promise<void> {
    // In real implementation, this would send to frontend via WebSocket/SSE
    logger.info('Sending UI requests', {
      contextId: context.contextId,
      count: requests.length,
      types: requests.map(r => r.templateType)
    });
    
    // Instantiate UXOptimizationAgent if there are UIRequests
    if (requests.length > 0) {
      const taskId = context.contextId;
      logger.info('🎯 Instantiating UXOptimizationAgent for task', {
        taskId,
        requestCount: requests.length
      });
      
      // Use the agent discovery service factory pattern
      // Factory will create a new instance per task (not cached)
      const { agentDiscovery } = await import('../services/agent-discovery');
      const agent = await agentDiscovery.instantiateAgent(
        'ux_optimization_agent',
        taskId, // Pass taskId as businessId for UXOptimizationAgent
        (context.currentState as any)?.user_id
      );
      
      // Call executeInternal directly since we need the response
      // This is safe because we know it's a UXOptimizationAgent from the factory
      const uxAgent = agent as any; // Cast to access protected method
      const optimizationResult = await uxAgent.executeInternal({
        taskContext: context,
        operation: 'optimize_form_experience',
        parameters: {
          uiRequests: requests,
          userContext: {
            businessType: (context.currentState as any)?.business_type || 'small business',
            experienceLevel: 'first-time',
            industry: (context.currentState as any)?.industry || 'general'
          }
        }
      });
      
      // Log the optimization result
      if (optimizationResult.status === 'completed' && optimizationResult.uiRequests) {
        logger.info('✅ UX Optimization completed', {
          originalCount: requests.length,
          optimizedCount: optimizationResult.uiRequests.length
        });
        
        // Store optimized UIRequests if successful
        if (optimizationResult.uiRequests.length > 0) {
          requests = optimizationResult.uiRequests; // Replace with optimized version
        }
      }
    }
    
    // Record FULL UI requests in context for proper persistence
    // UI requests are now stored as task_context_events
    // The recordContextEntry method will handle persistence and broadcasting
    await this.recordContextEntry(context, {
      operation: 'ui_requests_created',
      data: {
        // Store the complete UI request data for frontend consumption
        uiRequests: requests,
        // Keep summary for quick reference  
        summary: {
          count: requests.length,
          types: requests.map(r => r.templateType),
          requestIds: requests.map(r => r.requestId)
        }
      },
      reasoning: 'Requesting user input for required information'
    });
    
    // The recordContextEntry method already broadcasts the event via SSE
    // No need for additional broadcasting - the frontend will receive the
    // ui_requests_created event through the task context update stream
    
    logger.debug('UI requests created and broadcast via context event', {
      contextId: context.contextId,
      requestCount: requests.length
    });
  }
  
  /**
   * Clean up agents for a completed task
   */
  private cleanupAgentsForTask(taskId: string): void {
    // Clean up agent subscriptions
    // Note: UXOptimizationAgent instances are not tracked here - they will be garbage collected
    // when no longer referenced since they're not cached in the factory
    if (this.activeTaskSubscriptions.has(taskId)) {
      logger.info('🧹 Cleaning up agent subscriptions for completed task', { taskId });
      this.activeTaskSubscriptions.delete(taskId);
    }
  }
  
  /**
   * Recovery: Reinstantiate agents for pending UIRequests after system restart
   */
  private async recoverAgentsForPendingUIRequests(context: TaskContext): Promise<void> {
    const taskId = context.contextId;
    
    // Check if there are pending UIRequests in the context history
    const pendingUIRequests: UIRequest[] = [];
    let hasUnresolvedUIRequests = false;
    
    // Scan history for UIRequest events
    for (const entry of context.history) {
      if (entry.operation === 'ui_requests_created' && entry.data?.uiRequests) {
        // Found UIRequests
        pendingUIRequests.push(...(entry.data.uiRequests as UIRequest[]));
        hasUnresolvedUIRequests = true;
      }
      
      if (entry.operation === 'ui_response_received') {
        // UIRequests were resolved
        hasUnresolvedUIRequests = false;
        pendingUIRequests.length = 0;
      }
    }
    
    // If we have unresolved UIRequests, reinstantiate UXOptimizationAgent
    if (hasUnresolvedUIRequests && pendingUIRequests.length > 0) {
      logger.info('🔄 Recovering UXOptimizationAgent for pending UIRequests', {
        taskId,
        requestCount: pendingUIRequests.length
      });
      
      // Use the agent discovery service factory pattern for proper DI
      // Factory will create a new instance per task (not cached)
      const { agentDiscovery } = await import('../services/agent-discovery');
      await agentDiscovery.instantiateAgent(
        'ux_optimization_agent',
        taskId, // Pass taskId as businessId for UXOptimizationAgent
        (context.currentState as any)?.user_id
      );
      
      // The UXOptimizationAgent instance is now ready to process UIRequests
      // It doesn't need explicit monitoring setup - it will process requests when called
      // The agent instance will be garbage collected when no longer referenced
      
      logger.info('✅ UXOptimizationAgent instantiated for task recovery', { 
        taskId,
        info: 'Agent ready to process UIRequests when needed'
      });
    }
  }
  
  /**
   * Check if task goals are achieved
   */
  private async areGoalsAchieved(context: TaskContext): Promise<boolean> {
    const taskDefinition = context.metadata?.taskDefinition || {};
    
    if (!taskDefinition.goals) {
      return true; // No goals means task is complete
    }
    
    // Check primary goals
    const goals = taskDefinition.goals;
    if (Array.isArray(goals)) {
      // Simple array of goal strings - DO NOT return true prematurely!
      // Goals are only achieved when ALL phases are complete
      return false; // Continue executing all phases
    } else if (goals.primary) {
      // Structured goals with primary/secondary
      for (const goal of goals.primary) {
        if (goal.required && !this.isGoalAchieved(context, goal)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Check if specific goal is achieved
   */
  private isGoalAchieved(context: TaskContext, _goal: any): boolean {
    // Evaluate goal success criteria against current state
    // In real implementation, this would use expression evaluation
    return context.currentState.completeness >= 100;
  }
  
  /**
   * Update task status in database
   * Used to track task state transitions like waiting_for_input
   */
  /**
   * Update task completeness percentage
   * OrchestratorAgent is the SINGLE SOURCE OF TRUTH for task progress
   */
  private async updateTaskCompleteness(taskId: string, completeness: number): Promise<void> {
    logger.info(`📊 Updating task completeness to ${completeness}%`, {
      taskId,
      completeness
    });
    
    try {
      const taskService = TaskService.getInstance();
      await taskService.updateTaskCompleteness(taskId, completeness);
      
      logger.info(`✅ Task completeness updated to ${completeness}%`, {
        taskId
      });
    } catch (error) {
      logger.error('Failed to update task completeness', {
        taskId,
        completeness,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - continue execution even if completeness update fails
    }
  }

  private async updateTaskStatus(context: TaskContext, status: TaskStatus): Promise<void> {
    logger.info(`📝 Updating task status to ${status.toUpperCase()}`, {
      contextId: context.contextId
    });
    
    try {
      const taskService = TaskService.getInstance();
      const taskId = context.contextId; // contextId IS the taskId in our architecture
      await taskService.updateTaskStatus(taskId, status);
      
      // CRITICAL: Also update the in-memory context to keep it in sync
      context.currentState.status = status;
      
      logger.info(`✅ Task status updated to ${status.toUpperCase()} in database and context`, {
        contextId: context.contextId
      });
      
      // Clean up agent instances for terminal states
      if (status === TASK_STATUS.FAILED || status === TASK_STATUS.CANCELLED) {
        try {
          const { agentDiscovery } = await import('../services/agent-discovery');
          agentDiscovery.cleanupTaskAgents(context.contextId);
          logger.info(`♻️ Agent instances cleaned up for ${status} task`, {
            taskId: context.contextId,
            status
          });
        } catch (cleanupError) {
          logger.warn('Could not clean up agent instances', {
            taskId: context.contextId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
        }
      }
    } catch (error) {
      logger.error('Failed to update task status', {
        contextId: context.contextId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Complete task
   */
  private async completeTaskContext(context: TaskContext): Promise<void> {
    // Log that we're updating task status
    logger.info('📝 Completing task', {
      contextId: context.contextId
    });
    
    // Status is updated in the database by TaskService
    // We don't update in-memory state - TaskService is the single source of truth
    
    // Update task completeness to 100% and status in database via TaskService
    try {
      const taskService = new TaskService(DatabaseService.getInstance());
      const completedAt = new Date().toISOString();
      
      // Set completeness to 100% when task completes
      const taskId = context.contextId; // contextId IS the taskId in our architecture
      await this.updateTaskCompleteness(taskId, 100);
      
      // Update task status
      await taskService.updateTaskStatus(taskId, TASK_STATUS.COMPLETED, completedAt);
      
      logger.info('✅ Task status updated to COMPLETED in database', {
        contextId: context.contextId
      });
    } catch (error) {
      logger.error('Error updating task status', {
        contextId: context.contextId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Record completion in context with updated state
    await this.recordContextEntry(context, {
      operation: `task_${TASK_STATUS.COMPLETED}`,
      data: {
        completedAt: new Date().toISOString(),
        finalState: context.currentState,
        status: 'completed',
        completeness: 100
      },
      reasoning: 'All phases executed successfully'
    });
    
    // NOTE: Knowledge extraction is handled as a phase in the execution plan
    // as instructed in orchestrator.yaml - not triggered here
    
    // Clean up local state
    this.activeExecutions.delete(context.contextId);
    this.pendingUIRequests.delete(context.contextId);
    
    // Clean up cached agent instances for garbage collection
    // This is critical for ephemeral agents and memory management
    try {
      const { agentDiscovery } = await import('../services/agent-discovery');
      agentDiscovery.cleanupTaskAgents(context.contextId);
      logger.info('♻️ Agent instances cleaned up for completed task', {
        taskId: context.contextId
      });
    } catch (error) {
      logger.warn('Could not clean up agent instances', {
        taskId: context.contextId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Handle orchestration failure with resilience
   */
  private async handleOrchestrationFailure(
    context: TaskContext,
    error: any
  ): Promise<void> {
    logger.error('Applying failure recovery', {
      contextId: context.contextId,
      error: error.message,
      strategy: this.config.resilience.fallbackStrategy
    });
    
    await this.recordContextEntry(context, {
      operation: 'orchestration_failed',
      data: {
        error: error.message,
        strategy: this.config.resilience.fallbackStrategy
      },
      reasoning: 'Orchestration encountered an error, applying recovery strategy'
    });
    
    // CRITICAL: Announce that we're pausing the orchestration
    // This was missing - the orchestrator should communicate its state
    await this.recordContextEntry(context, {
      operation: ORCHESTRATOR_OPS.AGENT_EXECUTION_PAUSED,
      data: {
        agentId: 'orchestrator_agent',
        reason: 'automation_failure',
        error: error.message,
        nextStep: 'switching_to_manual_mode'
      },
      reasoning: 'I am pausing orchestration due to an error. Switching to manual mode to continue with user assistance.',
      confidence: 1.0,
      trigger: {
        type: 'system_event',
        source: 'orchestration_failure',
        details: { error: error.message }
      }
    });
    
    logger.info('⏸️ ORCHESTRATOR: I am pausing - switching to manual mode', {
      contextId: context.contextId,
      error: error.message
    });
    
    switch (this.config.resilience.fallbackStrategy) {
      case 'degrade':
        // Switch to manual mode
        await this.switchToManualMode(context);
        break;
        
      case 'guide':
        // Provide step-by-step guidance
        await this.provideManualGuidance(context);
        break;
        
      case 'fail':
      default:
        // Mark task as failed
        await this.updateTaskStatus(context, TASK_STATUS.FAILED);
        break;
    }
  }
  
  /**
   * Switch to manual mode when automation fails
   */
  private async switchToManualMode(context: TaskContext): Promise<void> {
    const manualGuide: UIRequest = {
      requestId: `manual_${Date.now()}`,
      templateType: UITemplateType.SteppedWizard,
      semanticData: {
        title: 'Let\'s Complete This Together',
        description: 'Our automated system encountered an issue. We\'ll guide you through completing this task manually.',
        steps: this.generateManualSteps(context),
        allowSkip: false
      },
      context: {
        mode: 'manual',
        reason: 'automation_failure'
      }
    };
    
    await this.sendUIRequests(context, [manualGuide]);
    
    // CRITICAL: Update task status to waiting_for_input
    // This was missing, causing tasks to remain in limbo after failures
    await this.updateTaskStatus(context, TASK_STATUS.WAITING_FOR_INPUT);
    
    logger.info('⏸️ Task paused - switched to manual mode due to automation failure', {
      contextId: context.contextId,
      status: TASK_STATUS.WAITING_FOR_INPUT
    });
  }
  
  /**
   * Provide manual guidance
   */
  private async provideManualGuidance(context: TaskContext): Promise<void> {
    // Generate step-by-step instructions
    const guidance = await this.generateGuidance(context);
    
    const guideRequest: UIRequest = {
      requestId: `guide_${Date.now()}`,
      templateType: UITemplateType.InstructionPanel,
      semanticData: {
        title: 'Step-by-Step Guide',
        instructions: guidance,
        supportLinks: [
          { label: 'Contact Support', url: '/support' },
          { label: 'View Help Docs', url: '/help' }
        ]
      },
      context: {
        mode: 'guided',
        reason: 'providing_assistance'
      }
    };
    
    await this.sendUIRequests(context, [guideRequest]);
    
    // Update task status when providing guidance
    await this.updateTaskStatus(context, TASK_STATUS.WAITING_FOR_INPUT);
    
    logger.info('⏸️ Task paused - providing manual guidance', {
      contextId: context.contextId,
      status: TASK_STATUS.WAITING_FOR_INPUT
    });
  }
  
  /**
   * Generate manual steps from template
   */
  private generateManualSteps(context: TaskContext): any[] {
    const taskDefinition = context.metadata?.taskDefinition || {};
    
    // Generate manual steps from task goals
    const goals = taskDefinition.goals || [];
    if (Array.isArray(goals)) {
      return goals.map((goal, index) => ({
        step: index + 1,
        title: `Step ${index + 1}`,
        description: goal,
        status: 'pending'
      }));
    }
    
    // Fallback: create basic steps from task data
    return [{
      step: 1,
      title: context.currentState?.data?.title || 'Complete Task',
      description: context.currentState?.data?.description || 'Follow the instructions to complete this task',
      status: 'pending'
    }];
  }
  
  /**
   * Generate fields for manual phase
   */
  private generateFieldsForPhase(phase: any): any[] {
    // Generate appropriate input fields based on phase
    return [
      {
        id: 'phase_input',
        label: `Information for ${phase.name}`,
        type: 'text',
        required: true
      }
    ];
  }
  
  /**
   * Generate guidance from context
   */
  private async generateGuidance(context: TaskContext): Promise<string[]> {
    // Use LLM to generate helpful guidance
    const prompt = `
      Generate step-by-step guidance for completing this task manually:
      Task: ${JSON.stringify(context.currentState?.data)}
      Task Definition: ${JSON.stringify(context.metadata?.taskDefinition)}
      Current State: ${JSON.stringify(context.currentState)}
      
      Provide clear, actionable steps the user can follow.
    `;
    
    const response = await this.llmProvider.complete({
      prompt: prompt,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.5,
      systemPrompt: 'You provide clear, helpful guidance for manual task completion.'
    });
    
    return response.content.split('\n').filter((line: string) => line.trim());
  }
  
  /**
   * Optimize execution plan
   */
  private optimizePlan(plan: ExecutionPlan, _context: TaskContext): ExecutionPlan {
    // Optimize plan for efficiency and minimal user interruption
    // For now, return as-is
    return plan;
  }
  
  /**
   * Find alternative agent with similar capabilities
   */
  private findAlternativeAgent(agent: AgentCapability): AgentCapability | null {
    for (const [id, candidate] of this.agentRegistry) {
      if (id === agent.agentId) continue;
      
      // Check for capability overlap
      const overlap = candidate.capabilities.filter(c => 
        agent.capabilities.includes(c)
      );
      
      if (overlap.length > 0 && candidate.availability === 'available') {
        return candidate;
      }
    }
    
    return null;
  }
  
  // recordContextEntry method moved to BaseAgent as protected method
  // Now all agents including OrchestratorAgent can use this.recordContextEntry()
  
  /**
   * =============================================================================
   * PURE A2A SYSTEM - AGENT LIFECYCLE MANAGEMENT
   * =============================================================================
   * 
   * These methods replace AgentManager functionality with pure A2A approach.
   * OrchestratorAgent now manages the entire agent ecosystem.
   */
  
  /**
   * Initialize the entire agent system using A2A discovery
   */
  public async initializeAgentSystem(): Promise<void> {
    logger.info('🚀 Initializing Pure A2A Agent System');
    
    try {
      // Import agentDiscovery service
      const { agentDiscovery } = await import('../services/agent-discovery');
      
      // Discover all agents from YAML configurations
      logger.info('🔍 Discovering agents from YAML configurations...');
      this.agentCapabilities = await agentDiscovery.discoverAgents();
      
      // Log discovered capabilities
      logger.info('📊 Agent Capabilities Discovered:', {
        count: this.agentCapabilities.size,
        agents: Array.from(this.agentCapabilities.keys())
      });
      
      // Print capability report for debugging
      const capabilityReport = agentDiscovery.generateCapabilityReport();
      logger.info('\n' + capabilityReport);
      
      logger.info('✅ Pure A2A Agent System initialized successfully');
    } catch (error) {
      logger.error('💥 Failed to initialize A2A Agent System', error);
      throw error;
    }
  }
  
  /**
   * Configure agents for execution plan via DI and SSE subscription
   * 
   * This method creates agents via DI and subscribes them to the task message bus.
   * Agents remain active, listening for updates and working autonomously.
   * 
   * @param plan - The execution plan with agent requirements
   * @param taskId - The task ID for the message bus
   */
  private async configureAgentsForExecution(plan: ExecutionPlan, taskId: string): Promise<void> {
    // Extract all unique agents from all phases
    const requiredAgents = new Set<string>();
    for (const phase of plan.phases) {
      phase.agents.forEach(agent => requiredAgents.add(agent));
    }
    
    logger.info('Configuring agents for execution plan', {
      taskId,
      requiredAgents: Array.from(requiredAgents),
      phaseCount: plan.phases.length
    });
    
    // Track which agents are subscribed to this task
    const subscribedAgents = new Set<string>();
    
    for (const agentId of requiredAgents) {
      try {
        // Create agent via DI and configure for task
        await this.createAgentForTask(agentId, taskId);
        subscribedAgents.add(agentId);
        
        logger.info(`Agent ${agentId} configured for task ${taskId}`);
      } catch (error) {
        logger.error(`Failed to configure agent ${agentId}`, error);
        // Continue with other agents even if one fails
      }
    }
    
    // Store subscription tracking
    this.activeTaskSubscriptions.set(taskId, subscribedAgents);
    
    // Broadcast execution plan to all subscribed agents
    await this.broadcastTaskEvent(taskId, {
      type: 'EXECUTION_PLAN',
      plan: {
        taskId,
        phases: plan.phases,
        requiredAgents: Array.from(subscribedAgents),
        coordinator: 'orchestrator_agent'
      },
      timestamp: new Date().toISOString()
    });
    
    logger.info('All agents configured and execution plan broadcast', {
      taskId,
      subscribedCount: subscribedAgents.size
    });
  }
  
  /**
   * Create agent instance via Dependency Injection and configure for task
   * 
   * CRITICAL: Agents are NOT stored - they're created per-task and configured
   * to subscribe to the task-centered message bus. Agents remain active listening
   * for updates and analyze each event to determine if they can proceed.
   * 
   * @param agentId - The agent type to create
   * @param taskId - The task to subscribe the agent to
   * @returns The configured agent instance
   */
  public async createAgentForTask(agentId: string, taskId: string): Promise<any> {
    try {
      logger.info(`🤖 Creating agent via DI: ${agentId} for task: ${taskId}`);
      
      // Use Dependency Injection Container directly
      const { DIContainer } = await import('../services/dependency-injection');
      
      // Check if agent is registered in DI
      if (DIContainer.isAgentRegistered(agentId)) {
        // Create agent with SSE subscriptions already configured
        const agent = await DIContainer.resolveAgent(agentId, taskId);
        
        // Track active subscription
        if (!this.activeTaskSubscriptions.has(taskId)) {
          this.activeTaskSubscriptions.set(taskId, new Set());
        }
        this.activeTaskSubscriptions.get(taskId)!.add(agentId);
        
        logger.info(`✅ Agent created via DI and subscribed to task: ${agentId}`);
        return agent;
      } else {
        // Fallback to agentDiscovery if not in DI container
        const { agentDiscovery } = await import('../services/agent-discovery');
        const agent = await agentDiscovery.instantiateAgent(agentId, taskId);
        
        // Configure agent to subscribe to task message bus
        await this.configureAgentForTask(agent, taskId);
        return agent;
      }
    
    } catch (error) {
      logger.error(`❌ Failed to create agent: ${agentId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Configure an agent to subscribe to task-centered message bus
   * 
   * The agent will listen for events and analyze each update to determine
   * if it can continue its work, is blocked, or has completed.
   * 
   * @param agent - The agent instance to configure
   * @param taskId - The task to subscribe to
   */
  private async configureAgentForTask(agent: any, taskId: string): Promise<void> {
    // Subscribe agent to task events via SSE
    if (agent && typeof agent.subscribeToTaskEvents === 'function') {
      await agent.subscribeToTaskEvents(taskId, async (event: any) => {
        // Agent analyzes event to determine if it can proceed
        logger.debug('Agent received task event', {
          agentId: agent.specializedTemplate?.agent?.id || 'unknown',
          taskId,
          eventType: event.type
        });
        
        // Agent's internal logic will handle the event
        // It may announce completion, blockage, or continue working
      });
      
      logger.info('Agent subscribed to task message bus', {
        agentId: agent.specializedTemplate?.agent?.id || 'unknown',
        taskId
      });
    }
  }
  
  /**
   * Route A2A message via SSE broadcast
   * 
   * Instead of direct agent-to-agent calls, messages are broadcast
   * on the task message bus for loose coupling. Target agents listening
   * on the bus will receive and process the message.
   */
  public async routeA2AMessage(fromAgentId: string, toAgentId: string, message: any, taskId?: string): Promise<any> {
    try {
      // Validate communication permissions using A2A protocol
      const { agentDiscovery } = await import('../services/agent-discovery');
      
      if (!agentDiscovery.canCommunicate(fromAgentId, toAgentId)) {
        throw new Error(`A2A communication not allowed: ${fromAgentId} -> ${toAgentId}`);
      }
      
      // Broadcast message on SSE for target agent
      // If no taskId provided, use a system-wide channel
      const channel = taskId || 'system';
      
      await this.broadcastTaskEvent(channel, {
        type: 'A2A_MESSAGE',
        from: fromAgentId,
        to: toAgentId,
        message,
        timestamp: new Date().toISOString()
      });
      
      logger.debug(`A2A message broadcast: ${fromAgentId} -> ${toAgentId}`, {
        channel,
        messageType: message.type
      });
      
      return { 
        status: 'message_broadcast', 
        from: fromAgentId,
        to: toAgentId,
        channel 
      };
    } catch (error) {
      logger.error(`Failed A2A message: ${fromAgentId} -> ${toAgentId}`, error);
      throw error;
    }
  }
  
  /**
   * Handle agent-to-orchestrator requests for assistance
   * This enables agents to communicate needs back to the orchestrator
   * Engine PRD Lines 975-982: Agents can request help from orchestrator
   */
  public async handleAgentRequest(
    taskId: string, 
    fromAgentId: string, 
    request: OrchestratorRequest
  ): Promise<OrchestratorResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info('🤖 AGENT REQUEST: Processing agent assistance request', {
        taskId,
        fromAgent: fromAgentId,
        requestType: request.type,
        priority: request.priority,
        requestId
      });

      // Analyze the request and determine response
      const response = await this.analyzeAgentRequest(taskId, fromAgentId, request, requestId);

      // Record the orchestrator's decision process
      // For now, we'll skip recording if we can't get context easily
      // This would normally fetch from database
      try {
        await this.recordContextEntry(
          { contextId: taskId } as TaskContext,
          {
            operation: 'agent_request_processed',
            data: {
              fromAgent: fromAgentId,
              requestType: request.type,
              priority: request.priority,
              responseStatus: response.status,
              reasoning: response.message
            },
            reasoning: `Processed ${request.type} request from ${fromAgentId}: ${response.status}`
          }
        );
      } catch (recordError) {
        logger.warn('Failed to record context entry', { 
          error: recordError instanceof Error ? recordError.message : String(recordError) 
        });
      }

      return response;
    } catch (error) {
      logger.error('Failed to process agent request', {
        taskId,
        fromAgent: fromAgentId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'denied',
        requestId,
        message: `Failed to process request: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        alternatives: [
          {
            option: 'Retry request',
            description: 'Resubmit the request after a brief delay'
          },
          {
            option: 'Escalate to user',
            description: 'Request user intervention for this issue'
          }
        ],
        responseTime: new Date().toISOString(),
        confidence: 0.3
      };
    }
  }

  /**
   * Analyze an agent's request and provide orchestration guidance
   */
  private async analyzeAgentRequest(
    taskId: string,
    fromAgentId: string,
    request: OrchestratorRequest,
    requestId: string
  ): Promise<OrchestratorResponse> {
    try {
      // Use LLM to analyze the request and provide guidance
      const analysisPrompt = `You are the orchestrator for a multi-agent system.
An agent needs assistance with a task.

AGENT: ${fromAgentId}
REQUEST TYPE: ${request.type}
PRIORITY: ${request.priority}
CONTEXT: ${JSON.stringify(request.context, null, 2)}

Analyze this request and provide appropriate guidance.
Consider:
1. The urgency and priority of the request
2. What resources or other agents might help
3. Any specific instructions or data needed

Respond with JSON only:
{
  "status": "approved" | "denied" | "deferred" | "modified" | "escalated",
  "message": "Brief explanation of the response",
  "provided": {
    "agents": ["array of agent IDs if provided"],
    "tools": ["array of tool names if provided"],
    "resourcesAllocated": [{"type": "resource type", "amount": "resource amount"}]
  },
  "nextSteps": [
    {
      "action": "description of action",
      "expectedCompletion": "time estimate",
      "dependencies": ["array of dependencies"]
    }
  ],
  "alternatives": [
    {
      "option": "alternative approach",
      "description": "description of alternative",
      "tradeoffs": ["array of tradeoffs"]
    }
  ]
}`;

      const llmResponse = await this.llmProvider.complete({
        prompt: analysisPrompt,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        systemPrompt: this.config.mission
      });

      // Parse response with fallback
      let response: OrchestratorResponse;
      try {
        const parsed = JSON.parse(llmResponse.content);
        response = {
          status: parsed.status || 'approved',
          requestId,
          message: parsed.message || 'Request received and being processed',
          provided: parsed.provided,
          nextSteps: parsed.nextSteps,
          alternatives: parsed.alternatives,
          responseTime: new Date().toISOString(),
          confidence: parsed.confidence || 0.8
        };
      } catch (error) {
        logger.warn('Failed to parse LLM response for agent request', { error });
        response = {
          status: 'approved',
          requestId,
          message: 'Request approved with fallback logic',
          nextSteps: [
            {
              action: 'Continue with your current approach',
              expectedCompletion: '5 minutes'
            },
            {
              action: 'Report any issues to orchestrator',
              expectedCompletion: 'As needed'
            }
          ],
          responseTime: new Date().toISOString(),
          confidence: 0.5
        };
      }

      return response;
    } catch (error) {
      logger.error('Failed to analyze agent request', {
        taskId,
        fromAgentId,
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'denied',
        requestId,
        message: 'Failed to analyze request due to internal error',
        alternatives: [
          {
            option: 'Retry request',
            description: 'Resubmit the request after a brief delay'
          }
        ],
        responseTime: new Date().toISOString(),
        confidence: 0.2
      };
    }
  }

  /**
   * Convert ComputedState to TaskContext for compatibility
   */
  private convertComputedStateToTaskContext(state: any, taskId: string): TaskContext {
    return {
      contextId: taskId,
      taskTemplateId: state.metadata?.templateId || 'unknown',
      tenantId: state.metadata?.userId || 'system',
      businessId: state.metadata?.businessId || state.data?.businessId,
      createdAt: state.metadata?.createdAt || new Date().toISOString(),
      currentState: state,
      history: state.history || [],
      metadata: state.metadata || {}
      // templateSnapshot omitted - agents use task data only
    };
  }

  /**
   * Create task using pure A2A system
   */
  public async createTask(taskRequest: any): Promise<string> {
    const taskContext = {
      contextId: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskTemplateId: taskRequest.templateId,
      tenantId: taskRequest.userId,
      businessId: taskRequest.businessId,
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'initialization',
        completeness: 0,
        data: {}
      },
      history: [],
      metadata: taskRequest.metadata || {}
    };

    logger.info('Creating task with Pure A2A system', {
      contextId: taskContext.contextId,
      templateId: taskContext.taskTemplateId
    });

    // Save task to database if userId provided
    if (taskRequest.userId) {
      const db = this.getDBService();
      await db.createTask(taskRequest.userId, {
        id: taskContext.contextId,
        user_id: taskRequest.userId,
        title: `${taskRequest.templateId} Task`,
        description: `Task for ${taskRequest.businessId}`,
        task_type: taskRequest.templateId || 'general',
        business_id: taskRequest.businessId,
        template_id: taskRequest.templateId,
        status: 'pending',
        priority: taskRequest.priority || 'medium',
        deadline: taskRequest.deadline,
        metadata: taskRequest.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      logger.info('Task saved to database', { contextId: taskContext.contextId });
    }

    // Create execution plan with agent requirements
    const executionPlan = await this.createExecutionPlan(taskContext as any);
    
    // Configure agents via DI for this task's message bus
    await this.configureAgentsForExecution(executionPlan, taskContext.contextId);
    
    // Start orchestration - agents work autonomously via SSE
    await this.orchestrateTask(taskContext as any);
    
    return taskContext.contextId;
  }
  
  /**
   * Get task status using direct database access
   */
  public async getTaskStatus(taskId: string, userId: string): Promise<any> {
    try {
      const db = this.getDBService();
      const task = await db.getTask(userId, taskId);
      
      if (!task) {
        return null;
      }

      return {
        taskId: task.id,
        userId: task.user_id,
        status: task.status,
        priority: task.priority,
        businessId: task.business_id,
        templateId: task.template_id,
        metadata: task.metadata,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at
      };
    } catch (error) {
      logger.error('Failed to get task status', { taskId, error });
      return null;
    }
  }
  
  /**
   * Get user tasks using direct database access
   */
  public async getUserTasks(userId: string): Promise<any[]> {
    try {
      const db = this.getDBService();
      const tasks = await db.getUserTasks(userId);
      
      return tasks.map(task => ({
        taskId: task.id,
        userId: task.user_id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        businessId: task.business_id,
        templateId: task.template_id,
        metadata: task.metadata,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at
      }));
    } catch (error) {
      logger.error('Failed to get user tasks', error);
      return [];
    }
  }
  
  /**
   * A2A Discovery Methods - Pure A2A Protocol
   */
  public async getDiscoveredCapabilities(): Promise<any[]> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.getCapabilities();
  }
  
  public async findAgentsBySkill(skill: string): Promise<any[]> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.findAgentsBySkill(skill);
  }
  
  public async findAgentsByRole(role: string): Promise<any[]> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.findAgentsByRole(role);
  }
  
  public async getAgentRouting(agentId: string): Promise<{ canReceiveFrom: string[], canSendTo: string[] } | undefined> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    const capability = agentDiscovery.getAgentCapability(agentId);
    if (capability) {
      return {
        canReceiveFrom: capability.canReceiveFrom,
        canSendTo: capability.canSendTo
      };
    }
    return undefined;
  }
  
  public async canAgentsCommunicate(fromAgent: string, toAgent: string): Promise<boolean> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.canCommunicate(fromAgent, toAgent);
  }
  
  public async getCapabilityReport(): Promise<string> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.generateCapabilityReport();
  }
  
  /**
   * System health check for pure A2A system
   */
  public isSystemHealthy(): boolean {
    // In pure A2A system, health means orchestrator is running
    // and can discover agents on-demand
    return this.agentCapabilities.size > 0;
  }
  
  /**
   * Shutdown agent system
   */
  public async shutdownSystem(): Promise<void> {
    logger.info('Shutting down Pure A2A Agent System');
    
    // Notify all subscribed agents via SSE that system is shutting down
    // Agents listening on task message buses will receive shutdown signal
    for (const [taskId] of this.activeTaskSubscriptions.entries()) {
      try {
        await this.broadcastTaskEvent(taskId, {
          type: 'SYSTEM_SHUTDOWN',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error broadcasting shutdown to task', { taskId, error });
      }
    }

    // Clear all task subscriptions
    this.activeTaskSubscriptions.clear();
    this.agentCapabilities.clear();
    this.agentRegistry.clear();

    logger.info('Pure A2A Agent System shut down');
  }
  
  /**
   * Get mapping of old agent names to YAML-based agent names
   * This ensures the LLM's old training data doesn't break the system
   */
  private getAgentNameCorrections(): Record<string, string> {
    return {
      // Common old names that LLMs might use from training data
      'ProfileCollector': 'profile_collection_agent',
      'TaskCoordinatorAgent': 'orchestrator_agent',
      'BusinessDiscoveryAgent': 'data_collection_agent',
      'DataEnrichmentAgent': 'data_collection_agent',
      'ComplianceVerificationAgent': 'legal_compliance_agent',
      'FormOptimizerAgent': 'ux_optimization_agent',
      'CelebrationAgent': 'celebration_agent',
      'MonitoringAgent': 'monitoring_agent',
      'AchievementTracker': 'celebration_agent',
      'PaymentAgent': 'payment_agent',
      'CommunicationAgent': 'communication_agent',
      'AgencyInteractionAgent': 'agency_interaction_agent',
      'EntityComplianceAgent': 'entity_compliance_agent'
    };
  }
  
  /**
   * Correct agent names in parsed plan using mapping rules
   * This is a safety net when LLM training data conflicts with YAML configuration
   */
  private correctAgentNames(parsedPlan: any, invalidNames: string[], validNames: string[]): any {
    const corrections = this.getAgentNameCorrections();
    const correctedPlan = JSON.parse(JSON.stringify(parsedPlan)); // Deep clone
    
    logger.info('🔧 CORRECTING AGENT NAMES', {
      invalidNames,
      validNames,
      availableCorrections: Object.keys(corrections)
    });
    
    // Correct names in reasoning.subtask_decomposition
    if (correctedPlan.reasoning?.subtask_decomposition) {
      correctedPlan.reasoning.subtask_decomposition.forEach((subtask: any) => {
        if (subtask.assigned_agent && corrections[subtask.assigned_agent]) {
          logger.info(`🔄 Correcting agent name: ${subtask.assigned_agent} → ${corrections[subtask.assigned_agent]}`);
          subtask.assigned_agent = corrections[subtask.assigned_agent];
        } else if (subtask.assigned_agent && !validNames.includes(subtask.assigned_agent)) {
          // If no mapping exists, use the first available agent as fallback
          const fallbackAgent = validNames[0] || 'profile_collection_agent';
          logger.warn(`⚠️ No mapping for ${subtask.assigned_agent}, using fallback: ${fallbackAgent}`);
          subtask.assigned_agent = fallbackAgent;
        }
      });
    }
    
    // Correct names in phases.subtasks
    correctedPlan.phases?.forEach((phase: any) => {
      phase.subtasks?.forEach((subtask: any) => {
        if (subtask.agent && corrections[subtask.agent]) {
          logger.info(`🔄 Correcting agent name: ${subtask.agent} → ${corrections[subtask.agent]}`);
          subtask.agent = corrections[subtask.agent];
        } else if (subtask.agent && !validNames.includes(subtask.agent)) {
          // If no mapping exists, use the first available agent as fallback
          const fallbackAgent = validNames[0] || 'profile_collection_agent';
          logger.warn(`⚠️ No mapping for ${subtask.agent}, using fallback: ${fallbackAgent}`);
          subtask.agent = fallbackAgent;
        }
      });
    });
    
    return correctedPlan;
  }
  
  /**
   * =============================================================================
   * TOOLCHAIN-FIRST UI REQUEST EXECUTION PLAN
   * =============================================================================
   * 
   * Creates execution plan when toolchain acquisition fails and UI input is needed
   */
  
  /**
   * Create execution plan that requests user input after toolchain attempts
   */
  private async createUIRequestExecutionPlan(
    context: TaskContext,
    uiRequest: any,
    acquisitionResult: any
  ): Promise<ExecutionPlan> {
    logger.info('🎯 Creating UI request execution plan after toolchain attempts', {
      contextId: context.contextId,
      stillMissingFields: acquisitionResult.stillMissingFields || acquisitionResult.stillMissing,
      toolchainResults: acquisitionResult.toolResults?.length || 0
    });
    
    // Record why we're requesting user input
    await this.recordContextEntry(context, {
      operation: 'toolchain_acquisition_failed_requesting_ui',
      data: {
        originalMissingFields: acquisitionResult.stillMissingFields || acquisitionResult.stillMissing,
        toolchainResults: acquisitionResult.toolResults || [],
        acquiredFromToolchain: acquisitionResult.acquiredData,
        requestingUserInput: true
      },
      reasoning: `Toolchain attempted ${acquisitionResult.toolResults?.length || 0} tools but could not acquire all required data. Requesting user input for remaining fields.`
    });
    
    // Create a single-phase plan that requests user input
    const uiRequestPlan: ExecutionPlan = {
      phases: [{
        name: 'User Data Collection (Post-Toolchain)',
        subtasks: [{
          description: 'Collect remaining business information from user after toolchain attempts',
          agent: 'profile_collection_agent',
          specific_instruction: `Request the following business information from the user: ${(acquisitionResult.stillMissingFields || acquisitionResult.stillMissing || []).join(', ')}. Explain that we attempted to find this information automatically but need their input for accuracy.`,
          input_data: {
            missingFields: acquisitionResult.stillMissingFields || acquisitionResult.stillMissing || [],
            toolchainResults: acquisitionResult.toolResults || [],
            acquiredData: acquisitionResult.acquiredData || {},
            context: 'toolchain_acquisition_failed'
          },
          expected_output: 'User-provided business data for remaining fields',
          success_criteria: ['All required fields provided by user', 'Data validated and stored']
        }],
        parallel_execution: false,
        dependencies: []
      }],
      reasoning: {
        task_analysis: `Toolchain tools could not provide all required data. Still need: ${(acquisitionResult.stillMissingFields || acquisitionResult.stillMissing || []).join(', ')}`,
        subtask_decomposition: [{
          subtask: 'Collect remaining business information from user',
          required_capabilities: ['user_input_collection', 'business_profile_management'],
          assigned_agent: 'profile_collection_agent',
          rationale: 'Specialized in collecting business information with user interaction after automated attempts'
        }],
        coordination_strategy: 'Single-phase user data collection as fallback after toolchain attempts'
      }
    } as any;
    
    // Add the UI request directly to the plan
    (uiRequestPlan as any).immediateUIRequest = uiRequest;
    
    return uiRequestPlan;
  }
  
  /**
   * Dynamically identify missing required fields based on task type
   * This replaces the hardcoded required_business_data configuration
   */
  private async identifyMissingRequiredFields(
    context: TaskContext, 
    taskType: string,
    businessProfile: Record<string, any>
  ): Promise<string[]> {
    const missingFields: string[] = [];
    
    // Define minimum required fields based on task type
    // This is now dynamically determined rather than hardcoded in YAML
    const taskRequirements: Record<string, string[]> = {
      'user_onboarding': ['business_name', 'business_type'],
      'soi_filing': ['business_name', 'entity_type', 'registered_agent_name'],
      'compliance_check': ['business_name', 'business_type', 'jurisdiction'],
      'general': ['business_name']
    };
    
    const requiredFields = taskRequirements[taskType] || taskRequirements['general'];
    
    // Check which fields are missing or empty
    for (const field of requiredFields) {
      const value = businessProfile[field];
      if (!value || value === '' || value === null || value === undefined) {
        missingFields.push(field);
      }
    }
    
    // Log what we found
    if (missingFields.length > 0) {
      logger.info('🔍 Identified missing required fields', {
        contextId: context.contextId,
        taskType,
        requiredFields,
        missingFields,
        presentFields: requiredFields.filter(f => !missingFields.includes(f))
      });
    }
    
    return missingFields;
  }
  
  
}