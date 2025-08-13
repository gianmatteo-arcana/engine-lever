/**
 * Compatibility Layer for Type Migrations
 * 
 * This file provides type compatibility during the universal engine migration.
 * It includes adapters and extended interfaces to bridge old and new type systems.
 */

import { AgentCapabilities } from '../agents/base/types';
import { TaskTemplate } from './engine-types';

// Extended AgentCapabilities to support orchestrator
export interface ExtendedAgentCapabilities extends AgentCapabilities {
  canPlan?: boolean;
  canDelegate?: boolean;
  canLearn?: boolean;
}

// FluidUIAction interface for agent UI requests - represents the actions object
export interface FluidUIActions {
  [key: string]: {
    type: 'submit' | 'cancel' | 'custom' | 'navigate';
    label: string;
    primary?: boolean;
    handler: () => any;
  };
}

// Extended UIRequest format for agents
export interface ExtendedUIRequest {
  requestId?: string;
  id?: string;
  templateType?: string;
  semanticData?: any;
  agentRole?: string;
  suggestedTemplates?: string[];
  dataNeeded?: string[];
  context?: any;
  businessData?: any;
  confidence?: any;
  actions?: FluidUIActions;
}

// Extended TaskTemplate for phases support
export interface ExtendedTaskTemplate extends TaskTemplate {
  phases?: Array<{
    id: string; // Required by TaskTemplate
    name: string;
    description: string; // Required by TaskTemplate
    agents: string[];
    maxDuration: number; // Required by TaskTemplate
    canSkip: boolean; // Required by TaskTemplate
    parallel?: boolean;
    dependencies?: string[];
  }>;
  steps?: Array<{
    id?: string;
    name: string;
    agent?: string;
    agents?: string[];
    config?: any;
    dependencies?: string[];
    parallel?: boolean;
  }>;
}

// Legacy UIRequest format (for agents returning old structure)
export interface LegacyUIRequest {
  id?: string;
  agentRole?: string;
  suggestedTemplates?: string[];
  dataNeeded?: string[];
  context?: any;
  [key: string]: any; // Allow any additional properties
}

// Extended validation rules
export interface ExtendedValidationRule {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  errorMessage?: string;
}

// Form field extensions
export interface ExtendedFormField {
  id: string;
  name?: string;
  label: string;
  type: 'text' | 'email' | 'select' | 'date' | 'address' | 'ein';
  required?: boolean;
  value?: any;
  options?: Array<{ value: string; label: string }>;
  validation?: ExtendedValidationRule;
  config?: any;
  requirementLevel?: any;
}

// Extended UIAugmentationRequest
export interface ExtendedUIAugmentationRequest {
  requestId?: string;
  type: string;
  template?: string;
  data?: any;
  presentation?: any;
  actionPills?: any;
  formSections?: any;
  context?: any;
  responseConfig?: any;
  tenantContext?: any;
  agentRole?: string;
  timestamp?: string;
  metadata?: any;
  requirementLevel?: any;
}

// Extended AgentRequest for backward compatibility
export interface ExtendedAgentRequest {
  requestId?: string;
  contextId?: string; // Legacy
  agentId?: string; // Legacy
  agentRole?: string;
  operation?: string; // Legacy
  instruction?: string;
  input?: any; // Legacy
  data?: Record<string, any>;
  context?: {
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    userProgress?: number;
  };
  taskContext?: any;
}

// Extended AgentResponse for backward compatibility
export interface ExtendedAgentResponse {
  requestId?: string; // Legacy
  agentId?: string; // Legacy
  status: 'completed' | 'needs_input' | 'delegated' | 'error';
  data?: Record<string, any>;
  output?: Record<string, any>; // Legacy
  uiRequests?: any[];
  uiRequest?: any; // Legacy
  reasoning?: string;
  nextAgent?: string;
  confidence?: number;
  contextUpdate?: any;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Type adapters for converting between old and new formats
 */
export class TypeAdapters {
  /**
   * Convert legacy UIRequest to new format
   */
  static adaptLegacyUIRequest(legacy: LegacyUIRequest): any {
    return {
      requestId: legacy.id || `req_${Date.now()}`,
      templateType: 'SmartTextInput', // Default template
      semanticData: {
        ...legacy,
        agentRole: legacy.agentRole,
        suggestedTemplates: legacy.suggestedTemplates,
        dataNeeded: legacy.dataNeeded
      },
      context: legacy.context || {}
    };
  }

  /**
   * Convert legacy AgentRequest to new format
   */
  static adaptAgentRequest(legacy: ExtendedAgentRequest): any {
    return {
      requestId: legacy.requestId || legacy.contextId,
      agentRole: legacy.agentRole || 'unknown',
      instruction: legacy.instruction || legacy.operation || 'execute',
      data: legacy.data || legacy.input || {},
      context: legacy.context || { urgency: 'medium' },
      taskContext: legacy.taskContext
    };
  }

  /**
   * Convert legacy AgentResponse to new format
   */
  static adaptAgentResponse(legacy: ExtendedAgentResponse): any {
    return {
      status: legacy.status, // Use status as-is since they're already correct
      data: legacy.data || legacy.output || {},
      uiRequests: legacy.uiRequests || (legacy.uiRequest ? [legacy.uiRequest] : []),
      reasoning: legacy.reasoning,
      nextAgent: legacy.nextAgent,
      confidence: legacy.confidence,
      contextUpdate: legacy.contextUpdate,
      error: legacy.error
    };
  }
}