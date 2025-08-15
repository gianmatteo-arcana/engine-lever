/**
 * DataEnrichmentAgent Tests
 * Tests for the migrated DataEnrichmentAgent BaseAgent implementation
 */

import { DataEnrichmentAgent } from '../DataEnrichmentAgent';
import { AgentTaskContext as TaskContext } from '../../types/unified-agent-types';

// Mock the ToolChain
jest.mock('../base/UnifiedBaseAgent', () => {
  return {
    BaseAgent: class MockBaseAgent {
      protected agentId = 'test-data-enrichment-agent';
      protected toolChain = {
        executeTool: jest.fn(),
        getAvailableTools: jest.fn().mockResolvedValue([]),
        findToolsByCapability: jest.fn().mockResolvedValue([]),
        getToolInfo: jest.fn().mockResolvedValue(null),
        isToolAvailable: jest.fn().mockResolvedValue(true)
      };
      
      constructor() {}
      
      async executeTask(taskId: string, context: TaskContext, parameters: Record<string, unknown>) {
        return this.executeTaskLogic(taskId, context, parameters);
      }
      
      protected executeTaskLogic(taskId: string, context: TaskContext, parameters: Record<string, unknown>): Promise<TaskContext> {
        throw new Error('Must be implemented by subclass');
      }
    }
  };
});

