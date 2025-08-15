/**
 * BaseAgent - Unified base class for all agents implementing A2A Server protocol
 * Part of the Three-Layer Protocol Architecture (A2A communication, Intelligence layer, MCP toolchain)
 */

import { AgentTaskContext as TaskContext, ensureAgentContext } from '../../types/unified-agent-types';
import { ToolChain } from '../../toolchain/ToolChain';
import { LegacyToolChain } from '../../toolchain/LegacyToolChain';
import { MCPToolChain } from '../../toolchain/MCPToolChain';
import { logger } from '../../utils/logger';

// A2A Server interface that all agents must implement
export interface A2AServer {
  receiveMessage(message: A2AMessage): Promise<A2AResponse>;
  sendMessage(target: string, message: A2AMessage): Promise<A2AResponse>;
  getCapabilities(): Promise<string[]>;
  getStatus(): Promise<AgentStatus>;
}

// A2A Protocol message format
export interface A2AMessage {
  id: string;
  type: string;
  sender: string;
  receiver: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

export interface A2AResponse {
  success: boolean;
  messageId: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface AgentStatus {
  id: string;
  status: 'idle' | 'working' | 'error' | 'offline';
  activeTasks: number;
  lastActivity: string;
  capabilities: string[];
}

// Agent configuration loaded from YAML
export interface AgentConfig {
  name: string;
  role: string;
  version: string;
  description: string;
  capabilities: string[];
  toolRequirements: string[];
  a2a: {
    protocolVersion: string;
    communicationMode: 'sync' | 'async';
    messageFormats: string[];
    routing: {
      canReceiveFrom: string[];
      canSendTo: string[];
    };
    messageHandling: {
      bufferSize: number;
      timeoutMs: number;
      retryEnabled: boolean;
    };
  };
  execution: {
    maxConcurrentTasks: number;
    timeoutMs: number;
    retryStrategy: {
      maxRetries: number;
      backoffMs: number;
      exponentialBackoff: boolean;
    };
    performance: {
      cachingEnabled: boolean;
      cacheExpiryMs: number;
      batchProcessing: boolean;
      maxBatchSize?: number;
    };
  };
  context: {
    persistence: boolean;
    shareLevel: 'private' | 'task' | 'global';
    contextKeys: string[];
    transformations: Array<{
      input: string;
      output: string;
      validation: string;
    }>;
  };
  ui?: {
    enableAugmentation: boolean;
    augmentationTypes: string[];
    progressReporting: boolean;
  };
  workflows?: Record<string, any>;
  prompts?: Record<string, any>;
}

/**
 * BaseAgent - The unified agent implementation
 * All agents should extend this class and implement executeTaskLogic
 */
export abstract class BaseAgent implements A2AServer {
  protected config: AgentConfig;
  protected toolChain: ToolChain;
  protected agentId: string;
  protected isInitialized = false;
  protected activeTasks = new Map<string, TaskContext>();
  
  constructor(configPath: string, toolChainType: 'legacy' | 'mcp' = 'legacy', mcpOptions?: { serverUrl: string; apiKey?: string }) {
    this.agentId = this.generateUUID();
    this.config = this.loadConfiguration(configPath);
    this.toolChain = this.initializeToolChain(toolChainType, mcpOptions);
  }

