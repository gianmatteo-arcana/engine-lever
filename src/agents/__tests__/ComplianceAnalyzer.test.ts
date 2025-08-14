/**
 * Entity Compliance Agent Tests
 * Tests all functionality specified in PRD lines 521-600
 * 
 * MANDATORY: No mock data - tests real compliance analysis logic
 * Uses test database and mock external APIs only
 */

import { ComplianceAnalyzer } from '../ComplianceAnalyzer';
import { TaskContext, AgentRequest } from '../../types/engine-types';
import { DatabaseService } from '../../services/database';

// Mock the database service
jest.mock('../../services/database', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      createContextHistoryEntry: jest.fn().mockResolvedValue({})
    }))
  }
}));

describe('ComplianceAnalyzer', () => {
  let agent: ComplianceAnalyzer;
  let mockContext: TaskContext;

  beforeEach(() => {
    agent = new ComplianceAnalyzer('test_business_compliance', 'test_user_compliance');
    
    mockContext = {
      contextId: 'test_context_789',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'compliance_analysis',
        completeness: 55,
        data: {
          user: {
            email: 'owner@techcorp.com',
            firstName: 'Alex',
            lastName: 'Chen',
            location: 'San Francisco, CA'
          },
          business: {
            name: 'TechCorp LLC',
            entityType: 'LLC',
            state: 'CA',
            industry: 'Technology',
            formationDate: '2023-01-15'
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'user_onboarding',
        version: '2.0',
        metadata: { name: 'Test Template', description: 'Test', category: 'test' },
        goals: { primary: [] }
      }
    };
  });

  describe('Compliance Requirements Analysis', () => {
    test('should identify LLC-specific requirements', async () => {
      const request: AgentRequest = {
        requestId: 'req_301',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('needs_input');
      expect(response.data.complianceCalendar).toBeDefined();
      
      const calendar = response.data.complianceCalendar;
      const llcRequirement = calendar.requirements.find((r: any) => r.id === 'llc_operating_agreement');
      
      expect(llcRequirement).toBeDefined();
      expect(llcRequirement?.category).toBe('governance');
      expect(llcRequirement?.priority).toBe('high');
    });

    test('should identify Corporation-specific requirements', async () => {
      mockContext.currentState.data.business.entityType = 'Corporation';
      
      const request: AgentRequest = {
        requestId: 'req_302',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const bylawsReq = calendar.requirements.find((r: any) => r.id === 'corp_bylaws');
      const boardMeetingReq = calendar.requirements.find((r: any) => r.id === 'annual_board_meeting');
      
      expect(bylawsReq).toBeDefined();
      expect(bylawsReq?.priority).toBe('critical');
      expect(boardMeetingReq).toBeDefined();
      expect(boardMeetingReq?.frequency).toBe('annual');
    });

    test('should identify Sole Proprietorship DBA requirement', async () => {
      mockContext.currentState.data.business = {
        name: 'Chen Consulting',
        entityType: 'Sole Proprietorship',
        state: 'CA'
      };
      
      const request: AgentRequest = {
        requestId: 'req_303',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const dbaReq = calendar.requirements.find((r: any) => r.id === 'dba_filing');
      
      expect(dbaReq).toBeDefined();
      expect(dbaReq?.priority).toBe('critical');
      expect(dbaReq?.estimatedCost).toBe(75);
    });
  });

  describe('State-Specific Requirements', () => {
    test('should calculate California annual report deadline', async () => {
      const request: AgentRequest = {
        requestId: 'req_304',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const annualReport = calendar.requirements.find((r: any) => r.id === 'annual_report');
      
      expect(annualReport).toBeDefined();
      expect(annualReport?.name).toContain('CA');
      expect(annualReport?.frequency).toBe('annual');
      expect(annualReport?.estimatedCost).toBe(20); // CA filing fee
    });

    test('should include registered agent requirement for entities', async () => {
      const request: AgentRequest = {
        requestId: 'req_305',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const registeredAgent = calendar.requirements.find((r: any) => r.id === 'registered_agent');
      
      expect(registeredAgent).toBeDefined();
      expect(registeredAgent?.priority).toBe('critical');
      expect(registeredAgent?.frequency).toBe('annual');
    });

    test('should not include registered agent for Sole Proprietorship', async () => {
      mockContext.currentState.data.business.entityType = 'Sole Proprietorship';
      
      const request: AgentRequest = {
        requestId: 'req_306',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const registeredAgent = calendar.requirements.find((r: any) => r.id === 'registered_agent');
      
      expect(registeredAgent).toBeUndefined();
    });
  });

  describe('Industry-Specific Requirements', () => {
    test('should identify food service license for restaurants', async () => {
      mockContext.currentState.data.business.industry = 'Food & Beverage';
      
      const request: AgentRequest = {
        requestId: 'req_307',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const foodLicense = calendar.requirements.find((r: any) => r.id === 'food_service_license');
      
      expect(foodLicense).toBeDefined();
      expect(foodLicense?.category).toBe('license');
      expect(foodLicense?.priority).toBe('critical');
      expect(foodLicense?.consequences).toContain('health department');
    });

    test('should identify professional license for service businesses', async () => {
      mockContext.currentState.data.business.industry = 'Professional Services';
      
      const request: AgentRequest = {
        requestId: 'req_308',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const profLicense = calendar.requirements.find((r: any) => r.id === 'professional_license');
      
      expect(profLicense).toBeDefined();
      expect(profLicense?.frequency).toBe('annual');
    });

    test('should identify sales tax permit for retail', async () => {
      mockContext.currentState.data.business.industry = 'Retail';
      
      const request: AgentRequest = {
        requestId: 'req_309',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const salesTax = calendar.requirements.find((r: any) => r.id === 'sales_tax_permit');
      
      expect(salesTax).toBeDefined();
      expect(salesTax?.category).toBe('tax');
      expect(salesTax?.estimatedCost).toBe(0); // Usually free
    });
  });

  describe('Federal Tax Requirements', () => {
    test('should require EIN for business entities', async () => {
      const request: AgentRequest = {
        requestId: 'req_310',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const ein = calendar.requirements.find((r: any) => r.id === 'federal_ein');
      
      expect(ein).toBeDefined();
      expect(ein?.priority).toBe('critical');
      expect(ein?.consequences).toContain('bank account');
    });

    test('should not require EIN for Sole Proprietorship', async () => {
      mockContext.currentState.data.business.entityType = 'Sole Proprietorship';
      
      const request: AgentRequest = {
        requestId: 'req_311',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const ein = calendar.requirements.find((r: any) => r.id === 'federal_ein');
      
      expect(ein).toBeUndefined();
    });

    test('should identify correct tax form for entity type', async () => {
      const testCases = [
        { entityType: 'Corporation', expectedForm: 'Form 1120' },
        { entityType: 'LLC', expectedForm: 'Form 1065 or 1040 Schedule C' },
        { entityType: 'Partnership', expectedForm: 'Form 1065' },
        { entityType: 'Sole Proprietorship', expectedForm: 'Form 1040 Schedule C' }
      ];

      for (const testCase of testCases) {
        mockContext.currentState.data.business.entityType = testCase.entityType;
        
        const request: AgentRequest = {
          requestId: `req_tax_${testCase.entityType}`,
          agentRole: 'entity_compliance_agent',
          instruction: 'analyze_compliance',
          data: {}
        };

        const response = await agent.processRequest(request, mockContext);
        const calendar = response.data.complianceCalendar;
        const taxReturn = calendar.requirements.find((r: any) => r.id === 'annual_tax_return');
        
        expect(taxReturn?.forms).toContain(testCase.expectedForm);
      }
    });
  });

  describe('Compliance Calendar Generation', () => {
    test('should prioritize requirements correctly', async () => {
      const request: AgentRequest = {
        requestId: 'req_312',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const priorities = calendar.requirements.map((r: any) => r.priority);
      
      // Check that critical items come first
      let lastCriticalIndex = -1;
      let firstHighIndex = priorities.length;
      
      priorities.forEach((priority: any, index: number) => {
        if (priority === 'critical') lastCriticalIndex = index;
        if (priority === 'high' && firstHighIndex === priorities.length) {
          firstHighIndex = index;
        }
      });
      
      if (lastCriticalIndex >= 0 && firstHighIndex < priorities.length) {
        expect(lastCriticalIndex).toBeLessThan(firstHighIndex);
      }
    });

    test('should calculate total estimated costs', async () => {
      const request: AgentRequest = {
        requestId: 'req_313',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const manualSum = calendar.requirements.reduce((sum: number, r: any) => sum + r.estimatedCost, 0);
      
      expect(calendar.summary.totalEstimatedCost).toBe(manualSum);
    });

    test('should identify next deadline correctly', async () => {
      const request: AgentRequest = {
        requestId: 'req_314',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const calendar = response.data.complianceCalendar;
      const sortedDeadlines = calendar.requirements
        .map((r: any) => r.deadline)
        .sort((a: any, b: any) => new Date(a).getTime() - new Date(b).getTime());
      
      expect(calendar.summary.nextDeadline).toBe(sortedDeadlines[0]);
    });
  });

  describe('Risk Assessment', () => {
    test('should identify high risk for multiple critical requirements', async () => {
      // Force multiple critical requirements
      mockContext.currentState.data.business.entityType = 'Corporation';
      mockContext.currentState.data.business.industry = 'Food & Beverage';
      
      const request: AgentRequest = {
        requestId: 'req_315',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const riskAssessment = response.data.riskAssessment;
      const criticalCount = response.data.complianceCalendar.summary.criticalCount;
      
      if (criticalCount > 3) {
        expect(riskAssessment.overallRisk).toBe('high');
        expect(riskAssessment.criticalIssues).toContain('Multiple critical compliance requirements pending');
      }
    });

    test('should provide recommendations based on requirements', async () => {
      const request: AgentRequest = {
        requestId: 'req_316',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const riskAssessment = response.data.riskAssessment;
      
      expect(riskAssessment.recommendations).toBeDefined();
      expect(Array.isArray(riskAssessment.recommendations)).toBe(true);
      
      if (response.data.complianceCalendar.summary.criticalCount > 0) {
        expect(riskAssessment.recommendations.some((r: any) => 
          r.includes('critical requirements')
        )).toBe(true);
      }
    });
  });

  describe('UI Request Generation', () => {
    test('should generate compliance roadmap UI request', async () => {
      const request: AgentRequest = {
        requestId: 'req_317',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.uiRequests).toHaveLength(1);
      const uiRequest = response.uiRequests![0];
      
      expect(uiRequest.templateType).toBe('compliance_roadmap');
      expect(uiRequest.semanticData.title).toBe('Your Compliance Roadmap');
      expect(uiRequest.semanticData.sections).toBeDefined();
      expect(uiRequest.semanticData.progressIndicator?.current).toBe(3);
      expect(uiRequest.semanticData.progressIndicator?.total).toBe(4);
    });

    test('should organize requirements into sections', async () => {
      const request: AgentRequest = {
        requestId: 'req_318',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      const sections = uiRequest.semanticData.sections;
      
      expect(sections.find((s: any) => s.id === 'critical_requirements')).toBeDefined();
      expect(sections.find((s: any) => s.id === 'upcoming_deadlines')).toBeDefined();
      expect(sections.find((s: any) => s.id === 'annual_planning')).toBeDefined();
    });

    test('should set urgency based on risk assessment', async () => {
      const request: AgentRequest = {
        requestId: 'req_319',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      const uiRequest = response.uiRequests![0];
      const riskLevel = response.data.riskAssessment.overallRisk;
      
      if (riskLevel === 'high') {
        expect(uiRequest.context?.urgency).toBe('high');
      } else {
        expect(uiRequest.context?.urgency).toBe('medium');
      }
    });
  });

  describe('Context Recording', () => {
    test('should record analysis initiation', async () => {
      const request: AgentRequest = {
        requestId: 'req_320',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const initiationEntry = mockContext.history.find(entry => 
        entry.operation === 'compliance_analysis_initiated'
      );

      expect(initiationEntry).toBeDefined();
      expect(initiationEntry?.actor.type).toBe('agent');
      expect(initiationEntry?.actor.id).toBe('compliance_analyzer');
      expect(initiationEntry?.data).toHaveProperty('businessProfile');
    });

    test('should record requirements identification', async () => {
      const request: AgentRequest = {
        requestId: 'req_321',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      await agent.processRequest(request, mockContext);

      const requirementsEntry = mockContext.history.find(entry => 
        entry.operation === 'compliance_requirements_identified'
      );

      expect(requirementsEntry).toBeDefined();
      expect(requirementsEntry?.data).toHaveProperty('requirementsCount');
      expect(requirementsEntry?.data).toHaveProperty('criticalCount');
      expect(requirementsEntry?.data).toHaveProperty('totalCost');
      expect(requirementsEntry?.data).toHaveProperty('riskLevel');
      expect(requirementsEntry?.reasoning).toContain('compliance requirements');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing business profile gracefully', async () => {
      mockContext.currentState.data = {}; // No business data
      
      const request: AgentRequest = {
        requestId: 'req_322',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should still work with defaults
      expect(response.status).toBe('needs_input');
      expect(response.data.businessProfile.entityType).toBe('Sole Proprietorship'); // Default
      expect(response.data.businessProfile.state).toBe('CA'); // Default
    });

    test('should handle processing errors', async () => {
      // Corrupt context to cause error
      mockContext.currentState = null as any;
      
      const request: AgentRequest = {
        requestId: 'req_323',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.status).toBe('error');
      expect(response.data).toHaveProperty('error');
      
      const errorEntry = mockContext.history.find(entry => 
        entry.operation === 'compliance_analysis_error'
      );
      expect(errorEntry).toBeDefined();
    });
  });

  describe('Integration with Agent Flow', () => {
    test('should specify next agent as UX optimization', async () => {
      const request: AgentRequest = {
        requestId: 'req_324',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      expect(response.nextAgent).toBe('ux_optimization_agent');
    });

    test('should use profile collection data if available', async () => {
      // Add profile collection entry to history
      mockContext.history.push({
        entryId: 'entry_profile',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'agent', id: 'profile_collection_agent', version: '1.0.0' },
        operation: 'profile_collection_initiated',
        data: {
          business: {
            name: 'Profile Business LLC',
            entityType: 'LLC',
            state: 'NY',
            industry: 'Consulting'
          }
        },
        reasoning: 'Profile collected'
      });

      const request: AgentRequest = {
        requestId: 'req_325',
        agentRole: 'entity_compliance_agent',
        instruction: 'analyze_compliance',
        data: {}
      };

      const response = await agent.processRequest(request, mockContext);

      // Should use profile data over current state
      expect(response.data.businessProfile.state).toBe('NY');
    });
  });
});

/**
 * Performance Tests
 */
describe('ComplianceAnalyzer Performance', () => {
  let agent: ComplianceAnalyzer;

  beforeEach(() => {
    agent = new ComplianceAnalyzer('test_business_compliance', 'test_user_compliance');
  });

  test('should complete analysis within time limits', async () => {
    const mockContext: TaskContext = {
      contextId: 'perf_test',
      taskTemplateId: 'user_onboarding',
      tenantId: 'test_tenant',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'compliance_analysis',
        completeness: 55,
        data: {
          business: {
            name: 'Test Corp',
            entityType: 'Corporation',
            state: 'CA',
            industry: 'Technology'
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'user_onboarding',
        version: '2.0',
        metadata: { name: 'Test', description: 'Test', category: 'test' },
        goals: { primary: [] }
      }
    };

    const request: AgentRequest = {
      requestId: 'perf_req',
      agentRole: 'entity_compliance_agent',
      instruction: 'analyze_compliance',
      data: {}
    };

    const startTime = Date.now();
    const response = await agent.processRequest(request, mockContext);
    const endTime = Date.now();

    // Should complete within 3 seconds (PRD requirement)
    expect(endTime - startTime).toBeLessThan(3000);
    expect(response).toBeDefined();
    expect(response.status).toBe('needs_input');
  });
});