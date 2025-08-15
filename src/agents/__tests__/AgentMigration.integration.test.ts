/**
 * Agent Migration Integration Tests
 * Tests the complete migration from service-based to BaseAgent architecture
 */

import { 
  createAgent,
  createDataEnrichmentAgent,
  createBackendOrchestratorAgent,
  createTaskManagementAgent,
  agentRegistry,
  MIGRATION_STATUS
} from '../unified-index';
import { AgentTaskContext as TaskContext } from '../../types/unified-agent-types';

// Mock BaseAgent and dependencies
jest.mock('../base/UnifiedBaseAgent', () => {
  return {
    BaseAgent: class MockBaseAgent {
      protected agentId = 'test-agent';
      protected config = { capabilities: ['test'] };
      protected toolChain = {
        executeTool: jest.fn().mockResolvedValue({ success: true, data: {} }),
        getAvailableTools: jest.fn().mockResolvedValue([]),
        findToolsByCapability: jest.fn().mockResolvedValue([]),
        getToolInfo: jest.fn().mockResolvedValue(null),
        isToolAvailable: jest.fn().mockResolvedValue(true)
      };
      
      constructor(configPath?: string) {
        this.agentId = configPath ? `agent-${configPath.split('/').pop()?.replace('.yaml', '')}` : 'test-agent';
      }
      
      async executeTask(taskId: string, context: TaskContext, parameters: Record<string, unknown>) {
        return this.executeTaskLogic(taskId, context, parameters);
      }
      
      async getConfiguration() {
        return this.config;
      }
      
      async sendA2AMessage(target: string, message: any) {
        return { success: true };
      }
      
      protected executeTaskLogic(taskId: string, context: TaskContext, parameters: Record<string, unknown>): Promise<TaskContext> {
        throw new Error('Must be implemented by subclass');
      }
    }
  };
});

// Mock Supabase - need to mock from agent's perspective
jest.mock('../../services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { 
              id: 'test-task-123', 
              title: 'Test Task',
              task_type: 'test',
              status: 'pending',
              priority: 'medium',
              user_id: 'user-123'
            },
            error: null
          })
        })
      }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-task-123' },
            error: null
          })
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'test-task-123' },
              error: null
            })
          })
        })
      })
    })
  }
}));

