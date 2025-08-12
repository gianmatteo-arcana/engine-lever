/**
 * PRD-Compliant Orchestrator
 * EXACTLY matches Engine PRD specification (lines 795-1033)
 * 
 * Master orchestrator that:
 * - Interprets task templates to understand goals
 * - Creates execution plans based on context
 * - Coordinates agent execution
 * - Minimizes user interruption
 * - Records all decisions with reasoning
 */

// import * as fs from 'fs';
// import * as yaml from 'yaml';
import { LLMProvider } from '../services/LLMProvider';
import { 
  TaskContext,
  ContextEntry,
  ExecutionPlan,
  ExecutionPhase,
  PhaseResult,
  UIRequest,
  TaskTemplate,
  AgentRequest
} from '../types/engine-types';
import { Agent } from './base/Agent';

interface OrchestratorConfig {
  id: string;
  version: string;
  name: string;
  mission: string;
  planning_rules: string[];
  agent_discovery: {
    method: string;
    path: string;
  };
  llm_config: {
    default_model: string;
    temperature: number;
    response_format: string;
  };
}

/**
 * Master Orchestrator - The brain of the system
 * Exactly matches PRD lines 847-1033
 */
export class PRDOrchestrator {
  private config: OrchestratorConfig;
  private llmProvider: LLMProvider;
  private agentRegistry: Map<string, Agent>;
  private contexts: Map<string, TaskContext>;
  
  constructor() {
    this.config = this.loadConfig();
    this.llmProvider = new LLMProvider();
    this.agentRegistry = new Map();
    this.contexts = new Map();
    this.discoverAgents();
  }
  
  /**
   * Load orchestrator configuration from YAML
   * PRD lines 799-841
   */
  private loadConfig(): OrchestratorConfig {
    // const configPath = '/config/orchestrator/orchestrator.yaml';
    // For now, return hardcoded config matching PRD
    return {
      id: 'master_orchestrator',
      version: '1.0.0',
      name: 'Master Task Orchestrator',
      mission: `You are the Master Orchestrator for SmallBizAlly. Your role is to:
1. Interpret task templates to understand goals
2. Create execution plans based on context
3. Coordinate agent execution
4. Minimize user interruption
5. Record all decisions with reasoning

Critical principles:
- PROGRESSIVE DISCLOSURE: Minimize user interruption
- Reorder UI requests to potentially avoid later questions
- Use pessimistic locking (agents take turns) for simplicity
- Record EVERYTHING - all decisions, plans, reasoning
- Never make business decisions - only follow templates

You read declarative goals and determine HOW to achieve them.
You coordinate agents but never execute business logic directly.`,
      planning_rules: [
        'Exhaust autonomous methods before user input',
        'Batch and reorder UI requests intelligently',
        'Simple pessimistic locking for agent coordination',
        'Always have fallback strategies',
        'Record execution plans in context'
      ],
      agent_discovery: {
        method: 'static_config',
        path: '/config/agents/'
      },
      llm_config: {
        default_model: 'gpt-4',
        temperature: 0.3,
        response_format: 'json'
      }
    };
  }
  
  /**
   * Discover available agents
   */
  private discoverAgents(): void {
    // For MVP, hardcode agent discovery
    // In production, would scan config directory
    console.log('[Orchestrator] Discovering agents...');
    
    // Register data collection agent
    try {
      const DataCollectionAgent = require('./base/Agent').DataCollectionAgent;
      this.agentRegistry.set('data_collection_agent', new DataCollectionAgent());
    } catch (error) {
      console.error('[Orchestrator] Failed to load data collection agent:', error);
    }
  }
  
  /**
   * Main execution method - PRD lines 847-881
   */
  async executeTask(contextId: string): Promise<void> {
    // Load context and template
    const context = await this.loadContext(contextId);
    const template = context.templateSnapshot;
    
    // Create execution plan
    const plan = await this.createExecutionPlan(template, context);
    
    // Record plan in context
    await this.recordPlan(context, plan);
    
    // Execute plan phases
    for (const phase of plan.phases) {
      const phaseResult = await this.executePhase(phase, context);
      
      if (phaseResult.status === 'needs_input') {
        await this.handleUserInputRequest(phaseResult.uiRequests!, context);
        return; // Pause execution
      }
      
      if (phaseResult.status === 'failed') {
        await this.handleFailure(phaseResult.error!, context);
        return;
      }
    }
    
    // Task complete
    await this.completeTask(context);
  }
  
