/**
 * Declarative Template Parser
 * 
 * Supports the new goals-driven, declarative template format
 * that aligns with our Universal Engine Architecture.
 * 
 * Templates define WHAT to achieve, not HOW to achieve it.
 * The OrchestratorAgent uses LLM reasoning to determine execution.
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { TaskTemplate } from '../types/engine-types';

// Declarative Goal Schema
const GoalSchema = z.object({
  id: z.string(),
  description: z.string(),
  required: z.boolean(),
  successCriteria: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

// Phase Schema (high-level, not prescriptive)
const PhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().optional(),
  canRunInBackground: z.boolean().optional(),
  requiresUserInteraction: z.union([z.boolean(), z.literal('maybe')]).optional()
});

// Fallback Strategy Schema
const FallbackStrategySchema = z.object({
  trigger: z.string(),
  action: z.string(),
  message: z.string()
});

// Declarative Task Template Schema
export const DeclarativeTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  estimatedDuration: z.number().optional(), // in minutes
  
  // Goals-driven architecture
  goals: z.object({
    primary: z.array(GoalSchema),
    secondary: z.array(GoalSchema).optional()
  }),
  
  // Required inputs (declarative)
  requiredInputs: z.object({
    minimal: z.array(z.string()),
    recommended: z.array(z.string()).optional(),
    optional: z.array(z.string()).optional()
  }).optional(),
  
  // Success criteria
  completionCriteria: z.array(z.string()).optional(),
  
  // High-level phases (not execution steps)
  phases: z.array(PhaseSchema).optional(),
  
  // Fallback strategies
  fallbackStrategies: z.array(FallbackStrategySchema).optional(),
  
  // Metadata
  metadata: z.record(z.any()).optional(),
  
  // Agent hints (not requirements)
  agentHints: z.array(z.string()).optional(),
  
  // Available data sources
  availableDataSources: z.array(z.string()).optional()
});

export type DeclarativeTemplate = z.infer<typeof DeclarativeTemplateSchema>;

export class DeclarativeTemplateParser {
  private templates: Map<string, TaskTemplate> = new Map();
  private templateDirs: string[];

  constructor(templateDirs?: string[]) {
    this.templateDirs = templateDirs || [
      path.join(__dirname, 'tasks'),
      path.join(process.cwd(), 'src', 'templates', 'tasks'),
      path.join(process.cwd(), 'config', 'templates')
    ];
  }

  /**
   * Load a declarative template and convert to TaskTemplate format
   */
  async loadTemplate(templateId: string): Promise<TaskTemplate> {
    // Check cache first
    if (this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    // Try to find template in any of the directories
    for (const dir of this.templateDirs) {
      const filePath = path.join(dir, `${templateId}.yaml`);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const rawTemplate = yaml.load(fileContent) as any;
        
        // Handle wrapped format (task_template: {...})
        const templateData = rawTemplate.task_template || rawTemplate;
        
        // Parse with declarative schema
        const declarativeTemplate = DeclarativeTemplateSchema.parse(templateData);
        
        // Convert to TaskTemplate format for compatibility
        const template: TaskTemplate = {
          id: declarativeTemplate.id,
          version: '1.0.0',
          metadata: {
            name: declarativeTemplate.name,
            description: declarativeTemplate.description,
            category: declarativeTemplate.category,
            priority: declarativeTemplate.priority,
            estimatedDuration: declarativeTemplate.estimatedDuration,
            ...declarativeTemplate.metadata
          },
          goals: declarativeTemplate.goals,
          
          // Optional fields for backward compatibility
          requiredInputs: declarativeTemplate.requiredInputs,
          completionCriteria: declarativeTemplate.completionCriteria,
          phases: declarativeTemplate.phases?.map(phase => ({
            id: phase.id,
            name: phase.name,
            description: phase.description,
            agents: declarativeTemplate.agentHints || [], // Use hints as agent suggestions
            maxDuration: (phase.estimatedMinutes || 10) * 60, // Convert to seconds
            canSkip: !phase.requiresUserInteraction
          })),
          fallbackStrategies: declarativeTemplate.fallbackStrategies,
          
          // Legacy fields (empty for declarative templates)
          agents: declarativeTemplate.agentHints
        };
        
        // Cache the template
        this.templates.set(templateId, template);
        
        logger.info('Declarative template loaded successfully', {
          templateId,
          name: template.metadata.name,
          primaryGoals: template.goals.primary.length,
          secondaryGoals: template.goals.secondary?.length || 0
        });
        
        return template;
        
      } catch (error) {
        // Continue to next directory if file not found or parse error
        if (error instanceof Error && !error.message.includes('ENOENT')) {
          logger.debug(`Failed to load template from ${filePath}:`, error.message);
        }
        continue;
      }
    }
    
    // Template not found in any directory
    throw new Error(`Template not found: ${templateId} in any of: ${this.templateDirs.join(', ')}`);
  }

  /**
   * Load all templates from all directories
   */
  async loadAllTemplates(): Promise<Map<string, TaskTemplate>> {
    const allTemplates = new Map<string, TaskTemplate>();
    
    for (const dir of this.templateDirs) {
      try {
        const files = await fs.readdir(dir);
        const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
        
        for (const file of yamlFiles) {
          const templateId = file.replace(/\.(yaml|yml)$/, '');
          
          // Skip if already loaded from another directory
          if (allTemplates.has(templateId)) {
            continue;
          }
          
          try {
            const template = await this.loadTemplate(templateId);
            allTemplates.set(templateId, template);
          } catch (error) {
            logger.error(`Failed to load template ${templateId}:`, error);
          }
        }
      } catch (error) {
        // Directory might not exist, continue
        logger.debug(`Could not read directory ${dir}:`, error);
      }
    }
    
    logger.info(`Loaded ${allTemplates.size} declarative templates`);
    return allTemplates;
  }

  /**
   * Validate that a template follows declarative principles
   */
  validateDeclarativePrinciples(template: DeclarativeTemplate): boolean {
    // Check that template doesn't contain prescriptive execution details
    const hasGoals = template.goals.primary.length > 0;
    const noExecutionSteps = !('steps' in template) && !('requiredAgents' in template);
    const phasesAreHighLevel = !template.phases || 
      template.phases.every(p => !('action' in p) && !('inputs' in p));
    
    if (!hasGoals) {
      logger.warn(`Template ${template.id} has no primary goals defined`);
      return false;
    }
    
    if (!noExecutionSteps) {
      logger.warn(`Template ${template.id} contains prescriptive execution details`);
      return false;
    }
    
    if (!phasesAreHighLevel) {
      logger.warn(`Template ${template.id} phases contain low-level execution details`);
      return false;
    }
    
    return true;
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templates.clear();
    logger.info('Template cache cleared');
  }
}