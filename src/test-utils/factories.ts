/**
 * Test Data Factories
 * 
 * Factory functions for creating test data that follows PRD schemas
 * Ensures consistent test data across all test suites
 */

import {
  TaskContext,
  TaskTemplate,
  ContextEntry,
  AgentRequest,
  AgentResponse,
  UIRequest,
  UITemplateType,
  Actor
} from '../types/engine-types';

/**
 * Factory for creating TaskContext test data
 * Follows Engine PRD Lines 145-220
 */
export class TaskContextFactory {
  static create(overrides: Partial<TaskContext> = {}): TaskContext {
    return {
      contextId: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskTemplateId: 'test_template',
      tenantId: 'tenant-test-123',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'initialization',
        completeness: 0,
        data: {}
      },
      history: [],
      templateSnapshot: TaskTemplateFactory.create(),
      ...overrides
    };
  }

  static createWithHistory(entries: number = 5): TaskContext {
    const context = this.create();
    context.history = Array(entries).fill(null).map((_, i) => 
      ContextEntryFactory.create({ sequenceNumber: i + 1 })
    );
    return context;
  }

  static createCompleted(): TaskContext {
    return this.create({
      currentState: {
        status: 'completed',
        phase: 'done',
        completeness: 100,
        data: { completedAt: new Date().toISOString() }
      }
    });
  }
}

/**
 * Factory for creating TaskTemplate test data
 * Follows Engine PRD Lines 526-587
 */
export class TaskTemplateFactory {
  static create(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
    return {
      id: 'test_template',
      name: 'Test Template',
      version: '1.0.0',
      description: 'Test template for unit tests',
      category: 'testing',
      steps: [
        {
          id: 'step1',
          name: 'Initial Step',
          agent: 'TestAgent',
          config: {
            action: 'collect_data',
            required: true
          },
          dependencies: []
        },
        {
          id: 'step2',
          name: 'Process Step',
          agent: 'ProcessAgent',
          config: {
            action: 'process_data'
          },
          dependencies: ['step1']
        }
      ],
      completionCriteria: [
        'task.status == "completed"',
        'task.data.processed == true'
      ],
      metadata: {
        created: new Date().toISOString(),
        author: 'test-suite'
      },
      ...overrides
    };
  }

  static createOnboardingTemplate(): TaskTemplate {
    return this.create({
      id: 'user_onboarding',
      name: 'User Onboarding',
      category: 'onboarding',
      steps: [
        {
          id: 'auth',
          name: 'Authentication',
          agent: 'AuthenticationAgent',
          config: { provider: 'google' },
          dependencies: []
        },
        {
          id: 'business_discovery',
          name: 'Business Discovery',
          agent: 'BusinessDiscoveryAgent',
          config: { searchDepth: 'deep' },
          dependencies: ['auth']
        },
        {
          id: 'profile_collection',
          name: 'Profile Collection',
          agent: 'ProfileCollectorAgent',
          config: { fields: ['ein', 'business_type'] },
          dependencies: ['business_discovery']
        }
      ]
    });
  }

  static createSOITemplate(): TaskTemplate {
    return this.create({
      id: 'soi_filing',
      name: 'Statement of Information Filing',
      category: 'compliance',
      steps: [
        {
          id: 'data_collection',
          name: 'Collect SOI Data',
          agent: 'DataCollectionAgent',
          config: { form: 'ca_soi' },
          dependencies: []
        },
        {
          id: 'validation',
          name: 'Validate Data',
          agent: 'ValidationAgent',
          config: { rules: 'ca_soi_rules' },
          dependencies: ['data_collection']
        },
        {
          id: 'submission',
          name: 'Submit to State',
          agent: 'SubmissionAgent',
          config: { portal: 'ca_sos' },
          dependencies: ['validation']
        }
      ]
    });
  }
}

/**
 * Factory for creating ContextEntry test data
 * Follows Engine PRD Lines 281-303
 */
export class ContextEntryFactory {
  static create(overrides: Partial<ContextEntry> = {}): ContextEntry {
    return {
      entryId: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: 1,
      actor: ActorFactory.create(),
      operation: 'test_operation',
      data: {
        test: true,
        value: 'test-value'
      },
      reasoning: 'Test operation for unit testing',
      ...overrides
    };
  }

