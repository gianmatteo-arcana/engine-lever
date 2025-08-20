#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Fixing hardcoded agent references to use YAML as source of truth...\n');

// Get list of valid agents from YAML files
const agentsDir = path.join(__dirname, 'config/agents');
const validAgents = fs.readdirSync(agentsDir)
  .filter(f => f.endsWith('.yaml'))
  .filter(f => !f.includes('base_agent') && !f.includes('test_agent'))
  .map(f => f.replace('.yaml', ''));

console.log('✅ Valid agents from YAML files:');
validAgents.forEach(agent => console.log(`  - ${agent}`));

// Files to fix
const filesToFix = [
  'src/agents/OrchestratorAgent.ts',
  'src/agents/base/types.ts',
  'src/templates/executor.ts'
];

console.log('\n📝 Files to fix:');
filesToFix.forEach(file => console.log(`  - ${file}`));

// 1. Fix OrchestratorAgent.ts - remove hardcoded agent list
const orchestratorPath = path.join(__dirname, 'src/agents/OrchestratorAgent.ts');
let orchestratorContent = fs.readFileSync(orchestratorPath, 'utf8');

// Remove the hardcoded getAvailableAgentsForGoals method
const hardcodedAgentsRegex = /private getAvailableAgentsForGoals[\s\S]*?return agents;[\s\n]*\}/;
if (hardcodedAgentsRegex.test(orchestratorContent)) {
  orchestratorContent = orchestratorContent.replace(
    hardcodedAgentsRegex,
    `private async getAvailableAgentsForGoals(goals: string[]): Promise<any[]> {
    // Use AgentDiscoveryService to get available agents dynamically
    const discoveryService = new AgentDiscoveryService();
    await discoveryService.discoverAgents();
    const capabilities = discoveryService.getCapabilityRegistry();
    
    // Convert capability registry to agent format expected by LLM
    const agents = Array.from(capabilities.values()).map(cap => ({
      agentId: cap.agentId,
      role: cap.role,
      capabilities: cap.skills,
      availability: cap.availability
    }));
    
    return agents;
  }`
  );
  console.log('\n✅ Fixed OrchestratorAgent - removed hardcoded agent list');
}

// 2. Fix types.ts - remove hardcoded AgentRole enum
const typesPath = path.join(__dirname, 'src/agents/base/types.ts');
let typesContent = fs.readFileSync(typesPath, 'utf8');

// Replace hardcoded enum with dynamic type
typesContent = typesContent.replace(
  /export enum AgentRole \{[\s\S]*?\}/,
  `// AgentRole is now dynamic - determined from YAML files
export type AgentRole = string; // Dynamic agent IDs from YAML configurations`
);

console.log('✅ Fixed types.ts - removed hardcoded AgentRole enum');

// 3. Fix references to specific agents like ProfileCollector, TaskCoordinatorAgent
const agentMappings = {
  'ProfileCollector': 'profile_collection_agent',
  'TaskCoordinatorAgent': 'orchestrator_agent', // or another appropriate agent
  'BusinessDiscoveryAgent': 'data_collection_agent',
  'DataEnrichmentAgent': 'data_collection_agent',
  'ComplianceVerificationAgent': 'legal_compliance_agent',
  'FormOptimizerAgent': 'ux_optimization_agent',
  'CelebrationAgent': 'celebration_agent',
  'MonitoringAgent': 'monitoring_agent',
  'AchievementTracker': 'celebration_agent'
};

// Fix each mapping in OrchestratorAgent
Object.entries(agentMappings).forEach(([oldName, newName]) => {
  const regex = new RegExp(`['"]${oldName}['"]`, 'g');
  orchestratorContent = orchestratorContent.replace(regex, `'${newName}'`);
});

console.log('✅ Fixed agent name mappings to match YAML files');

// Write back the fixed files
fs.writeFileSync(orchestratorPath, orchestratorContent);
fs.writeFileSync(typesPath, typesContent);

// 4. Fix template executor
const executorPath = path.join(__dirname, 'src/templates/executor.ts');
let executorContent = fs.readFileSync(executorPath, 'utf8');

// Remove hardcoded mapAgentRole method
executorContent = executorContent.replace(
  /private mapAgentRole\(agent: string\): AgentRole \{[\s\S]*?return mapping\[agent\] \|\| AgentRole\.ORCHESTRATOR;[\s\n]*\}/,
  `private mapAgentRole(agent: string): string {
    // Agent roles are now dynamic from YAML files
    return agent; // Return the agent ID as-is
  }`
);

fs.writeFileSync(executorPath, executorContent);
console.log('✅ Fixed template executor - removed hardcoded agent mapping');

console.log('\n✅ All hardcoded agent references have been fixed!');
console.log('Agents are now determined solely from YAML configuration files.');