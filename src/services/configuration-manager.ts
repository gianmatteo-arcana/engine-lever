/**
 * Configuration Manager
 * Loads and manages YAML configuration files for agents and task templates
 * Supports hot-reload in development for rapid iteration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { TaskTemplate, AgentConfig } from '../types/engine-types';
import { DeclarativeTemplateParser } from '../templates/declarative-parser';

export class ConfigurationManager {
  private configCache = new Map<string, any>();
  private watchers = new Map<string, fs.FSWatcher>();
  private configPath: string;
  private templateParser: DeclarativeTemplateParser;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(__dirname, '../../config');
    
    // Initialize declarative template parser with custom paths
    const templateDirs = [
      path.join(this.configPath, 'templates'),
      path.join(__dirname, '../templates/tasks'),
      path.join(process.cwd(), 'src', 'templates', 'tasks')
    ];
    this.templateParser = new DeclarativeTemplateParser(templateDirs);
    
    // Enable hot-reload in development
    if (process.env.NODE_ENV === 'development') {
      this.enableHotReload();
    }
  }

  /**
   * Load a task template from YAML using declarative parser
   */
  async loadTemplate(templateId: string): Promise<TaskTemplate> {
    const cacheKey = `template:${templateId}`;
    
    // Check cache first
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }
    
    try {
      // Use declarative parser to load template
      const template = await this.templateParser.loadTemplate(templateId);
      
      // Cache the template
      this.configCache.set(cacheKey, template);
      
      return template;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load template ${templateId}: ${message}`);
    }
  }

  /**
   * Load an agent configuration from YAML
   */
  async loadAgentConfig(agentId: string): Promise<AgentConfig> {
    const cacheKey = `agent:${agentId}`;
    
    // Check cache first
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }
    
    const agentPath = path.join(this.configPath, 'agents', `${agentId}.yaml`);
    
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent config not found: ${agentId} at ${agentPath}`);
    }
    
    try {
      const content = await fs.promises.readFile(agentPath, 'utf8');
      const parsed = yaml.parse(content);
      const config = parsed.agent as AgentConfig;
      
      // Validate required fields
      if (!config.agent?.id || !config.agent?.version) {
        throw new Error(`Invalid agent config: missing id or version in ${agentId}`);
      }
      
      // Cache the config
      this.configCache.set(cacheKey, config);
      
      return config;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load agent config ${agentId}: ${message}`);
    }
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<string[]> {
    const templatesDir = path.join(this.configPath, 'templates');
    
    if (!fs.existsSync(templatesDir)) {
      return [];
    }
    
    const files = await fs.promises.readdir(templatesDir);
    return files
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
      .map(file => file.replace(/\.(yaml|yml)$/, ''));
  }

  /**
   * List all available agent configs
   */
  async listAgents(): Promise<string[]> {
    const agentsDir = path.join(this.configPath, 'agents');
    
    if (!fs.existsSync(agentsDir)) {
      return [];
    }
    
    const files = await fs.promises.readdir(agentsDir);
    return files
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
      .map(file => file.replace(/\.(yaml|yml)$/, ''));
  }

  /**
   * Clear the configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    console.log('[ConfigManager] Cache cleared');
  }

  /**
   * Enable hot-reload for development
   */
  private enableHotReload(): void {
    const configDir = this.configPath;
    
    if (!fs.existsSync(configDir)) {
      console.warn(`[ConfigManager] Config directory not found: ${configDir}`);
      return;
    }
    
    // Watch the config directory for changes
    const watcher = fs.watch(configDir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.yaml') || filename.endsWith('.yml'))) {
        console.log(`[ConfigManager] Config changed: ${filename}`);
        this.clearCache();
      }
    });
    
    this.watchers.set(configDir, watcher);
    console.log('[ConfigManager] Hot-reload enabled for:', configDir);
  }

  /**
   * Cleanup watchers on shutdown
   */
  cleanup(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      console.log(`[ConfigManager] Stopped watching: ${path}`);
    }
    this.watchers.clear();
  }

  /**
   * Validate a template against schema
   */
  validateTemplate(template: TaskTemplate): boolean {
    // Basic validation
    if (!template.id || !template.version) {
      return false;
    }
    
    // Check required fields based on our schema
    if (!template.metadata?.name || !template.goals?.primary) {
      return false;
    }
    
    // All primary goals must have required field
    if (!template.goals.primary.every(goal => typeof goal.required === 'boolean')) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate an agent config against schema
   */
  validateAgentConfig(config: AgentConfig): boolean {
    // Basic validation
    if (!config.agent?.id || !config.agent?.version) {
      return false;
    }
    
    // Check required fields
    if (!config.agent.name || !config.agent.mission) {
      return false;
    }
    
    return true;
  }
}