  static createSystemEntry(operation: string, data: any = {}): ContextEntry {
    return this.create({
      actor: ActorFactory.createSystem(),
      operation,
      data,
      reasoning: `System performed ${operation}`
    });
  }

  static createAgentEntry(agentId: string, operation: string, data: any = {}): ContextEntry {
    return this.create({
      actor: ActorFactory.createAgent(agentId),
      operation,
      data,
      reasoning: `Agent ${agentId} performed ${operation}`
    });
  }

  static createUserEntry(userId: string, operation: string, data: any = {}): ContextEntry {
    return this.create({
      actor: ActorFactory.createUser(userId),
      operation,
      data,
      reasoning: `User ${userId} performed ${operation}`
    });
  }
}

/**
 * Factory for creating Actor test data
 * Follows Engine PRD Lines 290-292
 */
export class ActorFactory {
  static create(overrides: Partial<Actor> = {}): Actor {
    return {
      type: 'system',
      id: 'test-actor',
      version: '1.0.0',
      ...overrides
    };
  }

  static createSystem(id: string = 'system'): Actor {
    return this.create({
      type: 'system',
      id,
      version: '1.0.0'
    });
  }

  static createAgent(id: string): Actor {
    return this.create({
      type: 'agent',
      id,
      version: '1.0.0'
    });
  }

  static createUser(id: string): Actor {
    return this.create({
      type: 'user',
      id,
      version: 'n/a'
    });
  }

  static createExternal(service: string): Actor {
    return this.create({
      type: 'external',
      id: service,
      version: 'api'
    });
  }
}

/**
 * Factory for creating AgentRequest test data
 * Follows Engine PRD Lines 429-470
 */
export class AgentRequestFactory {
  static create(overrides: Partial<AgentRequest> = {}): AgentRequest {
    return {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      contextId: 'ctx-test-123',
      agentId: 'TestAgent',
      operation: 'test_operation',
      input: {
        test: true,
        data: 'test-data'
      },
      context: TaskContextFactory.create(),
      ...overrides
    };
  }

  static createWithContext(context: TaskContext): AgentRequest {
    return this.create({
      contextId: context.contextId,
      context
    });
  }
}

/**
 * Factory for creating AgentResponse test data
 * Follows Engine PRD Lines 472-503
 */
export class AgentResponseFactory {
  static create(overrides: Partial<AgentResponse> = {}): AgentResponse {
    return {
      requestId: 'req-test-123',
      agentId: 'TestAgent',
      status: 'success',
      output: {
        result: 'test-result',
        processed: true
      },
      uiRequest: null,
      reasoning: 'Test operation completed successfully',
      ...overrides
    };
  }

  static createWithUI(uiRequest: UIRequest): AgentResponse {
    return this.create({
      uiRequest,
      status: 'ui_required'
    });
  }

  static createError(error: string): AgentResponse {
    return this.create({
      status: 'error',
      output: { error },
      reasoning: `Operation failed: ${error}`
    });
  }
}

/**
 * Factory for creating UIRequest test data
 * Follows Engine PRD Lines 881-914
 */
