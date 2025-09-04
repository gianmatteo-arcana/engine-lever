import { UXOptimizationAgent } from '../../src/agents/UXOptimizationAgent';
import { UIRequest, UITemplateType } from '../../src/types/task-engine.types';
import { BaseAgentRequest } from '../../src/types/base-agent-types';
import * as fs from 'fs';
import * as path from 'path';

async function testUXOptimization() {
  console.log('🧪 Testing UXOptimizationAgent...\n');

  // Create test UIRequests simulating multiple forms
  const testUIRequests: UIRequest[] = [
    {
      requestId: 'test-1',
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        title: 'Business Registration Form',
        description: 'Provide business information for registration',
        fields: [
          { name: 'business_name', label: 'Business Name', type: 'text', required: true },
          { name: 'ein', label: 'Employer Identification Number', type: 'text', required: true },
          { name: 'business_type', label: 'Business Type', type: 'select', required: true }
        ]
      },
      context: {}
    },
    {
      requestId: 'test-2', 
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        title: 'Agent Designation Form',
        description: 'Designate your registered agent',
        fields: [
          { name: 'agent_name', label: 'Registered Agent Name', type: 'text', required: true },
          { name: 'agent_address', label: 'Agent Address', type: 'text', required: true },
          { name: 'agent_phone', label: 'Agent Phone', type: 'text', required: false }
        ]
      },
      context: {}
    },
    {
      requestId: 'test-3',
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        title: 'Business Address Information',
        description: 'Provide your business address details',
        fields: [
          { name: 'street_address', label: 'Street Address', type: 'text', required: true },
          { name: 'city', label: 'City', type: 'text', required: true },
          { name: 'state', label: 'State', type: 'select', required: true },
          { name: 'zip_code', label: 'ZIP Code', type: 'text', required: true }
        ]
      },
      context: {}
    }
  ];

  // Test with different scenarios
  const scenarios = [
    {
      name: 'Multiple UIRequests (should consolidate)',
      uiRequests: testUIRequests,
      userContext: {
        businessType: 'restaurant',
        experienceLevel: 'first-time',
        industry: 'food service'
      }
    },
    {
      name: 'Single UIRequest (should pass through)',
      uiRequests: [testUIRequests[0]],
      userContext: {
        businessType: 'tech startup',
        experienceLevel: 'experienced',
        industry: 'technology'
      }
    },
    {
      name: 'Empty UIRequests (should handle gracefully)',
      uiRequests: [],
      userContext: {}
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n📋 Testing: ${scenario.name}`);
    console.log(`  Input: ${scenario.uiRequests.length} UIRequest(s)`);
    
    try {
      // Create agent instance
      const agent = new UXOptimizationAgent('test-task-id', 'test-tenant', 'test-user');

      // Create request
      const request: BaseAgentRequest = {
        operation: 'optimize_ui_requests',
        parameters: {
          uiRequests: scenario.uiRequests,
          userContext: scenario.userContext
        },
        taskContext: {
          contextId: 'test-task-id',
          user: scenario.userContext
        }
      };

      // Execute optimization
      const response = await agent.executeInternal(request);

      // Display results
      console.log(`  Status: ${response.status}`);
      
      if (response.uiRequests) {
        const optimizedRequest = response.uiRequests[0];
        console.log(`  Result: ${optimizedRequest ? 'UIRequest optimized' : 'No UIRequest'}`);
        
        if (optimizedRequest) {
          console.log(`  Template: ${optimizedRequest.templateType}`);
          console.log(`  Title: ${optimizedRequest.semanticData?.title}`);
          
          const originalFieldCount = scenario.uiRequests.reduce((sum, req) => 
            sum + (req.semanticData?.fields?.length || 0), 0);
          const optimizedFieldCount = optimizedRequest.semanticData?.fields?.length || 0;
          
          console.log(`  Fields: ${originalFieldCount} → ${optimizedFieldCount}`);
          
          if (response.contextUpdate?.data?.metrics) {
            const metrics = response.contextUpdate.data.metrics as any;
            console.log(`  Cognitive Load Reduction: ${metrics.cognitive_load_reduction}%`);
          }
        }
      }

      // Save example output for PR documentation
      if (scenario.name === 'Multiple UIRequests (should consolidate)' && response.uiRequests?.[0]) {
        const example = {
          before: scenario.uiRequests,
          after: response.uiRequests[0],
          metrics: response.contextUpdate?.data?.metrics
        };
        
        const outputPath = path.join(__dirname, '..', '..', 'docs', 'ux-optimization-example.json');
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(example, null, 2));
        console.log(`\n  📁 Example saved to: ${outputPath}`);
      }

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Check if it's due to missing API key
      if (error instanceof Error && error.message.includes('API')) {
        console.log('  ℹ️ Note: This is expected when LLM API keys are not configured');
        console.log('  ✅ The agent should fall back to simple merge strategy');
      }
    }
  }

  console.log('\n✅ Testing complete!');
}

// Run the test
testUXOptimization().catch(console.error);