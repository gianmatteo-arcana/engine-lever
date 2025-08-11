/**
 * A2A Orchestrator Agent
 * 
 * The orchestrator is responsible for:
 * - Interpreting task goals and requirements
 * - Creating dynamic execution plans using LLM
 * - Delegating work to specialized agents
 * - Monitoring task progress
 * - Handling errors and retries
 */

import { BaseA2AAgent, A2ATask, A2ATaskResult, AgentCapabilities } from '../base/BaseA2AAgent';
import { LLMProvider, LLMRequest } from '../../services/llm-provider';
import { logger } from '../../utils/logger';
import { 
  TaskContext, 
  OnboardingTaskContext, 
  TaskGoal
} from '../../types/task-context';
import { TaskOrchestrationPlanRecord } from '../../services/database';
import { emitTaskEvent } from '../../services/task-events';

interface ExecutionPlan {
  phases: Array<{
    id: string;
    name: string;
    description: string;
    requiredAgents: string[];
    prerequisites?: string[];
    estimatedDuration?: string;
    goals: string[];
  }>;
  totalDuration?: string;
  criticalPath?: string[];
  fallbackStrategies?: Record<string, any>;
}

interface AgentRegistry {
  [agentRole: string]: {
    capabilities: string[];
    endpoints?: {
      task: string;
      status: string;
    };
    availability: 'available' | 'busy' | 'offline';
  };
}

export class A2AOrchestrator extends BaseA2AAgent {
  private llm: LLMProvider;
  private agentRegistry: AgentRegistry;

  constructor() {
    super('a2a-orchestrator-001', 'orchestrator', {
      name: 'A2A Task Orchestrator',
      skills: [
        'task_interpretation',
        'dynamic_planning',
        'agent_delegation',
        'progress_monitoring',
        'error_recovery'
      ],
      version: '1.0.0'
    });

    this.llm = LLMProvider.getInstance();
    
    // Initialize agent registry (hardcoded for MVP, future: dynamic discovery)
    this.agentRegistry = {
      data_collection_agent: {
        capabilities: ['form_data_collection', 'data_validation', 'cbc_api_lookup'],
        availability: 'available'
      },
      payment_agent: {
        capabilities: ['payment_processing', 'receipt_generation'],
        availability: 'available'
      },
      communication_agent: {
        capabilities: ['user_notifications', 'email_sending'],
        availability: 'available'
      }
    };
  }

  /**
   * Execute orchestration task
   */
  protected async executeWithTenantContext(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    try {
      // Extract task context
      const taskContext = task.input as TaskContext;
      
      switch (task.type) {
        case 'create_execution_plan':
          return await this.createExecutionPlan(task, taskContext);
          
        case 'delegate_phase':
          return await this.delegatePhase(task, taskContext);
          
        case 'monitor_progress':
          return await this.monitorProgress(task, taskContext);
          
        case 'handle_failure':
          return await this.handleFailure(task, taskContext);
          
        default:
          throw new Error(`Unknown orchestrator task type: ${task.type}`);
      }
    } catch (error) {
      logger.error('Orchestrator execution failed', { error, taskId: task.id });
      throw error;
    }
  }