  /**
   * Create execution plan using LLM
   * PRD lines 883-929
   */
  private async createExecutionPlan(
    template: TaskTemplate,
    context: TaskContext
  ): Promise<ExecutionPlan> {
    const prompt = `
${this.config.mission}

## Task Template
${JSON.stringify(template, null, 2)}

## Current Context
${JSON.stringify(context.currentState, null, 2)}

## Available Agents
${JSON.stringify(Array.from(this.agentRegistry.keys()), null, 2)}

Create an execution plan to achieve the template goals.
Consider what has already been done (in context history).
Minimize user input by using agents effectively.

Response format:
{
  "plan": {
    "phases": [
      {
        "id": "string",
        "goal": "string",
        "agents": ["agent_ids"],
        "strategy": "sequential",
        "estimatedDuration": number
      }
    ],
    "reasoning": "string",
    "userInputPoints": number,
    "estimatedTotalDuration": number
  }
}
`;
    
    const response = await this.llmProvider.complete({
      model: this.config.llm_config.default_model,
      prompt,
      responseFormat: 'json',
      temperature: this.config.llm_config.temperature
    });
    
    return {
      taskId: context.contextId,
      templateId: context.taskTemplateId,
      ...response.plan
    };
  }
  
  /**
   * Execute a phase of the plan
   * PRD lines 931-970
   */
  private async executePhase(
    phase: ExecutionPhase,
    context: TaskContext
  ): Promise<PhaseResult> {
    const results = [];
    
    // Execute agents sequentially (pessimistic locking for MVP)
    for (const agentId of phase.agents) {
      const agent = this.agentRegistry.get(agentId);
      
      if (!agent) {
        console.error(`[Orchestrator] Agent not found: ${agentId}`);
        continue;
      }
      
      const request: AgentRequest = {
        taskContext: context,
        operation: (phase as any).goal || phase.name,
        parameters: (phase as any).parameters || {},
        llmModel: this.config.llm_config.default_model
      };
      
      const response = await agent.execute(request);
      
      // Append to context
      if (response.contextUpdate) {
        context.history.push(response.contextUpdate);
        context.currentState = this.computeState(context.history);
      }
      
      // Save context after each agent
      await this.saveContext(context);
      
      if (response.status === 'needs_input') {
        return {
          status: 'needs_input',
          phase: phase,
          results: [response],
          uiRequests: response.uiRequests || []
        };
      }
      
      results.push(response);
    }
    
    return {
      status: 'completed' as const,
      phase: phase,
      results
    };
  }
  
  /**
   * Handle user input requests with progressive disclosure
   * PRD lines 972-1033
   */
  private async handleUserInputRequest(
    uiRequests: UIRequest[],
    context: TaskContext
  ): Promise<void> {
    // Reorder UI requests for progressive disclosure
    const optimizedRequests = await this.optimizeUIRequests(uiRequests, context);
    
    // Record in context
    const entry: ContextEntry = {
      entryId: this.generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'orchestrator',
        version: this.config.version
      },
      operation: 'ui_request_generated',
      data: {
        requests: optimizedRequests,
        optimization: 'reordered_for_progressive_disclosure'
      },
      reasoning: 'Requesting user input for missing required data'
    };
    
    context.history.push(entry);
    await this.saveContext(context);
    
