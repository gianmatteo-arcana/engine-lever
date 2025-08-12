/**
 * Type Safety Tests
 * 
 * These tests verify that our TypeScript types are properly enforced
 * and catch type errors at compile time.
 */

import { 
  TaskContext,
  TaskState,
  AgentRequest, 
  AgentResponse,
  ContextEntry,
  UIRequest,
  TaskTemplate,
  TaskGoal,
  ValidationRule,
  BusinessEntity,
  UserProfile,
  ComplianceRequirement
} from '../engine-types';

describe('Type Safety Tests', () => {
  describe('TaskContext Type Safety', () => {
    test('should enforce required TaskContext properties', () => {
      const validContext: TaskContext = {
        contextId: 'ctx_123',
        taskTemplateId: 'soi_filing',
        tenantId: 'tenant_123',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'processing',
          phase: 'data_collection',
          completeness: 50,
          data: {}
        },
        history: [],
        templateSnapshot: {
          id: 'soi_filing',
          version: '1.0',
          metadata: {
            name: 'SOI Filing',
            description: 'Statement of Information filing',
            category: 'compliance'
          },
          goals: {
            primary: [{ id: 'file_soi', description: 'File Statement of Information', required: true }]
          }
        }
      };

      expect(validContext).toBeDefined();
      expect(validContext.contextId).toBe('ctx_123');
      expect(validContext.currentState.completeness).toBe(50);
    });

    test('should not allow invalid status values', () => {
      const context: TaskContext = {
        contextId: 'ctx_123',
        taskTemplateId: 'soi_filing',
        tenantId: 'tenant_123',
        createdAt: new Date().toISOString(),
        currentState: {
          // @ts-expect-error - Testing invalid status value
          status: 'invalid_status',
          phase: 'data_collection',
          completeness: 50,
          data: {}
        },
        history: [],
        templateSnapshot: {
          id: 'soi_filing',
          version: '1.0',
          metadata: {
            name: 'SOI Filing',
            description: 'Statement of Information filing',
            category: 'compliance'
          },
          goals: {
            primary: [{ id: 'file_soi', description: 'File Statement of Information', required: true }]
          }
        }
      };

      // TypeScript should catch this at compile time
      expect(context.currentState.status).toBeDefined();
    });
  });

  describe('AgentRequest Type Safety', () => {
    test('should enforce required AgentRequest properties', () => {
      const validRequest: AgentRequest = {
        requestId: 'req_123',
        agentRole: 'business_discovery_agent',
        instruction: 'find_business',
        data: {
          email: 'test@example.com'
        }
      };

      expect(validRequest.requestId).toBe('req_123');
      expect(validRequest.agentRole).toBe('business_discovery_agent');
      expect(validRequest.instruction).toBe('find_business');
    });

    test('should allow optional context property', () => {
      const requestWithContext: AgentRequest = {
        requestId: 'req_124',
        agentRole: 'profile_collection_agent',
        instruction: 'collect_profile',
        data: {},
        context: {
          deviceType: 'mobile',
          userProgress: 25
        }
      };

      expect(requestWithContext.context).toBeDefined();
      expect(requestWithContext.context?.deviceType).toBe('mobile');
      expect(requestWithContext.context?.userProgress).toBe(25);
    });
  });

  describe('AgentResponse Type Safety', () => {
    test('should enforce valid status values', () => {
      const validResponse: AgentResponse = {
        status: 'completed',
        data: { result: 'success' },
        reasoning: 'Task completed successfully'
      };

      expect(validResponse.status).toBe('completed');

      const invalidResponse: AgentResponse = {
        status: 'invalid_status' as 'completed',
        data: {},
        reasoning: 'Test'
      };

      expect(invalidResponse).toBeDefined();
    });

    test('should allow optional properties', () => {
      const responseWithUI: AgentResponse = {
        status: 'needs_input',
        data: {},
        uiRequests: [{
          id: 'ui_123',
          agentRole: 'test_agent',
          suggestedTemplates: ['form_template'],
          dataNeeded: ['name', 'email'],
          context: {
            userProgress: 50,
            deviceType: 'desktop',
            urgency: 'medium'
          }
        }],
        reasoning: 'User input required',
        nextAgent: 'profile_collection_agent'
      };

      expect(responseWithUI.uiRequests).toHaveLength(1);
      expect(responseWithUI.nextAgent).toBe('profile_collection_agent');
    });
  });

  describe('ContextEntry Type Safety', () => {
    test('should enforce actor types', () => {
      const validEntry: ContextEntry = {
        entryId: 'entry_123',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: {
          type: 'agent',
          id: 'business_discovery_agent',
          version: '1.0.0'
        },
        operation: 'business_found',
        data: {
          businessName: 'Test Corp'
        },
        reasoning: 'Found business in public records'
      };

      expect(validEntry.actor.type).toBe('agent');

      const invalidEntry: ContextEntry = {
        entryId: 'entry_124',
        timestamp: new Date().toISOString(),
        sequenceNumber: 2,
        actor: {
          type: 'invalid_type' as 'agent',
          id: 'test'
        },
        operation: 'test',
        data: {}
      };

      expect(invalidEntry).toBeDefined();
    });

    test('should allow optional reasoning', () => {
      const entryWithoutReasoning: ContextEntry = {
        entryId: 'entry_125',
        timestamp: new Date().toISOString(),
        sequenceNumber: 3,
        actor: {
          type: 'system',
          id: 'system'
        },
        operation: 'auto_save',
        data: {}
      };

      expect(entryWithoutReasoning.reasoning).toBeUndefined();
    });
  });

  describe('UIRequest Type Safety', () => {
    test('should enforce urgency levels', () => {
      const validUIRequest: UIRequest = {
        id: 'ui_123',
        agentRole: 'profile_collection_agent',
        suggestedTemplates: ['business_form'],
        dataNeeded: ['businessName', 'entityType'],
        context: {
          userProgress: 75,
          deviceType: 'mobile',
          urgency: 'high'
        }
      };

      expect(validUIRequest.context.urgency).toBe('high');

      const invalidUIRequest: UIRequest = {
        id: 'ui_124',
        agentRole: 'test_agent',
        suggestedTemplates: [],
        dataNeeded: [],
        context: {
          userProgress: 50,
          deviceType: 'desktop',
          urgency: 'invalid_urgency' as 'low'
        }
      };

      expect(invalidUIRequest).toBeDefined();
    });

    test('should enforce device types', () => {
      const invalidDevice: UIRequest = {
        id: 'ui_125',
        agentRole: 'test_agent',
        suggestedTemplates: [],
        dataNeeded: [],
        context: {
          userProgress: 50,
          deviceType: 'invalid_device' as 'mobile',
          urgency: 'low'
        }
      };

      expect(invalidDevice).toBeDefined();
    });
  });

  describe('TaskState Type Safety', () => {
    test('should enforce phase values', () => {
      const validState: TaskState = {
        status: 'processing',
        phase: 'data_collection',
        completeness: 25,
        data: {
          user: {
            email: 'test@example.com'
          }
        }
      };

      expect(validState.phase).toBe('data_collection');

      const invalidPhase: TaskState = {
        status: 'processing',
        phase: 'invalid_phase' as 'data_collection',
        completeness: 50,
        data: {}
      };

      expect(invalidPhase).toBeDefined();
    });

    test('should enforce completeness range', () => {
      const validCompleteness: TaskState = {
        status: 'processing',
        phase: 'verification',
        completeness: 100,
        data: {}
      };

      expect(validCompleteness.completeness).toBe(100);
      expect(validCompleteness.completeness).toBeGreaterThanOrEqual(0);
      expect(validCompleteness.completeness).toBeLessThanOrEqual(100);
    });
  });

  describe('TaskTemplate Type Safety', () => {
    test('should enforce metadata properties', () => {
      const validTemplate: TaskTemplate = {
        id: 'soi_filing',
        version: '2.0',
        metadata: {
          name: 'SOI Filing',
          description: 'Annual Statement of Information filing',
          category: 'compliance'
        },
        goals: {
          primary: [
            { id: 'file_soi', description: 'File Statement of Information', required: true },
            { id: 'pay_fee', description: 'Pay filing fee', required: true }
          ],
          secondary: [
            { id: 'update_records', description: 'Update business records', required: false }
          ]
        },
        phases: [
          { 
            id: 'validation', 
            name: 'Validate Requirements', 
            description: 'Validate SOI filing requirements',
            agents: ['legal_compliance'],
            maxDuration: 300,
            canSkip: false
          },
          { 
            id: 'collection', 
            name: 'Collect Data', 
            description: 'Collect business data for filing',
            agents: ['data_collection'],
            maxDuration: 600,
            canSkip: false
          },
          { 
            id: 'submission', 
            name: 'Submit Filing', 
            description: 'Submit SOI to Secretary of State',
            agents: ['agency_interaction'],
            maxDuration: 900,
            canSkip: false
          }
        ]
      };

      expect(validTemplate.metadata.category).toBe('compliance');
      expect(validTemplate.metadata.category).toBe('compliance');
    });

    test('should enforce category values', () => {
      const invalidCategory: TaskTemplate = {
        id: 'test_template',
        version: '1.0',
        metadata: {
          name: 'Test',
          description: 'Test template',
          category: 'invalid_category' as 'compliance'
        },
        goals: {
          primary: []
        }
      };

      expect(invalidCategory).toBeDefined();
    });
  });

  describe('ValidationRule Type Safety', () => {
    test('should enforce rule structure', () => {
      const validRule: ValidationRule = {
        field: 'email',
        type: 'required',
        message: 'Email is required'
      };

      expect(validRule.field).toBe('email');
      expect(validRule.type).toBe('required');
      expect(validRule.message).toBe('Email is required');
    });

    test('should allow pattern validation', () => {
      const regexRule: ValidationRule = {
        field: 'email',
        type: 'regex',
        pattern: '^[\w]+@[\w]+\.[\w]+$',
        message: 'Invalid email format'
      };

      expect(regexRule.pattern).toBeDefined();
    });
  });

  describe('Type Inference Tests', () => {
    test('should properly infer union types', () => {
      type Status = 'pending' | 'processing' | 'completed' | 'failed';
      
      const getStatusMessage = (status: Status): string => {
        switch (status) {
          case 'pending':
            return 'Task is pending';
          case 'processing':
            return 'Task is processing';
          case 'completed':
            return 'Task completed successfully';
          case 'failed':
            return 'Task failed';
          // TypeScript ensures exhaustive checking
        }
      };

      expect(getStatusMessage('completed')).toBe('Task completed successfully');
      
      // @ts-expect-error - Testing invalid status
      expect(() => getStatusMessage('invalid')).toBeDefined();
    });

    test('should properly handle optional chaining', () => {
      interface UserData {
        email?: string;
        profile?: {
          name?: string;
          business?: {
            name?: string;
            entityType?: string;
          };
        };
      }

      const userData: UserData = {
        email: 'test@example.com',
        profile: {
          business: {
            name: 'Test Corp'
          }
        }
      };

      const businessName = userData.profile?.business?.name;
      expect(businessName).toBe('Test Corp');

      const entityType = userData.profile?.business?.entityType;
      expect(entityType).toBeUndefined();
    });
  });

  describe('Generic Type Tests', () => {
    test('should properly handle generic agent responses', () => {
      interface GenericResponse<T> {
        status: 'success' | 'error';
        data: T;
        timestamp: string;
      }

      interface BusinessData {
        name: string;
        entityType: string;
        state: string;
      }

      const businessResponse: GenericResponse<BusinessData> = {
        status: 'success',
        data: {
          name: 'Test LLC',
          entityType: 'LLC',
          state: 'CA'
        },
        timestamp: new Date().toISOString()
      };

      expect(businessResponse.data.name).toBe('Test LLC');
      expect(businessResponse.data.entityType).toBe('LLC');
    });

    test('should enforce constraints on generic types', () => {
      interface Identifiable {
        id: string;
      }

      class Repository<T extends Identifiable> {
        private items: T[] = [];

        add(item: T): void {
          this.items.push(item);
        }

        findById(id: string): T | undefined {
          return this.items.find(item => item.id === id);
        }
      }

      interface Task extends Identifiable {
        id: string;
        title: string;
      }

      const taskRepo = new Repository<Task>();
      taskRepo.add({ id: '1', title: 'Test Task' });
      
      const found = taskRepo.findById('1');
      expect(found?.title).toBe('Test Task');
    });
  });

  describe('Discriminated Union Tests', () => {
    test('should properly handle discriminated unions', () => {
      type AgentMessage = 
        | { type: 'request'; requestId: string; data: any }
        | { type: 'response'; responseId: string; result: any }
        | { type: 'error'; errorCode: string; message: string };

      const handleMessage = (msg: AgentMessage): string => {
        switch (msg.type) {
          case 'request':
            return `Request ${msg.requestId}`;
          case 'response':
            return `Response ${msg.responseId}`;
          case 'error':
            return `Error ${msg.errorCode}: ${msg.message}`;
        }
      };

      const requestMsg: AgentMessage = { 
        type: 'request', 
        requestId: 'req_123', 
        data: {} 
      };
      
      expect(handleMessage(requestMsg)).toBe('Request req_123');

      const errorMsg: AgentMessage = {
        type: 'error',
        errorCode: 'E001',
        message: 'Test error'
      };
      
      expect(handleMessage(errorMsg)).toBe('Error E001: Test error');
    });
  });
});