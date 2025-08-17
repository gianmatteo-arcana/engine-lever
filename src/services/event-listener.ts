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

export interface SystemEvent {
  eventType: string;
  contextId: string;
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
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
   */
  private async setupPostgreSQLListener(): Promise<void> {
    try {
      // Use database service to listen to the channel
      await this.dbService.listenToChannel('new_user_events', async (payload: string) => {
        try {
          const event: SystemEvent = JSON.parse(payload);
          await this.handleSystemEvent(event);
        } catch (error) {
          logger.error('Failed to process new user event', { error, payload });
        }
      });
    } catch (error) {
      logger.error('Failed to set up PostgreSQL listener', error);
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
   * Handle USER_REGISTERED event specifically
   */
  private async handleUserRegisteredEvent(event: SystemEvent): Promise<void> {
    logger.info('Received new user event', {
      contextId: event.contextId,
      userId: event.userId,
      email: event.email
    });

    try {
      // Create onboarding task using TaskService
      const context = await this.taskService.create({
        templateId: 'user_onboarding',
        tenantId: event.userId || 'system',
        userToken: '', // Service role will be used
        initialData: {
          userId: event.userId || '',
          email: event.email || '',
          firstName: event.firstName || '',
          lastName: event.lastName || '',
          contextId: event.contextId,
          source: 'oauth_registration',
          createdBy: 'system',
          priority: 'high'
        }
      });

      logger.info('Created onboarding task for new user', {
        userId: event.userId,
        taskId: context.contextId,
        templateId: context.taskTemplateId
      });

      // Start orchestration asynchronously
      this.orchestrator.orchestrateTask(context).catch(error => {
        logger.error('Orchestration failed for new user onboarding', {
          contextId: context.contextId,
          userId: event.userId,
          error: error.message
        });
      });

      // Emit task event to UnifiedEventBus for other subscribers
      const eventBus = new UnifiedEventBus(context.contextId, context.contextId);
      const taskEvent: Task = {
        id: context.contextId,
        status: 'created',
        result: {
          type: 'onboarding_initiated',
          userId: event.userId,
          email: event.email,
          templateId: 'user_onboarding'
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