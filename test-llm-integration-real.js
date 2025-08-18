#!/usr/bin/env node

/**
 * LLM Provider Real API Integration Test Runner
 * 
 * This script runs integration tests that connect to real OpenAI and Anthropic endpoints.
 * 
 * Usage:
 *   node test-llm-integration-real.js [options]
 * 
 * Options:
 *   --anthropic-only    Run only Anthropic tests
 *   --openai-only       Run only OpenAI tests
 *   --quick             Run a subset of quick tests
 *   --full              Run all tests (default)
 * 
 * Environment Variables:
 *   ANTHROPIC_API_KEY   Your Anthropic API key for Claude models
 *   OPENAI_API_KEY      Your OpenAI API key for GPT models
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  anthropicOnly: args.includes('--anthropic-only'),
  openaiOnly: args.includes('--openai-only'),
  quick: args.includes('--quick'),
  full: args.includes('--full') || (!args.includes('--anthropic-only') && !args.includes('--openai-only') && !args.includes('--quick'))
};

// Check environment variables
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

console.log('🧪 LLM Provider Real API Integration Tests');
console.log('=' .repeat(50));
console.log('🔑 API Key Status:');
console.log(`   Anthropic: ${hasAnthropicKey ? '✅ Available' : '❌ Missing (set ANTHROPIC_API_KEY)'}`);
console.log(`   OpenAI:    ${hasOpenAIKey ? '✅ Available' : '❌ Missing (set OPENAI_API_KEY)'}`);
console.log('');

if (!hasAnthropicKey && !hasOpenAIKey) {
  console.error('❌ No API keys found. Please set ANTHROPIC_API_KEY and/or OPENAI_API_KEY environment variables.');
  console.log('');
  console.log('Example:');
  console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
  console.log('  export OPENAI_API_KEY=sk-...');
  console.log('  node test-llm-integration-real.js');
  process.exit(1);
}

// Build test pattern based on options
let testPattern = 'Real API';
if (options.anthropicOnly) {
  testPattern = 'Anthropic.*Real API';
} else if (options.openaiOnly) {
  testPattern = 'OpenAI.*Real API';
} else if (options.quick) {
  testPattern = 'should complete text request|should correctly identify model capabilities';
}

console.log(`🎯 Running tests: ${testPattern}`);
console.log('⏱️ This may take up to 2 minutes due to API calls...');
console.log('');

// Run Jest with the integration test file
const jestArgs = [
  '--testTimeout=60000', // 60 second timeout for API calls
  '--verbose',
  '--no-cache',
  '--testNamePattern=' + testPattern,
  'test/integration/llm-provider-real-api.test.ts'
];

const jest = spawn('npx', ['jest', ...jestArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test'
  }
});

jest.on('close', (code) => {
  console.log('');
  if (code === 0) {
    console.log('✅ All integration tests passed!');
    console.log('');
    console.log('🎉 The LLM Provider is working correctly with real API endpoints.');
    console.log('   You can now use it in your agents with confidence.');
  } else {
    console.log('❌ Some integration tests failed.');
    console.log('');
    console.log('💡 Common issues:');
    console.log('   - Check your API keys are valid and have sufficient credits');
    console.log('   - Ensure you have internet connectivity');
    console.log('   - Some tests may fail due to API rate limits');
  }
  
  process.exit(code);
});

jest.on('error', (error) => {
  console.error('❌ Failed to run tests:', error.message);
  process.exit(1);
});