describe('DataEnrichmentAgent', () => {
  let agent: DataEnrichmentAgent;
  let mockContext: TaskContext;

  beforeEach(() => {
    agent = new DataEnrichmentAgent();
    mockContext = {
      // Required engine fields
      contextId: 'test-task-123',
      taskTemplateId: 'onboarding',
      tenantId: 'tenant-123',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'data_enrichment',
        completeness: 0,
        data: {}
      },
      history: [],
      templateSnapshot: {
        id: 'template-123',
        version: '1.0.0',
        metadata: {
          name: 'Onboarding',
          description: 'Onboarding template',
          category: 'onboarding'
        },
        goals: {
          primary: [],
          secondary: []
        },
        phases: [],
        monitoring: {
          checkpoints: [],
          successCriteria: []
        }
      } as any,
      
      // Agent-specific fields
      taskId: 'test-task-123',
      taskType: 'onboarding',
      userId: 'user-456',
      userToken: 'token-789',
      status: 'active',
      currentPhase: 'data_enrichment',
      completedPhases: [],
      sharedContext: {
        user: {
          email: 'john@acmecorp.com',
          firstName: 'John',
          lastName: 'Doe'
        },
        metadata: {}
      },
      agentContexts: {},
      activeUIRequests: {},
      pendingInputRequests: [],
      auditTrail: []
    };
  });

  describe('Domain Analysis', () => {
    it('should analyze business email domain correctly', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'domainAnalysis',
        email: 'john@acmecorp.com'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState).toBeDefined();
      expect(agentState.state.domainAnalysis).toBeDefined();
      expect(agentState.state.domainAnalysis.domain).toBe('acmecorp.com');
      expect(agentState.state.domainAnalysis.isPersonalEmail).toBe(false);
      expect(agentState.state.domainAnalysis.suggestedBusinessName).toBe('Acmecorp');
      expect(agentState.findings).toHaveLength(1);
      expect(agentState.findings[0].type).toBe('domain_analysis');
    });

    it('should identify personal email domains', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'domainAnalysis',
        email: 'john@gmail.com'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.domainAnalysis.domain).toBe('gmail.com');
      expect(agentState.state.domainAnalysis.isPersonalEmail).toBe(true);
      expect(agentState.state.domainAnalysis.suggestedBusinessName).toBeNull();
      expect(agentState.state.domainAnalysis.confidence).toBe(0.9);
    });

    it('should handle missing email error', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'domainAnalysis'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState).toBeDefined();
      expect(agentState.state.error).toBe('Email is required for domain analysis');
      expect(agentState.state.lastOperation).toBe('domainAnalysis');
      expect(agentState.state.failedAt).toBeDefined();
    });
  });

  describe('Public Records Search', () => {
    beforeEach(() => {
      // Mock successful ca_sos_search tool response
      agent['toolChain'].executeTool = jest.fn().mockResolvedValue({
        success: true,
        data: {
          found: true,
          business: {
            name: 'Acme Corporation',
            entityNumber: 'C1234567',
            state: 'CA',
            status: 'Active',
            formationDate: '2020-01-15'
          }
        }
      });
    });

    it('should search public records successfully', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'publicRecordsSearch',
        businessName: 'Acme Corporation'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.publicRecordsResult).toBeDefined();
      expect(agentState.state.publicRecordsResult.found).toBe(true);
      expect(agentState.state.publicRecordsResult.business?.name).toBe('Acme Corporation');
      expect(agentState.state.publicRecordsResult.confidence).toBe(0.8);
      expect(agentState.findings).toHaveLength(1);
      expect(agentState.findings[0].type).toBe('public_records_search');
    });

    it('should handle public records not found', async () => {
      agent['toolChain'].executeTool = jest.fn().mockResolvedValue({
        success: true,
        data: { found: false }
      });

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'publicRecordsSearch',
        businessName: 'Nonexistent Corp'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.publicRecordsResult.found).toBe(false);
      expect(agentState.state.publicRecordsResult.confidence).toBe(0.8);
    });

    it('should handle missing business name error', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'publicRecordsSearch'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState).toBeDefined();
      expect(agentState.state.error).toBe('Business name is required for public records search');
      expect(agentState.state.lastOperation).toBe('publicRecordsSearch');
      expect(agentState.state.failedAt).toBeDefined();
    });
  });

  describe('Business Inference', () => {
    beforeEach(() => {
      // Set up context with domain analysis and public records
      mockContext.agentContexts![agent['agentId']] = {
        state: {
          domainAnalysis: {
            domain: 'techstartup.io',
            isPersonalEmail: false,
            suggestedBusinessName: 'Techstartup',
            confidence: 0.7
          },
          publicRecordsResult: {
            found: false,
            confidence: 0.0,
            sources: []
          }
        },
        requirements: [],
        findings: [],
        nextActions: []
      };
    });

    it('should infer tech startup business type', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'businessInference'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.businessInference).toBeDefined();
      expect(agentState.state.businessInference.businessType).toBe('tech_startup');
      expect(agentState.state.businessInference.probableStructure).toBe('C-Corporation');
      expect(agentState.state.businessInference.probableState).toBe('CA');
      expect(agentState.findings).toHaveLength(1);
      expect(agentState.findings[0].type).toBe('business_inference');
    });

    it('should calculate appropriate confidence score', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'businessInference'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.businessInference.confidence).toBeGreaterThan(0.5);
      expect(agentState.state.businessInference.confidence).toBeLessThan(1.0);
    });
  });

  describe('OAuth Data Processing', () => {
    it('should process OAuth data correctly', async () => {
      const oauthData = {
        email: 'john@techcorp.com',
        name: 'John Smith',
        picture: 'https://example.com/photo.jpg',
        email_verified: true
      };

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'oauthProcessing',
        oauthData
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.enrichedUserData).toBeDefined();
      expect(agentState.state.enrichedUserData.userInfo.firstName).toBe('John');
      expect(agentState.state.enrichedUserData.userInfo.lastName).toBe('Smith');
      expect(agentState.state.enrichedUserData.userInfo.email).toBe('john@techcorp.com');
      expect(agentState.state.enrichedUserData.domainInfo.domain).toBe('techcorp.com');
      expect(agentState.state.enrichedUserData.domainInfo.isPersonalEmail).toBe(false);
      expect(agentState.state.enrichedUserData.confidence).toBe(0.9);
    });

    it('should handle unverified email', async () => {
      const oauthData = {
        email: 'john@example.com',
        name: 'John Smith',
        email_verified: false
      };

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'oauthProcessing',
        oauthData
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.enrichedUserData.confidence).toBe(0.6);
    });

    it('should handle missing OAuth data error', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'oauthProcessing'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState).toBeDefined();
      expect(agentState.state.error).toBe('OAuth data is required for processing');
      expect(agentState.state.lastOperation).toBe('oauthProcessing');
      expect(agentState.state.failedAt).toBeDefined();
    });
  });

  describe('Full Enrichment', () => {
    beforeEach(() => {
      // Mock tool responses for full enrichment
      agent['toolChain'].executeTool = jest.fn().mockResolvedValue({
        success: true,
        data: { found: false }
      });
    });

    it('should execute full enrichment pipeline', async () => {
      const oauthData = {
        email: 'founder@newstartup.io',
        name: 'Jane Founder',
        email_verified: true
      };

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'fullEnrichment',
        oauthData
      });

      const agentState = result.agentContexts![agent['agentId']];
      
      // Should have all enrichment data
      expect(agentState.state.enrichedUserData).toBeDefined();
      expect(agentState.state.domainAnalysis).toBeDefined();
      expect(agentState.state.publicRecordsResult).toBeDefined();
      expect(agentState.state.businessInference).toBeDefined();
      
      // Should have multiple findings
      expect(agentState.findings.length).toBeGreaterThan(3);
    });

    it('should generate UI confirmation for low confidence', async () => {
      const oauthData = {
        email: 'user@gmail.com', // Personal email = low confidence
        name: 'John User',
        email_verified: true
      };

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'fullEnrichment',
        oauthData
      });

      // Should generate UI request for confirmation
      expect(Object.keys(result.activeUIRequests || {})).toContain(agent['agentId']);
      expect((result.pendingInputRequests || []).length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown operation gracefully', async () => {
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'unknownOperation'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.error).toContain('Unknown operation: unknownOperation');
      expect(agentState.state.lastOperation).toBe('unknownOperation');
      expect(agentState.state.failedAt).toBeDefined();
    });

    it('should handle tool execution failures', async () => {
      agent['toolChain'].executeTool = jest.fn().mockRejectedValue(new Error('Tool execution failed'));

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'publicRecordsSearch',
        businessName: 'Test Corp'
      });

      const agentState = result.agentContexts![agent['agentId']];
      expect(agentState.state.error).toBeDefined();
    });
  });
});