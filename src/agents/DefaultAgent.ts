/**
 * DefaultAgent - Concrete implementation of BaseAgent
 * 
 * Issue #51: Agent Class Consolidation
 * This is THE concrete agent class used for all YAML-configured agents
 * 
 * All agent behavior comes from YAML configuration files
 * No hardcoded business logic here
 */

import { BaseAgent } from './base/BaseAgent';
import { logger } from '../utils/logger';
import { TaskContext } from '../types/engine-types';

export class DefaultAgent extends BaseAgent {
  // Everything is handled by BaseAgent through YAML configuration
  // This class just makes BaseAgent concrete so it can be instantiated
  
  /**
   * Initialize this agent for a specific task
   * Sets up SSE subscriptions and announces readiness
   * 
   * @param taskId - The task to initialize for
   */
  async initializeForTask(taskId: string): Promise<void> {
    const agentId = this.getAgentId();
    
    logger.info(`Initializing agent for task`, { agentId, taskId });
    
    // Subscribe to task events - using protected method from BaseAgent
    await this.subscribeToTaskEvents(taskId, async (event) => {
      logger.debug(`Agent received task event`, { 
        agentId, 
        taskId, 
        eventType: event.type 
      });
      
      // Handle event based on type
      await this.handleTaskEvent(event);
    });
    
    // Announce agent readiness - using protected method from BaseAgent
    await this.broadcastTaskEvent(taskId, {
      type: 'AGENT_READY',
      agentId,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Agent initialized and ready for task`, { agentId, taskId });
  }
  
  /**
   * Handle a task event received via SSE
   * Override this to implement agent-specific event handling
   * 
   * @param event - The event to handle
   */
  protected async handleTaskEvent(event: any): Promise<void> {
    const agentId = this.getAgentId();
    
    logger.debug(`Agent handling task event`, { 
      agentId, 
      eventType: event.type 
    });
    
    // Default implementation - agents can override for specific handling
    switch (event.type) {
      case 'EXECUTION_PLAN':
        // Agent receives execution plan and prepares for its phase
        logger.info(`Agent received execution plan`, { agentId });
        break;
        
      case 'PHASE_START':
        // Agent activated for its phase
        if (event.agents?.includes(agentId)) {
          logger.info(`Agent activated for phase`, { agentId, phase: event.phase });
        }
        break;
        
      case 'DATA_REQUEST':
        // Another agent requesting data
        if (event.targetAgent === agentId) {
          logger.info(`Agent received data request`, { agentId, requestId: event.requestId });
        }
        break;
        
      case 'BLOCKAGE_ANNOUNCED':
        // Another agent is blocked
        logger.debug(`Agent notified of peer blockage`, { agentId, blockedAgent: event.agentId });
        break;
        
      default:
        logger.debug(`Agent received unhandled event type: ${event.type}`, { agentId });
    }
  }
  
  /**
   * Get the agent ID from configuration
   */
  public getAgentId(): string {
    return (this as any).specializedTemplate?.agent?.id || 'unknown_agent';
  }
  
  /**
   * Record an execution event (AGENT_EXECUTION_STARTED, COMPLETED, FAILED)
   * This allows the agent to persist its own execution events following
   * the separation of concerns principle
   * 
   * @param context - The task context
   * @param event - The execution event to record
   */
  public async recordExecutionEvent(context: TaskContext, event: any): Promise<void> {
    const agentId = this.getAgentId();
    
    logger.debug(`Agent recording execution event`, { 
      agentId, 
      eventType: event.type,
      taskId: context.contextId 
    });
    
    // Use the protected recordContextEntry method from BaseAgent
    await this.recordContextEntry(context, {
      operation: event.type,
      data: event,
      reasoning: event.reasoning || `Agent ${agentId} execution: ${event.type}`,
      confidence: event.status === 'completed' ? 0.9 : 0.7,
      trigger: {
        type: 'system_event',  // Agent execution is a system event
        source: 'agent-executor',
        details: { requestId: event.requestId },
        requestId: event.requestId
      }
    });
  }
}