describe('Agent Migration Integration', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    // Clear registry between tests
    agentRegistry.clear();
    
    mockContext = {
      taskId: 'test-task-123',
      taskType: 'integration_test',
      userId: 'user-456',
      userToken: 'token-789',
      status: 'active',
      currentPhase: 'testing',
      completedPhases: [],
      sharedContext: {
        user: {
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        metadata: {}
      },
      agentContexts: {},
      activeUIRequests: {},
      pendingInputRequests: [],
      auditTrail: []
    };
  });

  describe('Agent Registry', () => {
    it('should provide all expected agent types', () => {
      const availableTypes = agentRegistry.getAvailableAgentTypes();
      
      // Should include YAML-configured agents
      expect(availableTypes).toContain('SOISpecialistAgent');
      expect(availableTypes).toContain('ComplianceAdvisorAgent');
      expect(availableTypes).toContain('ProfileBuilderAgent');
      expect(availableTypes).toContain('GeneralAssistantAgent');
      expect(availableTypes).toContain('TaskOrchestratorAgent');
      
      // Should include service-based agents
      expect(availableTypes).toContain('DataEnrichmentAgent');
      expect(availableTypes).toContain('BackendOrchestratorAgent');
      expect(availableTypes).toContain('TaskManagementAgent');
    });

    it('should create singleton instances for service agents', () => {
      const agent1 = agentRegistry.getAgent('DataEnrichmentAgent');
      const agent2 = agentRegistry.getAgent('DataEnrichmentAgent');
      
      expect(agent1).toBe(agent2); // Same instance
    });

    it('should validate agent availability', () => {
      expect(agentRegistry.isAgentAvailable('DataEnrichmentAgent')).toBe(true);
      expect(agentRegistry.isAgentAvailable('NonExistentAgent')).toBe(false);
    });
  });

  describe('DataEnrichmentAgent Migration', () => {
    it('should create DataEnrichmentAgent successfully', () => {
      const agent = createDataEnrichmentAgent();
      expect(agent).toBeDefined();
      expect(agent.constructor.name).toBe('DataEnrichmentAgent');
    });

    it('should execute domain analysis operation', async () => {
      const agent = createDataEnrichmentAgent();
      
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'domainAnalysis',
        email: 'test@businessdomain.com'
      });

      expect(result.agentContexts).toBeDefined();
      const agentState = result.agentContexts[agent['agentId']];
      expect(agentState).toBeDefined();
      expect(agentState.state.domainAnalysis).toBeDefined();
    });

    it('should handle OAuth data processing', async () => {
      const agent = createDataEnrichmentAgent();
      
      const oauthData = {
        email: 'test@company.com',
        name: 'Test User',
        email_verified: true
      };

      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'oauthProcessing',
        oauthData
      });

      const agentState = result.agentContexts[agent['agentId']];
      expect(agentState.state.enrichedUserData).toBeDefined();
      expect(agentState.findings).toContainEqual(
        expect.objectContaining({ type: 'oauth_processing' })
      );
    });
  });

  describe('BackendOrchestratorAgent Migration', () => {
    it('should create BackendOrchestratorAgent successfully', () => {
      const agent = createBackendOrchestratorAgent();
      expect(agent).toBeDefined();
      expect(agent.constructor.name).toBe('BackendOrchestratorAgent');
    });

    it('should have backward compatibility methods', async () => {
      const agent = createBackendOrchestratorAgent();
      
      // Mock successful tool execution
      agent['toolChain'].executeTool = jest.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-123',
          contextId: 'ctx-456'
        }
      });

      const result = await agent.createTask({
        templateId: 'test_template',
        initialData: { test: 'data' },
        userToken: 'test-token'
      });

      expect(result).toEqual({
        taskId: 'task-123',
        contextId: 'ctx-456',
        status: 'created',
        message: 'Task created successfully'
      });
    });
  });

  describe('TaskManagementAgent Migration', () => {
    it('should create TaskManagementAgent as singleton', () => {
      const agent1 = createTaskManagementAgent();
      const agent2 = createTaskManagementAgent();
      
      expect(agent1).toBe(agent2); // Should be same instance
      expect(agent1.constructor.name).toBe('TaskManagementAgent');
    });

    it('should have backward compatibility methods', () => {
      const agent = createTaskManagementAgent();
      
      // Test that the agent has the expected backward compatibility methods
      expect(agent.createTask).toBeDefined();
      expect(typeof agent.createTask).toBe('function');
      
      expect(agent.getTask).toBeDefined();
      expect(typeof agent.getTask).toBe('function');
      
      expect(agent.getUserTasks).toBeDefined();
      expect(typeof agent.getUserTasks).toBe('function');
      
      // Verify it extends BaseAgent
      expect(agent.executeTask).toBeDefined();
      expect(typeof agent.executeTask).toBe('function');
    });
  });

  describe('YAML-Configured Agents', () => {
    it('should create SOI Specialist Agent from YAML config', () => {
      const agent = createAgent('SOISpecialistAgent');
      expect(agent).toBeDefined();
      expect(agent['agentId']).toContain('soi-specialist');
    });

    it('should create Compliance Advisor Agent from YAML config', () => {
      const agent = createAgent('ComplianceAdvisorAgent');
      expect(agent).toBeDefined();
      expect(agent['agentId']).toContain('compliance-advisor');
    });

    it('should create Profile Builder Agent from YAML config', () => {
      const agent = createAgent('ProfileBuilderAgent');
      expect(agent).toBeDefined();
      expect(agent['agentId']).toContain('profile-builder');
    });

    it('should create General Assistant Agent from YAML config', () => {
      const agent = createAgent('GeneralAssistantAgent');
      expect(agent).toBeDefined();
      expect(agent['agentId']).toContain('general-assistant');
    });

    it('should create Task Orchestrator Agent from YAML config', () => {
      const agent = createAgent('TaskOrchestratorAgent');
      expect(agent).toBeDefined();
      expect(agent['agentId']).toContain('orchestrator');
    });
  });

  describe('Migration Status Tracking', () => {
    it('should track completed migrations correctly', () => {
      expect(MIGRATION_STATUS.completed).toContain('DataEnrichmentAgent');
      expect(MIGRATION_STATUS.completed).toContain('BackendOrchestratorAgent');
      expect(MIGRATION_STATUS.completed).toContain('TaskManagementAgent');
    });

    it('should track YAML-configured agents', () => {
      expect(MIGRATION_STATUS.yamlConfigured).toContain('SOISpecialistAgent');
      expect(MIGRATION_STATUS.yamlConfigured).toContain('ComplianceAdvisorAgent');
      expect(MIGRATION_STATUS.yamlConfigured).toContain('ProfileBuilderAgent');
      expect(MIGRATION_STATUS.yamlConfigured).toContain('GeneralAssistantAgent');
      expect(MIGRATION_STATUS.yamlConfigured).toContain('TaskOrchestratorAgent');
    });

    it('should track pending migrations', () => {
      expect(MIGRATION_STATUS.pending).toContain('EventsAgent');
      expect(MIGRATION_STATUS.pending).toContain('BackendAPIAgent');
      expect(MIGRATION_STATUS.pending).toContain('TaskReplayAgent');
    });
  });

  describe('A2A Protocol Compliance', () => {
    it('should support A2A message sending', async () => {
      const agent = createDataEnrichmentAgent();
      
      const result = await agent.sendA2AMessage('TestAgent', {
        type: 'test_message',
        payload: { test: 'data' }
      });

      expect(result.success).toBe(true);
    });

    it('should load agent configuration', async () => {
      const agent = createDataEnrichmentAgent();
      
      const config = await agent.getConfiguration();
      expect(config).toBeDefined();
      expect(config.capabilities).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown agent types gracefully', () => {
      expect(() => {
        createAgent('NonExistentAgent' as any);
      }).toThrow('Unknown agent type: NonExistentAgent');
    });

    it('should handle agent execution errors gracefully', async () => {
      const agent = createDataEnrichmentAgent();
      
      const result = await agent.executeTask('test-task', mockContext, {
        operation: 'unknownOperation'
      });

      const agentState = result.agentContexts[agent['agentId']];
      expect(agentState.state.error).toContain('Unknown operation: unknownOperation');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain legacy service exports', async () => {
      const agentIndex = await import('../index');
      
      expect(agentIndex.intelligentDataEnrichmentService).toBeDefined();
      expect(agentIndex.taskService).toBeDefined();
    });

    it('should support legacy orchestrator service creation', async () => {
      const agentIndex = await import('../index');
      
      const orchestratorService = agentIndex.createOrchestratorService('test-token');
      expect(orchestratorService).toBeDefined();
      expect(orchestratorService.createTask).toBeDefined();
      expect(orchestratorService.getTaskContext).toBeDefined();
      expect(orchestratorService.submitUIResponse).toBeDefined();
    });
  });
});