  private generateUUID(): string {
    return 'agent-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Load agent configuration from YAML file
   */
  private loadConfiguration(configPath: string): AgentConfig {
    try {
      // For testing, return a mock configuration
      const config: AgentConfig = {
        name: 'TestAgent',
        role: 'test',
        version: '1.0.0',
        description: 'Test agent configuration',
        capabilities: ['test'],
        toolRequirements: ['test'],
        a2a: {
          protocolVersion: '1.0.0',
          communicationMode: 'async',
          messageFormats: ['json'],
          routing: {
            canReceiveFrom: ['*'],
            canSendTo: ['*']
          },
          messageHandling: {
            bufferSize: 100,
            timeoutMs: 30000,
            retryEnabled: true
          }
        },
        execution: {
          maxConcurrentTasks: 5,
          timeoutMs: 60000,
          retryStrategy: {
            maxRetries: 3,
            backoffMs: 1000,
            exponentialBackoff: true
          },
          performance: {
            cachingEnabled: true,
            cacheExpiryMs: 300000,
            batchProcessing: false
          }
        },
        context: {
          persistence: false,
          shareLevel: 'task',
          contextKeys: ['test'],
          transformations: []
        }
      };
      
      return config;
    } catch (error) {
      logger.error('BaseAgent: Failed to load configuration', {
        configPath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to load agent configuration: ${configPath}`);
    }
  }

  /**
   * Initialize the appropriate tool chain
   */
  private initializeToolChain(type: 'legacy' | 'mcp', mcpOptions?: { serverUrl: string; apiKey?: string }): ToolChain {
    switch (type) {
      case 'legacy':
        return new LegacyToolChain();
      case 'mcp':
        if (!mcpOptions) {
          throw new Error('MCP options required for MCP tool chain');
        }
        return new MCPToolChain(mcpOptions);
      default:
        throw new Error(`Unknown tool chain type: ${type}`);
    }
  }

  /**
   * A2A Server implementation - receive message from another agent
   */
  async receiveMessage(message: A2AMessage): Promise<A2AResponse> {
    try {
      logger.info('BaseAgent: Received A2A message', {
        agentId: this.agentId,
        messageType: message.type,
        sender: message.sender
      });

      // Validate message format
      if (!message.id || !message.type || !message.sender) {
        return {
          success: false,
          messageId: message.id || 'unknown',
          error: 'Invalid message format'
        };
      }

      // Check if we can receive from this sender
      if (!this.config.a2a.routing.canReceiveFrom.includes(message.sender)) {
        return {
          success: false,
          messageId: message.id,
          error: `Not authorized to receive messages from ${message.sender}`
        };
      }

      // Process the message based on type
      const response = await this.processA2AMessage(message);
      
      return {
        success: true,
        messageId: message.id,
        data: response
      };
    } catch (error) {
      logger.error('BaseAgent: Failed to process A2A message', {
        agentId: this.agentId,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * A2A Server implementation - send message to another agent
   */
  async sendMessage(target: string, message: A2AMessage): Promise<A2AResponse> {
    try {
      // Check if we can send to this target
      if (!this.config.a2a.routing.canSendTo.includes(target)) {
        throw new Error(`Not authorized to send messages to ${target}`);
      }

      // Add sender information
      message.sender = this.agentId;
      message.receiver = target;
      message.timestamp = new Date().toISOString();

      logger.info('BaseAgent: Sending A2A message', {
        agentId: this.agentId,
        target,
        messageType: message.type
      });

      // In a real implementation, this would route to the target agent
      // For now, we'll simulate a successful send
      return {
        success: true,
        messageId: message.id,
        data: { sent: true, target }
      };
    } catch (error) {
      logger.error('BaseAgent: Failed to send A2A message', {
        agentId: this.agentId,
        target,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get agent capabilities
   */
  async getCapabilities(): Promise<string[]> {
    return this.config.capabilities;
  }

  /**
   * Get agent status
   */
  async getStatus(): Promise<AgentStatus> {
    return {
      id: this.agentId,
      status: this.activeTasks.size > 0 ? 'working' : 'idle',
      activeTasks: this.activeTasks.size,
      lastActivity: new Date().toISOString(),
      capabilities: this.config.capabilities
    };
  }

  /**
   * Execute a task (main entry point for task execution)
   */
  async executeTask(taskId: string, context: TaskContext, parameters: Record<string, unknown>): Promise<TaskContext> {
    // Ensure context has all required fields
    const safeContext = ensureAgentContext(context);
    
    try {
      // Track active task
      this.activeTasks.set(taskId, safeContext);
      
      logger.info('BaseAgent: Starting task execution', {
        agentId: this.agentId,
        taskId,
        parameters: Object.keys(parameters)
      });
      
      // Initialize agent context if not exists
      if (!safeContext.agentContexts[this.agentId]) {
        safeContext.agentContexts[this.agentId] = {
          state: {},
          requirements: [],
          findings: [],
          nextActions: []
        };
      }

      // Execute the task logic (implemented by subclasses)
      const result = await this.executeTaskLogic(taskId, safeContext, parameters);
      
      logger.info('BaseAgent: Task execution completed', {
        agentId: this.agentId,
        taskId
      });

      return result;
    } catch (error) {
      logger.error('BaseAgent: Task execution failed', {
        agentId: this.agentId,
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Update context with error
      safeContext.agentContexts[this.agentId] = {
        ...safeContext.agentContexts[this.agentId],
        state: {
          ...safeContext.agentContexts[this.agentId]?.state,
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date().toISOString()
        }
      };
      
      return safeContext;
    } finally {
      // Remove from active tasks
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Process A2A messages (can be overridden by subclasses)
   */
  protected async processA2AMessage(message: A2AMessage): Promise<Record<string, unknown>> {
    switch (message.type) {
      case 'task_assignment':
        // Handle task assignment from orchestrator
        return await this.handleTaskAssignment(message.payload);
      case 'status_request':
        // Handle status request
        const status = await this.getStatus();
        return status as unknown as Record<string, unknown>;
      case 'capability_request':
        // Handle capability request
        return { capabilities: await this.getCapabilities() };
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle task assignment from A2A message
   */
  protected async handleTaskAssignment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const taskId = payload.taskId as string;
    const context = payload.context as TaskContext;
    const parameters = payload.parameters as Record<string, unknown>;

    if (!taskId || !context || !parameters) {
      throw new Error('Invalid task assignment payload');
    }

    const result = await this.executeTask(taskId, context, parameters);
    return { taskId, completed: true, context: result };
  }

  /**
   * Send A2A message (convenience method)
   */
  protected async sendA2AMessage(target: string, messageData: { type: string; payload: Record<string, unknown> }): Promise<A2AResponse> {
    const message: A2AMessage = {
      id: crypto.randomUUID(),
      type: messageData.type,
      sender: this.agentId,
      receiver: target,
      payload: messageData.payload,
      timestamp: new Date().toISOString()
    };

    return await this.sendMessage(target, message);
  }

  /**
   * Get agent configuration (for inspection)
   */
  async getConfiguration(): Promise<AgentConfig> {
    return this.config;
  }

  /**
   * Abstract method that must be implemented by subclasses
   * This is where the agent's specific logic goes
   */
  protected abstract executeTaskLogic(
    taskId: string, 
    context: TaskContext, 
    parameters: Record<string, unknown>
  ): Promise<TaskContext>;
}