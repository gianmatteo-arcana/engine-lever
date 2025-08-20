/**
 * Generic Event Listener Service
 * 
 * Listens for various system events from PostgreSQL NOTIFY
 * and initiates appropriate workflows
 * 
 * ARCHITECTURAL INTEGRATION:
 * - Subscribes to PostgreSQL NOTIFY channels
 * - Handles different event types (USER_REGISTERED, etc.)
 * - Leverages UnifiedEventBus for event propagation
 * - Works with OrchestratorAgent for task orchestration
 */

import { DatabaseService } from './database';
import { TaskService } from './task-service';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { logger } from '../utils/logger';
import { UnifiedEventBus } from './event-bus/UnifiedEventBus';
import { Task } from '../types/a2a-types';
import { v4 as uuidv4 } from 'uuid';

export interface SystemEvent {
  eventType: string;
  contextId: string;
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  // Task creation event fields
  taskId?: string;
  taskType?: string;
  templateId?: string;
  status?: string;
  priority?: string;
  title?: string;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Service that listens for system events
 * and initiates appropriate workflows
 */
export class EventListener {
  private dbService: DatabaseService;
  private taskService: TaskService;
  private orchestrator: OrchestratorAgent;
  private isListening: boolean = false;
  private listenerConnection: any = null;

  constructor(
    dbService?: DatabaseService,
    taskService?: TaskService,
    orchestrator?: OrchestratorAgent
  ) {
    // Allow dependency injection while maintaining backward compatibility
    this.dbService = dbService || DatabaseService.getInstance();
    this.taskService = taskService || TaskService.getInstance();
    this.orchestrator = orchestrator || OrchestratorAgent.getInstance();
  }

  /**
   * Start listening for system events
   */
  public async startListening(): Promise<void> {
    if (this.isListening) {
      logger.info('Event listener already active');
      return;
    }

    try {
      logger.info('Starting event listener...');
      
      // Set up PostgreSQL LISTEN for various channels
      await this.setupPostgreSQLListener();
      
      this.isListening = true;
      logger.info('Event listener started successfully');
    } catch (error) {
      logger.error('Failed to start event listener', error);
      throw error;
    }
  }

  /**
   * Stop listening for events
   */
  public async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    try {
      if (this.listenerConnection) {
        await this.listenerConnection.end();
        this.listenerConnection = null;
      }
      
      this.isListening = false;
      logger.info('Event listener stopped');
    } catch (error) {
      logger.error('Error stopping event listener', error);
    }
  }

  /**
   * Set up PostgreSQL LISTEN/NOTIFY subscription
   * Now using Supabase Realtime to listen to table INSERT events
   */
  private async setupPostgreSQLListener(): Promise<void> {
    try {
      // NOTE: Listening to auth.users table is not available through Realtime
      // User registration events should come through a different mechanism
      
      // Listen to new task creation (tasks table)
      await this.dbService.listenToTableInserts('tasks', 'public', async (newTask: any) => {
        try {
          logger.info('📋 New task creation detected', {
            taskId: newTask.id,
            userId: newTask.user_id,
            taskType: newTask.task_type,
            templateId: newTask.template_id
          });
          
          // Convert to SystemEvent format for task creation
          const event: SystemEvent = {
            eventType: 'TASK_CREATED',
            contextId: newTask.id, // Use task ID as context ID
            taskId: newTask.id,
            userId: newTask.user_id,
            taskType: newTask.task_type,
            templateId: newTask.template_id,
            status: newTask.status,
            priority: newTask.priority,
            title: newTask.title,
            timestamp: newTask.created_at || new Date().toISOString()
          };
          
          await this.handleTaskCreationEvent(event);
        } catch (error) {
          logger.error('Failed to process task creation event', { error, newTask });
        }
      });

      logger.info('✅ EventListener subscribed to Supabase Realtime: public.tasks INSERT');
    } catch (error) {
      logger.error('Failed to set up Realtime listeners', error);
      throw error;
    }
  }

  /**
   * Handle system events and route to appropriate handlers
   * Generic routing supports any event type
   */
  private async handleSystemEvent(event: SystemEvent): Promise<void> {
    switch (event.eventType) {
      case 'USER_REGISTERED':
        await this.handleUserRegisteredEvent(event);
        break;
      case 'TASK_COMPLETED':
        await this.handleTaskCompletedEvent(event);
        break;
      case 'BUSINESS_CREATED':
        await this.handleBusinessCreatedEvent(event);
        break;
      case 'COMPLIANCE_DEADLINE':
        await this.handleComplianceDeadlineEvent(event);
        break;
      default:
        logger.warn('Unknown event type received', { eventType: event.eventType });
        // Still attempt to handle via generic workflow
        await this.handleGenericEvent(event);
    }
  }

