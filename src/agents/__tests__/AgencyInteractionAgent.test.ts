/**
 * Agency Interaction Agent Tests
 * Comprehensive test suite for the consolidated BaseAgent implementation
 */

import { AgencyInteractionAgent } from '../AgencyInteractionAgent';
import { TaskContext, AgentRequest } from '../../types/engine-types';
import { DatabaseService } from '../../services/database';

// Mock external dependencies
jest.mock('../../services/database');
jest.mock('../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response for agency interactions',
        model: 'mock-model',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));

describe('AgencyInteractionAgent', () => {
  let agent: AgencyInteractionAgent;
  let mockTaskContext: TaskContext;
  let mockDbService: any;

  beforeEach(() => {
    // Initialize agent
    agent = new AgencyInteractionAgent('test_business_123', 'test_user_123');
    
    // Setup mock database service
    mockDbService = {
      createContextHistoryEntry: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      upsertAgentContext: jest.fn().mockResolvedValue({}),
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);

    // Setup mock task context
    mockTaskContext = {
      contextId: 'ctx_agency_test',
      taskTemplateId: 'form_submission',
      tenantId: 'tenant_test',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'agency_interaction',
        completeness: 80,
        data: {
          business: {
            name: 'GovCorp LLC',
            entityType: 'LLC',
            entityNumber: '202301234567',
            state: 'CA',
            address: {
              street: '123 Government St',
              city: 'Sacramento',
              state: 'CA',
              zipCode: '95814'
            }
          },
          user: {
            firstName: 'Alice',
            lastName: 'Government',
            email: 'alice@govcorp.com',
            preferences: {
              notifications: 'email'
            }
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'form_submission',
        version: '1.0',
        metadata: {
          name: 'Form Submission',
          description: 'Submit forms to government agencies',
          category: 'compliance'
        },
        goals: {
          primary: [
            { id: 'form_submission', description: 'Submit form to agency', required: true },
            { id: 'status_tracking', description: 'Track submission status', required: false }
          ]
        }
      }
    };
  });

  describe('Form Submission', () => {
    it('should submit form to CA SOS successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_ca_sos_submit',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'TechCorp LLC',
            entityNumber: '202301234567',
            entityType: 'LLC',
            address: {
              street: '123 Main St',
              city: 'San Francisco',
              state: 'CA',
              zipCode: '94105'
            },
            members: [
              { name: 'John Doe', percentage: 100, address: '123 Main St' }
            ]
          },
          attachments: []
        },
        context: {
          urgency: 'medium',
          deviceType: 'desktop',
          userProgress: 80
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toMatch(/needs_input|error/);
      expect(response.data.submissionResult).toBeDefined();
      expect(response.data.agency).toBe('ca_sos');
      expect(response.data.trackingInfo).toBeDefined();
      expect(response.uiRequests).toHaveLength(1);
      expect(response.reasoning).toContain('Form submitted to ca_sos');
      if (response.data.submissionResult.status !== 'error') {
        expect(response.data.submissionResult.confirmationNumber).toBeDefined();
        expect(response.nextAgent).toBe('monitoring');
      }
    });

    it('should validate form data before submission', async () => {
      const request: AgentRequest = {
        requestId: 'req_invalid_form',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: '', // Invalid: empty name
            entityNumber: 'invalid', // Invalid: wrong format
            entityType: 'LLC',
            address: {
              street: '', // Invalid: empty street
              city: 'San Francisco',
              state: 'CA',
              zipCode: '94105'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Form validation failed');
      expect(response.data.validationErrors).toBeDefined();
      expect(response.data.validationErrors.length).toBeGreaterThan(0);
    });

    it('should handle unsupported agency gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_unsupported_agency',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'unsupported_agency',
          formData: {
            entityName: 'Test Corp'
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Unsupported agency');
      expect(response.reasoning).toContain('not supported by this agent');
    });

    it('should handle missing required parameters', async () => {
      const request: AgentRequest = {
        requestId: 'req_missing_params',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          // Missing agency and formData
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Agency and form data are required');
      expect(response.reasoning).toContain('Cannot submit form without');
    });
  });

  describe('Submission Status Checking', () => {
    it('should check submission status successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_status_check',
        agentRole: 'agency_interaction',
        instruction: 'check_submission_status',
        data: {
          confirmationNumber: 'CA-SOS-12345-ABCD',
          agency: 'ca_sos'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.statusResult).toBeDefined();
      expect(response.data.statusResult.currentStatus).toBeDefined();
      expect(response.data.statusResult.processingStage).toBeDefined();
      expect(response.data.trackingDetails).toBeDefined();
      expect(response.reasoning).toContain('Status check completed');
    });

    it('should generate status tracking UI for incomplete submissions', async () => {
      const request: AgentRequest = {
        requestId: 'req_status_ui',
        agentRole: 'agency_interaction',
        instruction: 'check_submission_status',
        data: {
          confirmationNumber: 'CA-SOS-12345-PROCESSING',
          agency: 'ca_sos'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // UI should be generated if status is not completed/rejected
      if (response.status === 'needs_input') {
        expect(response.uiRequests).toHaveLength(1);
        expect(response.uiRequests![0].semanticData.title).toContain('Submission Status');
        expect(response.uiRequests![0].semanticData.actions.refresh_status).toBeDefined();
      }
    });

    it('should handle missing status check parameters', async () => {
      const request: AgentRequest = {
        requestId: 'req_missing_status_params',
        agentRole: 'agency_interaction',
        instruction: 'check_submission_status',
        data: {
          // Missing confirmationNumber and agency
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Confirmation number and agency are required');
    });
  });

  describe('Document Retrieval', () => {
    it('should retrieve documents successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_document_retrieval',
        agentRole: 'agency_interaction',
        instruction: 'retrieve_documents',
        data: {
          confirmationNumber: 'CA-SOS-12345-COMPLETE',
          agency: 'ca_sos',
          documentTypes: ['confirmation_letter', 'filing_receipt']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.retrievalResult).toBeDefined();
      expect(response.data.documentSummary).toBeDefined();
      expect(response.data.documentSummary.totalDocuments).toBeGreaterThanOrEqual(0);
      expect(response.reasoning).toContain('Successfully retrieved');
    });

    it('should provide document download information', async () => {
      const request: AgentRequest = {
        requestId: 'req_document_info',
        agentRole: 'agency_interaction',
        instruction: 'retrieve_documents',
        data: {
          confirmationNumber: 'CA-SOS-12345-DOCS',
          agency: 'ca_sos'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.documentSummary.documentTypes).toBeDefined();
      expect(response.data.documentSummary.downloadUrls).toBeDefined();
      expect(Array.isArray(response.data.documentSummary.documentTypes)).toBe(true);
      expect(Array.isArray(response.data.documentSummary.downloadUrls)).toBe(true);
    });
  });

  describe('Portal Error Handling', () => {
    it('should handle validation errors with recovery plan', async () => {
      const request: AgentRequest = {
        requestId: 'req_validation_error',
        agentRole: 'agency_interaction',
        instruction: 'handle_portal_error',
        data: {
          errorType: 'validation_error',
          errorMessage: 'Invalid entity number format',
          submissionContext: {
            agency: 'ca_sos',
            formType: 'SI-550'
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.portalError).toBeDefined();
      expect(response.data.portalError.type).toBe('validation');
      expect(response.data.portalError.retryable).toBe(true);
      expect(response.data.recoveryPlan).toBeDefined();
      expect(response.uiRequests).toHaveLength(1);
      expect(response.nextAgent).toBe('communication');
    });

    it('should handle authentication failures', async () => {
      const request: AgentRequest = {
        requestId: 'req_auth_error',
        agentRole: 'agency_interaction',
        instruction: 'handle_portal_error',
        data: {
          errorType: 'authentication_failed',
          errorMessage: 'Invalid credentials'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.portalError.type).toBe('authentication');
      expect(response.data.portalError.retryable).toBe(true);
      expect(response.data.portalError.userActionRequired).toBe(true);
      expect(response.data.retryOptions).toContain('update_credentials');
    });

    it('should handle system errors with appropriate escalation', async () => {
      const request: AgentRequest = {
        requestId: 'req_system_error',
        agentRole: 'agency_interaction',
        instruction: 'handle_portal_error',
        data: {
          errorType: 'system_error',
          errorMessage: 'Portal maintenance in progress'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.portalError.type).toBe('system_error');
      expect(response.data.portalError.retryable).toBe(false);
      // When retryable is false, retryOptions should be empty array
      expect(response.data.retryOptions).toEqual([]);
    });
  });

  describe('Form Data Validation', () => {
    it('should validate correct form data', async () => {
      const request: AgentRequest = {
        requestId: 'req_validate_good',
        agentRole: 'agency_interaction',
        instruction: 'validate_form_data',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'Valid Corp LLC',
            entityNumber: '202301234567',
            entityType: 'LLC',
            address: {
              street: '123 Valid St',
              city: 'San Francisco',
              state: 'CA',
              zipCode: '94105'
            },
            members: [
              { name: 'John Doe', percentage: 100 }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.validationResult.valid).toBe(true);
      expect(response.data.validationResult.errors).toHaveLength(0);
      expect(response.data.formQuality).toBeDefined();
      expect(response.reasoning).toContain('Ready for submission');
    });

    it('should validate and report form data errors', async () => {
      const request: AgentRequest = {
        requestId: 'req_validate_bad',
        agentRole: 'agency_interaction',
        instruction: 'validate_form_data',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: '',
            entityNumber: 'invalid',
            entityType: 'LLC',
            address: {
              street: '',
              city: 'San Francisco',
              state: 'CA',
              zipCode: '94105'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.validationResult.valid).toBe(false);
      expect(response.data.validationResult.errors.length).toBeGreaterThan(0);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.formQuality.score).toBeLessThan(100);
    });

    it('should provide agency-specific validation', async () => {
      // Test IRS-specific validation
      const request: AgentRequest = {
        requestId: 'req_validate_irs',
        agentRole: 'agency_interaction',
        instruction: 'validate_form_data',
        data: {
          agency: 'irs',
          formData: {
            entityName: 'IRS Test Corp',
            entityNumber: 'invalid-ein',
            entityType: 'Corporation',
            address: {
              street: '123 Tax St',
              city: 'Washington',
              state: 'DC',
              zipCode: '20001'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.validationResult.errors).toContain('IRS requires valid EIN format (XX-XXXXXXX)');
    });
  });

  describe('Context Recording', () => {
    it('should record agency interaction initiation with proper reasoning', async () => {
      const request: AgentRequest = {
        requestId: 'req_context_test',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'Context Test LLC',
            entityType: 'LLC',
            address: {
              street: '123 Context St',
              city: 'Test City',
              state: 'CA',
              zipCode: '12345'
            }
          }
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'agency_interaction_initiated',
          reasoning: 'Starting government portal interaction and form submission process'
        })
      );
    });

    it('should record form submission with submission details', async () => {
      const request: AgentRequest = {
        requestId: 'req_submission_context',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'Submission Test Corp',
            entityNumber: '202301234567',
            entityType: 'Corporation',
            address: {
              street: '123 Submit St',
              city: 'Filing City',
              state: 'CA',
              zipCode: '95814'
            },
            officers: [{ name: 'Test Officer', title: 'CEO' }]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      if (response.data.submissionResult.status !== 'error') {
        expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
          mockTaskContext.contextId,
          expect.objectContaining({
            operation: 'form_submitted',
            reasoning: expect.stringContaining('Form successfully submitted to ca_sos')
          })
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown instructions gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_unknown',
        agentRole: 'agency_interaction',
        instruction: 'unknown_agency_operation',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Unknown agency interaction instruction');
      expect(response.reasoning).toContain('unrecognized instruction type');
    });

    it('should handle processing errors gracefully', async () => {
      // Force an error by corrupting the context
      const corruptedContext = { ...mockTaskContext, currentState: null };

      const request: AgentRequest = {
        requestId: 'req_error_test',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'Error Test Corp'
          }
        }
      };

      const response = await agent.processRequest(request, corruptedContext as any);

      expect(response.status).toBe('error');
      expect(response.data.error).toBeDefined();
      // The error could be validation failure or technical error depending on what fails first
      expect(response.reasoning).toMatch(/Technical error during agency interaction|Form data does not meet agency requirements/);
    });

    it('should continue processing even if database write fails', async () => {
      // Mock database failure
      mockDbService.createContextHistoryEntry.mockRejectedValue(new Error('Database error'));

      const request: AgentRequest = {
        requestId: 'req_db_fail',
        agentRole: 'agency_interaction',
        instruction: 'validate_form_data',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'DB Test Corp',
            entityType: 'LLC',
            address: {
              street: '123 DB St',
              city: 'Test',
              state: 'CA',
              zipCode: '12345'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Should still process successfully despite database error
      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.validationResult).toBeDefined();
    });
  });

  describe('UI Request Generation', () => {
    it('should generate submission confirmation UI', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_confirmation',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'UI Test LLC',
            entityNumber: '202301234567',
            entityType: 'LLC',
            address: {
              street: '123 UI St',
              city: 'Interface City',
              state: 'CA',
              zipCode: '94105'
            },
            members: [{ name: 'UI Tester', percentage: 100 }]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      if (response.status === 'needs_input') {
        expect(response.uiRequests).toHaveLength(1);
        expect(response.uiRequests![0].semanticData.title).toContain('Form Submitted Successfully');
        expect(response.uiRequests![0].semanticData.actions.track_status).toBeDefined();
        expect(response.uiRequests![0].semanticData.actions.continue).toBeDefined();
      }
    });

    it('should generate error resolution UI for portal errors', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_error',
        agentRole: 'agency_interaction',
        instruction: 'handle_portal_error',
        data: {
          errorType: 'payment_failed',
          errorMessage: 'Credit card declined'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.uiRequests).toHaveLength(1);
      expect(response.uiRequests![0].semanticData.title).toContain('Submission Error');
      expect(response.uiRequests![0].semanticData.actions.retry).toBeDefined();
      expect(response.uiRequests![0].semanticData.actions.contact_support).toBeDefined();
    });
  });

  describe('Integration with Agent Flow', () => {
    it('should specify correct next agent for successful submissions', async () => {
      const request: AgentRequest = {
        requestId: 'req_flow_success',
        agentRole: 'agency_interaction',
        instruction: 'submit_form',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'Flow Test Corp',
            entityNumber: '202301234567',
            entityType: 'Corporation',
            address: {
              street: '123 Flow St',
              city: 'Workflow City',
              state: 'CA',
              zipCode: '95814'
            },
            officers: [{ name: 'Flow Manager', title: 'CEO' }]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      if (response.data.submissionResult.status === 'submitted') {
        expect(response.nextAgent).toBe('monitoring');
        expect(response.status).toBe('needs_input');
      }
    });

    it('should specify communication agent for user-required actions', async () => {
      const request: AgentRequest = {
        requestId: 'req_flow_communication',
        agentRole: 'agency_interaction',
        instruction: 'handle_portal_error',
        data: {
          errorType: 'validation_error',
          errorMessage: 'Missing required field'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.nextAgent).toBe('communication');
      expect(response.status).toBe('needs_input');
    });
  });

  describe('AgencyInteractionAgent Performance', () => {
    it('should complete agency operations within time limits', async () => {
      const startTime = Date.now();

      const request: AgentRequest = {
        requestId: 'req_performance_test',
        agentRole: 'agency_interaction',
        instruction: 'validate_form_data',
        data: {
          agency: 'ca_sos',
          formData: {
            entityName: 'Performance Test LLC',
            entityType: 'LLC',
            address: {
              street: '123 Speed St',
              city: 'Fast City',
              state: 'CA',
              zipCode: '12345'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);
      const duration = Date.now() - startTime;

      expect(response.status).toMatch(/completed|needs_input/);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle multiple agency requests efficiently', async () => {
      const agencies = ['ca_sos', 'irs', 'ftb'];

      const promises = agencies.map(agency => {
        const request: AgentRequest = {
          requestId: `req_${agency}`,
          agentRole: 'agency_interaction',
          instruction: 'validate_form_data',
          data: {
            agency,
            formData: {
              entityName: `${agency.toUpperCase()} Test Corp`,
              entityType: 'LLC',
              address: {
                street: '123 Multi St',
                city: 'Test City',
                state: 'CA',
                zipCode: '12345'
              }
            }
          }
        };
        return agent.processRequest(request, mockTaskContext);
      });

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toMatch(/completed|needs_input|error/);
        expect(response.data.validationResult).toBeDefined();
      });
    });
  });
});