/**
 * OrchestratorAgent - Universal Task Orchestration
 * 
 * Engine PRD Compliant Implementation (Lines 847-1033)
 * The single, universal orchestrator that handles ALL task types
 * 
 * CORE PRINCIPLES:
 * 1. Everything is a task, everything is configuration
 * 2. Zero special cases - handles onboarding, SOI, any task identically
 * 3. Progressive disclosure - minimize user interruption
 * 4. Complete traceability - record all decisions with reasoning
 * 5. Resilient fallbacks - graceful degradation when automation unavailable
 * 
 * This consolidates patterns from:
 * - PRDOrchestrator: LLM-powered planning and reasoning
 * - ResilientOrchestrator: Graceful degradation patterns
 * - A2AOrchestrator: Agent coordination protocol
 * - BaseOrchestrator: Core message handling
 */

// OrchestratorAgent is a special case - doesn't extend BaseAgent
// It's the master coordinator that manages all other agents
import { LLMProvider } from '../services/llm-provider-interface';
import { ConfigurationManager } from '../services/configuration-manager';
import { DatabaseService } from '../services/database';
import { StateComputer } from '../services/state-computer';
import { logger } from '../utils/logger';
import {
  TaskContext,
  TaskTemplate,
  ContextEntry,
  ExecutionPlan,
  ExecutionPhase,
  AgentRequest,
  AgentResponse,
  UIRequest,
  UITemplateType
} from '../types/engine-types';

/**
 * Orchestration configuration
 */
interface OrchestratorConfig {
  id: string;
  version: string;
  mission: string;
  planningRules: string[];
  progressiveDisclosure: {
    enabled: boolean;
    batchingStrategy: 'intelligent' | 'sequential' | 'priority';
    minBatchSize: number;
    maxUserInterruptions: number;
  };
  resilience: {
    fallbackStrategy: 'degrade' | 'guide' | 'fail';
    maxRetries: number;
    timeoutMs: number;
  };
}

/**
 * Agent capability definition
 */
interface AgentCapability {
  agentId: string;
  role: string;
  capabilities: string[];
  availability: 'available' | 'busy' | 'offline' | 'not_implemented';
  fallbackStrategy?: 'user_input' | 'alternative_agent' | 'defer';
}

/**
 * Universal OrchestratorAgent
 * The conductor of the SmallBizAlly symphony
 * 
 * NOTE: OrchestratorAgent is a special case - does NOT extend BaseAgent
 * It's the master coordinator that manages all DefaultAgent instances
 */
export class OrchestratorAgent {
  private static instance: OrchestratorAgent;
  
  private config: OrchestratorConfig;
  private llmProvider: LLMProvider;
  private configManager: ConfigurationManager;
  private dbService: DatabaseService;
  private stateComputer: StateComputer;
  
  // Agent registry and coordination
  private agentRegistry: Map<string, AgentCapability>;
  private activeExecutions: Map<string, ExecutionPlan>;
  private pendingUIRequests: Map<string, UIRequest[]>;
  
  private constructor() {
    this.config = this.loadConfig();
    this.llmProvider = new LLMProvider();
    this.configManager = new ConfigurationManager();
    this.dbService = DatabaseService.getInstance();
    this.stateComputer = new StateComputer();
    
    this.agentRegistry = new Map();
    this.activeExecutions = new Map();
    this.pendingUIRequests = new Map();
    
    this.initializeAgentRegistry();
  }
  
  /**
   * Singleton pattern for single orchestrator
   */
  public static getInstance(): OrchestratorAgent {
    if (!OrchestratorAgent.instance) {
      OrchestratorAgent.instance = new OrchestratorAgent();
    }
    return OrchestratorAgent.instance;
  }
  
