/**
 * Integration tests for Agent Dependency Injection
 * 
 * Tests the complete flow of:
 * 1. Agent discovery from YAML
 * 2. Registration with DI container
 * 3. Task-scoped agent creation
 * 4. SSE event subscriptions
 * 5. Agent-to-agent communication via events
 * 
 * TODO: Real PostgreSQL integration tests
 *   - Create test suite using real PostgreSQL instance
 *   - Test actual LISTEN/NOTIFY functionality
 *   - Verify event persistence in task_context_events table
 *   - Test transaction isolation and concurrent updates
 *   - Measure real database query performance
 *   - Test connection pooling and limits
 *   - Verify RLS policies work correctly
 * 
 * TODO: Performance benchmarks
 *   - Add performance test suite separate from unit tests
 *   - Measure agent creation time (target: <100ms)
 *   - Measure event broadcast latency (target: <50ms)
 *   - Test memory usage with 100+ agents
 *   - Profile hot paths and optimize bottlenecks
 */

import { DIContainer, initializeAgents } from '../../src/services/dependency-injection';
import { OrchestratorAgent } from '../../src/agents/OrchestratorAgent';
import { DatabaseService } from '../../src/services/database';
import { logger } from '../../src/utils/logger';
import { a2aEventBus } from '../../src/services/a2a-event-bus';

// Mock dependencies
jest.mock('../../src/services/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/credential-vault');
jest.mock('../../src/services/tool-chain');
jest.mock('../../src/services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        status: 'completed',
        contextUpdate: {
          operation: 'test_operation',
          data: { result: 'success' },
          reasoning: 'Test operation completed',
          confidence: 0.9
        }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));
jest.mock('../../src/services/real-llm-provider');
jest.mock('fs');
jest.mock('yaml');