  /**
   * Create dynamic execution plan using LLM
   */
  private async createExecutionPlan(
    task: A2ATask,
    taskContext: TaskContext
  ): Promise<A2ATaskResult> {
    try {
      // Build prompt for LLM
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildPlanningPrompt(taskContext);

      // Get plan from LLM
      const llmRequest: LLMRequest = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        maxTokens: 2000,
        metadata: {
          taskId: task.id,
          agentRole: this.agentRole,
          purpose: 'execution_planning'
        }
      };

      const llmResponse = await this.llm.complete(llmRequest);
      
      // Parse the execution plan
      const executionPlan = this.parseExecutionPlan(llmResponse.content);

      // Save plan to database
      await this.savePlan(task.id, executionPlan, llmResponse);

      // Emit plan created event with context
      await emitTaskEvent('plan-created', {
        taskId: task.id,
        plan: executionPlan,
        estimatedDuration: executionPlan.totalDuration,
        phaseCount: executionPlan.phases.length
      }, {
        userToken: task.tenantContext?.userToken,
        actorType: 'agent',
        actorId: this.agentId,
        actorRole: this.agentRole,
        reasoning: `Created execution plan with ${executionPlan.phases.length} phases`,
        phase: 'planning'
      });

      // Return the plan
      return {
        status: 'complete',
        result: {
          plan: executionPlan,
          estimatedDuration: executionPlan.totalDuration,
          firstPhase: executionPlan.phases[0]
        }
      };

    } catch (error) {
      logger.error('Failed to create execution plan', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'PLANNING_FAILED',
          message: 'Failed to create execution plan',
          details: error
        }
      };
    }
  }

  /**
   * Delegate a phase to appropriate agents
   */
  private async delegatePhase(
    task: A2ATask,
    taskContext: TaskContext
  ): Promise<A2ATaskResult> {
    const { phaseId, planId } = task.input;
    
    try {
      // Get the plan and phase details
      const plan = await this.dbService.getActiveOrchestrationPlan(task.id);
      if (!plan) {
        throw new Error('No active plan found');
      }

      const phase = (plan.execution_plan as ExecutionPlan).phases.find(p => p.id === phaseId);
      if (!phase) {
        throw new Error(`Phase ${phaseId} not found in plan`);
      }

      // Check agent availability
      const availableAgents = phase.requiredAgents.filter(
        agent => this.agentRegistry[agent]?.availability === 'available'
      );

      if (availableAgents.length === 0) {
        return {
          status: 'error',
          error: {
            code: 'NO_AGENTS_AVAILABLE',
            message: 'No agents available for this phase',
            details: { requiredAgents: phase.requiredAgents }
          }
        };
      }

      // Create delegation tasks for each agent
      const delegations = availableAgents.map(agentRole => ({
        agentRole,
        taskType: this.mapPhaseToTaskType(phase.name),
        input: {
          ...taskContext,
          phaseGoals: phase.goals,
          phaseContext: phase
        }
      }));

      // Emit phase started event with context
      await emitTaskEvent('phase-started', {
        taskId: task.id,
        phaseId: phase.id,
        phaseName: phase.name,
        requiredAgents: phase.requiredAgents,
        delegatedTo: availableAgents
      }, {
        userToken: task.tenantContext?.userToken,
        actorType: 'agent',
        actorId: this.agentId,
        actorRole: this.agentRole,
        reasoning: `Starting phase ${phase.name} with ${availableAgents.length} agents`,
        phase: phase.name
      });

      return {
        status: 'complete',
        result: {
          delegations,
          phaseId: phase.id,
          phaseName: phase.name
        }
      };

    } catch (error) {
      logger.error('Failed to delegate phase', { error, taskId: task.id, phaseId });
      return {
        status: 'error',
        error: {
          code: 'DELEGATION_FAILED',
          message: 'Failed to delegate phase',
          details: error
        }
      };
    }
  }

  /**
   * Monitor task progress
   */
  private async monitorProgress(
    task: A2ATask,
    taskContext: TaskContext
  ): Promise<A2ATaskResult> {
    try {
      // Get all agent contexts
      const agentContexts = await this.dbService.getTaskAgentContexts(
        task.tenantContext.userToken,
        task.id
      );

      // Calculate overall progress
      const progress = {
        completedAgents: agentContexts.filter(ctx => ctx.is_complete).length,
        totalAgents: agentContexts.length,
        percentComplete: agentContexts.length > 0 
          ? Math.round((agentContexts.filter(ctx => ctx.is_complete).length / agentContexts.length) * 100)
          : 0,
        agentStatuses: agentContexts.map(ctx => ({
          agent: ctx.agent_role,
          isComplete: ctx.is_complete,
          lastAction: ctx.last_action,
          lastActionAt: ctx.last_action_at,
          errorCount: ctx.error_count
        }))
      };

      // Determine if we need to move to next phase
      const allComplete = progress.completedAgents === progress.totalAgents && progress.totalAgents > 0;

      // Emit progress event with context
      await emitTaskEvent('progress', {
        taskId: task.id,
        progress: progress.percentComplete,
        completedAgents: progress.completedAgents,
        totalAgents: progress.totalAgents,
        agentStatuses: progress.agentStatuses
      }, {
        userToken: task.tenantContext?.userToken,
        actorType: 'agent',
        actorId: this.agentId,
        actorRole: this.agentRole,
        reasoning: `Task progress: ${progress.percentComplete}% complete`
      });

      return {
        status: 'complete',
        result: {
          progress,
          shouldAdvance: allComplete,
          nextAction: allComplete ? 'advance_to_next_phase' : 'continue_monitoring'
        }
      };

    } catch (error) {
      logger.error('Failed to monitor progress', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'MONITORING_FAILED',
          message: 'Failed to monitor task progress',
          details: error
        }
      };
    }
  }

  /**
   * Handle task failures with recovery strategies
   */
  private async handleFailure(
    task: A2ATask,
    taskContext: TaskContext
  ): Promise<A2ATaskResult> {
    const { failureDetails, agentRole, phaseId } = task.input;

    try {
      // Use LLM to determine recovery strategy
      const llmRequest: LLMRequest = {
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at error recovery and task orchestration. Analyze the failure and suggest recovery strategies.'
          },
          { 
            role: 'user', 
            content: JSON.stringify({
              taskType: taskContext.taskType,
              currentPhase: phaseId,
              failedAgent: agentRole,
              failureDetails,
              taskContext: {
                status: taskContext.status,
                completedPhases: taskContext.completedPhases
              }
            })
          }
        ],
        temperature: 0.5,
        maxTokens: 1000,
        metadata: {
          taskId: task.id,
          purpose: 'error_recovery'
        }
      };

      const llmResponse = await this.llm.complete(llmRequest);
      const recoveryStrategy = JSON.parse(llmResponse.content);

      // Emit error event with context
      await emitTaskEvent('error', {
        taskId: task.id,
        agentRole,
        phaseId,
        failureDetails,
        recoveryStrategy: recoveryStrategy.recommendation
      }, {
        userToken: task.tenantContext?.userToken,
        actorType: 'agent',
        actorId: this.agentId,
        actorRole: this.agentRole,
        reasoning: `Error in ${agentRole}: ${failureDetails}. Recovery: ${recoveryStrategy.recommendation}`,
        phase: phaseId
      });

      return {
        status: 'complete',
        result: {
          recoveryStrategy,
          recommendation: recoveryStrategy.recommendation || 'retry',
          alternativeAgents: recoveryStrategy.alternativeAgents || [],
          userNotificationRequired: recoveryStrategy.notifyUser || false
        }
      };

    } catch (error) {
      logger.error('Failed to handle failure', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'RECOVERY_FAILED',
          message: 'Failed to determine recovery strategy',
          details: error
        }
      };
    }
  }

  /**
   * Build system prompt for LLM
   */
  private buildSystemPrompt(): string {
    return `You are an expert task orchestrator for a business compliance platform. Your role is to:
1. Analyze task requirements and create detailed execution plans
2. Identify which specialized agents are needed for each phase
3. Ensure proper sequencing and dependencies
4. Consider multi-tenant security requirements
5. Optimize for efficiency while maintaining accuracy

Available agents and their capabilities:
${JSON.stringify(this.agentRegistry, null, 2)}

Always respond with valid JSON following the execution plan schema.`;
  }

  /**
   * Build planning prompt based on task context
   */
  private buildPlanningPrompt(taskContext: TaskContext): string {
    const goals = (taskContext as any).task_goals || [];
    const requirements = (taskContext as any).required_inputs || {};

    return `Create an execution plan for the following task:

Task Type: ${taskContext.taskType}
Task ID: ${taskContext.taskId}
Current Status: ${taskContext.status}

Task Goals:
${JSON.stringify(goals, null, 2)}

Required Inputs:
${JSON.stringify(requirements, null, 2)}

Current Context:
${JSON.stringify(taskContext.sharedContext, null, 2)}

Create a detailed execution plan with:
1. Logical phases to achieve all goals
2. Which agents are needed for each phase
3. Dependencies between phases
4. Estimated duration for each phase
5. Critical path identification
6. Fallback strategies for potential failures

Return the plan as JSON in this format:
{
  "phases": [
    {
      "id": "phase_1",
      "name": "Data Collection",
      "description": "Collect required business information",
      "requiredAgents": ["data_collection_agent"],
      "prerequisites": [],
      "estimatedDuration": "5 minutes",
      "goals": ["collect_business_name", "collect_ein"]
    }
  ],
  "totalDuration": "15 minutes",
  "criticalPath": ["phase_1", "phase_2"],
  "fallbackStrategies": {}
}`;
  }

  /**
   * Parse execution plan from LLM response
   */
  private parseExecutionPlan(llmContent: string): ExecutionPlan {
    try {
      // Try to parse as JSON first
      return JSON.parse(llmContent);
    } catch (error) {
      // If not valid JSON, try to extract JSON from the response
      const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback to a default plan
      logger.warn('Failed to parse LLM plan, using fallback', { llmContent });
      return this.getDefaultPlan();
    }
  }

  /**
   * Get default execution plan (fallback)
   */
  private getDefaultPlan(): ExecutionPlan {
    return {
      phases: [
        {
          id: 'phase_1',
          name: 'Data Collection',
          description: 'Collect required information',
          requiredAgents: ['data_collection_agent'],
          estimatedDuration: '10 minutes',
          goals: ['collect_required_data']
        },
        {
          id: 'phase_2',
          name: 'Validation',
          description: 'Validate collected data',
          requiredAgents: ['data_collection_agent'],
          prerequisites: ['phase_1'],
          estimatedDuration: '5 minutes',
          goals: ['validate_data']
        },
        {
          id: 'phase_3',
          name: 'Completion',
          description: 'Complete the task',
          requiredAgents: ['communication_agent'],
          prerequisites: ['phase_2'],
          estimatedDuration: '5 minutes',
          goals: ['notify_completion']
        }
      ],
      totalDuration: '20 minutes',
      criticalPath: ['phase_1', 'phase_2', 'phase_3']
    };
  }

  /**
   * Save execution plan to database
   */
  private async savePlan(
    taskId: string,
    plan: ExecutionPlan,
    llmResponse: any
  ): Promise<void> {
    try {
      await this.dbService.createOrchestrationPlan({
        task_id: taskId,
        goals: plan.phases.flatMap(p => p.goals),
        execution_plan: plan,
        plan_version: 1,
        is_active: true,
        llm_model: llmResponse.model,
        llm_response: llmResponse,
        llm_tokens_used: llmResponse.usage?.totalTokens,
        steps_completed: 0,
        steps_total: plan.phases.length
      });
    } catch (error) {
      logger.error('Failed to save execution plan', { error, taskId });
      // Non-critical error - continue execution
    }
  }

  /**
   * Map phase name to task type for agent delegation
   */
  private mapPhaseToTaskType(phaseName: string): string {
    const mappings: Record<string, string> = {
      'Data Collection': 'collect_business_data',
      'Validation': 'validate_data',
      'Payment Processing': 'process_payment',
      'Submission': 'submit_forms',
      'Completion': 'notify_completion'
    };

    return mappings[phaseName] || 'execute_phase';
  }
}