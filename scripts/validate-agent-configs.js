#!/usr/bin/env node

/**
 * Agent Configuration Validation Script
 * 
 * Validates all YAML agent configurations for:
 * - Proper YAML syntax
 * - Required fields presence
 * - Schema compliance
 * - Naming conventions
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Configuration validation rules
const REQUIRED_FIELDS = [
  'agent.id',
  'agent.name',
  'agent.version',
  'agent.role',
  'agent.mission',
  'schemas.output'
];

const NAMING_PATTERNS = {
  agent_id: /^[a-z_]+_agent$/,
  version: /^\d+\.\d+\.\d+$/,
  role: /^[a-z_]+_specialist$/
};

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

function validateConfig(configPath, config) {
  const errors = [];
  const warnings = [];
  
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = getNestedValue(config, field);
    if (!value) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check naming conventions
  if (config.agent) {
    if (config.agent.id && !NAMING_PATTERNS.agent_id.test(config.agent.id)) {
      warnings.push(`Agent ID "${config.agent.id}" doesn't follow naming convention (should end with _agent)`);
    }
    
    if (config.agent.version && !NAMING_PATTERNS.version.test(config.agent.version)) {
      errors.push(`Version "${config.agent.version}" doesn't follow semantic versioning (x.y.z)`);
    }
    
    if (config.agent.role && !NAMING_PATTERNS.role.test(config.agent.role)) {
      warnings.push(`Role "${config.agent.role}" doesn't follow naming convention (should end with _specialist)`);
    }
  }
  
  // Check schema structure
  if (config.schemas && config.schemas.output) {
    const output = config.schemas.output;
    if (output.type !== 'object') {
      errors.push('Output schema must be of type "object"');
    }
    
    if (!output.required || !Array.isArray(output.required)) {
      errors.push('Output schema must have "required" array');
    }
    
    if (!output.properties) {
      errors.push('Output schema must have "properties" object');
    }
  }
  
  return { errors, warnings };
}

function main() {
  const configDir = path.join(__dirname, '../config/agents');
  
  console.log('🔍 Validating Agent Configurations...\n');
  
  let totalConfigs = 0;
  let validConfigs = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  
  // Read all YAML files in the agents directory (exclude templates and index)
  const files = fs.readdirSync(configDir).filter(file => 
    file.endsWith('.yaml') && 
    file !== 'index.yaml' && 
    file !== 'base_agent.yaml'  // Exclude template file
  );
  
  for (const file of files) {
    const configPath = path.join(configDir, file);
    totalConfigs++;
    
    console.log(`📝 Validating ${file}...`);
    
    try {
      // Parse YAML
      const content = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(content);
      
      // Validate configuration
      const { errors, warnings } = validateConfig(configPath, config);
      
      totalErrors += errors.length;
      totalWarnings += warnings.length;
      
      if (errors.length === 0) {
        validConfigs++;
        console.log(`   ✅ Valid configuration`);
      } else {
        console.log(`   ❌ Configuration has errors:`);
        errors.forEach(error => console.log(`      - ${error}`));
      }
      
      if (warnings.length > 0) {
        console.log(`   ⚠️  Warnings:`);
        warnings.forEach(warning => console.log(`      - ${warning}`));
      }
      
    } catch (error) {
      totalErrors++;
      console.log(`   💥 Failed to parse YAML: ${error.message}`);
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📊 Validation Summary:');
  console.log(`   Total configurations: ${totalConfigs}`);
  console.log(`   Valid configurations: ${validConfigs}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`   Total warnings: ${totalWarnings}`);
  
  if (validConfigs === totalConfigs && totalErrors === 0) {
    console.log('\n🎉 All agent configurations are valid!');
    process.exit(0);
  } else {
    console.log('\n❌ Some configurations need attention.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateConfig, getNestedValue };