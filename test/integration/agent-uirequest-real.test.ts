/**
 * Real-world Agent UIRequest Test
 * 
 * This test replicates the exact scenario from production logs to ensure
 * agents consistently return UIRequests with the actual instructions used by the orchestrator.
 */

import dotenv from 'dotenv';
import { DefaultAgent } from '../../src/agents/DefaultAgent';
import { AgentExecutor } from '../../src/services/agent-executor';
import { AgentRequest, TaskContext } from '../../src/types/engine-types';
import { logger } from '../../src/utils/logger';

// Load environment variables from .env file
dotenv.config();

// Silence logger during tests unless debugging
if (!process.env.DEBUG) {
  logger.transports.forEach(t => t.silent = true);
}

// Set test timeout to 60 seconds for multiple LLM calls
jest.setTimeout(60000);

describe('Real-world Agent UIRequest Generation', () => {
  // This is the actual task context from production logs
  const createRealTaskContext = (taskId: string = 'test-task'): TaskContext => ({
    contextId: taskId,
    taskTemplateId: 'onboarding',
    tenantId: '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934',
    createdAt: new Date().toISOString(),
    currentState: {
      status: 'pending',
      phase: 'initialization',
      completeness: 0,
      data: {
        taskId: taskId,
        userId: '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934',
        title: 'Onboarding Task - ' + new Date().toISOString(),
        description: 'Created via universal API',
        taskType: 'onboarding'
      }
    },
    history: [] as any,
    metadata: {
      contextData: {
        createdAt: new Date().toISOString(),
        description: 'Created via universal API',
        developer: true,
        source: 'dev-toolkit',
        taskType: 'onboarding',
        title: 'Onboarding Task - ' + new Date().toISOString(),
        userId: '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934'
      },
      taskDefinition: {
        id: 'onboarding',
        version: '1.0.0',
        metadata: {
          name: 'Business Profile Onboarding',
          description: 'Set up your business profile and get started with SmallBizAlly',
          category: 'onboarding',
          priority: 'critical',
          estimatedDuration: 30
        },
        goals: {
          primary: [
            {
              id: 'verify_identity',
              description: 'Establish user and business identity',
              required: true
            },
            {
              id: 'determine_structure',
              description: 'Understand business entity type and jurisdiction',
              required: true
            },
            {
              id: 'gather_identifiers',
              description: 'Collect tax IDs and registration numbers',
              required: true
            }
          ]
        },
        requiredInputs: {
          minimal: ['user_email', 'business_name', 'entity_type', 'formation_state'] as any,
          recommended: ['ein', 'business_address', 'industry_classification', 'employee_count'] as any,
          optional: ['annual_revenue', 'business_licenses', 'team_members', 'integration_preferences']
        },
        completionCriteria: [
          'User authenticated',
          'Business name confirmed',
          'Entity type determined',
          'Primary jurisdiction identified',
          'Core features enabled'
        ] as any,
        fallbackStrategies: [
          {
            trigger: 'no_public_records_found',
            action: 'request_user_input',
            message: "We couldn't find your business records, but that's OK - we'll set it up together"
          }
        ] as any,
        agentHints: ['profile_collector', 'business_discovery', 'compliance_analyzer', 'data_enrichment'] as any,
        availableDataSources: ['google_oauth', 'email_domain', 'secretary_of_state', 'irs_databases', 'clearbit_api', 'google_places']
      }
    }
  });

  describe('Profile Collection Agent - Real Subtask Instructions', () => {
    it('should return UIRequest with exact production instruction', async () => {
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934',
        '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934'
      );

      // This is the EXACT instruction from production logs
      const request: AgentRequest = {
        requestId: `subtask_${Date.now()}_test`,
        operation: 'execute_subtask',
        instruction: 'Implement progressive disclosure form to collect business name, contact details, and preliminary entity type. Use smart defaults and inference where possible.',
        data: {
          business_name: 'string',
          contact_email: 'string',
          phone: 'string'
        },
        context: {
          subtaskDescription: 'Collect core business identity information',
          expectedOutput: 'Validated basic business profile',
          successCriteria: ['Complete basic profile collected', 'Contact information validated'] as any,
          urgency: 'medium'
        },
        taskContext: createRealTaskContext()
      };

      console.log('\n🎯 Testing with REAL production instruction:');
      console.log('Instruction:', request.instruction);
      
      const response = await AgentExecutor.execute(agent, request);
      
      console.log('\n📊 Results:');
      console.log('Status:', response.status);
      console.log('UIRequests count:', response.uiRequests?.length || 0);
      
      // Verify the agent returns needs_input with UIRequest
      expect(response.status).toBe('needs_input');
      expect(response.uiRequests).toBeDefined();
      expect(response.uiRequests!.length).toBeGreaterThan(0);
      
      const uiRequest = response.uiRequests![0];
      console.log('\n✅ UIRequest Generated:');
      console.log('Title:', uiRequest.semanticData?.title || 'N/A');
      console.log('Template Type:', uiRequest.templateType);
      console.log('Fields:', uiRequest.semanticData?.fields?.map((f: any) => `${f.name} (${f.type})`).join(', ') || 'N/A');
      
      // Verify the UIRequest has proper structure
      expect(uiRequest.templateType).toBe('form');
      expect(uiRequest.semanticData?.title).toBeTruthy();
      expect(uiRequest.semanticData?.instructions).toBeTruthy();
      expect(uiRequest.semanticData?.fields).toBeInstanceOf(Array);
      
      // Verify expected fields based on the instruction
      const fieldNames = uiRequest.semanticData?.fields?.map((f: any) => f.name) || [];
      expect(fieldNames).toContain('business_name');
      
      // Log reasoning to understand agent's decision
      console.log('\n🧠 Agent Reasoning:');
      console.log(response.reasoning?.substring(0, 200) + '...');
    });

    it('should consistently generate UIRequests for multiple real subtasks', async () => {
      // Test different real subtask instructions from orchestrator
      const realSubtasks = [
        {
          instruction: 'Implement progressive disclosure form to collect business name, structure, and basic contact details with smart defaults',
          expectedFields: ['business_name']
        },
        {
          instruction: 'Cross-reference provided information with public records and business registrations. Flag any discrepancies.',
          expectedFields: ['business_name', 'ein'] // Should ask for identifiers to search
        },
        {
          instruction: 'Collect comprehensive business profiles while maintaining an excellent user experience that reduces abandonment',
          expectedFields: ['business_name', 'entity_type']
        }
      ];

      console.log('\n🔄 Testing multiple real-world subtasks:\n');
      
      for (const [index, subtask] of realSubtasks.entries()) {
        console.log(`\n📝 Subtask ${index + 1}: "${subtask.instruction.substring(0, 50)}..."`);
        
        const agent = new DefaultAgent(
          'profile_collection_agent.yaml',
          '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934',
          'test-user'
        );

        const request: AgentRequest = {
          requestId: `subtask_${Date.now()}_${index}`,
          operation: 'execute_subtask',
          instruction: subtask.instruction,
          data: {}, // No data available, should trigger UIRequest
          context: {
            subtaskDescription: 'Business profile collection',
            expectedOutput: 'Business profile data',
            successCriteria: 'Profile data collected'
          },
          taskContext: createRealTaskContext(`task-${index}`)
        };

        const response = await AgentExecutor.execute(agent, request);
        
        console.log(`  Status: ${response.status}`);
        console.log(`  Has UIRequest: ${response.uiRequests && response.uiRequests.length > 0}`);
        
        if (response.status === 'needs_input' && response.uiRequests && response.uiRequests.length > 0) {
          const fields = response.uiRequests[0].semanticData?.fields?.map((f: any) => f.name) || [];
          console.log(`  Fields: ${fields.join(', ')}`);
          
          // Check if expected fields are present
          for (const expectedField of subtask.expectedFields) {
            if (fields.includes(expectedField)) {
              console.log(`  ✅ Contains expected field: ${expectedField}`);
            } else {
              console.log(`  ⚠️  Missing expected field: ${expectedField}`);
            }
          }
        }
        
        // All subtasks should trigger UIRequests when no data is available
        expect(response.status).toBe('needs_input');
        expect(response.uiRequests).toBeDefined();
        expect(response.uiRequests!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Data Collection Agent - Real Subtask Instructions', () => {
    it('should handle real data collection subtask', async () => {
      const agent = new DefaultAgent(
        'data_collection_agent.yaml',
        '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934',
        'test-user'
      );

      // Real instruction for data collection from orchestrator
      const request: AgentRequest = {
        requestId: `data_${Date.now()}`,
        operation: 'execute_subtask',
        instruction: 'Cross-reference provided information with public records and business registrations. Flag any discrepancies.',
        data: {
          business_profile: 'object from previous phase' // Placeholder data
        },
        context: {
          subtaskDescription: 'Verify business existence and registration',
          expectedOutput: 'Verified business entity data with official records',
          successCriteria: 'Business existence confirmed, Registration status verified'
        },
        taskContext: createRealTaskContext('data-task')
      };

      console.log('\n🔍 Testing Data Collection Agent with real instruction:');
      console.log('Instruction:', request.instruction?.substring(0, 80) + '...');
      
      const response = await AgentExecutor.execute(agent, request);
      
      console.log('\nResponse Status:', response.status);
      
      // When no actual business data is provided, should ask for it
      if (response.status === 'needs_input') {
        expect(response.uiRequests).toBeDefined();
        expect(response.uiRequests!.length).toBeGreaterThan(0);
        
        const uiRequest = response.uiRequests![0];
        console.log('UIRequest Title:', uiRequest.semanticData?.title);
        console.log('Requested Fields:', uiRequest.semanticData?.fields?.map((f: any) => f.name).join(', '));
      }
    });
  });

  describe('Parallel Execution - Real Orchestrator Pattern', () => {
    it('should handle parallel subtasks like orchestrator does', async () => {
      // Orchestrator often runs profile_collection and ux_optimization in parallel
      const parallelTasks = [
        {
          agentConfig: 'profile_collection_agent.yaml',
          instruction: 'Implement progressive disclosure form to collect business name, contact details, and preliminary entity type. Use smart defaults and inference where possible.',
          subtaskDescription: 'Collect core business identity information'
        },
        {
          agentConfig: 'ux_optimization_agent.yaml',
          instruction: 'Optimize the onboarding form for maximum completion rates using progressive disclosure and mobile-first design',
          subtaskDescription: 'Optimize user experience during collection'
        }
      ];

      console.log('\n⚡ Testing parallel execution like orchestrator:\n');
      
      const promises = parallelTasks.map(async (task, index) => {
        const agent = new DefaultAgent(
          task.agentConfig,
          '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934',
          'test-user'
        );

        const request: AgentRequest = {
          requestId: `parallel_${Date.now()}_${index}`,
          operation: 'execute_subtask',
          instruction: task.instruction,
          data: {},
          context: {
            subtaskDescription: task.subtaskDescription,
            expectedOutput: 'Task specific output',
            successCriteria: 'Task completed'
          },
          taskContext: createRealTaskContext(`parallel-${index}`)
        };

        const startTime = Date.now();
        const response = await AgentExecutor.execute(agent, request);
        const duration = Date.now() - startTime;
        
        return {
          agent: task.agentConfig.replace('.yaml', ''),
          status: response.status,
          hasUIRequest: !!(response.uiRequests && response.uiRequests.length > 0),
          duration,
          uiRequestTitle: response.uiRequests?.[0]?.semanticData?.title
        };
      });

      const results = await Promise.all(promises);
      
      console.log('\n📊 Parallel Execution Results:');
      results.forEach(r => {
        console.log(`\n${r.agent}:`);
        console.log(`  Status: ${r.status}`);
        console.log(`  Duration: ${r.duration}ms`);
        console.log(`  Has UIRequest: ${r.hasUIRequest}`);
        if (r.uiRequestTitle) {
          console.log(`  UIRequest Title: "${r.uiRequestTitle}"`);
        }
      });

      // Profile collection should need input
      const profileResult = results.find(r => r.agent === 'profile_collection_agent');
      expect(profileResult?.status).toBe('needs_input');
      expect(profileResult?.hasUIRequest).toBe(true);
      
      // UX optimization might complete (it optimizes the form structure)
      const uxResult = results.find(r => r.agent === 'ux_optimization_agent');
      expect(['completed', 'needs_input']).toContain(uxResult?.status);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed context gracefully', async () => {
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        'test-business',
        'test-user'
      );

      const request: AgentRequest = {
        requestId: 'edge-case-1',
        operation: 'execute_subtask',
        instruction: 'Collect business information',
        data: null as any, // Malformed data
        context: {
          subtaskDescription: 'Test edge case'
        },
        taskContext: {
          contextId: 'edge-task',
          // Minimal context
        } as any
      };

      // Should not throw, should handle gracefully
      const response = await AgentExecutor.execute(agent, request);
      
      console.log('\n🔧 Edge case - malformed context:');
      console.log('Status:', response.status);
      console.log('Error:', response.error);
      
      // Should either error or ask for input
      expect(['needs_input', 'error']).toContain(response.status);
    });

    it('should include UIRequest even with very long instructions', async () => {
      const agent = new DefaultAgent(
        'profile_collection_agent.yaml',
        'test-business',
        'test-user'
      );

      const veryLongInstruction = `
        Implement a comprehensive progressive disclosure form system that collects all necessary business information
        including but not limited to: legal business name as registered with state authorities, doing-business-as names,
        federal employer identification number, state tax identification numbers, business formation date, entity type
        (LLC, Corporation, Partnership, Sole Proprietorship, etc.), state of formation, current operating states,
        principal business address, mailing address if different, all business phone numbers, primary contact email,
        website URL, social media profiles, industry classification codes (NAICS/SIC), number of employees,
        annual revenue range, business bank account information for verification purposes, authorized representatives,
        ownership structure, and any other relevant information needed for complete business profile establishment.
        Ensure all fields use appropriate validation, provide helpful placeholder text, implement smart defaults where
        possible, and organize fields in logical groups with progressive disclosure to minimize cognitive load.
      `.trim();

      const request: AgentRequest = {
        requestId: 'long-instruction',
        operation: 'execute_subtask',
        instruction: veryLongInstruction,
        data: {},
        context: {
          subtaskDescription: 'Comprehensive data collection'
        },
        taskContext: createRealTaskContext('long-task')
      };

      console.log('\n📜 Testing with very long instruction...');
      console.log('Instruction length:', veryLongInstruction.length, 'characters');
      
      const response = await AgentExecutor.execute(agent, request);
      
      console.log('Response status:', response.status);
      
      // Should still generate proper UIRequest
      expect(response.status).toBe('needs_input');
      expect(response.uiRequests).toBeDefined();
      expect(response.uiRequests!.length).toBeGreaterThan(0);
      
      if (response.uiRequests?.[0]) {
        console.log('UIRequest still generated ✅');
        console.log('Field count:', response.uiRequests[0].semanticData?.fields?.length);
      }
    });
  });
});