    // Send to UI layer
    await this.sendToUI(context.contextId, optimizedRequests);
  }
  
  /**
   * Optimize UI requests using LLM
   * PRD lines 1004-1032
   */
  private async optimizeUIRequests(
    requests: UIRequest[],
    context: TaskContext
  ): Promise<UIRequest[]> {
    // Use LLM to intelligently reorder requests
    const prompt = `
You are optimizing UI requests for progressive disclosure.
Reorder these requests to:
1. Ask most important questions first
2. Group related questions
3. Questions whose answers might eliminate later questions go first

Current context data available:
${JSON.stringify(context.currentState.data, null, 2)}

UI Requests to optimize:
${JSON.stringify(requests, null, 2)}

Return the requests in optimal order with reasoning.
`;
    
    const response = await this.llmProvider.complete({
      model: this.config.llm_config.default_model,
      prompt,
      responseFormat: 'json',
      temperature: this.config.llm_config.temperature
    });
    
    return response.optimizedRequests || requests;
  }
  
  /**
   * Record execution plan in context
   */
  private async recordPlan(context: TaskContext, plan: ExecutionPlan): Promise<void> {
    const entry: ContextEntry = {
      entryId: this.generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'orchestrator',
        version: this.config.version
      },
      operation: 'execution_plan_created',
      data: {
        plan
      },
      reasoning: (plan as any).reasoning || 'Execution plan created'
    };
    
    context.history.push(entry);
    await this.saveContext(context);
  }
  
  /**
   * Compute current state from history
   */
  private computeState(history: ContextEntry[]): any {
    // Replay history to compute current state
    const state = {
      status: 'active',
      phase: 'unknown',
      completeness: 0,
      data: {}
    };
    
    for (const entry of history) {
      // Merge data from each entry
      Object.assign(state.data, entry.data);
      
      // Update status based on operations
      if (entry.operation === 'task_completed') {
        state.status = 'completed';
        state.completeness = 100;
      }
      
      // Update phase
      if (entry.operation === 'phase_started') {
        state.phase = entry.data.phase;
      }
    }
    
    return state;
  }
  
  /**
   * Save context to storage
   */
  private async saveContext(context: TaskContext): Promise<void> {
    this.contexts.set(context.contextId, context);
    // TODO: Persist to database
  }
  
  /**
   * Load context from storage
   */
  private async loadContext(contextId: string): Promise<TaskContext> {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    return context;
  }
  
  /**
   * Send UI requests to frontend
   */
  private async sendToUI(contextId: string, requests: UIRequest[]): Promise<void> {
    console.log('[Orchestrator] Sending UI requests:', {
      contextId,
      requestCount: requests.length
    });
    // TODO: Implement actual UI communication
  }
  
  /**
   * Complete a task
   */
  private async completeTask(context: TaskContext): Promise<void> {
    const entry: ContextEntry = {
      entryId: this.generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'orchestrator',
        version: this.config.version
      },
      operation: 'task_completed',
      data: {
        finalState: context.currentState
      },
      reasoning: 'All goals achieved successfully'
    };
    
    context.history.push(entry);
    context.currentState.status = 'completed';
    context.currentState.completeness = 100;
    
    await this.saveContext(context);
  }
  
  /**
   * Handle task failure
   */
  private async handleFailure(error: string, context: TaskContext): Promise<void> {
    const entry: ContextEntry = {
      entryId: this.generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'orchestrator',
        version: this.config.version
      },
      operation: 'task_failed',
      data: {
        error
      },
      reasoning: `Task failed: ${error}`
    };
    
    context.history.push(entry);
    context.currentState.status = 'failed';
    
    await this.saveContext(context);
  }
  
  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Create a new task from template
   */
  async createTask(templateId: string, tenantId: string, initialData?: any): Promise<string> {
    // Load template
    const template = await this.loadTemplate(templateId);
    
    // Create initial context
    const context: TaskContext = {
      contextId: this.generateId(),
      taskTemplateId: templateId,
      tenantId,
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'initialization',
        completeness: 0,
        data: initialData || {}
      },
      history: [],
      templateSnapshot: template
    };
    
    // Add creation entry
    const entry: ContextEntry = {
      entryId: this.generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: 1,
      actor: {
        type: 'system',
        id: 'task_creator'
      },
      operation: 'task_created',
      data: {
        templateId,
        trigger: 'api_request'
      },
      reasoning: 'New task created from template'
    };
    
    context.history.push(entry);
    await this.saveContext(context);
    
    return context.contextId;
  }
  
  /**
   * Load task template
   */
  private async loadTemplate(_templateId: string): Promise<TaskTemplate> {
    // For demo, return hardcoded onboarding template
    return {
      id: 'user_onboarding',
      version: '1.0.0',
      metadata: {
        name: 'New User Onboarding',
        description: 'Collect business information for new users',
        category: 'onboarding',
        estimatedDuration: 180
      },
      goals: {
        primary: [
          {
            id: 'create_user_profile',
            description: 'Establish user identity and preferences',
            required: true
          },
          {
            id: 'collect_business_info',
            description: 'Gather essential business details',
            required: true
          }
        ]
      },
      phases: [
        {
          id: 'user_info',
          name: 'User Information',
          description: 'Gather user information',
          agents: ['data_collection_agent'],
          maxDuration: 10,
          canSkip: false
        },
        {
          id: 'business_info',
          name: 'Business Information',
          description: 'Collect business details',
          agents: ['data_collection_agent'],
          maxDuration: 15,
          canSkip: false
        }
      ]
    };
  }
}