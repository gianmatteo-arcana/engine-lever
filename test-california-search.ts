/**
 * Test script for California Business Search Tool
 * Run with: npx ts-node test-california-search.ts
 */

import { ToolChain } from './src/services/tool-chain';

async function testCaliforniaSearch() {
  console.log('='.repeat(60));
  console.log('Testing California Business Search Tool');
  console.log('='.repeat(60));
  
  const toolChain = new ToolChain();
  
  // Test searching for a well-known California company
  const testCompanies = [
    'Apple Inc',
    'Google LLC',
    'OpenAI'
  ];
  
  for (const company of testCompanies) {
    console.log(`\nSearching for: ${company}`);
    console.log('-'.repeat(40));
    
    try {
      const result = await toolChain.searchBusinessEntity(company, 'CA');
      
      if (result) {
        console.log('✅ Found business entity:');
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('❌ No results found');
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }
  
  // Test the tool registry
  console.log('\n' + '='.repeat(60));
  console.log('Tool Registry Information:');
  console.log('='.repeat(60));
  
  const registry = toolChain.getToolRegistry();
  console.log('\nRegistered tools:');
  Object.keys(registry).forEach(toolName => {
    const tool = (registry as any)[toolName];
    console.log(`\n- ${toolName}: ${tool.description}`);
    if (tool.capabilities) {
      console.log(`  Capabilities: ${tool.capabilities.join(', ')}`);
    }
  });
  
  // Display available tools for LLM
  console.log('\n' + '='.repeat(60));
  console.log('LLM Tool Description:');
  console.log('='.repeat(60));
  console.log(toolChain.getAvailableTools());
  
  console.log('\n✅ Test complete!');
  process.exit(0);
}

// Run the test
testCaliforniaSearch().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});