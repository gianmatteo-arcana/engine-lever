import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  AgentRole,
  AgentStatus,
  AgentMessage,
  TaskContext,
  AgentCapabilities,
  AgentPersona,
  AgentDecision,
  AgentMemory,
  TaskPriority
} from './types';

export abstract class BaseAgent extends EventEmitter {
  protected status: AgentStatus = AgentStatus.IDLE;
  protected currentTasks: Map<string, TaskContext> = new Map();
  protected memory: AgentMemory = {
    shortTerm: new Map(),
    workingMemory: new Map(),
    taskHistory: [],
    learnings: new Map()
  };

  constructor(
    protected readonly persona: AgentPersona,
    protected readonly capabilities: AgentCapabilities
  ) {
    super();
    this.initialize();
  }

  protected initialize(): void {
    logger.info(`Initializing ${this.persona.name} agent`, {
      role: this.persona.role,
      capabilities: this.capabilities
    });

    this.on('message', this.handleMessage.bind(this));
    this.on('task', this.handleTask.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  public getRole(): AgentRole {
    return this.persona.role;
  }

  public getStatus(): AgentStatus {
    return this.status;
  }

  public getCapabilities(): AgentCapabilities {
    return this.capabilities;
  }

  public getPersona(): AgentPersona {
    return this.persona;
  }

  protected setStatus(status: AgentStatus): void {
    const previousStatus = this.status;
    this.status = status;
    logger.debug(`${this.persona.name} status changed`, {
      from: previousStatus,
      to: status
    });
    this.emit('statusChanged', { from: previousStatus, to: status });
  }

  public async processMessage(message: AgentMessage): Promise<void> {
    try {
      this.logAuditTrail('message_received', message);
      
      if (message.to !== this.persona.role) {
        logger.warn(`Message not intended for ${this.persona.name}`, {
          intended: message.to,
          actual: this.persona.role
        });
        return;
      }

      await this.handleMessage(message);
    } catch (error) {
      logger.error(`Error processing message in ${this.persona.name}`, error);
      this.emit('error', error);
    }
  }

  protected abstract handleMessage(message: AgentMessage): Promise<void>;

  protected abstract handleTask(context: TaskContext): Promise<void>;

  protected abstract makeDecision(context: TaskContext): Promise<AgentDecision>;

  protected abstract executeAction(decision: AgentDecision, context: TaskContext): Promise<any>;

  public async startTask(context: TaskContext): Promise<void> {
    if (this.currentTasks.size >= this.capabilities.maxConcurrentTasks) {
      throw new Error(`${this.persona.name} at maximum concurrent task capacity`);
    }

    this.currentTasks.set(context.taskId, context);
    this.setStatus(AgentStatus.WORKING);
    this.logAuditTrail('task_started', context);

    try {
      await this.handleTask(context);
    } catch (error) {
      logger.error(`Task failed in ${this.persona.name}`, {
        taskId: context.taskId,
        error
      });
      this.setStatus(AgentStatus.ERROR);
      throw error;
    }
  }

  public async completeTask(taskId: string, result: any): Promise<void> {
    const context = this.currentTasks.get(taskId);
    if (!context) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.logAuditTrail('task_completed', { taskId, result });
    this.memory.taskHistory.push(context);
    this.currentTasks.delete(taskId);

    if (this.currentTasks.size === 0) {
      this.setStatus(AgentStatus.IDLE);
    }

    this.emit('taskCompleted', { taskId, result });
  }

  protected sendMessage(to: AgentRole, payload: any, type: 'request' | 'response' | 'notification' = 'request'): void {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.persona.role,
      to,
      type,
      timestamp: new Date(),
      payload,
      priority: TaskPriority.MEDIUM
    };

    this.emit('sendMessage', message);
    logger.debug(`${this.persona.name} sending message`, {
      to,
      type,
      messageId: message.id
    });
  }

  protected async delegateTask(to: AgentRole, context: TaskContext): Promise<void> {
    if (!this.capabilities.canDelegateTasks) {
      throw new Error(`${this.persona.name} cannot delegate tasks`);
    }

    this.sendMessage(to, {
      action: 'delegate_task',
      context
    }, 'request');

    this.logAuditTrail('task_delegated', {
      to,
      taskId: context.taskId
    });
  }

  protected handleError(error: Error): void {
    logger.error(`Error in ${this.persona.name}`, error);
    this.setStatus(AgentStatus.ERROR);
    
    // TODO: Product Designer - Define error recovery strategies
    // For now, just log and emit error event
    this.emit('agentError', {
      agent: this.persona.role,
      error: error.message,
      timestamp: new Date()
    });
  }

  protected logAuditTrail(action: string, details?: any): void {
    const entry = {
      timestamp: new Date(),
      agent: this.persona.role,
      action,
      details
    };

    // Add to current task context if applicable
    this.currentTasks.forEach(context => {
      context.auditTrail.push(entry);
    });

    logger.info(`Audit trail: ${this.persona.name}`, entry);
  }

  protected generateMessageId(): string {
    return `${this.persona.role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected updateMemory(key: string, value: any, memoryType: 'shortTerm' | 'workingMemory' | 'learnings' = 'workingMemory'): void {
    this.memory[memoryType].set(key, value);
    logger.debug(`${this.persona.name} memory updated`, {
      memoryType,
      key
    });
  }

  protected getMemory(key: string, memoryType: 'shortTerm' | 'workingMemory' | 'learnings' = 'workingMemory'): any {
    return this.memory[memoryType].get(key);
  }

  public async shutdown(): Promise<void> {
    logger.info(`Shutting down ${this.persona.name}`);
    
    // Complete or suspend current tasks
    for (const [taskId, context] of this.currentTasks) {
      this.logAuditTrail('task_suspended', { taskId });
      // TODO: Product Designer - Define task suspension strategy
    }

    this.currentTasks.clear();
    this.setStatus(AgentStatus.IDLE);
    this.removeAllListeners();
  }

  public getMetrics(): any {
    return {
      role: this.persona.role,
      status: this.status,
      activeTasks: this.currentTasks.size,
      completedTasks: this.memory.taskHistory.length,
      memoryUsage: {
        shortTerm: this.memory.shortTerm.size,
        workingMemory: this.memory.workingMemory.size,
        learnings: this.memory.learnings.size
      }
    };
  }
}