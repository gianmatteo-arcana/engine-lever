/**
 * Test that UXOptimizationAgent properly loads and uses YAML configuration
 */

import { UXOptimizationAgent } from '../../../src/agents/UXOptimizationAgent';
import * as fs from 'fs';
import * as yaml from 'yaml';
import * as path from 'path';

describe('UXOptimizationAgent YAML Configuration', () => {
  let agent: UXOptimizationAgent;

  beforeEach(() => {
    agent = new UXOptimizationAgent('test-task-id', 'test-tenant', 'test-user');
  });

  it('should load YAML configuration on instantiation', () => {
    // Check that the agent has loaded the YAML config via BaseAgent
    const config = (agent as any).specializedTemplate;
    
    expect(config).toBeDefined();
    expect(config.agent).toBeDefined();
    expect(config.agent.id).toBe('ux_optimization_agent');
  });

  it('should have human-centered mission in YAML', () => {
    const config = (agent as any).specializedTemplate;
    
    expect(config.agent.mission).toContain('trusted advisor');
    expect(config.agent.mission).toContain('translator');
    expect(config.agent.mission).toContain('human-friendly');
  });

  it('should have optimize_form_experience operation with protocol', () => {
    const config = (agent as any).specializedTemplate;
    
    expect(config.operations).toBeDefined();
    expect(config.operations.optimize_form_experience).toBeDefined();
    expect(config.operations.optimize_form_experience.protocol).toBeDefined();
    expect(config.operations.optimize_form_experience.protocol.system_prompt).toBeDefined();
    expect(config.operations.optimize_form_experience.protocol.user_prompt).toBeDefined();
  });

  it('should use YAML prompts with variable substitution', () => {
    const config = (agent as any).specializedTemplate;
    const protocol = config.operations.optimize_form_experience.protocol;
    
    // Check that prompts have variable placeholders
    expect(protocol.system_prompt).toContain('{userExperience}');
    expect(protocol.system_prompt).toContain('{businessType}');
    expect(protocol.system_prompt).toContain('{industry}');
    
    expect(protocol.user_prompt).toContain('{industry}');
    expect(protocol.user_prompt).toContain('{requestSummaries}');
    expect(protocol.user_prompt).toContain('{rawRequests}');
  });

  it('should verify YAML file exists and is valid', () => {
    const configPath = path.join(process.cwd(), 'config', 'agents', 'ux_optimization_agent.yaml');
    
    expect(fs.existsSync(configPath)).toBe(true);
    
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.parse(configContent);
    
    expect(config.agent.id).toBe('ux_optimization_agent');
    expect(config.operations.optimize_form_experience).toBeDefined();
  });
});