/**
 * Task Introspection Tool
 * 
 * Provides agents with the ability to understand and reason about their current task
 * without direct database access. All introspection is scoped to the current task only.
 * 
 * This tool enables agents to:
 * - Query task template details and structure
 * - Analyze task progress and completeness
 * - Review collected data fields
 * - Understand task objectives and requirements
 */

import { BaseTool } from './base-tool';
import { DatabaseService } from '../services/database';
import { createTaskLogger } from '../utils/logger';

export interface TaskIntrospectionParams {
  taskId: string;
  userId: string;
  aspectToInspect?: 'template' | 'progress' | 'data' | 'objectives' | 'all';
}

export interface TaskIntrospectionResult {
  taskId: string;
  template?: {
    id: string;
    name: string;
    description: string;
    category: string;
    requiredFields: string[];
    optionalFields: string[];
    expectedOutcome: string;
  };
  progress?: {
    status: string;
    completeness: number;
    stepsCompleted: number;
    totalSteps: number;
    currentStep: string;
    blockers: string[];
    lastActivity: string;
    timeElapsed: string;
  };
  collectedData?: {
    fields: Record<string, any>;
    missingRequired: string[];
    validationIssues: string[];
    dataQuality: number; // 0-100 score
    lastUpdated: string;
  };
  objectives?: {
    primaryGoal: string;
    subGoals: string[];
    successCriteria: string[];
    currentFocus: string;
    nextActions: string[];
  };
  insights?: {
    summary: string;
    recommendations: string[];
    warnings: string[];
  };
}

export class TaskIntrospectionTool extends BaseTool {
  private db: DatabaseService;

  constructor() {
    super();
    this.db = DatabaseService.getInstance();
  }

  get name(): string {
    return 'TaskIntrospection';
  }

  get description(): string {
    return 'Introspective analysis of current task internals: processing state, requirements, and progress. SCOPE: Task-specific internal analysis only - NOT for general data access or cross-task queries.';
  }