export class UIRequestFactory {
  static create(overrides: Partial<UIRequest> = {}): UIRequest {
    return {
      requestId: `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        title: 'Test Input',
        description: 'Please enter test data',
        fields: [
          {
            id: 'test_field',
            label: 'Test Field',
            type: 'text',
            required: true
          }
        ]
      },
      context: {},
      ...overrides
    };
  }

  static createFoundYouCard(businessData: any): UIRequest {
    return this.create({
      templateType: UITemplateType.FoundYouCard,
      semanticData: {
        title: 'We Found Your Business!',
        businessInfo: businessData,
        actions: [
          { id: 'confirm', label: 'Yes, this is correct' },
          { id: 'edit', label: 'Edit information' }
        ]
      }
    });
  }

  static createActionPillGroup(actions: Array<{id: string, label: string}>): UIRequest {
    return this.create({
      templateType: UITemplateType.ActionPillGroup,
      semanticData: {
        title: 'Choose an action',
        actions
      }
    });
  }

  static createSuccessScreen(message: string): UIRequest {
    return this.create({
      templateType: UITemplateType.SuccessScreen,
      semanticData: {
        title: 'Success!',
        message,
        nextSteps: []
      }
    });
  }
}

/**
 * Factory for creating test database records
 */
export class DatabaseRecordFactory {
  static createTaskRecord(overrides: any = {}): any {
    return {
      id: `task-${Date.now()}`,
      user_id: 'user-test-123',
      title: 'Test Task',
      description: 'Test task description',
      task_type: 'test',
      business_id: 'business-test-123',
      template_id: 'test_template',
      status: 'pending',
      priority: 'medium',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  static createExecutionRecord(taskId: string, overrides: any = {}): any {
    return {
      id: `exec-${Date.now()}`,
      task_id: taskId,
      execution_id: `exec-${Date.now()}`,
      current_step: 'step1',
      completed_steps: [],
      agent_assignments: {},
      variables: {},
      status: 'running',
      started_at: new Date().toISOString(),
      is_paused: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }
}

/**
 * Test data builders for complex scenarios
 */
export class TestDataBuilder {
  /**
   * Creates a complete onboarding scenario
   */
  static createOnboardingScenario() {
    const template = TaskTemplateFactory.createOnboardingTemplate();
    const context = TaskContextFactory.create({
      taskTemplateId: template.id,
      templateSnapshot: template
    });
    
    // Add history entries for each step
    context.history = [
      ContextEntryFactory.createSystemEntry('task_created', {
        templateId: template.id
      }),
      ContextEntryFactory.createAgentEntry('AuthenticationAgent', 'auth_completed', {
        userId: 'user-123',
        email: 'test@example.com'
      }),
      ContextEntryFactory.createAgentEntry('BusinessDiscoveryAgent', 'business_found', {
        businessName: 'Test Corp',
        ein: '12-3456789'
      }),
      ContextEntryFactory.createAgentEntry('ProfileCollectorAgent', 'profile_collected', {
        complete: true
      })
    ];
    
    return { template, context };
  }

  /**
   * Creates a complete SOI filing scenario
   */
  static createSOIScenario() {
    const template = TaskTemplateFactory.createSOITemplate();
    const context = TaskContextFactory.create({
      taskTemplateId: template.id,
      templateSnapshot: template
    });
    
    context.history = [
      ContextEntryFactory.createSystemEntry('task_created', {
        templateId: template.id
      }),
      ContextEntryFactory.createAgentEntry('DataCollectionAgent', 'data_collected', {
        form: 'ca_soi',
        complete: true
      }),
      ContextEntryFactory.createAgentEntry('ValidationAgent', 'validation_passed', {
        errors: []
      })
    ];
    
    return { template, context };
  }

  /**
   * Creates test data for concurrent operations
   */
  static createConcurrentTasks(count: number = 10): TaskContext[] {
    return Array(count).fill(null).map((_, i) => 
      TaskContextFactory.create({
        contextId: `ctx-concurrent-${i}`,
        tenantId: `tenant-${i % 3}` // Distribute across 3 tenants
      })
    );
  }
}

/**
 * Mock data generators for testing
 */
export class MockDataGenerator {
  static generateRandomEmail(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const random = Array(10).fill(null)
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');
    return `${random}@test.example.com`;
  }

  static generateRandomEIN(): string {
    const digits = Array(9).fill(null)
      .map(() => Math.floor(Math.random() * 10))
      .join('');
    return `${digits.substr(0, 2)}-${digits.substr(2)}`;
  }

  static generateBusinessName(): string {
    const prefixes = ['Acme', 'Global', 'United', 'Premier', 'Advanced'];
    const suffixes = ['Corp', 'LLC', 'Inc', 'Group', 'Partners'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    return `${prefix} Test ${suffix}`;
  }

  static generateLargePayload(sizeKB: number = 10): any {
    const obj: any = {};
    const targetSize = sizeKB * 1024;
    let currentSize = 0;
    let counter = 0;
    
    while (currentSize < targetSize) {
      const key = `field_${counter++}`;
      const value = `value_${Math.random().toString(36).repeat(10)}`;
      obj[key] = value;
      currentSize += key.length + value.length;
    }
    
    return obj;
  }
}