/**
 * Unified Agent Types
 * Extended types for the unified BaseAgent architecture
 * These extend the backend's engine-types to support agent-specific functionality
 */

import { TaskContext as EngineTaskContext } from './engine-types';

// Add missing properties from engine types
interface ExtendedEngineTaskContext extends EngineTaskContext {
  updatedAt?: string;
  version?: number;
  isComplete?: boolean;
}

/**
 * Agent-specific context stored in TaskContext metadata
 */
export interface AgentContext {
  state: Record<string, any>;
  requirements: string[];
  findings: Array<{
    type: string;
    data: any;
    timestamp: string;
  }>;
  nextActions: string[];
}

/**
 * UI Request for agent-generated UI elements
 */
export interface UIRequest {
  id: string;
  agentId: string;
  requestType: string;
  semanticData: Record<string, any>;
  status: 'pending' | 'completed' | 'cancelled';
  timestamp: string;
}

/**
 * Extended TaskContext for agent operations
 * Wraps the engine TaskContext with agent-specific extensions
 */
export interface AgentTaskContext extends ExtendedEngineTaskContext {
  // Agent-specific fields stored in metadata
  agentContexts?: Record<string, AgentContext>;
  activeUIRequests?: Record<string, UIRequest>;
  pendingInputRequests?: UIRequest[];
  
  // Compatibility fields for testing
  taskId?: string;
  taskType?: string;
  userId?: string;
  userToken?: string;
  status?: 'active' | 'completed' | 'failed';
  currentPhase?: string;
  completedPhases?: string[];
  sharedContext?: {
    user?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  auditTrail?: Array<{
    timestamp: string;
    action: string;
    agentId: string;
    details?: any;
  }>;
}

/**
 * Helper to convert engine TaskContext to AgentTaskContext
 */
export function toAgentTaskContext(engineContext: EngineTaskContext): AgentTaskContext {
  const agentContext: AgentTaskContext = {
    ...engineContext,
    agentContexts: engineContext.metadata?.agentContexts || {},
    activeUIRequests: engineContext.metadata?.activeUIRequests || {},
    pendingInputRequests: engineContext.metadata?.pendingInputRequests || [],
    
    // Map engine fields to compatibility fields
    taskId: engineContext.contextId,
    taskType: engineContext.taskTemplateId,
    status: engineContext.currentState.status === 'completed' ? 'completed' : 
            engineContext.currentState.status === 'failed' ? 'failed' : 'active',
    currentPhase: engineContext.currentState.phase,
    completedPhases: engineContext.metadata?.completedPhases || [],
    sharedContext: {
      user: engineContext.metadata?.user || {},
      metadata: engineContext.metadata || {}
    },
    auditTrail: engineContext.metadata?.auditTrail || []
  };
  
  return agentContext;
}

/**
 * Helper to convert AgentTaskContext back to engine TaskContext
 */
export function toEngineTaskContext(agentContext: AgentTaskContext): EngineTaskContext {
  const engineContext: EngineTaskContext = {
    contextId: agentContext.contextId || agentContext.taskId || '',
    taskTemplateId: agentContext.taskTemplateId || agentContext.taskType || '',
    tenantId: agentContext.tenantId || '',
    createdAt: agentContext.createdAt || new Date().toISOString(),
    currentState: agentContext.currentState || {
      status: agentContext.status === 'active' ? 'processing' : 
              agentContext.status === 'completed' ? 'completed' : 'failed',
      phase: agentContext.currentPhase || 'unknown',
      completeness: 0,
      data: {}
    },
    history: agentContext.history || [],
    // templateSnapshot omitted - agents use task data only
    metadata: {
      ...agentContext.metadata,
      agentContexts: agentContext.agentContexts,
      activeUIRequests: agentContext.activeUIRequests,
      pendingInputRequests: agentContext.pendingInputRequests,
      completedPhases: agentContext.completedPhases,
      user: agentContext.sharedContext?.user,
      auditTrail: agentContext.auditTrail
    }
  };
  
  return engineContext;
}

export type { TaskContext } from './engine-types';

// Re-export engine types for backward compatibility
export type { TaskContext as EngineTaskContext } from './engine-types';

// Helper function to ensure required context fields (excluding optional templateSnapshot)
export function ensureAgentContext(context: AgentTaskContext): AgentTaskContext {
  return {
    ...context,
    agentContexts: context.agentContexts || {},
    activeUIRequests: context.activeUIRequests || {},
    pendingInputRequests: context.pendingInputRequests || [],
    sharedContext: context.sharedContext || { metadata: {} },
    taskId: context.taskId || '',
    userId: context.userId || '',
    userToken: context.userToken || '',
    taskType: context.taskType || '',
    status: context.status || 'active',
    currentPhase: context.currentPhase || 'initial',
    completedPhases: context.completedPhases || [],
    auditTrail: context.auditTrail || [],
    contextId: context.contextId || `context_${Date.now()}`,
    taskTemplateId: context.taskTemplateId || '',
    tenantId: context.tenantId || 'default',
    createdAt: context.createdAt || new Date().toISOString(),
    updatedAt: context.updatedAt || new Date().toISOString(),
    version: context.version || 1,
    isComplete: context.isComplete || false,
    currentState: context.currentState || {
      status: 'processing',
      phase: 'initial',
      completeness: 0,
      data: {}
    },
    history: context.history || [],
    // templateSnapshot omitted - agents use task data only
    metadata: context.metadata || {}
  };
}

// Helper to create a minimal valid context
export function createMinimalContext(overrides: Partial<AgentTaskContext> = {}): AgentTaskContext {
  return {
    taskId: overrides.taskId || 'temp',
    taskType: overrides.taskType || 'default',
    userId: overrides.userId || '',
    userToken: overrides.userToken || '',
    status: overrides.status || 'active',
    currentPhase: overrides.currentPhase || 'initial',
    completedPhases: overrides.completedPhases || [],
    sharedContext: overrides.sharedContext || { metadata: {} },
    agentContexts: overrides.agentContexts || {},
    activeUIRequests: overrides.activeUIRequests || {},
    pendingInputRequests: overrides.pendingInputRequests || [],
    auditTrail: overrides.auditTrail || [],
    contextId: overrides.contextId || `context_${Date.now()}`,
    taskTemplateId: overrides.taskTemplateId || '',
    tenantId: overrides.tenantId || 'default',
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    version: overrides.version || 1,
    isComplete: overrides.isComplete || false,
    currentState: overrides.currentState || {
      status: 'processing',
      phase: 'initial',
      completeness: 0,
      data: {}
    },
    history: overrides.history || [],
    // templateSnapshot omitted - agents use task data only
    metadata: overrides.metadata || {}
  };
}