  /**
   * Load orchestrator configuration
   * Engine PRD Lines 799-841
   */
  private loadConfig(): OrchestratorConfig {
    // In production, load from YAML
    // For now, return PRD-compliant config
    return {
      id: 'universal_orchestrator',
      version: '1.0.0',
      mission: `
        You are the Universal Task Orchestrator for SmallBizAlly.
        
        Your responsibilities:
        1. Interpret task templates to understand goals
        2. Create dynamic execution plans based on context
        3. Coordinate specialist agents to achieve goals
        4. Minimize user interruption through progressive disclosure
        5. Record all decisions with complete reasoning
        
        Critical principles:
        - UNIVERSAL: Handle ANY task type identically
        - PROGRESSIVE: Batch and reorder UI requests intelligently
        - RESILIENT: Gracefully degrade when automation unavailable
        - TRACEABLE: Record everything for complete audit trail
        - DECLARATIVE: Follow templates, never hardcode business logic
      `,
      planningRules: [
        'Exhaust autonomous methods before requesting user input',
        'Batch related UI requests to minimize interruptions',
        'Reorder questions to potentially avoid later ones',
        'Always have fallback strategies for unavailable services',
        'Record execution plans in TaskContext for traceability'
      ],
      progressiveDisclosure: {
        enabled: true,
        batchingStrategy: 'intelligent',
        minBatchSize: 3,
        maxUserInterruptions: 5
      },
      resilience: {
        fallbackStrategy: 'degrade',
        maxRetries: 3,
        timeoutMs: 30000
      }
    };
  }
  
  /**
   * Initialize agent registry with available agents
   */
  private initializeAgentRegistry(): void {
    // Discover available agents
    const agents: AgentCapability[] = [
      {
        agentId: 'business_discovery',
        role: 'data_enrichment',
        capabilities: ['business_lookup', 'ein_validation', 'address_verification'],
        availability: 'available'
      },
      {
        agentId: 'profile_collector',
        role: 'data_collection',
        capabilities: ['form_generation', 'data_validation', 'document_parsing'],
        availability: 'available'
      },
      {
        agentId: 'compliance_analyzer',
        role: 'legal_compliance',
        capabilities: ['requirement_analysis', 'deadline_tracking', 'form_preparation'],
        availability: 'available'
      },
      {
        agentId: 'payment_processor',
        role: 'payment',
        capabilities: ['payment_collection', 'receipt_generation'],
        availability: 'not_implemented',
        fallbackStrategy: 'user_input'
      }
    ];
    
    agents.forEach(agent => {
      this.agentRegistry.set(agent.agentId, agent);
    });
  }
  
