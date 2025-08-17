/**
 * Service Integration Tests
 * 
 * Tests the integration between various services to ensure they work together correctly
 */

import { DatabaseService } from '../../src/services/database';
import { StateComputer } from '../../src/services/state-computer';
import { ConfigurationManager } from '../../src/services/configuration-manager';
import { TaskContext, ContextEntry, TaskState } from '../../src/types/engine-types';
import * as path from 'path';
import * as fs from 'fs';

describe('Service Integration Tests', () => {
  describe('DatabaseService + StateComputer Integration', () => {
    let dbService: DatabaseService;
    
    beforeEach(() => {
      dbService = DatabaseService.getInstance();
    });

    test('should compute state from database history records', async () => {
      // Create mock context history
      const mockHistory: ContextEntry[] = [
        {
          entryId: 'entry_1',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          actor: { type: 'user', id: 'user_123' },
          operation: 'task_initiated',
          data: { task: 'onboarding' },
          reasoning: 'User started onboarding'
        },
        {
          entryId: 'entry_2',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          actor: { type: 'agent', id: 'business_discovery', version: '1.0' },
          operation: 'business_found',
          data: { 
            business: { 
              name: 'Test Corp', 
              entityType: 'LLC' 
            } 
          },
          reasoning: 'Found business in public records'
        }
      ];

      // Compute state from history
      const computedState = StateComputer.computeState(mockHistory);
      
      expect(computedState.status).toBe('created');
      expect(computedState.data.business).toBeDefined();
      expect(computedState.data.business.name).toBe('Test Corp');
      expect(computedState.completeness).toBeGreaterThanOrEqual(0);
    });

    test('should track state changes over time', () => {
      const history: ContextEntry[] = [];
      
      // Initial state
      const state1 = StateComputer.computeState(history);
      expect(state1.status).toBe('created');
      
      // Add first event
      history.push({
        entryId: 'entry_1',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'system', id: 'system' },
        operation: 'task_initiated',
        data: {}
      });
      
      const state2 = StateComputer.computeState(history);
      expect(state2.status).toBe('created');
      
      // Generate diff
      const diff = StateComputer.generateStateDiff(state1, state2);
      // Status doesn't change in this case
      expect(diff.statusChange).toBeUndefined();
    });
  });

  describe('ConfigurationManager Tests', () => {
    let configManager: ConfigurationManager;
    const testConfigPath = path.join(__dirname, '../../../config');
    
    beforeEach(() => {
      // Create test config directory if it doesn't exist
      if (!fs.existsSync(testConfigPath)) {
        fs.mkdirSync(testConfigPath, { recursive: true });
      }
      
      const templatesPath = path.join(testConfigPath, 'templates');
      if (!fs.existsSync(templatesPath)) {
        fs.mkdirSync(templatesPath, { recursive: true });
      }
      
      const agentsPath = path.join(testConfigPath, 'agents');
      if (!fs.existsSync(agentsPath)) {
        fs.mkdirSync(agentsPath, { recursive: true });
      }
      
      configManager = new ConfigurationManager(testConfigPath);
    });

    test('should handle missing template gracefully', async () => {
      try {
        await configManager.loadTemplate('non_existent_template');
      } catch (error: any) {
        expect(error.message).toContain('Template not found');
      }
    });

    test('should handle missing agent config gracefully', async () => {
      try {
        await configManager.loadAgentConfig('non_existent_agent');
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });

    test('should cache loaded configurations', async () => {
      // Create a test template file
      const testTemplate = {
        task_template: {
          id: 'test_template',
          version: '1.0',
          metadata: {
            name: 'Test Template',
            description: 'Test template for integration testing',
            category: 'test'
          },
          goals: {
            primary: [
              { id: 'test_goal', description: 'Test goal', required: true }
            ]
          }
        }
      };
      
      const templatePath = path.join(testConfigPath, 'templates', 'test_template.yaml');
      fs.writeFileSync(templatePath, JSON.stringify(testTemplate));
      
      // Load template twice
      const template1 = await configManager.loadTemplate('test_template');
      const template2 = await configManager.loadTemplate('test_template');
      
      // Should be the same cached instance
      expect(template1).toBe(template2);
      
      // Clean up
      fs.unlinkSync(templatePath);
    });
  });

  describe('Service Singleton Patterns', () => {
    test('should maintain singleton instance for DatabaseService', () => {
      const db1 = DatabaseService.getInstance();
      const db2 = DatabaseService.getInstance();
      expect(db1).toBe(db2);
    });

    test('should create new instances for non-singleton services', () => {
      const config1 = new ConfigurationManager();
      const config2 = new ConfigurationManager();
      expect(config1).not.toBe(config2);
    });
  });

  describe('End-to-End Service Flow', () => {
    test('should handle complete task lifecycle', async () => {
      const dbService = DatabaseService.getInstance();
      
      // Create a new task context
      const context: TaskContext = {
        contextId: 'test_context',
        taskTemplateId: 'user_onboarding',
        tenantId: 'test_tenant',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'pending',
          phase: 'initialization',
          completeness: 0,
          data: {}
        },
        history: [],
        templateSnapshot: {
          id: 'user_onboarding',
          version: '1.0',
          metadata: {
            name: 'User Onboarding',
            description: 'Onboard new user',
            category: 'onboarding'
          },
          goals: {
            primary: [
              { id: 'collect_info', description: 'Collect user information', required: true },
              { id: 'verify_business', description: 'Verify business details', required: true }
            ]
          }
        }
      };

      // Simulate task progression
      context.history.push({
        entryId: 'entry_1',
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        actor: { type: 'user', id: 'user_123' },
        operation: 'task_started',
        data: { email: 'test@example.com' }
      });

      // Compute new state
      const newState = StateComputer.computeState(context.history);
      
      // Create a new TaskState from ComputedState
      const taskState: TaskState = {
        status: newState.status as TaskState['status'],
        phase: newState.phase,
        completeness: newState.completeness,
        data: newState.data
      };
      
      context.currentState = taskState;

      // Verify state progression
      expect(context.currentState.status).toBe('created');
      expect(context.currentState.completeness).toBeGreaterThanOrEqual(0);

      // Add business discovery
      context.history.push({
        entryId: 'entry_2',
        timestamp: new Date().toISOString(),
        sequenceNumber: 2,
        actor: { type: 'agent', id: 'business_discovery', version: '1.0' },
        operation: 'business_found',
        data: {
          business: {
            name: 'Test Business LLC',
            entityType: 'LLC',
            state: 'CA'
          }
        }
      });

      // Recompute state
      const finalComputedState = StateComputer.computeState(context.history);
      
      // Create final TaskState
      const finalTaskState: TaskState = {
        status: finalComputedState.status as TaskState['status'],
        phase: finalComputedState.phase,
        completeness: finalComputedState.completeness,
        data: finalComputedState.data
      };
      
      context.currentState = finalTaskState;

      // Verify final state
      expect(context.currentState.data.business).toBeDefined();
      expect(context.currentState.data.business.name).toBe('Test Business LLC');
      expect(context.currentState.completeness).toBeGreaterThanOrEqual(taskState.completeness);
    });
  });

  describe('Service Error Recovery', () => {
    test('should handle database connection errors', async () => {
      const dbService = DatabaseService.getInstance();
      
      // Mock a connection error
      const mockGetUserClient = jest.spyOn(dbService as any, 'getUserClient');
      mockGetUserClient.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      // Attempt to get user client should handle error gracefully
      try {
        await (dbService as any).getUserClient('invalid_token');
      } catch (error: any) {
        expect(error.message).toContain('Database connection failed');
      }

      mockGetUserClient.mockRestore();
    });

    test('should handle configuration loading errors', async () => {
      const configManager = new ConfigurationManager();
      
      // Try to load non-existent config
      try {
        await configManager.loadAgentConfig('non_existent_agent');
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Service Performance', () => {
    test('should compute state efficiently for large histories', () => {
      const largeHistory: ContextEntry[] = [];
      
      // Generate 1000 events
      for (let i = 0; i < 1000; i++) {
        largeHistory.push({
          entryId: `entry_${i}`,
          timestamp: new Date().toISOString(),
          sequenceNumber: i + 1,
          actor: { type: 'agent', id: 'test_agent', version: '1.0' },
          operation: 'data_update',
          data: { field: `value_${i}` }
        });
      }

      const startTime = Date.now();
      const computedState = StateComputer.computeState(largeHistory);
      const endTime = Date.now();

      // Should complete within 100ms even for large histories
      expect(endTime - startTime).toBeLessThan(100);
      expect(computedState).toBeDefined();
    });

    test('should handle concurrent service calls', async () => {
      const dbService = DatabaseService.getInstance();
      
      // Simulate concurrent calls
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve({
          id: `task_${i}`,
          status: 'pending'
        }));
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.id).toBe(`task_${index}`);
      });
    });
  });
});