  /**
   * Main introspection method
   */
  async introspect(params: TaskIntrospectionParams): Promise<TaskIntrospectionResult> {
    const { taskId, userId, aspectToInspect = 'all' } = params;
    const taskLogger = createTaskLogger(taskId);

    try {
      taskLogger.info('📊 Starting task introspection', { 
        taskId, 
        aspect: aspectToInspect 
      });

      // Get task data (scoped to user and task)
      const task = await this.db.getTask(userId, taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found or unauthorized`);
      }

      // Get task context history
      const contextHistory = await this.db.getContextHistory(userId, taskId, 50);

      // Build introspection result based on requested aspect
      const result: TaskIntrospectionResult = {
        taskId
      };

      if (aspectToInspect === 'all' || aspectToInspect === 'template') {
        result.template = await this.analyzeTemplate(task, contextHistory);
      }

      if (aspectToInspect === 'all' || aspectToInspect === 'progress') {
        result.progress = await this.analyzeProgress(task, contextHistory);
      }

      if (aspectToInspect === 'all' || aspectToInspect === 'data') {
        result.collectedData = await this.analyzeCollectedData(task, contextHistory);
      }

      if (aspectToInspect === 'all' || aspectToInspect === 'objectives') {
        result.objectives = await this.analyzeObjectives(task, contextHistory);
      }

      // Generate insights based on the analysis
      result.insights = this.generateInsights(result);

      taskLogger.info('✅ Task introspection completed', {
        taskId,
        hasTemplate: !!result.template,
        hasProgress: !!result.progress,
        hasData: !!result.collectedData,
        hasObjectives: !!result.objectives
      });

      return result;

    } catch (error) {
      taskLogger.error('Task introspection failed', error);
      throw error;
    }
  }

  /**
   * Analyze task template and structure
   */
  private async analyzeTemplate(task: any, history: any[]): Promise<any> {
    const taskLogger = createTaskLogger(task.id);

    try {
      // Extract template information from task metadata
      const metadata = task.metadata || {};
      const taskDefinition = metadata.taskDefinition || {};
      
      // Determine required and optional fields from history
      const requiredFields = this.extractRequiredFields(history);
      const optionalFields = this.extractOptionalFields(history);

      return {
        id: metadata.taskTemplateId || task.task_type || 'unknown',
        name: task.title || taskDefinition.name || 'Task',
        description: task.description || taskDefinition.description || '',
        category: taskDefinition.category || task.task_type || 'general',
        requiredFields,
        optionalFields,
        expectedOutcome: taskDefinition.expectedOutcome || 
                        this.inferExpectedOutcome(task.task_type)
      };
    } catch (error) {
      taskLogger.warn('Failed to analyze template', error);
      return null;
    }
  }

  /**
   * Analyze task progress and completeness
   */
  private async analyzeProgress(task: any, history: any[]): Promise<any> {
    const taskLogger = createTaskLogger(task.id);

    try {
      // Calculate progress metrics
      const totalSteps = this.countTotalSteps(history);
      const completedSteps = this.countCompletedSteps(history);
      const completeness = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

      // Find current step and blockers
      const currentStep = this.findCurrentStep(history);
      const blockers = this.identifyBlockers(history);

      // Calculate time elapsed
      const createdAt = new Date(task.created_at);
      const now = new Date();
      const timeElapsed = this.formatTimeElapsed(now.getTime() - createdAt.getTime());

      // Get last activity
      const lastActivity = history.length > 0 
        ? history[history.length - 1].operation 
        : 'No activity yet';

      return {
        status: task.status,
        completeness: Math.round(completeness),
        stepsCompleted: completedSteps,
        totalSteps,
        currentStep,
        blockers,
        lastActivity,
        timeElapsed
      };
    } catch (error) {
      taskLogger.warn('Failed to analyze progress', error);
      return null;
    }
  }

  /**
   * Analyze collected data fields
   */
  private async analyzeCollectedData(task: any, history: any[]): Promise<any> {
    const taskLogger = createTaskLogger(task.id);

    try {
      // Extract all collected data from history
      const collectedFields: Record<string, any> = {};
      const validationIssues: string[] = [];

      for (const entry of history) {
        if (entry.data?.extractedData) {
          Object.assign(collectedFields, entry.data.extractedData);
        }
        if (entry.data?.formData) {
          Object.assign(collectedFields, entry.data.formData);
        }
      }

      // Identify missing required fields
      const requiredFields = this.extractRequiredFields(history);
      const missingRequired = requiredFields.filter(field => !collectedFields[field]);

      // Calculate data quality score
      const dataQuality = this.calculateDataQuality(collectedFields, requiredFields);

      // Find last update time
      const lastDataUpdate = history
        .filter(h => h.data?.extractedData || h.data?.formData)
        .pop();
      const lastUpdated = lastDataUpdate?.timestamp || task.created_at;

      return {
        fields: collectedFields,
        missingRequired,
        validationIssues,
        dataQuality,
        lastUpdated
      };
    } catch (error) {
      taskLogger.warn('Failed to analyze collected data', error);
      return null;
    }
  }

  /**
   * Analyze task objectives and requirements
   */
  private async analyzeObjectives(task: any, history: any[]): Promise<any> {
    const taskLogger = createTaskLogger(task.id);

    try {
      // Determine primary goal based on task type
      const primaryGoal = this.determinePrimaryGoal(task);
      
      // Extract sub-goals from task history
      const subGoals = this.extractSubGoals(history);
      
      // Define success criteria
      const successCriteria = this.defineSuccessCriteria(task, history);
      
      // Determine current focus
      const currentFocus = this.determineCurrentFocus(history);
      
      // Suggest next actions
      const nextActions = this.suggestNextActions(task, history);

      return {
        primaryGoal,
        subGoals,
        successCriteria,
        currentFocus,
        nextActions
      };
    } catch (error) {
      taskLogger.warn('Failed to analyze objectives', error);
      return null;
    }
  }

  /**
   * Generate insights based on introspection results
   */
  private generateInsights(result: TaskIntrospectionResult): any {
    const insights = {
      summary: '',
      recommendations: [] as string[],
      warnings: [] as string[]
    };

    // Generate summary
    if (result.progress) {
      insights.summary = `Task is ${result.progress.completeness}% complete with ${result.progress.stepsCompleted} of ${result.progress.totalSteps} steps done.`;
      
      if (result.collectedData?.missingRequired?.length) {
        insights.summary += ` Missing ${result.collectedData.missingRequired.length} required fields.`;
      }
    }

    // Generate recommendations
    if (result.collectedData?.missingRequired?.length) {
      insights.recommendations.push(
        `Collect missing required fields: ${result.collectedData.missingRequired.join(', ')}`
      );
    }

    if (result.progress?.blockers?.length) {
      insights.recommendations.push(
        `Address blockers: ${result.progress.blockers.join(', ')}`
      );
    }

    if (result.objectives?.nextActions?.length) {
      insights.recommendations.push(...result.objectives.nextActions);
    }

    // Generate warnings
    if (result.collectedData?.dataQuality && result.collectedData.dataQuality < 50) {
      insights.warnings.push('Data quality is below acceptable threshold');
    }

    if (result.progress?.completeness === 0) {
      insights.warnings.push('No progress has been made on this task');
    }

    return insights;
  }

  // Helper methods

  private extractRequiredFields(history: any[]): string[] {
    // Extract from UIRequests in history
    const fields = new Set<string>();
    
    for (const entry of history) {
      if (entry.data?.uiRequest?.semanticData?.fields) {
        for (const field of entry.data.uiRequest.semanticData.fields) {
          if (field.required) {
            fields.add(field.name);
          }
        }
      }
    }

    // Add common required fields based on patterns
    if (history.some(h => h.operation?.includes('business'))) {
      fields.add('businessName');
      fields.add('businessAddress');
    }

    return Array.from(fields);
  }

  private extractOptionalFields(history: any[]): string[] {
    const fields = new Set<string>();
    
    for (const entry of history) {
      if (entry.data?.uiRequest?.semanticData?.fields) {
        for (const field of entry.data.uiRequest.semanticData.fields) {
          if (!field.required) {
            fields.add(field.name);
          }
        }
      }
    }

    return Array.from(fields);
  }

  private countTotalSteps(history: any[]): number {
    // Estimate based on task patterns
    const hasBusinessRegistration = history.some(h => 
      h.operation?.includes('business') || h.operation?.includes('registration')
    );
    
    if (hasBusinessRegistration) {
      return 8; // Typical business registration has ~8 steps
    }
    
    return Math.max(5, history.length); // Default estimate
  }

  private countCompletedSteps(history: any[]): number {
    const completedOperations = new Set<string>();
    
    for (const entry of history) {
      if (entry.operation && entry.data?.status === 'success') {
        completedOperations.add(entry.operation);
      }
    }
    
    return completedOperations.size;
  }

  private findCurrentStep(history: any[]): string {
    // Find last UI request or operation
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].data?.uiRequest) {
        return `Waiting for: ${history[i].data.uiRequest.semanticData?.title || 'user input'}`;
      }
      if (history[i].operation) {
        return `Processing: ${history[i].operation}`;
      }
    }
    
    return 'Initial setup';
  }

  private identifyBlockers(history: any[]): string[] {
    const blockers: string[] = [];
    
    // Check for pending UI requests
    const pendingUIRequests = history.filter(h => 
      h.data?.uiRequest && !h.data?.uiResponse
    );
    
    if (pendingUIRequests.length > 0) {
      blockers.push('Waiting for user input');
    }
    
    // Check for errors
    const errors = history.filter(h => h.data?.error);
    if (errors.length > 0) {
      blockers.push('Previous errors need resolution');
    }
    
    return blockers;
  }

  private calculateDataQuality(fields: Record<string, any>, required: string[]): number {
    if (required.length === 0) return 100;
    
    const filledRequired = required.filter(field => fields[field]).length;
    const completeness = (filledRequired / required.length) * 100;
    
    // Additional quality checks
    let qualityScore = completeness;
    
    // Penalize for empty or very short values
    for (const value of Object.values(fields)) {
      if (typeof value === 'string' && value.length < 2) {
        qualityScore -= 5;
      }
    }
    
    return Math.max(0, Math.min(100, Math.round(qualityScore)));
  }

  private determinePrimaryGoal(task: any): string {
    if (task.description) {
      return task.description;
    }
    
    switch (task.task_type) {
      case 'onboarding':
        return 'Complete business registration and setup';
      case 'statement_of_information':
        return 'File Statement of Information with California Secretary of State';
      default:
        return `Complete ${task.task_type || 'task'} successfully`;
    }
  }

  private extractSubGoals(history: any[]): string[] {
    const goals = new Set<string>();
    
    for (const entry of history) {
      if (entry.data?.uiRequest?.semanticData?.title) {
        goals.add(entry.data.uiRequest.semanticData.title);
      }
    }
    
    return Array.from(goals);
  }

  private defineSuccessCriteria(task: any, _history: any[]): string[] {
    const criteria: string[] = [];
    
    // Add task-specific criteria
    if (task.task_type === 'onboarding') {
      criteria.push('Business information collected');
      criteria.push('Registration documents prepared');
      criteria.push('Compliance requirements identified');
    }
    
    // Add completion criteria
    criteria.push('All required fields collected');
    criteria.push('No validation errors');
    criteria.push('Task marked as complete');
    
    return criteria;
  }

  private determineCurrentFocus(history: any[]): string {
    if (history.length === 0) {
      return 'Getting started';
    }
    
    const lastEntry = history[history.length - 1];
    
    if (lastEntry.data?.uiRequest) {
      return `Collecting: ${lastEntry.data.uiRequest.semanticData?.title || 'information'}`;
    }
    
    if (lastEntry.operation) {
      return `Working on: ${lastEntry.operation}`;
    }
    
    return 'Processing';
  }

  private suggestNextActions(task: any, history: any[]): string[] {
    const actions: string[] = [];
    
    // Check for missing required data
    const required = this.extractRequiredFields(history);
    const collected = this.extractCollectedFields(history);
    const missing = required.filter(field => !collected[field]);
    
    if (missing.length > 0) {
      actions.push(`Collect missing information: ${missing.join(', ')}`);
    }
    
    // Check task status
    if (task.status === 'created' || task.status === 'pending') {
      actions.push('Begin task execution');
    }
    
    if (task.status === 'in_progress' && missing.length === 0) {
      actions.push('Review collected information');
      actions.push('Proceed to submission');
    }
    
    return actions;
  }

  private extractCollectedFields(history: any[]): Record<string, any> {
    const fields: Record<string, any> = {};
    
    for (const entry of history) {
      if (entry.data?.extractedData) {
        Object.assign(fields, entry.data.extractedData);
      }
      if (entry.data?.formData) {
        Object.assign(fields, entry.data.formData);
      }
    }
    
    return fields;
  }

  private inferExpectedOutcome(taskType: string): string {
    switch (taskType) {
      case 'onboarding':
        return 'Business successfully registered and ready to operate';
      case 'statement_of_information':
        return 'Statement of Information filed and confirmation received';
      default:
        return 'Task completed successfully';
    }
  }

  private formatTimeElapsed(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}, ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
    }
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}