describe('Agent DI Integration', () => {
  let orchestrator: OrchestratorAgent;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockA2AEventBus: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    DIContainer.clear();
    
    // Mock A2A Event Bus
    mockA2AEventBus = {
      broadcast: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(() => {}),
      unsubscribe: jest.fn(),
      getEventHistory: jest.fn().mockReturnValue([])
    };
    (a2aEventBus as any).broadcast = mockA2AEventBus.broadcast;
    (a2aEventBus as any).subscribe = mockA2AEventBus.subscribe;
    (a2aEventBus as any).unsubscribe = mockA2AEventBus.unsubscribe;
    (a2aEventBus as any).getEventHistory = mockA2AEventBus.getEventHistory;
    
    // Mock DatabaseService.getInstance()
    mockDbService = {
      notifyTaskContextUpdate: jest.fn().mockResolvedValue(undefined),
      createTaskContextEvent: jest.fn().mockResolvedValue({ id: 'event_123' }),
      listenForTaskUpdates: jest.fn().mockResolvedValue(() => {}),
      query: jest.fn(),
      transaction: jest.fn(),
    } as any;
    
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    
    // Mock logger
    (logger.info as jest.Mock).mockImplementation(() => {});
    (logger.debug as jest.Mock).mockImplementation(() => {});
    (logger.error as jest.Mock).mockImplementation(() => {});
    (logger.warn as jest.Mock).mockImplementation(() => {});
    
    // Mock LLM provider
    const { RealLLMProvider } = require('../../src/services/real-llm-provider');
    RealLLMProvider.mockImplementation(() => ({
      complete: jest.fn().mockResolvedValue({
        status: 'completed',
        data: {}
      })
    }));
    
    // Mock fs for agent discovery
    const fs = require('fs');
    fs.readdirSync = jest.fn().mockReturnValue([
      'business_discovery_agent.yaml',
      'profile_collection_agent.yaml',
      'entity_compliance_agent.yaml'
    ]);
    
    // Mock complete YAML file content with schemas
    const mockAgentYaml = {
      business_discovery_agent: `
agent:
  id: business_discovery_agent
  version: 1.0.0
  name: Business Discovery Agent
  role: information_specialist
  a2a:
    protocolVersion: 1.0.0
    communicationMode: async
    routing:
      canReceiveFrom:
        - orchestrator_agent
        - profile_collection_agent
      canSendTo:
        - orchestrator_agent
        - entity_compliance_agent
  agent_card:
    skills:
      - Business research
      - Data extraction
      - Entity verification
schemas:
  output:
    type: object
    properties:
      businessInfo:
        type: object`,
      profile_collection_agent: `
agent:
  id: profile_collection_agent
  version: 1.0.0
  name: Profile Collection Agent
  role: data_collection_specialist
schemas:
  output:
    type: object`,
      entity_compliance_agent: `
agent:
  id: entity_compliance_agent
  version: 1.0.0
  name: Entity Compliance Agent
  role: compliance_specialist
schemas:
  output:
    type: object`
    };
    
    // Mock base agent template
    const mockBaseAgent = `
base_agent:
  version: 1.0.0
  llm_config:
    model: gpt-4
schemas:
  output:
    type: object`;
    
    fs.readFileSync = jest.fn().mockImplementation((path: string) => {
      if (path.includes('base_agent')) {
        return mockBaseAgent;
      }
      for (const [agentId, content] of Object.entries(mockAgentYaml)) {
        if (path.includes(agentId)) {
          return content;
        }
      }
      // Default to business_discovery_agent
      return mockAgentYaml.business_discovery_agent;
    });
    
    // Mock YAML parser
    const yaml = require('yaml');
    yaml.parse = jest.fn().mockImplementation((content: string) => {
      // Parse our mock YAML strings into objects
      const lines = content.split('\n').filter(l => l.trim());
      const result: any = {};
      let currentSection: any = result;
      let currentKey = '';
      
      for (const line of lines) {
        if (line.includes(':') && !line.startsWith('  ')) {
          const [key, value] = line.split(':').map(s => s.trim());
          if (value) {
            currentSection[key] = value;
          } else {
            currentSection[key] = {};
            currentKey = key;
          }
        } else if (line.startsWith('  ') && currentKey) {
          const trimmed = line.trim();
          if (trimmed.includes(':')) {
            const [key, value] = trimmed.split(':').map(s => s.trim());
            if (!currentSection[currentKey]) currentSection[currentKey] = {};
            currentSection[currentKey][key] = value || {};
          }
        }
      }
      
      // Return structured object matching expected format
      if (content.includes('business_discovery_agent')) {
        return {
          agent: {
            id: 'business_discovery_agent',
            version: '1.0.0',
            name: 'Business Discovery Agent',
            role: 'information_specialist',
            mission: 'Discover and validate business information',
            a2a: {
              protocolVersion: '1.0.0',
              communicationMode: 'async',
              routing: {
                canReceiveFrom: ['orchestrator_agent', 'profile_collection_agent'],
                canSendTo: ['orchestrator_agent', 'entity_compliance_agent']
              }
            },
            agent_card: {
              skills: ['Business research', 'Data extraction', 'Entity verification']
            }
          },
          schemas: {
            output: { type: 'object', properties: { businessInfo: { type: 'object' } } }
          }
        };
      } else if (content.includes('profile_collection_agent')) {
        return {
          agent: {
            id: 'profile_collection_agent',
            version: '1.0.0',
            name: 'Profile Collection Agent',
            role: 'data_collection_specialist',
            mission: 'Collect and organize user profile data'
          },
          schemas: {
            output: { type: 'object' }
          }
        };
      } else if (content.includes('entity_compliance_agent')) {
        return {
          agent: {
            id: 'entity_compliance_agent',
            version: '1.0.0',
            name: 'Entity Compliance Agent',
            role: 'compliance_specialist',
            mission: 'Ensure entity compliance with regulations'
          },
          schemas: {
            output: { type: 'object' }
          }
        };
      } else if (content.includes('base_agent')) {
        return {
          base_agent: {
            version: '1.0.0',
            llm_config: { model: 'gpt-4' }
          },
          schemas: {
            output: { type: 'object' }
          }
        };
      }
      
      return result;
    });
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Agent Registration with DI Container', () => {
    it('should discover and register agents from YAML', async () => {
      // Initialize agents
      await initializeAgents();
      
      // Verify agents are registered
      expect(DIContainer.isAgentRegistered('business_discovery_agent')).toBe(true);
      expect(DIContainer.isAgentRegistered('profile_collection_agent')).toBe(true);
      expect(DIContainer.isAgentRegistered('entity_compliance_agent')).toBe(true);
      
      // Verify orchestrator is registered as singleton
      expect(DIContainer.isRegistered('Agent:orchestrator_agent')).toBe(true);
    });
    
    it('should register agents with TRANSIENT lifecycle', async () => {
      await initializeAgents();
      
      // Create multiple instances of the same agent for different tasks
      const taskId1 = 'task-123';
      const taskId2 = 'task-456';
      
      const agent1 = await DIContainer.resolveAgent('business_discovery_agent', taskId1);
      const agent2 = await DIContainer.resolveAgent('business_discovery_agent', taskId2);
      
      // Verify they are different instances
      expect(agent1).not.toBe(agent2);
    });
  });
  
  describe('Task-Scoped Agent Creation', () => {
    beforeEach(async () => {
      await initializeAgents();
      orchestrator = OrchestratorAgent.getInstance();
    });
    
    it('should create agent with automatic SSE subscriptions', async () => {
      const taskId = 'test-task-123';
      const agentId = 'business_discovery_agent';
      
      // Create agent for task
      const agent = await orchestrator.createAgentForTask(agentId, taskId);
      
      // Verify agent was created
      expect(agent).toBeDefined();
      
      // Verify SSE subscription was set up
      expect(mockDbService.listenForTaskUpdates).toHaveBeenCalledWith(
        taskId,
        expect.any(Function)
      );
      
      // Verify agent announced readiness via A2A Event Bus
      expect(mockA2AEventBus.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AGENT_READY',
          taskId,
          agentId: 'business_discovery_agent',
          timestamp: expect.any(String)
        })
      );
    });
    
    it('should track active task subscriptions', async () => {
      const taskId = 'test-task-456';
      
      // Create multiple agents for the same task
      await orchestrator.createAgentForTask('business_discovery_agent', taskId);
      await orchestrator.createAgentForTask('profile_collection_agent', taskId);
      
      // Verify orchestrator tracks subscriptions
      const subscriptions = (orchestrator as any).activeTaskSubscriptions.get(taskId);
      expect(subscriptions).toBeDefined();
      expect(subscriptions.has('business_discovery_agent')).toBe(true);
      expect(subscriptions.has('profile_collection_agent')).toBe(true);
    });
  });
  
  describe('SSE Event Broadcasting', () => {
    beforeEach(async () => {
      await initializeAgents();
    });
    
    it('should broadcast execution plan to all agents', async () => {
      const taskId = 'test-task-789';
      const orchestrator = OrchestratorAgent.getInstance();
      
      // Create mock execution plan
      const plan = {
        phases: [
          {
            name: 'discovery',
            agents: ['business_discovery_agent', 'profile_collection_agent'],
            parallel: true
          },
          {
            name: 'compliance',
            agents: ['entity_compliance_agent'],
            parallel: false
          }
        ]
      };
      
      // Configure agents for execution (this broadcasts the plan)
      await (orchestrator as any).configureAgentsForExecution(plan, taskId);
      
      // Verify execution plan was broadcast via A2A Event Bus
      expect(mockA2AEventBus.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXECUTION_PLAN',
          taskId,
          data: expect.objectContaining({
            type: 'EXECUTION_PLAN',
            plan: expect.objectContaining({
              taskId,
              phases: plan.phases
            })
          })
        })
      );
    });
  });
  
  describe('Agent Event Handling', () => {
    it('should handle task events based on type', async () => {
      await initializeAgents();
      
      const taskId = 'test-task-events';
      const agent = await DIContainer.resolveAgent('business_discovery_agent', taskId);
      
      // Simulate different event types
      const events = [
        {
          type: 'EXECUTION_PLAN',
          plan: { phases: [] }
        },
        {
          type: 'PHASE_START',
          phase: 'discovery',
          agents: ['business_discovery_agent']
        },
        {
          type: 'DATA_REQUEST',
          targetAgent: 'business_discovery_agent',
          requestId: 'req-123',
          dataType: 'business_info'
        },
        {
          type: 'BLOCKAGE_ANNOUNCED',
          agentId: 'profile_collection_agent',
          blockage: { reason: 'Missing data' }
        }
      ];
      
      // Process each event
      for (const event of events) {
        await (agent as any).handleTaskEvent(event);
      }
      
      // Verify appropriate logging for each event type
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('received execution plan'),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('activated for phase'),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('received data request'),
        expect.any(Object)
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('notified of peer blockage'),
        expect.any(Object)
      );
    });
  });
  
  describe('Error Handling', () => {
    it('should throw error when creating unregistered agent', async () => {
      await initializeAgents();
      
      await expect(
        DIContainer.resolveAgent('non_existent_agent', 'task-123')
      ).rejects.toThrow('Agent not registered: non_existent_agent');
    });
    
    it('should handle agent creation failures gracefully', async () => {
      await initializeAgents();
      
      // Mock agent creation to fail
      const fs = require('fs');
      fs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('Failed to read YAML');
      });
      
      const orchestrator = OrchestratorAgent.getInstance();
      
      // Should fall back to agentDiscovery
      await expect(
        orchestrator.createAgentForTask('failing_agent', 'task-fail')
      ).rejects.toThrow();
    });
  });
  
  describe('Agent Lifecycle', () => {
    it('should properly initialize agent for task', async () => {
      await initializeAgents();
      
      const taskId = 'lifecycle-test';
      const agent = await DIContainer.resolveAgent('business_discovery_agent', taskId);
      
      // Verify agent is initialized
      expect(agent).toBeDefined();
      expect(agent.initializeForTask).toBeDefined();
      
      // Verify agent subscribed to task events
      expect(mockDbService.listenForTaskUpdates).toHaveBeenCalledWith(
        taskId,
        expect.any(Function)
      );
      
      // Verify agent announced readiness via A2A Event Bus
      expect(mockA2AEventBus.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AGENT_READY',
          taskId,
          agentId: expect.any(String),
          timestamp: expect.any(String)
        })
      );
    });
    
    it('should support multiple agents working on same task', async () => {
      await initializeAgents();
      
      const taskId = 'multi-agent-task';
      
      // Create multiple agents for the same task
      const agents = await Promise.all([
        DIContainer.resolveAgent('business_discovery_agent', taskId),
        DIContainer.resolveAgent('profile_collection_agent', taskId),
        DIContainer.resolveAgent('entity_compliance_agent', taskId)
      ]);
      
      // Verify all agents are created
      expect(agents).toHaveLength(3);
      expect(agents.every(a => a !== null)).toBe(true);
      
      // Verify each agent set up its own subscription
      expect(mockDbService.listenForTaskUpdates).toHaveBeenCalledTimes(3);
      
      // Verify each agent announced readiness via A2A Event Bus
      const readyAnnouncements = (mockA2AEventBus.broadcast as jest.Mock)
        .mock.calls
        .filter(call => call[0].type === 'AGENT_READY');
      expect(readyAnnouncements).toHaveLength(3);
    });
  });
});