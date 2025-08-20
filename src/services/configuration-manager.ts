/**
 * Configuration Manager
 * Loads and manages YAML configuration files for agents ONLY
 * Agents internalize their mission from YAML configs and reason autonomously
 * Supports hot-reload in development for rapid iteration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { AgentConfig } from '../types/engine-types';

export class ConfigurationManager {
  private configCache = new Map<string, any>();
  private watchers = new Map<string, fs.FSWatcher>();
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(__dirname, '../../config');
    
    // Enable hot-reload in development
    if (process.env.NODE_ENV === 'development') {
      this.enableHotReload();
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