import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Task Template Schema
export const TaskTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['compliance', 'tax', 'insurance', 'registration', 'reporting']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  estimatedDuration: z.number(), // in minutes
  requiredAgents: z.array(z.string()),
  requiredTools: z.array(z.string()),
  steps: z.array(z.object({
    id: z.string(),
    name: z.string(),
    agent: z.string(),
    action: z.string(),
    inputs: z.record(z.any()).optional(),
    outputs: z.array(z.string()).optional(),
    conditions: z.object({
      pre: z.array(z.string()).optional(),
      post: z.array(z.string()).optional()
    }).optional(),
    errorHandling: z.object({
      retryCount: z.number().optional(),
      fallbackAction: z.string().optional(),
      escalationAgent: z.string().optional()
    }).optional()
  })),
  dataRequirements: z.array(z.object({
    field: z.string(),
    type: z.string(),
    source: z.string().optional(),
    required: z.boolean(),
    validation: z.string().optional()
  })),
  deadlineRules: z.object({
    type: z.enum(['fixed', 'relative', 'recurring']),
    value: z.string(), // e.g., "2024-12-31", "30 days", "annually"
    alertThreshold: z.number().optional() // days before deadline
  }).optional(),
  compliance: z.object({
    jurisdiction: z.string(),
    formNumber: z.string().optional(),
    regulatoryBody: z.string(),
    penalties: z.string().optional()
  }).optional()
});

export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

export class TemplateParser {
  private templates: Map<string, TaskTemplate> = new Map();
  private templateDir: string;

  constructor(templateDir: string = path.join(__dirname, 'tasks')) {
    this.templateDir = templateDir;
  }

  async loadTemplate(templateId: string): Promise<TaskTemplate> {
    // Check cache first
    if (this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    try {
      const filePath = path.join(this.templateDir, `${templateId}.yaml`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const rawTemplate = yaml.load(fileContent) as any;
      
      // Validate against schema
      const template = TaskTemplateSchema.parse(rawTemplate);
      
      // Cache the template
      this.templates.set(templateId, template);
      
      logger.info('Template loaded successfully', {
        templateId,
        name: template.name
      });
      
      return template;
    } catch (error) {
      logger.error('Failed to load template', {
        templateId,
        error
      });
      throw new Error(`Failed to load template ${templateId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async loadAllTemplates(): Promise<void> {
    try {
      const files = await fs.readdir(this.templateDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      for (const file of yamlFiles) {
        const templateId = path.basename(file, path.extname(file));
        await this.loadTemplate(templateId);
      }
      
      logger.info('All templates loaded', {
        count: this.templates.size
      });
    } catch (error) {
      logger.error('Failed to load templates', error);
      throw error;
    }
  }

  getTemplate(templateId: string): TaskTemplate | undefined {
    return this.templates.get(templateId);
  }

  getAllTemplates(): TaskTemplate[] {
    return Array.from(this.templates.values());
  }

  validateTemplate(template: any): boolean {
    try {
      TaskTemplateSchema.parse(template);
      return true;
    } catch (error) {
      logger.error('Template validation failed', error);
      return false;
    }
  }

  async saveTemplate(template: TaskTemplate): Promise<void> {
    try {
      const filePath = path.join(this.templateDir, `${template.id}.yaml`);
      const yamlContent = yaml.dump(template, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });
      
      await fs.writeFile(filePath, yamlContent, 'utf-8');
      this.templates.set(template.id, template);
      
      logger.info('Template saved', {
        templateId: template.id,
        path: filePath
      });
    } catch (error) {
      logger.error('Failed to save template', {
        templateId: template.id,
        error
      });
      throw error;
    }
  }

  getTemplatesByCategory(category: string): TaskTemplate[] {
    return Array.from(this.templates.values())
      .filter(t => t.category === category);
  }

  getTemplatesByAgent(agentRole: string): TaskTemplate[] {
    return Array.from(this.templates.values())
      .filter(t => t.requiredAgents.includes(agentRole));
  }

  async reloadTemplates(): Promise<void> {
    this.templates.clear();
    await this.loadAllTemplates();
  }
}