  /**
   * Main orchestration entry point
   * Handles ANY task type through universal flow
   * Engine PRD Lines 847-881
   */
  public async orchestrateTask(context: TaskContext): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting universal task orchestration', {
        contextId: context.contextId,
        templateId: context.taskTemplateId,
        tenantId: context.tenantId
      });
      
      // 1. Create execution plan from template
      const executionPlan = await this.createExecutionPlan(context);
      this.activeExecutions.set(context.contextId, executionPlan);
      
      // 2. Record plan in context for traceability
      await this.recordContextEntry(context, {
        operation: 'execution_plan_created',
        data: { plan: executionPlan },
        reasoning: 'Generated execution plan from task template'
      });
      
      // 3. Execute plan phases
      for (const phase of executionPlan.phases) {
        const phaseResult = await this.executePhase(context, phase);
        
        // 4. Record phase completion
        await this.recordContextEntry(context, {
          operation: 'phase_completed',
          data: { 
            phaseId: (phase as any).id || phase.name,
            result: phaseResult,
            duration: phaseResult.duration
          },
          reasoning: `Completed phase: ${phase.name}`
        });
        
        // 5. Handle UI requests with progressive disclosure
        if (phaseResult.uiRequests && phaseResult.uiRequests.length > 0) {
          await this.handleProgressiveDisclosure(context, phaseResult.uiRequests);
        }
        
        // 6. Check if goals achieved
        if (await this.areGoalsAchieved(context)) {
          break;
        }
      }
      
      // 7. Mark task complete
      await this.completeTaskContext(context);
      
      logger.info('Task orchestration completed', {
        contextId: context.contextId,
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Orchestration failed', {
        contextId: context.contextId,
        error: errorMessage
      });
      
      // Apply resilience strategy
      await this.handleOrchestrationFailure(context, error);
    }
  }
  
  /**
   * Create execution plan using LLM
   * Engine PRD Lines 915-972
   */
  private async createExecutionPlan(context: TaskContext): Promise<ExecutionPlan> {
    const template = context.templateSnapshot;
    
    // Use LLM to create dynamic plan
    const planPrompt = `
      You are creating an execution plan for a task.
      
      Task Template: ${JSON.stringify(template)}
      Current Context: ${JSON.stringify(context.currentState)}
      
      Available Agents: ${JSON.stringify(Array.from(this.agentRegistry.values()))}
      
      Create an execution plan with phases that:
      1. Achieves all required goals in the template
      2. Minimizes user interruption
      3. Uses available agents efficiently
      4. Has fallback strategies for unavailable services
      
      Return a JSON execution plan with phases, agent assignments, and dependencies.
    `;
    
    const llmResponse = await this.llmProvider.complete({
      model: 'gpt-4',
      prompt: `${this.config.mission}\n\n${planPrompt}`,
      temperature: 0.3,
      responseFormat: 'json'
    });
    
    const plan = JSON.parse(llmResponse.content) as ExecutionPlan;
    
    // Validate and optimize plan
    return this.optimizePlan(plan, context);
  }
  
  /**
   * Execute a phase of the plan
   */
  private async executePhase(
    context: TaskContext,
    phase: ExecutionPhase
  ): Promise<any> {
    logger.info('Executing phase', {
      contextId: context.contextId,
      phaseId: (phase as any).id || phase.name,
      phaseName: phase.name
    });
    
    const phaseStart = Date.now();
    const results: any[] = [];
    const uiRequests: UIRequest[] = [];
    
    // Execute agents for this phase
    for (const agentId of (phase.agents || [])) {
      const agent = this.agentRegistry.get(agentId);
      
      if (!agent) {
        logger.warn('Agent not found', { agentId });
        continue;
      }
      
      if (agent.availability === 'available') {
        // Execute agent
        const agentResult = await this.executeAgent(context, agent, phase);
        results.push(agentResult);
        
        // Collect any UI requests
        if ((agentResult as any).uiRequest) {
          uiRequests.push((agentResult as any).uiRequest);
        } else if (agentResult.uiRequests) {
          uiRequests.push(...agentResult.uiRequests);
        }
      } else {
        // Apply fallback strategy
        const fallbackResult = await this.applyFallbackStrategy(context, agent, phase);
        results.push(fallbackResult);
        
        if ((fallbackResult as any).uiRequest) {
          uiRequests.push((fallbackResult as any).uiRequest);
        } else if (fallbackResult.uiRequests) {
          uiRequests.push(...fallbackResult.uiRequests);
        }
      }
    }
    
    return {
      phaseId: (phase as any).id || phase.name,
      status: 'completed',
      results,
      uiRequests,
      duration: Date.now() - phaseStart
    };
  }
  
  /**
   * Execute a specific agent
   */
  private async executeAgent(
    context: TaskContext,
    agent: AgentCapability,
    phase: ExecutionPhase
  ): Promise<AgentResponse> {
    // Create agent request
    const request: AgentRequest = {
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentRole: agent.role,
      instruction: (phase as any).operation || 'execute',
      data: (phase as any).input || {},
      context: { urgency: 'medium' as const },
      taskContext: context
    };
    
    // In real implementation, this would call the actual agent
    // For now, simulate agent execution
    logger.info('Executing agent', {
      agentId: agent.agentId,
      requestId: request.requestId
    });
    
    // Simulate agent response
    return {
      status: 'completed' as const,
      data: {
        message: `Agent ${agent.agentId} completed successfully`,
        agentId: agent.agentId
      },
      reasoning: `Executed ${agent.role} for ${phase.name}`
    };
  }
  
  /**
   * Apply fallback strategy when agent unavailable
   * Implements resilient degradation pattern
   */
  private async applyFallbackStrategy(
    context: TaskContext,
    agent: AgentCapability,
    phase: ExecutionPhase
  ): Promise<AgentResponse> {
    logger.warn('Applying fallback strategy', {
      agentId: agent.agentId,
      strategy: agent.fallbackStrategy || this.config.resilience.fallbackStrategy
    });
    
    const strategy = agent.fallbackStrategy || this.config.resilience.fallbackStrategy;
    
    switch (strategy) {
      case 'user_input':
        // Request data from user
        return {
          status: 'needs_input' as const,
          data: {
            agentId: agent.agentId
          },
          uiRequests: [this.createUserInputRequest(agent, phase)],
          reasoning: `Agent ${agent.agentId} unavailable, requesting user input`
        };
        
      case 'alternative_agent': {
        // Find alternative agent with similar capabilities
        const alternative = this.findAlternativeAgent(agent);
        if (alternative) {
          return this.executeAgent(context, alternative, phase);
        }
        // Fall through to defer if no alternative
      }
        
      case 'defer':
      default:
        // Defer this step for later
        return {
          status: 'delegated' as const,
          data: {
            message: `Step deferred: ${agent.role} unavailable`,
            canProceed: true,
            agentId: agent.agentId
          },
          reasoning: `Deferring ${agent.role} due to unavailability`
        };
    }
  }
  
  /**
   * Create UI request for user input fallback
   */
  private createUserInputRequest(
    agent: AgentCapability,
    phase: ExecutionPhase
  ): UIRequest {
    return {
      requestId: `ui_${Date.now()}`,
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        title: `Information Needed: ${phase.name}`,
        description: `We need your help to complete this step since our automated service is temporarily unavailable.`,
        fields: [
          {
            id: 'user_input',
            label: `Please provide ${agent.role} information`,
            type: 'text',
            required: true,
            help: `This information is typically obtained through ${agent.agentId}, but we need you to provide it manually.`
          }
        ],
        guidance: [
          'You can find this information in your business documents',
          'If unsure, you can upload relevant documents instead',
          'We\'ll guide you through each required field'
        ]
      },
      context: {
        agentId: agent.agentId,
        phaseId: (phase as any).id || phase.name,
        fallbackReason: 'service_unavailable'
      }
    };
  }
  
  /**
   * Handle progressive disclosure of UI requests
   * Engine PRD Lines 50, 83-85
   */
  private async handleProgressiveDisclosure(
    context: TaskContext,
    uiRequests: UIRequest[]
  ): Promise<void> {
    if (!this.config.progressiveDisclosure.enabled) {
      // Send all requests immediately
      await this.sendUIRequests(context, uiRequests);
      return;
    }
    
    // Intelligent batching and reordering
    const optimized = await this.optimizeUIRequests(uiRequests);
    
    // Store pending requests
    const pending = this.pendingUIRequests.get(context.contextId) || [];
    pending.push(...optimized);
    this.pendingUIRequests.set(context.contextId, pending);
    
    // Send batch if threshold reached
    if (pending.length >= this.config.progressiveDisclosure.minBatchSize) {
      const batch = pending.splice(0, this.config.progressiveDisclosure.minBatchSize);
      await this.sendUIRequests(context, batch);
    }
  }
  
  /**
   * Optimize UI requests to minimize user interruption
   */
  private async optimizeUIRequests(requests: UIRequest[]): Promise<UIRequest[]> {
    // Use LLM to intelligently reorder requests
    const optimizationPrompt = `
      Reorder these UI requests to minimize user interruption:
      1. Group related requests together
      2. Put requests that might eliminate others first
      3. Prioritize critical information
      
      Requests: ${JSON.stringify(requests)}
      
      Return the optimized order as a JSON array of request IDs.
    `;
    
    try {
      const response = await this.llmProvider.complete({
        model: 'gpt-4',
        prompt: `You optimize UI request ordering for minimal user interruption.\n\n${optimizationPrompt}`,
        temperature: 0.3,
        responseFormat: 'json'
      });
      
      const optimizedOrder = JSON.parse(response.content) as string[];
      
      // Reorder requests based on LLM recommendation
      return optimizedOrder
        .map(id => requests.find(r => r.requestId === id))
        .filter(r => r !== undefined) as UIRequest[];
        
    } catch (error) {
      logger.warn('Failed to optimize UI requests, using original order', { error });
      return requests;
    }
  }
  
  /**
   * Send UI requests to frontend
   */
  private async sendUIRequests(context: TaskContext, requests: UIRequest[]): Promise<void> {
    // In real implementation, this would send to frontend via WebSocket/SSE
    logger.info('Sending UI requests', {
      contextId: context.contextId,
      count: requests.length,
      types: requests.map(r => r.templateType)
    });
    
    // Record UI requests in context
    await this.recordContextEntry(context, {
      operation: 'ui_requests_sent',
      data: {
        requests: requests.map(r => ({
          id: r.requestId,
          type: r.templateType
        }))
      },
      reasoning: 'Requesting user input for required information'
    });
  }
  
  /**
   * Check if task goals are achieved
   */
  private async areGoalsAchieved(context: TaskContext): Promise<boolean> {
    const template = context.templateSnapshot as TaskTemplate;
    
    if (!template.goals) {
      return true; // No goals means task is complete
    }
    
    // Check primary goals
    for (const goal of template.goals.primary) {
      if (goal.required && !this.isGoalAchieved(context, goal)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if specific goal is achieved
   */
  private isGoalAchieved(context: TaskContext, _goal: any): boolean {
    // Evaluate goal success criteria against current state
    // In real implementation, this would use expression evaluation
    return context.currentState.completeness >= 100;
  }
  
  /**
   * Complete task
   */
  private async completeTaskContext(context: TaskContext): Promise<void> {
    await this.recordContextEntry(context, {
      operation: 'task_completed',
      data: {
        completedAt: new Date().toISOString(),
        finalState: context.currentState
      },
      reasoning: 'All required goals achieved'
    });
    
    // Clean up
    this.activeExecutions.delete(context.contextId);
    this.pendingUIRequests.delete(context.contextId);
  }
  
  /**
   * Handle orchestration failure with resilience
   */
  private async handleOrchestrationFailure(
    context: TaskContext,
    error: any
  ): Promise<void> {
    logger.error('Applying failure recovery', {
      contextId: context.contextId,
      error: error.message,
      strategy: this.config.resilience.fallbackStrategy
    });
    
    await this.recordContextEntry(context, {
      operation: 'orchestration_failed',
      data: {
        error: error.message,
        strategy: this.config.resilience.fallbackStrategy
      },
      reasoning: 'Orchestration encountered an error, applying recovery strategy'
    });
    
    switch (this.config.resilience.fallbackStrategy) {
      case 'degrade':
        // Switch to manual mode
        await this.switchToManualMode(context);
        break;
        
      case 'guide':
        // Provide step-by-step guidance
        await this.provideManualGuidance(context);
        break;
        
      case 'fail':
      default:
        // Mark task as failed
        context.currentState.status = 'failed';
        break;
    }
  }
  
  /**
   * Switch to manual mode when automation fails
   */
  private async switchToManualMode(context: TaskContext): Promise<void> {
    const manualGuide: UIRequest = {
      requestId: `manual_${Date.now()}`,
      templateType: UITemplateType.SteppedWizard,
      semanticData: {
        title: 'Let\'s Complete This Together',
        description: 'Our automated system encountered an issue. We\'ll guide you through completing this task manually.',
        steps: this.generateManualSteps(context),
        allowSkip: false
      },
      context: {
        mode: 'manual',
        reason: 'automation_failure'
      }
    };
    
    await this.sendUIRequests(context, [manualGuide]);
  }
  
  /**
   * Provide manual guidance
   */
  private async provideManualGuidance(context: TaskContext): Promise<void> {
    // Generate step-by-step instructions
    const guidance = await this.generateGuidance(context);
    
    const guideRequest: UIRequest = {
      requestId: `guide_${Date.now()}`,
      templateType: UITemplateType.InstructionPanel,
      semanticData: {
        title: 'Step-by-Step Guide',
        instructions: guidance,
        supportLinks: [
          { label: 'Contact Support', url: '/support' },
          { label: 'View Help Docs', url: '/help' }
        ]
      },
      context: {
        mode: 'guided',
        reason: 'providing_assistance'
      }
    };
    
    await this.sendUIRequests(context, [guideRequest]);
  }
  
  /**
   * Generate manual steps from template
   */
  private generateManualSteps(context: TaskContext): any[] {
    const template = context.templateSnapshot as TaskTemplate;
    
    // Convert template phases to manual steps
    return (template.phases || []).map((phase, index) => ({
      id: `step_${index + 1}`,
      title: phase.name,
      description: phase.description,
      fields: this.generateFieldsForPhase(phase),
      help: `This step typically takes ${phase.maxDuration || '5-10'} minutes`
    }));
  }
  
  /**
   * Generate fields for manual phase
   */
  private generateFieldsForPhase(phase: any): any[] {
    // Generate appropriate input fields based on phase
    return [
      {
        id: 'phase_input',
        label: `Information for ${phase.name}`,
        type: 'text',
        required: true
      }
    ];
  }
  
  /**
   * Generate guidance from context
   */
  private async generateGuidance(context: TaskContext): Promise<string[]> {
    // Use LLM to generate helpful guidance
    const prompt = `
      Generate step-by-step guidance for completing this task manually:
      Template: ${JSON.stringify(context.templateSnapshot)}
      Current State: ${JSON.stringify(context.currentState)}
      
      Provide clear, actionable steps the user can follow.
    `;
    
    const response = await this.llmProvider.complete({
      model: 'gpt-4',
      prompt: `You provide clear, helpful guidance for manual task completion.\n\n${prompt}`,
      temperature: 0.5
    });
    
    return response.content.split('\n').filter((line: string) => line.trim());
  }
  
  /**
   * Optimize execution plan
   */
  private optimizePlan(plan: ExecutionPlan, _context: TaskContext): ExecutionPlan {
    // Optimize plan for efficiency and minimal user interruption
    // For now, return as-is
    return plan;
  }
  
  /**
   * Find alternative agent with similar capabilities
   */
  private findAlternativeAgent(agent: AgentCapability): AgentCapability | null {
    for (const [id, candidate] of this.agentRegistry) {
      if (id === agent.agentId) continue;
      
      // Check for capability overlap
      const overlap = candidate.capabilities.filter(c => 
        agent.capabilities.includes(c)
      );
      
      if (overlap.length > 0 && candidate.availability === 'available') {
        return candidate;
      }
    }
    
    return null;
  }
  
  /**
   * Record entry in task context
   */
  private async recordContextEntry(
    context: TaskContext,
    entry: Partial<ContextEntry>
  ): Promise<void> {
    const fullEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'orchestrator_agent',
        version: this.config.version
      },
      operation: entry.operation || 'orchestration',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Orchestration decision',
      ...entry
    };
    
    // Append to history (append-only)
    context.history.push(fullEntry);
    
    // Persist to database
    try {
      await this.dbService.createContextHistoryEntry(context.contextId, fullEntry);
    } catch (error) {
      logger.error('Failed to persist context entry', {
        contextId: context.contextId,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Required abstract methods from BaseAgent
   */
  protected async handleMessage(message: any): Promise<any> {
    // Delegate to orchestrateTask for universal handling
    if (message.type === 'task' && message.context) {
      await this.orchestrateTask(message.context);
    }
    return { success: true };
  }
  
  protected async handleTask(task: any): Promise<any> {
    // Delegate to orchestrateTask for universal handling
    if (task.context) {
      await this.orchestrateTask(task.context);
    }
    return { success: true };
  }
  
  protected async makeDecision(context: any): Promise<any> {
    // Use LLM for decision making
    return this.createExecutionPlan(context);
  }
  
  protected async executeAction(action: any): Promise<any> {
    // Execute agent actions
    if (action.agent && action.phase) {
      return this.executeAgent(action.context, action.agent, action.phase);
    }
    return { success: true };
  }
}