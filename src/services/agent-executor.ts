/**
 * Agent Executor Service
 * 
 * Handles execution of agents through dependency injection
 * Provides a clean interface between OrchestratorAgent and DefaultAgent
 * without tight coupling
 * 
 * SEPARATION OF CONCERNS:
 * - This service ORCHESTRATES agent execution only
 * - It does NOT persist events (agents persist their own events)
 * - It calls agent.recordExecutionEvent() to let agents record their own events
 * - This maintains clean boundaries: each component owns its own data
 * 
 * Event persistence flow:
 * 1. AgentExecutor calls agent.recordExecutionEvent()
 * 2. Agent uses its inherited recordContextEntry() to persist
 * 3. recordContextEntry() handles both DB persistence and A2A broadcasting
 * 
 * See docs/EVENT_PERSISTENCE_ARCHITECTURE.md for full details
 */

import { logger } from '../utils/logger';
import { AgentRequest, AgentResponse } from '../types/task-engine.types';
import { BaseAgentRequest, BaseAgentResponse } from '../types/base-agent-types';
import { ORCHESTRATOR_OPS } from '../constants/orchestrator-operations';
// Removed DefaultAgent import - now handles any agent type

export class AgentExecutor {
  /**
   * Execute an agent with proper type conversion and event broadcasting
   * This service bridges the gap between OrchestratorAgent and DefaultAgent
   * 
   * @param agent - The agent instance to execute
   * @param request - The agent request from OrchestratorAgent
   * @returns The agent's response
   */
  static async execute(agent: any, request: AgentRequest): Promise<AgentResponse> {
    // Get agent ID - handle both DefaultAgent and BaseAgent
    const agentId = typeof agent.getAgentId === 'function' 
      ? agent.getAgentId() 
      : (agent.specializedTemplate?.agent?.id || 'unknown_agent');
    
    logger.info('🚀 Agent Executor: Starting agent execution', {
      agentId,
      requestId: request.requestId,
      instruction: request.instruction?.substring(0, 100),
      taskId: request.taskContext?.contextId
    });
    
    // Let the agent record its own execution event (if it supports it)
    if (request.taskContext && typeof agent.recordExecutionEvent === 'function') {
      await agent.recordExecutionEvent(request.taskContext, {
        type: 'AGENT_EXECUTION_STARTED',
        agentId,
        requestId: request.requestId,
        instruction: request.instruction?.substring(0, 100),
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
      // Extract UIRequest from contextUpdate.data.uiRequest if present
      const uiRequests = [];
      if (baseResponse.contextUpdate?.data?.uiRequest) {
        uiRequests.push(baseResponse.contextUpdate.data.uiRequest);
      }
      
      const agentResponse: AgentResponse = {
        status: baseResponse.status || 'completed',
        data: baseResponse.contextUpdate?.data || {},
        reasoning: baseResponse.contextUpdate?.reasoning,
        uiRequests: uiRequests,
        error: baseResponse.error ? {
          code: baseResponse.error.type,
          message: baseResponse.error.message,
          recoverable: baseResponse.error.can_retry || false
        } : undefined
      };
      
      // Let the agent record its own execution event
      // CRITICAL: Use PAUSED when agent needs input, not COMPLETED
      if (request.taskContext && typeof agent.recordExecutionEvent === 'function') {
        const eventType = agentResponse.status === 'needs_input' 
          ? ORCHESTRATOR_OPS.AGENT_EXECUTION_PAUSED  // Agent is paused waiting for user input
          : ORCHESTRATOR_OPS.PHASE_COMPLETED; // Agent finished successfully
          
        await agent.recordExecutionEvent(request.taskContext, {
          type: eventType,
          agentId,
          requestId: request.requestId,
          status: agentResponse.status,
          // CRITICAL: Include UIRequests in the event so frontend can detect them
          uiRequests: agentResponse.uiRequests,
          timestamp: new Date().toISOString()
        });
      }
      
      const logMessage = agentResponse.status === 'needs_input'
        ? '⏸️ Agent Executor: Agent paused - needs user input'
        : '✅ Agent Executor: Agent completed execution';
        
      logger.info(logMessage, {
        agentId,
        requestId: request.requestId,
        status: agentResponse.status,
        hasUIRequests: agentResponse.uiRequests && agentResponse.uiRequests.length > 0
      });
      
      return agentResponse;
      
    } catch (error) {
      logger.error('❌ Agent Executor: Agent execution failed', {
        agentId,
        requestId: request.requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Let the agent record its own execution event
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