  /**
   * Handle TASK_CREATED events from database trigger
   * This is the key integration point for orchestration
   */
  private async handleTaskCreationEvent(event: SystemEvent): Promise<void> {
    logger.info('🎯 Task creation event received', {
      eventType: event.eventType,
      taskId: event.taskId,
      userId: event.userId,
      taskType: event.taskType,
      templateId: event.templateId
    });

    try {
      // Create a simple TaskContext object for orchestration
      // We'll use task_context_events table for storing events
      const taskContext = {
        contextId: event.taskId, // Use the task ID as context ID
        taskTemplateId: event.templateId || event.taskType || 'onboarding',
        tenantId: event.userId || 'system',
        createdAt: new Date().toISOString(),
        currentState: {
          status: event.status || 'pending',
          phase: 'initialization',
          completeness: 0,
          data: {
            taskId: event.taskId,
            userId: event.userId,
            title: event.title || 'Task',
            taskType: event.taskType,
            metadata: event.metadata || {}
          }
        },
        history: [],
        templateSnapshot: {
          id: event.templateId || event.taskType || 'onboarding',
          version: '1.0.0',
          metadata: {
            name: event.title || 'Task',
            description: 'Task execution'
          },
          goals: {
            primary: [
              { id: 'complete_task', description: 'Complete the task', required: true }
            ],
            secondary: []
          },
          phases: [
            {
              id: 'initialization',
              name: 'Initialization',
              description: 'Task setup',
              requiredCapabilities: ['orchestrator'],
              estimatedDurationMinutes: 1
            },
            {
              id: 'execution',
              name: 'Execution',
              description: 'Execute task',
              requiredCapabilities: ['execution'],
              estimatedDurationMinutes: 10
            },
            {
              id: 'completion',
              name: 'Completion',
              description: 'Complete task',
              requiredCapabilities: ['orchestrator'],
              estimatedDurationMinutes: 1
            }
          ]
        }
      };

      // Record the orchestration initiation event
      const dbService = this.dbService.getServiceClient();
      const { error: eventError } = await dbService
        .from('task_context_events')
        .insert({
          context_id: event.taskId, // Use task ID as context ID (it's already a UUID)
          task_id: event.taskId,
          operation: 'ORCHESTRATION_INITIATED',
          actor_id: 'EventListener',
          actor_type: 'system',
          data: {
            templateId: event.templateId,
            taskType: event.taskType,
            userId: event.userId
          },
          reasoning: 'Task created via Realtime event, initiating orchestration'
        });

      if (eventError) {
        logger.error('Failed to record orchestration event', {
          taskId: event.taskId,
          error: eventError
        });
      }

      logger.info('✅ Orchestration event recorded', {
        taskId: event.taskId,
        templateId: taskContext.taskTemplateId
      });

      // Start orchestration asynchronously
      this.orchestrator.orchestrateTask(taskContext as any).catch(error => {
        logger.error('Orchestration failed for task', {
          taskId: event.taskId,
          error: error.message
        });
      });

      // Emit event to UnifiedEventBus for other subscribers
      const eventBus = new UnifiedEventBus(event.taskId || '', event.taskId || '');
      const taskEvent: Task = {
        id: event.taskId || '',
        status: 'running' as const,
        result: {
          type: 'task_orchestration_initiated',
          originalTaskId: event.taskId,
          userId: event.userId,
          taskType: event.taskType,
          templateId: event.templateId
        }
      };
      
      await eventBus.publish(taskEvent);

      logger.info('🚀 Task orchestration initiated successfully', {
        taskId: event.taskId
      });

    } catch (error) {
      logger.error('Failed to handle task creation event', {
        eventType: event.eventType,
        taskId: event.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle USER_REGISTERED event specifically
   */
  private async handleUserRegisteredEvent(event: SystemEvent): Promise<void> {
    logger.info('Received new user event', {
      contextId: event.contextId,
      userId: event.userId,
      email: event.email
    });

    try {
      const taskId = uuidv4(); // Generate proper UUID
      
      // First create a task in the tasks table
      const dbService = this.dbService.getServiceClient();
      const { error: taskError } = await dbService
        .from('tasks')
        .insert({
          id: taskId,
          user_id: event.userId,
          task_type: 'onboarding',
          template_id: 'onboarding',
          title: `Onboarding for ${event.email}`,
          description: 'User onboarding workflow',
          status: 'pending',
          priority: 'high',
          metadata: {
            email: event.email,
            source: 'oauth_registration'
          }
        });

      if (taskError) {
        logger.error('Failed to create onboarding task', {
          userId: event.userId,
          error: taskError
        });
        return;
      }

      // Create a simple TaskContext for orchestration
      const taskContext = {
        contextId: taskId,
        taskTemplateId: 'onboarding',
        tenantId: event.userId || 'system',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: {
            userId: event.userId || '',
            email: event.email || '',
            firstName: event.firstName || '',
            lastName: event.lastName || ''
          }
        },
        history: [],
        templateSnapshot: {
          id: 'onboarding',
          version: '1.0.0',
          metadata: {
            name: 'Business Onboarding',
            description: 'Complete business profile setup'
          },
          goals: {
            primary: [
              { id: 'verify_identity', description: 'Verify user identity', required: true },
              { id: 'collect_business_info', description: 'Collect business information', required: true }
            ],
            secondary: []
          },
          phases: [
            {
              id: 'initialization',
              name: 'Initialization',
              description: 'Task setup and planning',
              requiredCapabilities: ['orchestrator'],
              estimatedDurationMinutes: 1
            },
            {
              id: 'data_collection',
              name: 'Data Collection',
              description: 'Gather necessary information',
              requiredCapabilities: ['data_collection'],
              estimatedDurationMinutes: 5
            },
            {
              id: 'verification',
              name: 'Verification',
              description: 'Verify collected data',
              requiredCapabilities: ['verification'],
              estimatedDurationMinutes: 2
            },
            {
              id: 'completion',
              name: 'Completion',
              description: 'Finalize onboarding',
              requiredCapabilities: ['orchestrator'],
              estimatedDurationMinutes: 1
            }
          ]
        }
      };

      // Record the onboarding initiation event
      const { error: eventError } = await dbService
        .from('task_context_events')
        .insert({
          context_id: taskId, // Use task ID as context ID
          task_id: taskId,
          operation: 'ONBOARDING_INITIATED',
          actor_id: 'EventListener',
          actor_type: 'system',
          data: {
            userId: event.userId,
            email: event.email
          },
          reasoning: 'New user registered, initiating onboarding workflow'
        });

      if (eventError) {
        logger.error('Failed to record onboarding event', {
          taskId,
          error: eventError
        });
      }

      logger.info('Created onboarding task for new user', {
        userId: event.userId,
        taskId,
        templateId: 'onboarding'
      });

      // Start orchestration asynchronously
      this.orchestrator.orchestrateTask(taskContext as any).catch(error => {
        logger.error('Orchestration failed for new user onboarding', {
          taskId,
          userId: event.userId,
          error: error.message
        });
      });

      // Emit task event to UnifiedEventBus for other subscribers
      const eventBus = new UnifiedEventBus(taskId, taskId);
      const taskEvent: Task = {
        id: taskId,
        status: 'created',
        result: {
          type: 'onboarding_initiated',
          userId: event.userId,
          email: event.email,
          templateId: 'onboarding'
        }
      };
      
      await eventBus.publish(taskEvent);

    } catch (error) {
      logger.error('Failed to create onboarding task for new user', {
        userId: event.userId,
        email: event.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // TODO: Consider retry logic or dead letter queue for failed onboarding
    }
  }

  /**
   * Handle TASK_COMPLETED events
   */
  private async handleTaskCompletedEvent(event: SystemEvent): Promise<void> {
    logger.info('Task completed event received', {
      taskId: event.contextId,
      userId: event.userId
    });
    
    // Could trigger follow-up workflows, notifications, etc.
    // Implementation depends on specific business requirements
  }

  /**
   * Handle BUSINESS_CREATED events
   */
  private async handleBusinessCreatedEvent(event: SystemEvent): Promise<void> {
    logger.info('Business created event received', {
      businessId: event.contextId,
      userId: event.userId
    });
    
    // Could trigger compliance setup, initial filings, etc.
  }

  /**
   * Handle COMPLIANCE_DEADLINE events
   */
  private async handleComplianceDeadlineEvent(event: SystemEvent): Promise<void> {
    logger.info('Compliance deadline event received', {
      deadlineId: event.contextId,
      userId: event.userId
    });
    
    // Could trigger reminder workflows, deadline notifications, etc.
  }

  /**
   * Generic event handler for unknown event types
   * This ensures the system is extensible
   */
  private async handleGenericEvent(event: SystemEvent): Promise<void> {
    logger.info('Processing generic event', {
      eventType: event.eventType,
      contextId: event.contextId,
      userId: event.userId
    });
    
    // Generic workflow: Create a task based on event type
    // This allows the system to handle new event types without code changes
    try {
      const context = await this.taskService.create({
        templateId: event.eventType.toLowerCase(), // e.g., "user_registered" -> "user_registered"
        tenantId: event.userId || 'system',
        userToken: '', // Service role will be used
        initialData: {
          ...event,
          source: 'system_event',
          createdBy: 'event_listener',
          priority: 'medium'
        }
      });

      logger.info('Created generic task from event', {
        eventType: event.eventType,
        taskId: context.contextId
      });
    } catch (error) {
      logger.error('Failed to create generic task from event', {
        eventType: event.eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Manually trigger onboarding for a user (useful for testing)
   */
  public async triggerOnboardingForUser(userId: string, email: string, firstName?: string, lastName?: string): Promise<void> {
    const event: SystemEvent = {
      eventType: 'USER_REGISTERED',
      contextId: `manual-${Date.now()}`,
      userId,
      email,
      firstName,
      lastName
    };

    await this.handleSystemEvent(event);
  }
}

// Factory function for dependency injection
export function createEventListener(
  dbService?: DatabaseService,
  taskService?: TaskService,
  orchestrator?: OrchestratorAgent
): EventListener {
  return new EventListener(dbService, taskService, orchestrator);
}

// Backward compatibility: getInstance equivalent
let defaultInstance: EventListener | null = null;
export const getEventListener = () => {
  if (!defaultInstance) {
    defaultInstance = new EventListener();
  }
  return defaultInstance;
};