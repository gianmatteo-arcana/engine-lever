#!/usr/bin/env npx ts-node

/**
 * Test script for California Business Search Tool
 * 
 * Usage:
 *   npm run test:ca-search "Apple Inc"           # Search by name
 *   npm run test:ca-search --number C0806592     # Search by entity number
 *   npm run test:ca-search "Google" --limit 3    # Limit results
 *   npm run test:ca-search --help                # Show help
 */

import { ToolChain, EntityType, EntityStatus } from '../src/services/tool-chain';

function showHelp() {
  console.log(`
🔍 California Business Search Tool

Usage:
  npm run test:ca-search -- Company Name           Search by business name
  npm run test:ca-search -- --number ENTITY_NUMBER Search by entity number
  npm run test:ca-search -- Name --limit N         Limit results to N items
  npm run test:ca-search -- --help                 Show this help

Examples:
  npm run test:ca-search -- Apple Inc
  npm run test:ca-search -- Google LLC --limit 5
  npm run test:ca-search -- --number C0806592
  npm run test:ca-search -- Starbucks Corporation

Note: This searches the real California Secretary of State database
and may take 10-30 seconds depending on the number of results.
  `);
}

function formatEntityType(raw: string, normalized?: EntityType): string {
  if (normalized) {
    return `${raw} → ${normalized}`;
  }
  return `${raw} (unrecognized)`;
}

function formatStatus(raw: string, normalized?: EntityStatus): string {
  if (normalized) {
    return `${raw} → ${normalized}`;
  }
  return `${raw} (unrecognized)`;
}

function formatAddress(address?: any): string {
  if (!address) return 'Not available';
  return `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
}

function displayResults(results: any[], searchTerm: string, isEntityNumber = false) {
  const searchType = isEntityNumber ? 'entity number' : 'business name';
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 California Business Search Results`);
  console.log(`Searched for ${searchType}: "${searchTerm}"`);
  console.log(`Found: ${results.length} result(s)`);
  console.log(`${'='.repeat(80)}`);
  
  if (results.length === 0) {
    console.log('\n❌ No businesses found matching your search.');
    console.log('\nTips:');
    console.log('• Try a shorter or more general name');
    console.log('• Check spelling');
    console.log('• Try searching without LLC, Inc, Corp, etc.');
    return;
  }
  
  results.forEach((result, index) => {
    console.log(`\n📋 Result ${index + 1}:`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Entity Type: ${formatEntityType(result.entityType, result.entityTypeNormalized)}`);
    console.log(`   Status: ${formatStatus(result.status, result.statusNormalized)}`);
    console.log(`   Formation Date: ${result.formationDate || 'Not available'}`);
    console.log(`   Jurisdiction: ${result.jurisdiction || 'Not specified'}`);
    console.log(`   Address: ${formatAddress(result.address)}`);
    console.log(`   EIN: ${result.ein || 'Not available'}`);
    console.log(`   ${'-'.repeat(60)}`);
  });
  
  if (results.length > 0) {
    console.log(`\n✅ Search completed successfully!`);
    console.log(`\nℹ️  Note: Raw values show exactly what's in the California database.`);
    console.log(`   Normalized values use standard categories for consistency.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Show help
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }
  
  // Parse arguments
  const numberIndex = args.indexOf('--number');
  const limitIndex = args.indexOf('--limit');
  
  let searchTerm: string;
  let isEntityNumber = false;
  let limit = 10; // Default limit
  
  if (numberIndex !== -1) {
    // Search by entity number
    if (numberIndex + 1 >= args.length) {
      console.error('❌ Error: --number requires an entity number');
      process.exit(1);
    }
    searchTerm = args[numberIndex + 1];
    isEntityNumber = true;
  } else {
    // Search by name - collect all arguments that aren't flags
    const usedIndices = new Set();
    if (limitIndex !== -1) {
      usedIndices.add(limitIndex);
      usedIndices.add(limitIndex + 1);
    }
    
    const nameArgs = args.filter((arg, index) => 
      !arg.startsWith('--') && !usedIndices.has(index)
    );
    
    if (nameArgs.length === 0) {
      console.error('❌ Error: Please provide a business name to search for');
      showHelp();
      process.exit(1);
    }
    searchTerm = nameArgs.join(' '); // Join multiple words
  }
  
  // Parse limit
  if (limitIndex !== -1) {
    if (limitIndex + 1 >= args.length) {
      console.error('❌ Error: --limit requires a number');
      process.exit(1);
    }
    const limitValue = parseInt(args[limitIndex + 1]);
    if (isNaN(limitValue) || limitValue <= 0) {
      console.error('❌ Error: --limit must be a positive number');
      process.exit(1);
    }
    limit = limitValue;
  }
  
  console.log(`\n🚀 Starting California business search...`);
  console.log(`Search term: "${searchTerm}"`);
  console.log(`Search type: ${isEntityNumber ? 'Entity Number' : 'Business Name'}`);
  if (!isEntityNumber) {
    console.log(`Result limit: ${limit}`);
  }
  console.log(`\n⏳ This may take 10-30 seconds...`);
  
  const toolChain = new ToolChain();
  
  try {
    if (isEntityNumber) {
      // Search by entity number (returns single result or null)
      const result = await toolChain.searchByEntityNumber(searchTerm);
      const results = result ? [result] : [];
      displayResults(results, searchTerm, true);
    } else {
      // Search by name (returns array of results)
      const results = await toolChain.searchBusinessEntity(searchTerm);
      const limitedResults = results.slice(0, limit);
      
      if (results.length > limit) {
        console.log(`\n⚠️  Showing first ${limit} of ${results.length} results. Use --limit to see more.`);
      }
      
      displayResults(limitedResults, searchTerm, false);
    }
    
  } catch (error) {
    console.error(`\n❌ Search failed:`, error);
    console.log(`\nPossible issues:`);
    console.log(`• Network connection problems`);
    console.log(`• California SOS website temporarily unavailable`);
    console.log(`• Browser automation blocked`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}