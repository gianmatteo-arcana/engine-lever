/**
 * Agent Executor Service
 * 
 * Handles execution of agents through dependency injection
 * Provides a clean interface between OrchestratorAgent and DefaultAgent
 * without tight coupling
 */

import { logger } from '../utils/logger';
import { AgentRequest, AgentResponse, TaskContext } from '../types/engine-types';
import { BaseAgentRequest, BaseAgentResponse } from '../types/base-agent-types';
import { DefaultAgent } from '../agents/DefaultAgent';
import { a2aEventBus } from './a2a-event-bus';

export class AgentExecutor {
  /**
   * Execute an agent with proper type conversion and event broadcasting
   * This service bridges the gap between OrchestratorAgent and DefaultAgent
   * 
   * @param agent - The agent instance to execute
   * @param request - The agent request from OrchestratorAgent
   * @returns The agent's response
   */
  static async execute(agent: DefaultAgent, request: AgentRequest): Promise<AgentResponse> {
    const agentId = agent.getAgentId();
    
    logger.info('🚀 Agent Executor: Starting agent execution', {
      agentId,
      requestId: request.requestId,
      instruction: request.instruction?.substring(0, 100),
      taskId: request.taskContext?.contextId
    });
    
    // Broadcast agent starting event
    if (request.taskContext) {
      await this.broadcastAgentEvent(request.taskContext, {
        type: 'AGENT_EXECUTION_STARTED',
        agentId,
        requestId: request.requestId,
        instruction: request.instruction,
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      // Convert AgentRequest to BaseAgentRequest for BaseAgent.executeInternal
      const baseRequest: BaseAgentRequest = {
        operation: request.operation || 'execute_subtask',
        parameters: {
          instruction: request.instruction,
          data: request.data,
          context: request.context,
          expectedOutput: request.context?.expectedOutput,
          successCriteria: request.context?.successCriteria,
          subtaskDescription: request.context?.subtaskDescription
        },
        taskContext: request.taskContext || {},
        urgency: request.context?.urgency
      };
      
      // Execute using BaseAgent's executeInternal
      const baseResponse: BaseAgentResponse = await agent.executeInternal(baseRequest);
      
      // Convert BaseAgentResponse to AgentResponse
      const agentResponse: AgentResponse = {
        status: baseResponse.status || 'completed',
        data: baseResponse.contextUpdate?.data || {},
        reasoning: baseResponse.contextUpdate?.reasoning,
        uiRequests: baseResponse.uiRequests || [],
        error: baseResponse.error ? {
          code: baseResponse.error.type,
          message: baseResponse.error.message,
          recoverable: baseResponse.error.can_retry || false
        } : undefined
      };
      
      // Broadcast agent completion event
      if (request.taskContext) {
        await this.broadcastAgentEvent(request.taskContext, {
          type: 'AGENT_EXECUTION_COMPLETED',
          agentId,
          requestId: request.requestId,
          status: agentResponse.status,
          result: baseResponse.contextUpdate?.data,
          reasoning: baseResponse.contextUpdate?.reasoning,
          timestamp: new Date().toISOString()
        });
      }
      
      logger.info('✅ Agent Executor: Agent completed execution', {
        agentId,
        requestId: request.requestId,
        status: agentResponse.status
      });
      
      return agentResponse;
      
    } catch (error) {
      logger.error('❌ Agent Executor: Agent execution failed', {
        agentId,
        requestId: request.requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Broadcast agent failure event
      if (request.taskContext) {
        await this.broadcastAgentEvent(request.taskContext, {
          type: 'AGENT_EXECUTION_FAILED',
          agentId,
          requestId: request.requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Broadcast an agent event through the A2A event bus
   * 
   * @param context - The task context
   * @param event - The event to broadcast
   */
  private static async broadcastAgentEvent(context: TaskContext, event: any): Promise<void> {
    try {
      // Use the agent's recordContextEntry if available
      if (context && context.contextId) {
        await a2aEventBus.broadcast({
          type: 'TASK_CONTEXT_UPDATE',
          taskId: context.contextId,
          agentId: event.agentId,
          operation: event.type,
          data: event,
          timestamp: event.timestamp || new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast agent event', {
        eventType: event.type,
        agentId: event.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}