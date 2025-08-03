import { z } from 'zod';

export enum AgentRole {
  ORCHESTRATOR = 'orchestrator',
  LEGAL_COMPLIANCE = 'legal_compliance',
  DATA_COLLECTION = 'data_collection',
  PAYMENT = 'payment',
  AGENCY_INTERACTION = 'agency_interaction',
  MONITORING = 'monitoring',
  COMMUNICATION = 'communication'
}

export enum AgentStatus {
  IDLE = 'idle',
  WORKING = 'working',
  WAITING = 'waiting',
  ERROR = 'error',
  COMPLETED = 'completed'
}

export enum TaskPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export const AgentMessageSchema = z.object({
  id: z.string(),
  from: z.nativeEnum(AgentRole),
  to: z.nativeEnum(AgentRole),
  type: z.enum(['request', 'response', 'notification', 'error']),
  timestamp: z.date(),
  payload: z.any(),
  correlationId: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM)
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const TaskContextSchema = z.object({
  taskId: z.string(),
  userId: z.string(),
  businessId: z.string(),
  templateId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority),
  deadline: z.date().optional(),
  metadata: z.record(z.any()).default({}),
  auditTrail: z.array(z.object({
    timestamp: z.date(),
    agent: z.nativeEnum(AgentRole),
    action: z.string(),
    details: z.any().optional()
  })).default([])
});

export type TaskContext = z.infer<typeof TaskContextSchema>;

export interface AgentCapabilities {
  canInitiateTasks: boolean;
  canDelegateTasks: boolean;
  requiredTools: string[];
  maxConcurrentTasks: number;
  supportedMessageTypes: string[];
}

export interface AgentPersona {
  role: AgentRole;
  name: string;
  description: string;
  expertise: string[];
  responsibilities: string[];
  limitations: string[];
}

export interface AgentDecision {
  action: string;
  reasoning: string;
  confidence: number;
  alternativeActions?: string[];
  requiredResources?: string[];
  estimatedDuration?: number;
}

export interface AgentMemory {
  shortTerm: Map<string, any>;
  workingMemory: Map<string, any>;
  taskHistory: TaskContext[];
  learnings: Map<string, any>;
}

// Helper function for priority conversion
export function convertPriority(priority: string): TaskPriority {
  const mapping: Record<string, TaskPriority> = {
    'critical': TaskPriority.CRITICAL,
    'high': TaskPriority.HIGH,
    'medium': TaskPriority.MEDIUM,
    'low': TaskPriority.LOW
  };
  return mapping[priority] || TaskPriority.MEDIUM;
}