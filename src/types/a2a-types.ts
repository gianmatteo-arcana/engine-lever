/**
 * A2A Protocol Type Definitions
 * 
 * Local type definitions for A2A protocol to avoid ESM/CommonJS compatibility issues
 * Based on @a2a-js/sdk types
 */

/**
 * Message type for A2A protocol
 */
export interface Message {
  content: string[];
  role: 'user' | 'assistant' | 'system';
}

/**
 * Task type for A2A protocol
 */
export interface Task {
  id: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'canceled';
  result?: any;
  error?: string;
}

/**
 * Task status update event
 */
export interface TaskStatusUpdateEvent {
  taskId: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'canceled';
  final?: boolean;
}

/**
 * Task artifact update event
 */
export interface TaskArtifactUpdateEvent {
  taskId: string;
  artifacts: any[];
  artifact?: any;
  contextId?: string;
  kind?: string;
}

/**
 * Union type for all agent execution events
 */
export type AgentExecutionEvent = Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

/**
 * Request context for agent execution
 */
export interface RequestContext {
  readonly userMessage: Message;
  readonly task?: Task;
  readonly referenceTasks?: Task[];
  readonly taskId: string;
  readonly contextId: string;
}

/**
 * Event bus interface for publishing and subscribing to events
 */
export interface ExecutionEventBus {
  publish(event: AgentExecutionEvent): void | Promise<void>;
  on(eventName: 'event' | 'finished', listener: (event: AgentExecutionEvent) => void): this;
  off(eventName: 'event' | 'finished', listener: (event: AgentExecutionEvent) => void): this;
  once(eventName: 'event' | 'finished', listener: (event: AgentExecutionEvent) => void): this;
  removeAllListeners(eventName?: 'event' | 'finished'): this;
  finished(): void;
}

/**
 * Agent executor interface - core contract for all agents
 */
export interface AgentExecutor {
  /**
   * Executes the agent logic based on the request context and publishes events.
   * @param requestContext The context of the current request.
   * @param eventBus The bus to publish execution events to.
   */
  execute: (requestContext: RequestContext, eventBus: ExecutionEventBus) => Promise<void>;
  
  /**
   * Method to explicitly cancel a running task.
   * The implementation should handle the logic of stopping the execution
   * and publishing the final 'canceled' status event on the provided event bus.
   * @param taskId The ID of the task to cancel.
   * @param eventBus The event bus associated with the task's execution.
   */
  cancelTask: (taskId: string, eventBus: ExecutionEventBus) => Promise<void>;
}