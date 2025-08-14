/**
 * Legal Compliance Agent Tests
 * Comprehensive test suite for the consolidated BaseAgent implementation
 */

import { LegalComplianceAgent } from '../LegalComplianceAgent';
import { TaskContext, AgentRequest } from '../../types/engine-types';
import { DatabaseService } from '../../services/database';

// Mock external dependencies
jest.mock('../../services/database');
jest.mock('../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response for legal analysis',
        model: 'mock-model',
        usage: { promptTokens: 150, completionTokens: 75, totalTokens: 225 }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));

describe('LegalComplianceAgent', () => {
  let agent: LegalComplianceAgent;
  let mockTaskContext: TaskContext;
  let mockDbService: any;

  beforeEach(() => {
    // Initialize agent
    agent = new LegalComplianceAgent('test_business_123', 'test_user_123');
    
    // Setup mock database service
    mockDbService = {
      createContextHistoryEntry: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      upsertAgentContext: jest.fn().mockResolvedValue({}),
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);

    // Setup mock task context
    mockTaskContext = {
      contextId: 'ctx_legal_analysis_test',
      taskTemplateId: 'regulatory_analysis',
      tenantId: 'tenant_test',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'regulatory_analysis',
        completeness: 0,
        data: {
          business: {
            name: 'TestEntity',
            entityType: 'Entity',
            state: 'TestState',
            formationDate: '2023-01-15T00:00:00.000Z',
            industry: 'Technology',
            ein: '12-3456789'
          },
          user: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@testentity.com'
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'regulatory_analysis',
        version: '1.0',
        metadata: {
          name: 'Regulatory Analysis',
          description: 'Analyze entity regulatory requirements',
          category: 'legal'
        },
        goals: {
          primary: [
            { id: 'identify_requirements', description: 'Identify regulatory obligations', required: true },
            { id: 'assess_risk', description: 'Assess regulatory risks', required: true }
          ]
        }
      }
    };
  });

  describe('Filing Requirements Validation', () => {
    it('should validate filing requirements with template data', async () => {
      const request: AgentRequest = {
        requestId: 'req_filing_validation',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'annual_report',
          requirements: {
            required: true,
            fee: 50,
            period: 'Annual',
            documents: ['Entity information', 'Financial summary'],
            formId: 'AR-100'
          }
        },
        context: {
          userProgress: 0,
          deviceType: 'desktop',
          urgency: 'medium'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.filingRequirements).toBeDefined();
      expect(response.data.filingRequirements.isRequired).toBe(true);
      expect(response.data.filingRequirements.fee).toBe(50);
      expect(response.data.filingRequirements.formIdentifier).toBe('AR-100');
      expect(response.data.filingRequirements.filingType).toBe('annual_report');
      expect(response.nextAgent).toBe('data_collection');
      expect(response.uiRequests).toHaveLength(1);
    });

    it('should indicate filing not required when template specifies', async () => {
      const request: AgentRequest = {
        requestId: 'req_filing_not_required',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'optional_filing',
          requirements: {
            required: false
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.filingRequirements.isRequired).toBe(false);
      expect(response.data.guidance.nextSteps[0]).toContain('No optional_filing filing required');
    });

    it('should calculate correct filing due date from template data', async () => {
      const request: AgentRequest = {
        requestId: 'req_due_date',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'quarterly_report',
          requirements: {
            daysFromNow: 30
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.filingRequirements.dueDate).toBeDefined();
      // Should be 30 days from now
      const expectedDueDate = new Date();
      expectedDueDate.setDate(expectedDueDate.getDate() + 30);
      
      const actualDueDate = new Date(response.data.filingRequirements.dueDate);
      expect(actualDueDate.toDateString()).toBe(expectedDueDate.toDateString());
    });
  });

  describe('Entity Requirements Analysis', () => {
    it('should perform comprehensive regulatory analysis', async () => {
      const request: AgentRequest = {
        requestId: 'req_entity_analysis',
        agentRole: 'legal_analysis',
        instruction: 'analyze_entity_requirements',
        data: {
          scope: {
            requirements: [
              {
                type: 'Annual Filing',
                deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'upcoming',
                priority: 'high',
                fee: 100,
                description: 'Annual regulatory filing'
              },
              {
                type: 'Quarterly Report',
                deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'due',
                priority: 'medium',
                fee: 25,
                description: 'Quarterly activity report'
              }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.requirements).toBeDefined();
      expect(Array.isArray(response.data.requirements)).toBe(true);
      expect(response.data.requirements.length).toBe(2);
      
      expect(response.data.riskAssessment).toBeDefined();
      expect(response.data.riskAssessment.level).toMatch(/^(high|medium|low)$/);
      expect(response.data.riskAssessment.factors).toBeDefined();
      expect(response.data.riskAssessment.mitigationSteps).toBeDefined();
      
      expect(response.nextAgent).toBe('ux_optimization_agent');
      expect(response.uiRequests).toHaveLength(1);
    });

    it('should identify requirements from template scope', async () => {
      const request: AgentRequest = {
        requestId: 'req_template_requirements',
        agentRole: 'legal_analysis',
        instruction: 'analyze_entity_requirements',
        data: {
          scope: {
            requirements: [
              { type: 'Registration Renewal', priority: 'high', fee: 50 },
              { type: 'Tax Filing', priority: 'critical', fee: 800 }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      const requirements = response.data.requirements;
      expect(requirements).toHaveLength(2);

      // Check first requirement
      const renewalRequirement = requirements.find((r: any) => r.type === 'Registration Renewal');
      expect(renewalRequirement).toBeDefined();
      expect(renewalRequirement.priority).toBe('high');
      expect(renewalRequirement.fee).toBe(50);

      // Check second requirement
      const taxRequirement = requirements.find((r: any) => r.type === 'Tax Filing');
      expect(taxRequirement).toBeDefined();
      expect(taxRequirement.priority).toBe('critical');
      expect(taxRequirement.fee).toBe(800);
    });

    it('should provide accurate summary statistics', async () => {
      const request: AgentRequest = {
        requestId: 'req_summary_stats',
        agentRole: 'legal_analysis',
        instruction: 'analyze_entity_requirements',
        data: {
          scope: {
            requirements: [
              { type: 'Filing A', priority: 'critical' },
              { type: 'Filing B', priority: 'high' },
              { type: 'Filing C', priority: 'medium' }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.totalRequirements).toBe(3);
      expect(response.data.summary.criticalCount).toBe(1);
      expect(typeof response.data.summary.upcomingDeadlines).toBe('number');
    });
  });

  describe('Risk Assessment', () => {
    it('should assess regulatory risks accurately', async () => {
      const request: AgentRequest = {
        requestId: 'req_risk_assessment',
        agentRole: 'legal_analysis',
        instruction: 'assess_regulatory_risk',
        data: {
          scope: {
            requirements: [
              { type: 'Filing A', status: 'upcoming', priority: 'medium' },
              { type: 'Filing B', status: 'due', priority: 'high' }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.riskAssessment).toBeDefined();
      expect(response.data.riskAssessment.level).toMatch(/^(high|medium|low)$/);
      expect(Array.isArray(response.data.riskAssessment.factors)).toBe(true);
      expect(Array.isArray(response.data.riskAssessment.mitigationSteps)).toBe(true);
      expect(response.data.recommendations).toBeDefined();
    });

    it('should identify high risk for overdue requirements', async () => {
      const request: AgentRequest = {
        requestId: 'req_overdue_risk',
        agentRole: 'legal_analysis',
        instruction: 'assess_regulatory_risk',
        data: {
          scope: {
            requirements: [
              { type: 'Critical Filing', status: 'overdue', priority: 'critical' },
              { type: 'Important Report', status: 'overdue', priority: 'high' }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.riskAssessment.level).toBe('high');
      expect(response.data.riskAssessment.factors).toContain('Overdue regulatory obligations');
      expect(response.data.riskAssessment.mitigationSteps.length).toBeGreaterThan(0);
    });
  });

  describe('Regulatory Guidance Preparation', () => {
    it('should prepare regulatory guidance with prefilled data', async () => {
      const request: AgentRequest = {
        requestId: 'req_guidance_prep',
        agentRole: 'legal_analysis',
        instruction: 'prepare_regulatory_guidance',
        data: { 
          filingType: 'standard_report',
          templateData: {
            sections: ['Section A', 'Section B', 'Section C'],
            fields: [
              { id: 'field1', label: 'Field 1', required: true },
              { id: 'field2', label: 'Field 2', required: false }
            ],
            prefillMapping: {
              field1: 'name',
              field2: 'industry'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.guidanceTemplate).toBeDefined();
      expect(response.data.guidanceTemplate.sections).toHaveLength(3);
      expect(response.data.guidanceTemplate.fields).toHaveLength(2);
      
      expect(response.data.prefilledData).toBeDefined();
      expect(response.data.prefilledData.entityName).toBe('TestEntity');
      expect(response.data.prefilledData.field1).toBe('TestEntity'); // Mapped from name
      expect(response.data.prefilledData.field2).toBe('Technology'); // Mapped from industry
      
      expect(response.data.instructions).toBeDefined();
      expect(Array.isArray(response.data.instructions)).toBe(true);
    });

    it('should generate submission guidance from template', async () => {
      const request: AgentRequest = {
        requestId: 'req_submission_guidance',
        agentRole: 'legal_analysis',
        instruction: 'prepare_regulatory_guidance',
        data: { 
          filingType: 'electronic_filing',
          templateData: {
            submission: {
              method: 'online',
              url: 'https://example.gov/submit',
              fee: 75,
              processingTime: '2-3 business days',
              confirmationMethod: 'email'
            }
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.submissionGuidance).toBeDefined();
      expect(response.data.submissionGuidance.method).toBe('online');
      expect(response.data.submissionGuidance.url).toBe('https://example.gov/submit');
      expect(response.data.submissionGuidance.fee).toBe(75);
      expect(response.data.submissionGuidance.processingTime).toBe('2-3 business days');
    });

    it('should provide default guidance when template data not provided', async () => {
      const request: AgentRequest = {
        requestId: 'req_default_guidance',
        agentRole: 'legal_analysis',
        instruction: 'prepare_regulatory_guidance',
        data: { 
          filingType: 'generic_filing'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.instructions).toContain('Review all information for accuracy');
      expect(response.data.submissionGuidance.method).toBe('varies');
    });
  });

  describe('Context Recording', () => {
    it('should record regulatory analysis initiation with proper reasoning', async () => {
      const request: AgentRequest = {
        requestId: 'req_context_test',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'test_filing',
          requirements: { required: true }
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'regulatory_analysis_initiated',
          reasoning: 'Starting comprehensive regulatory analysis for entity and filing requirements'
        })
      );
    });

    it('should record filing validation with entity details', async () => {
      const request: AgentRequest = {
        requestId: 'req_filing_context',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'periodic_report',
          requirements: { required: true, fee: 100 }
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'filing_requirements_validated',
          data: expect.objectContaining({
            filingType: 'periodic_report',
            fee: 100
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown instructions gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_unknown',
        agentRole: 'legal_analysis',
        instruction: 'unknown_legal_operation',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Unknown instruction');
      expect(response.reasoning).toContain('unrecognized instruction type');
    });

    it('should handle processing errors gracefully', async () => {
      // Force an error by corrupting the context
      const corruptedContext = { ...mockTaskContext, currentState: null };

      const request: AgentRequest = {
        requestId: 'req_error_test',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { filingType: 'test' }
      };

      const response = await agent.processRequest(request, corruptedContext as any);

      expect(response.status).toBe('error');
      expect(response.data.error).toBeDefined();
      expect(response.reasoning).toContain('Technical error during regulatory analysis');
    });

    it('should continue processing even if database write fails', async () => {
      // Mock database failure
      mockDbService.createContextHistoryEntry.mockRejectedValue(new Error('Database error'));

      const request: AgentRequest = {
        requestId: 'req_db_fail',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'test_filing',
          requirements: { required: true }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Should still process successfully despite database error
      expect(response.status).toBe('needs_input');
      expect(response.data.filingRequirements).toBeDefined();
    });
  });

  describe('UI Request Generation', () => {
    it('should generate filing guidance UI with proper structure', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_guidance',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'ui_test_filing',
          requirements: { required: true, fee: 50 }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.uiRequests).toHaveLength(1);
      const ui = response.uiRequests![0];
      expect(ui.semanticData.agentRole).toBe('legal_analysis_agent');
      expect(ui.semanticData.title).toContain('UI_TEST_FILING Filing Requirements');
      expect(ui.semanticData.actions.proceed).toBeDefined();
      expect(ui.semanticData.actions.learn_more).toBeDefined();
    });

    it('should generate regulatory roadmap UI for entity analysis', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_roadmap',
        agentRole: 'legal_analysis',
        instruction: 'analyze_entity_requirements',
        data: {
          scope: {
            requirements: [
              { type: 'Filing A', priority: 'high', fee: 100 },
              { type: 'Filing B', priority: 'critical', fee: 200 }
            ]
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.uiRequests).toHaveLength(1);
      const ui = response.uiRequests![0];
      expect(ui.semanticData.agentRole).toBe('legal_analysis_agent');
      expect(ui.semanticData.title).toBe('Your Regulatory Roadmap');
      expect(ui.semanticData.summary.totalEstimatedFees).toBe(300);
      expect(ui.semanticData.actions.start).toBeDefined();
      expect(ui.semanticData.actions.customize).toBeDefined();
    });
  });

  describe('LegalComplianceAgent Performance', () => {
    it('should complete operations within time limits', async () => {
      const startTime = Date.now();

      const request: AgentRequest = {
        requestId: 'req_performance_test',
        agentRole: 'legal_analysis',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'performance_test',
          requirements: { required: true }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);
      const duration = Date.now() - startTime;

      expect(response.status).toBe('needs_input');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});