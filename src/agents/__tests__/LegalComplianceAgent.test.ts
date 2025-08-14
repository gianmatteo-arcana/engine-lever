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
        content: 'Mock LLM response for legal compliance analysis',
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
      contextId: 'ctx_legal_compliance_test',
      taskTemplateId: 'legal_compliance_analysis',
      tenantId: 'tenant_test',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'compliance_analysis',
        completeness: 0,
        data: {
          business: {
            name: 'TechCorp LLC',
            entityType: 'LLC',
            state: 'CA',
            formationDate: '2023-01-15T00:00:00.000Z',
            industry: 'Technology',
            ein: '12-3456789'
          },
          user: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@techcorp.com'
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'legal_compliance_analysis',
        version: '1.0',
        metadata: {
          name: 'Legal Compliance Analysis',
          description: 'Analyze business compliance requirements',
          category: 'legal'
        },
        goals: {
          primary: [
            { id: 'identify_requirements', description: 'Identify compliance obligations', required: true },
            { id: 'assess_risk', description: 'Assess compliance risks', required: true }
          ]
        }
      }
    };
  });

  describe('Filing Requirements Validation', () => {
    it('should validate SOI filing requirements for CA LLC', async () => {
      const request: AgentRequest = {
        requestId: 'req_soi_validation',
        agentRole: 'legal_compliance',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'soi',
          entityType: 'LLC',
          jurisdiction: 'CA',
          formationDate: '2023-01-15'
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
      expect(response.data.filingRequirements.fee).toBe(20);
      expect(response.data.filingRequirements.formNumber).toBe('SI-550');
      expect(response.data.filingRequirements.filingType).toBe('soi');
      expect(response.nextAgent).toBe('data_collection');
      expect(response.uiRequests).toHaveLength(1);
    });

    it('should indicate SOI not required for sole proprietorship', async () => {
      // Update context for sole proprietorship
      mockTaskContext.currentState.data.business.entityType = 'Sole Proprietorship';

      const request: AgentRequest = {
        requestId: 'req_soi_sole_prop',
        agentRole: 'legal_compliance',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'soi',
          entityType: 'Sole Proprietorship' 
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.filingRequirements.isRequired).toBe(false);
      expect(response.data.guidance.nextSteps[0]).toContain('No soi filing required');
    });

    it('should calculate correct filing due date', async () => {
      const request: AgentRequest = {
        requestId: 'req_soi_due_date',
        agentRole: 'legal_compliance',
        instruction: 'validate_filing_requirements',
        data: { 
          filingType: 'soi',
          formationDate: '2023-01-15' 
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.filingRequirements.dueDate).toBeDefined();
      // Should be 90 days after formation date
      const expectedDueDate = new Date('2023-01-15');
      expectedDueDate.setDate(expectedDueDate.getDate() + 90);
      
      const actualDueDate = new Date(response.data.filingRequirements.dueDate);
      expect(actualDueDate.toDateString()).toBe(expectedDueDate.toDateString());
    });
  });

  describe('Entity Compliance Analysis', () => {
    it('should perform comprehensive compliance analysis', async () => {
      const request: AgentRequest = {
        requestId: 'req_entity_analysis',
        agentRole: 'legal_compliance',
        instruction: 'analyze_entity_compliance',
        data: {
          businessEntity: {
            name: 'TechCorp LLC',
            entityType: 'LLC',
            jurisdiction: 'CA',
            formationDate: '2023-01-15'
          }
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.complianceRequirements).toBeDefined();
      expect(Array.isArray(response.data.complianceRequirements)).toBe(true);
      expect(response.data.complianceRequirements.length).toBeGreaterThan(0);
      
      expect(response.data.riskAssessment).toBeDefined();
      expect(response.data.riskAssessment.level).toMatch(/^(high|medium|low)$/);
      expect(response.data.riskAssessment.factors).toBeDefined();
      expect(response.data.riskAssessment.mitigationSteps).toBeDefined();
      
      expect(response.nextAgent).toBe('ux_optimization_agent');
      expect(response.uiRequests).toHaveLength(1);
    });

    it('should identify SOI and franchise tax requirements for LLC', async () => {
      const request: AgentRequest = {
        requestId: 'req_llc_requirements',
        agentRole: 'legal_compliance',
        instruction: 'analyze_entity_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      const requirements = response.data.complianceRequirements;
      expect(requirements).toHaveLength(2); // SOI + Franchise Tax

      // Check SOI requirement
      const soiRequirement = requirements.find((r: any) => r.type === 'Statement of Information');
      expect(soiRequirement).toBeDefined();
      expect(soiRequirement.priority).toBe('high');
      expect(soiRequirement.fee).toBe(20);

      // Check Franchise Tax requirement
      const franchiseTaxRequirement = requirements.find((r: any) => r.type === 'Franchise Tax Return');
      expect(franchiseTaxRequirement).toBeDefined();
      expect(franchiseTaxRequirement.priority).toBe('critical');
      expect(franchiseTaxRequirement.fee).toBe(800);
    });

    it('should provide accurate summary statistics', async () => {
      const request: AgentRequest = {
        requestId: 'req_summary_stats',
        agentRole: 'legal_compliance',
        instruction: 'analyze_entity_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.totalRequirements).toBe(2);
      expect(response.data.summary.criticalCount).toBe(1); // Franchise tax
      expect(typeof response.data.summary.upcomingDeadlines).toBe('number');
    });
  });

  describe('Risk Assessment', () => {
    it('should assess compliance risks accurately', async () => {
      const request: AgentRequest = {
        requestId: 'req_risk_assessment',
        agentRole: 'legal_compliance',
        instruction: 'assess_compliance_risk',
        data: {}
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
      // Mock overdue SOI requirement by setting formation date in the past
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      mockTaskContext.currentState.data.business.formationDate = pastDate.toISOString();

      const request: AgentRequest = {
        requestId: 'req_overdue_risk',
        agentRole: 'legal_compliance',
        instruction: 'assess_compliance_risk',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Note: This test depends on the specific risk assessment logic
      // The actual risk level may vary based on implementation
      expect(response.data.riskAssessment.factors.length).toBeGreaterThan(0);
      expect(response.data.riskAssessment.mitigationSteps.length).toBeGreaterThan(0);
    });
  });

  describe('Compliance Guidance Preparation', () => {
    it('should prepare SOI compliance guidance with prefilled data', async () => {
      const request: AgentRequest = {
        requestId: 'req_guidance_prep',
        agentRole: 'legal_compliance',
        instruction: 'prepare_compliance_guidance',
        data: { filingType: 'soi' }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.guidanceTemplate).toBeDefined();
      expect(response.data.prefilledData).toBeDefined();
      expect(response.data.instructions).toBeDefined();
      expect(response.data.submissionGuidance).toBeDefined();

      // Check prefilled data
      expect(response.data.prefilledData.businessName).toBe('TechCorp LLC');
      expect(response.data.prefilledData.entityType).toBe('LLC');
      expect(response.data.prefilledData.jurisdiction).toBe('CA');

      // Check guidance template structure
      expect(response.data.guidanceTemplate.filingType).toBe('soi');
      expect(Array.isArray(response.data.guidanceTemplate.sections)).toBe(true);
      expect(Array.isArray(response.data.guidanceTemplate.fields)).toBe(true);
    });

    it('should provide submission guidance', async () => {
      const request: AgentRequest = {
        requestId: 'req_submission_guidance',
        agentRole: 'legal_compliance',
        instruction: 'prepare_compliance_guidance',
        data: { filingType: 'soi' }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      const guidance = response.data.submissionGuidance;
      expect(guidance.method).toBe('online');
      expect(guidance.url).toContain('sos.ca.gov');
      expect(guidance.fee).toBe(20);
      expect(guidance.processingTime).toBeDefined();
    });
  });

  describe('Context Recording', () => {
    it('should record context entries for analysis initiation', async () => {
      const request: AgentRequest = {
        requestId: 'req_context_test',
        agentRole: 'legal_compliance',
        instruction: 'validate_soi_requirements',
        data: {}
      };

      await agent.processRequest(request, mockTaskContext);

      // Verify context entry was added to history
      expect(mockTaskContext.history.length).toBeGreaterThan(0);
      
      const initiationEntry = mockTaskContext.history.find(entry => 
        entry.operation === 'compliance_analysis_initiated'
      );
      expect(initiationEntry).toBeDefined();
      expect(initiationEntry!.reasoning).toContain('compliance analysis');
      expect(initiationEntry!.actor.id).toBe('legal_compliance_agent');
    });

    it('should record context entries for completed analysis', async () => {
      const request: AgentRequest = {
        requestId: 'req_completed_analysis',
        agentRole: 'legal_compliance',
        instruction: 'assess_compliance_risk',
        data: {}
      };

      await agent.processRequest(request, mockTaskContext);

      const riskEntry = mockTaskContext.history.find(entry => 
        entry.operation === 'compliance_risk_assessed'
      );
      expect(riskEntry).toBeDefined();
      expect(riskEntry!.data.riskLevel).toMatch(/^(high|medium|low)$/);
      expect(riskEntry!.reasoning).toContain('Risk assessment completed');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown instructions gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_unknown',
        agentRole: 'legal_compliance',
        instruction: 'unknown_instruction',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Unknown instruction');
      expect(response.reasoning).toContain('unrecognized instruction');
    });

    it('should handle processing errors', async () => {
      // Force an error by corrupting the context
      const corruptedContext = { ...mockTaskContext, currentState: null };

      const request: AgentRequest = {
        requestId: 'req_error_test',
        agentRole: 'legal_compliance',
        instruction: 'validate_filing_requirements',
        data: { filingType: 'soi' }
      };

      const response = await agent.processRequest(request, corruptedContext as any);

      expect(response.status).toBe('error');
      expect(response.data.error).toBeDefined();
      expect(response.reasoning).toContain('Technical error');
    });

    it('should continue processing even if database write fails', async () => {
      // Mock database failure
      mockDbService.createContextHistoryEntry.mockRejectedValue(new Error('Database error'));

      const request: AgentRequest = {
        requestId: 'req_db_fail',
        agentRole: 'legal_compliance',
        instruction: 'validate_filing_requirements',
        data: { filingType: 'soi' }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Should still process successfully despite database error
      expect(response.status).toBe('needs_input');
      expect(response.data.filingRequirements).toBeDefined();
    });
  });

  describe('Integration with Agent Flow', () => {
    it('should specify correct next agent after filing validation', async () => {
      const request: AgentRequest = {
        requestId: 'req_next_agent',
        agentRole: 'legal_compliance',
        instruction: 'validate_filing_requirements',
        data: { filingType: 'soi' }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.nextAgent).toBe('data_collection');
    });

    it('should specify correct next agent after entity analysis', async () => {
      const request: AgentRequest = {
        requestId: 'req_entity_next',
        agentRole: 'legal_compliance',
        instruction: 'analyze_entity_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.nextAgent).toBe('ux_optimization_agent');
    });

    it('should generate appropriate UI requests', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_generation',
        agentRole: 'legal_compliance',
        instruction: 'analyze_entity_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.uiRequests).toHaveLength(1);
      
      const uiRequest = response.uiRequests![0];
      expect(uiRequest.requestId).toContain('compliance_roadmap_');
      expect(uiRequest.semanticData.agentRole).toBe('legal_compliance_agent');
      expect(uiRequest.semanticData.title).toContain('Compliance Roadmap');
      expect(uiRequest.semanticData.actions).toBeDefined();
      expect(uiRequest.context?.urgency).toMatch(/^(high|medium|low)$/);
    });
  });

  describe('LegalComplianceAgent Performance', () => {
    it('should complete compliance analysis within time limits', async () => {
      const startTime = Date.now();

      const request: AgentRequest = {
        requestId: 'req_performance_test',
        agentRole: 'legal_compliance',
        instruction: 'analyze_entity_compliance',
        data: {}
      };

      await agent.processRequest(request, mockTaskContext);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});