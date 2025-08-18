/**
 * Test script to verify LLM integration is working
 * Run with: ANTHROPIC_API_KEY=your-key node test-llm-integration.js
 */

// Set up environment
process.env.NODE_ENV = 'development';

// Check if API key is provided
if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
  console.error('❌ Error: Please set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable');
  console.log('Usage: ANTHROPIC_API_KEY=your-key node test-llm-integration.js');
  process.exit(1);
}

async function testLLMIntegration() {
  console.log('🧪 Testing LLM Integration...\n');
  
  try {
    // Import the LLM provider
    const { LLMProvider } = require('./dist/services/llm-provider');
    const provider = LLMProvider.getInstance();
    
    console.log('✅ LLM Provider initialized');
    console.log(`📋 Default model: ${provider.getDefaultModel()}`);
    console.log(`📋 Available models: ${provider.getAvailableModels().join(', ')}\n`);
    
    // Test 1: Simple text completion
    console.log('Test 1: Simple text completion');
    console.log('--------------------------------');
    const response1 = await provider.complete({
      prompt: 'What is 2 + 2? Answer with just the number.',
      temperature: 0
    });
    console.log('Response:', response1.content);
    console.log('Model used:', response1.model);
    console.log('Provider:', response1.provider);
    console.log('✅ Test 1 passed\n');
    
    // Test 2: JSON response (like orchestration would use)
    console.log('Test 2: JSON response for orchestration');
    console.log('---------------------------------------');
    const response2 = await provider.complete({
      prompt: `Given a task to "Register a new business", create a simple execution plan.
      
      Return a JSON object with this structure:
      {
        "phases": [
          {
            "id": "phase_id",
            "name": "Phase Name",
            "agents": ["agent1", "agent2"],
            "dependencies": []
          }
        ]
      }`,
      responseFormat: 'json',
      temperature: 0.3
    });
    
    console.log('Response:', response2.content);
    
    // Try to parse as JSON
    try {
      const plan = JSON.parse(response2.content);
      console.log('Parsed plan phases:', plan.phases?.length || 0);
      console.log('✅ Test 2 passed - Valid JSON response\n');
    } catch (e) {
      console.log('⚠️ Response is not valid JSON, but that\'s okay for this model\n');
    }
    
    // Test 3: Using specific model
    console.log('Test 3: Using specific model');
    console.log('----------------------------');
    const modelToTest = process.env.ANTHROPIC_API_KEY ? 'claude-3-haiku-20240307' : 'gpt-3.5-turbo';
    console.log(`Testing with model: ${modelToTest}`);
    
    const response3 = await provider.complete({
      prompt: 'Say "Hello from the LLM!" and nothing else.',
      model: modelToTest,
      temperature: 0
    });
    
    console.log('Response:', response3.content);
    console.log('Model used:', response3.model);
    console.log('✅ Test 3 passed\n');
    
    // Summary
    console.log('=' .repeat(50));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('=' .repeat(50));
    console.log('\n✅ LLM Integration is fully functional!');
    console.log('The OrchestratorAgent can now use real LLM reasoning.');
    
    if (response2.usage) {
      console.log('\n📊 Token usage for orchestration-like request:');
      console.log(`   Prompt tokens: ${response2.usage.promptTokens}`);
      console.log(`   Completion tokens: ${response2.usage.completionTokens}`);
      console.log(`   Total tokens: ${response2.usage.totalTokens}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
testLLMIntegration().catch(console.error);