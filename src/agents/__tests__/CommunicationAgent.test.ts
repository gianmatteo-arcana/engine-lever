/**
 * Communication Agent Tests
 * Comprehensive test suite for the consolidated BaseAgent implementation
 */

import { CommunicationAgent } from '../CommunicationAgent';
import { TaskContext, AgentRequest } from '../../types/engine-types';
import { DatabaseService } from '../../services/database';

// Mock external dependencies
jest.mock('../../services/database');
jest.mock('../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response for communication operations',
        model: 'mock-model',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));

describe('CommunicationAgent', () => {
  let agent: CommunicationAgent;
  let mockTaskContext: TaskContext;
  let mockDbService: any;

  beforeEach(() => {
    // Initialize agent
    agent = new CommunicationAgent('test_business_123', 'test_user_123');
    
    // Setup mock database service
    mockDbService = {
      createContextHistoryEntry: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      upsertAgentContext: jest.fn().mockResolvedValue({}),
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);

    // Setup mock task context
    mockTaskContext = {
      contextId: 'ctx_communication_test',
      taskTemplateId: 'communication_operation',
      tenantId: 'tenant_test',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'communication',
        completeness: 50,
        data: {
          business: {
            name: 'TechCorp LLC',
            entityType: 'LLC',
            state: 'CA'
          },
          user: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@techcorp.com',
            preferences: {
              communication: 'email'
            }
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'communication_operation',
        version: '1.0',
        metadata: {
          name: 'Communication Operation',
          description: 'Handle user communications',
          category: 'communication'
        },
        goals: {
          primary: [
            { id: 'deliver_message', description: 'Deliver message to user', required: true },
            { id: 'track_response', description: 'Track user response', required: false }
          ]
        }
      }
    };
  });

  describe('Notification Operations', () => {
    it('should send status update notification successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_notification',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'status_update',
          content: {
            task_type: 'Statement of Information',
            milestone: 'business_data_verified',
            next_step: 'form_preparation'
          },
          urgency: 'medium'
        },
        context: {
          userProgress: 50,
          deviceType: 'desktop',
          urgency: 'medium'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.notification).toBeDefined();
      expect(response.data.notification.messageType).toBe('status_update');
      expect(response.data.notification.urgency).toBe('medium');
      expect(response.data.notification.channel).toBe('email');
      expect(response.data.communicationStrategy).toBeDefined();
      expect(response.reasoning).toContain('Notification sent via email');
    });

    it('should handle urgent notifications with appropriate channel selection', async () => {
      const request: AgentRequest = {
        requestId: 'req_urgent_notification',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'error_alert',
          content: {
            error: 'Payment failed',
            action_required: 'Update payment method'
          },
          urgency: 'urgent'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.notification.urgency).toBe('urgent');
      expect(response.data.notification.channel).toBe('sms');
      expect(response.data.communicationStrategy.urgency).toBe('urgent');
    });

    it('should personalize messages based on user persona', async () => {
      // Modify context to simulate first-time user
      mockTaskContext.history = [];

      const request: AgentRequest = {
        requestId: 'req_personalized',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'task_started',
          content: {
            task_type: 'Business Registration',
            estimated_time: '2-3 days'
          },
          urgency: 'medium'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.communicationStrategy.personalization.type).toBe('first_timer');
      expect(response.data.communicationStrategy.personalization.explanationLevel).toBe('comprehensive');
    });
  });

  describe('Approval Request Operations', () => {
    it('should send payment authorization approval request', async () => {
      const request: AgentRequest = {
        requestId: 'req_approval',
        agentRole: 'communication',
        instruction: 'request_approval',
        data: {
          approvalType: 'payment_authorization',
          details: {
            amount: 45.00,
            recipient: 'Regulatory Agency',
            breakdown: {
              government_fee: 25.00,
              processing_fee: 15.00,
              convenience_fee: 5.00
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.approvalRequest).toBeDefined();
      expect(response.data.approvalRequest.approvalType).toBe('payment_authorization');
      expect(response.data.approvalRequest.responseRequired).toBe(true);
      expect(response.data.approvalRequest.timeout).toBe('24_hours');
      expect(response.data.escalationPlan).toBeDefined();
      expect(response.uiRequests).toHaveLength(1);
      expect(response.nextAgent).toBe('communication');
    });

    it('should send form review approval request', async () => {
      const request: AgentRequest = {
        requestId: 'req_form_approval',
        agentRole: 'communication',
        instruction: 'request_approval',
        data: {
          approvalType: 'form_review',
          details: {
            formType: 'SOI',
            fields: ['business_name', 'address', 'members'],
            prefilled: true
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.approvalRequest.approvalType).toBe('form_review');
      expect(response.data.approvalRequest.channel).toBe('email');
      expect(response.uiRequests).toHaveLength(1);
      expect(response.uiRequests![0].semanticData.actions.approve).toBeDefined();
      expect(response.uiRequests![0].semanticData.actions.reject).toBeDefined();
    });

    it('should handle missing approval data gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_invalid_approval',
        agentRole: 'communication',
        instruction: 'request_approval',
        data: {
          approvalType: 'payment_authorization'
          // Missing details
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Approval type and details are required');
      expect(response.reasoning).toContain('Cannot request approval without type and details');
    });
  });

  describe('Status Update Operations', () => {
    it('should send milestone progress update', async () => {
      const request: AgentRequest = {
        requestId: 'req_status_update',
        agentRole: 'communication',
        instruction: 'send_status_update',
        data: {
          milestone: 'payment_processed',
          taskType: 'Statement of Information',
          progress: 75,
          nextStep: 'government_submission'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.notification).toBeDefined();
      expect(response.data.notification.messageType).toBe('status_update');
      expect(response.data.milestone).toBe('payment_processed');
      expect(response.data.progress).toBe(75);
      expect(response.reasoning).toContain('Status update delivered via email');
    });

    it('should adapt status update for power users', async () => {
      // Simulate power user with many tasks
      mockTaskContext.history = new Array(15).fill({}).map((_, i) => ({
        entryId: `entry_${i}`,
        timestamp: new Date().toISOString(),
        sequenceNumber: i + 1,
        actor: { type: 'agent', id: 'test_agent', version: '1.0.0' },
        operation: 'test',
        data: {},
        reasoning: 'test',
        trigger: { type: 'agent_request', source: 'test', details: {} }
      }));

      const request: AgentRequest = {
        requestId: 'req_power_user_status',
        agentRole: 'communication',
        instruction: 'send_status_update',
        data: {
          milestone: 'documents_generated',
          taskType: 'Franchise Tax',
          progress: 90
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.notification.templateUsed).toBe('brief_status');
    });
  });

  describe('Support Operations', () => {
    it('should provide helpful support response', async () => {
      const request: AgentRequest = {
        requestId: 'req_support',
        agentRole: 'communication',
        instruction: 'provide_support',
        data: {
          supportType: 'filing_question',
          userQuery: 'When will my SOI be submitted?',
          context: {
            currentTask: 'soi_filing',
            stage: 'form_preparation'
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.supportResponse).toBeDefined();
      expect(response.data.supportResponse.messageType).toBe('support_response');
      expect(response.data.supportResponse.channel).toBe('in_app');
      expect(response.data.supportType).toBe('filing_question');
      expect(response.reasoning).toContain('Support response delivered');
    });
  });

  describe('Communication Escalation', () => {
    it('should escalate urgent communications appropriately', async () => {
      const request: AgentRequest = {
        requestId: 'req_escalation',
        agentRole: 'communication',
        instruction: 'escalate_communication',
        data: {
          originalMessageId: 'msg_123456',
          escalationReason: 'no_response_24hrs',
          urgencyLevel: 'high'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.escalationMessage).toBeDefined();
      expect(response.data.channel).toBe('sms');
      expect(response.data.escalationReason).toBe('no_response_24hrs');
      expect(response.reasoning).toContain('Communication successfully escalated via sms');
    });

    it('should use phone call for critical escalations', async () => {
      const request: AgentRequest = {
        requestId: 'req_critical_escalation',
        agentRole: 'communication',
        instruction: 'escalate_communication',
        data: {
          originalMessageId: 'msg_789',
          escalationReason: 'deadline_missed',
          urgencyLevel: 'critical'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.channel).toBe('phone_call');
    });
  });

  describe('Channel Selection', () => {
    it('should select appropriate channels based on urgency', async () => {
      const testCases = [
        { urgency: 'low', expectedChannel: 'in_app' },
        { urgency: 'medium', expectedChannel: 'email' },
        { urgency: 'high', expectedChannel: 'push_notification' },
        { urgency: 'urgent', expectedChannel: 'sms' }
      ];

      for (const testCase of testCases) {
        const request: AgentRequest = {
          requestId: `req_${testCase.urgency}`,
          agentRole: 'communication',
          instruction: 'send_notification',
          data: {
            messageType: 'general_notification',
            content: { message: 'test' },
            urgency: testCase.urgency
          }
        };

        const response = await agent.processRequest(request, mockTaskContext);
        expect(response.data.notification.channel).toBe(testCase.expectedChannel);
      }
    });
  });

  describe('Context Recording', () => {
    it('should record communication initiation with proper reasoning', async () => {
      const request: AgentRequest = {
        requestId: 'req_context_test',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'test_notification',
          content: { test: 'data' },
          urgency: 'medium'
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'communication_operation_initiated',
          reasoning: 'Starting user communication operation'
        })
      );
    });

    it('should record notification sending with communication details', async () => {
      const request: AgentRequest = {
        requestId: 'req_notification_context',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'completion_notification',
          content: { task: 'completed' },
          urgency: 'medium'
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'notification_sent',
          reasoning: expect.stringContaining('medium urgency notification sent via email')
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown instructions gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_unknown',
        agentRole: 'communication',
        instruction: 'unknown_communication_operation',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Unknown communication instruction');
      expect(response.reasoning).toContain('unrecognized instruction type');
    });

    it('should handle processing errors gracefully', async () => {
      // Force an error by corrupting the context
      const corruptedContext = { ...mockTaskContext, currentState: null };

      const request: AgentRequest = {
        requestId: 'req_error_test',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'test',
          content: { test: 'data' },
          urgency: 'medium'
        }
      };

      const response = await agent.processRequest(request, corruptedContext as any);

      expect(response.status).toBe('error');
      expect(response.data.error).toBeDefined();
      expect(response.reasoning).toContain('Technical error during communication operation');
    });

    it('should continue processing even if database write fails', async () => {
      // Mock database failure
      mockDbService.createContextHistoryEntry.mockRejectedValue(new Error('Database error'));

      const request: AgentRequest = {
        requestId: 'req_db_fail',
        agentRole: 'communication',
        instruction: 'send_notification',
        data: {
          messageType: 'test_notification',
          content: { test: 'data' },
          urgency: 'medium'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Should still process successfully despite database error
      expect(response.status).toBe('completed');
      expect(response.data.notification).toBeDefined();
    });
  });

  describe('UI Request Generation', () => {
    it('should generate notification UI for response-required messages', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_test',
        agentRole: 'communication',
        instruction: 'request_approval',
        data: {
          approvalType: 'document_review',
          details: {
            documentType: 'generated_form',
            reviewRequired: true
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.uiRequests).toHaveLength(1);
      expect(response.uiRequests).toHaveLength(1);
      expect(response.uiRequests![0].templateType).toBe('ApprovalRequest');
      expect(response.uiRequests![0].semanticData.actions.approve).toBeDefined();
      expect(response.uiRequests![0].semanticData.actions.reject).toBeDefined();
      expect(response.uiRequests![0].semanticData.actions.request_info).toBeDefined();
    });

    it('should not generate UI for simple notifications', async () => {
      const request: AgentRequest = {
        requestId: 'req_simple_notification',
        agentRole: 'communication',
        instruction: 'send_status_update',
        data: {
          milestone: 'task_started',
          taskType: 'SOI Filing'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.uiRequests).toBeUndefined();
    });
  });

  describe('Integration with Agent Flow', () => {
    it('should specify correct next agent for approval requests', async () => {
      const request: AgentRequest = {
        requestId: 'req_flow_test',
        agentRole: 'communication',
        instruction: 'request_approval',
        data: {
          approvalType: 'payment_authorization',
          details: { amount: 50, recipient: 'CA SOS' }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.nextAgent).toBe('communication');
      expect(response.status).toBe('needs_input');
    });

    it('should not specify next agent for completed notifications', async () => {
      const request: AgentRequest = {
        requestId: 'req_completed_flow',
        agentRole: 'communication',
        instruction: 'send_status_update',
        data: {
          milestone: 'filing_complete',
          taskType: 'Business Registration'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.nextAgent).toBeUndefined();
      expect(response.status).toBe('completed');
    });
  });

  describe('CommunicationAgent Performance', () => {
    it('should complete communication operations within time limits', async () => {
      const startTime = Date.now();

      const request: AgentRequest = {
        requestId: 'req_performance_test',
        agentRole: 'communication',
        instruction: 'send_status_update',
        data: {
          milestone: 'task_completed',
          taskType: 'Test Task',
          progress: 100
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);
      const duration = Date.now() - startTime;

      expect(response.status).toBe('completed');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});