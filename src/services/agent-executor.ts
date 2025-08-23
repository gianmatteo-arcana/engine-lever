/**
 * Agent Executor Service
 * 
 * Handles execution of agents through dependency injection
 * Provides a clean interface between OrchestratorAgent and DefaultAgent
 * without tight coupling
 */

import { logger } from '../utils/logger';
import { AgentRequest, AgentResponse } from '../types/engine-types';
import { BaseAgentRequest, BaseAgentResponse } from '../types/base-agent-types';
import { DefaultAgent } from '../agents/DefaultAgent';

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
    
    // Have the agent record its own execution start event (separation of concerns)
    if (request.taskContext) {
      await agent.recordExecutionEvent(request.taskContext, {
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
      
      // Have the agent record its own execution completion event (separation of concerns)
      if (request.taskContext) {
        await agent.recordExecutionEvent(request.taskContext, {
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
      
      // Have the agent record its own execution failure event (separation of concerns)
      if (request.taskContext) {
        await agent.recordExecutionEvent(request.taskContext, {
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
}