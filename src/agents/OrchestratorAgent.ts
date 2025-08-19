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

import { BaseAgent } from './base/BaseAgent';
import { ConfigurationManager } from '../services/configuration-manager';
import { DatabaseService } from '../services/database';
import { StateComputer } from '../services/state-computer';
import { logger } from '../utils/logger';
// import { agentDiscovery } from '../services/agent-discovery'; // Will be used in executePhase
import {
  TaskContext,
  TaskTemplate,
  ExecutionPlan,
  ExecutionPhase,
  AgentRequest,
  AgentResponse,
  UIRequest,
  UITemplateType,
  OrchestratorRequest,
  OrchestratorResponse
} from '../types/engine-types';

/**
 * JSON Schema templates for consistent LLM responses
 */
const _EXECUTION_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    reasoning: {
      type: "object",
      properties: {
        task_analysis: { type: "string" },
        subtask_decomposition: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              subtask: { type: "string" },
              required_capabilities: { type: "array", items: { type: "string" } },
              assigned_agent: { type: "string" },
              rationale: { type: "string" }
            }
          }
        },
        coordination_strategy: { type: "string" }
      },
      required: ["task_analysis", "subtask_decomposition", "coordination_strategy"]
    },
    phases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          subtasks: {
            type: "array",
            items: {
              type: "object", 
              properties: {
                description: { type: "string" },
                agent: { type: "string" },
                specific_instruction: { type: "string" },
                input_data: { type: "object" },
                expected_output: { type: "string" },
                success_criteria: { type: "array", items: { type: "string" } }
              },
              required: ["description", "agent", "specific_instruction"]
            }
          },
          parallel_execution: { type: "boolean" },
          dependencies: { type: "array", items: { type: "string" } }
        },
        required: ["name", "subtasks"]
      }
    },
    estimated_duration: { type: "string" },
    user_interactions: { type: "string", enum: ["none", "minimal", "guided", "extensive"] }
  },
  required: ["reasoning", "phases"]
};

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
 * Agent capability definition with detailed specialization information
 * Used by the Orchestrator to understand what each agent can accomplish
 * and how to decompose complex tasks into appropriate subtasks
 */
interface AgentCapability {
  agentId: string;
  role: string;
  capabilities: string[];
  availability: 'available' | 'busy' | 'offline' | 'not_implemented';
  specialization: string; // Human-readable description of what this agent specializes in
  fallbackStrategy?: 'user_input' | 'alternative_agent' | 'defer';
}

/**
 * Universal OrchestratorAgent
 * The conductor of the SmallBizAlly symphony
 * 
 * Now extends BaseAgent to gain event emission and standard agent capabilities
 * while maintaining its special orchestration responsibilities
 */
export class OrchestratorAgent extends BaseAgent {
  private static instance: OrchestratorAgent;
  
  private config: OrchestratorConfig;
  private configManager: ConfigurationManager;
  private dbService: DatabaseService;
  private stateComputer: StateComputer;
  
  // Agent registry and coordination
  private agentRegistry: Map<string, AgentCapability>;
  private activeExecutions: Map<string, ExecutionPlan>;
  private pendingUIRequests: Map<string, UIRequest[]>;
  
  // Pure A2A System - Agent Lifecycle Management via DI
  // NO AGENT INSTANCES STORED - Using DI and task-centered message bus
  private agentCapabilities: Map<string, any> = new Map();
  private activeTaskSubscriptions: Map<string, Set<string>> = new Map(); // taskId -> Set of agentIds
  
  private constructor() {
    try {
      logger.info('🚀 OrchestratorAgent constructor starting...');
      
      // Call BaseAgent constructor with orchestrator config
      // Using 'system' as businessId since orchestrator works across all businesses
      logger.info('📄 Loading BaseAgent with orchestrator.yaml...');
      super('orchestrator.yaml', 'system', 'system');
      logger.info('✅ BaseAgent constructor completed successfully');
      
      logger.info('⚙️ Loading orchestrator config...');
      this.config = this.loadConfig();
      logger.info('✅ Orchestrator config loaded successfully');
      
      logger.info('🗃️ Initializing data structures...');
      this.agentRegistry = new Map();
      this.activeExecutions = new Map();
      this.pendingUIRequests = new Map();
      logger.info('✅ Data structures initialized');
      
      // Lazy initialization to avoid startup crashes
      logger.info('🔌 Setting up lazy initialization for services...');
      this.configManager = null as any;
      this.dbService = null as any;
      this.stateComputer = null as any;
      logger.info('✅ Lazy initialization configured');
      
      logger.info('📋 Initializing agent registry...');
      this.initializeAgentRegistry();
      logger.info('✅ Agent registry initialized');
      
      logger.info('🎉 OrchestratorAgent constructor completed successfully!');
    } catch (error) {
      console.error('ERROR: OrchestratorAgent constructor failed:', error);
      logger.error('💥 FATAL: OrchestratorAgent constructor failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * 🔑 SINGLETON PATTERN - Critical for system initialization
   * 
   * This is THE entry point where OrchestratorAgent is created.
   * Called by AgentManager.initialize() during server startup.
   * 
   * INITIALIZATION FLOW:
   * 1. First call creates the instance
   * 2. Constructor calls BaseAgent constructor
   * 3. BaseAgent loads YAML configs
   * 4. BaseAgent creates ToolChain → CredentialVault
   * 5. CredentialVault REQUIRES Supabase env vars
   * 
   * COMMON FAILURES:
   * - Missing SUPABASE_URL/KEY → CredentialVault throws
   * - Missing orchestrator.yaml → BaseAgent throws
   * - Missing base_agent.yaml → BaseAgent throws
   * 
   * @returns The single OrchestratorAgent instance
   * @throws Error if initialization fails (missing config, etc)
   */
  public static getInstance(): OrchestratorAgent {
    if (!OrchestratorAgent.instance) {
      console.log('Creating first OrchestratorAgent instance (singleton)');
      OrchestratorAgent.instance = new OrchestratorAgent();
    }
    return OrchestratorAgent.instance;
  }

  /**
   * Lazy initialize services to avoid startup crashes
   */
  private getConfigManager(): ConfigurationManager {
    if (!this.configManager) {
      this.configManager = new ConfigurationManager();
    }
    return this.configManager;
  }

  private getDBService(): DatabaseService {
    if (!this.dbService) {
      this.dbService = DatabaseService.getInstance();
    }
    return this.dbService;
  }

  private getStateComputer(): StateComputer {
    if (!this.stateComputer) {
      this.stateComputer = new StateComputer();
    }
    return this.stateComputer;
  }
  
  /**
   * Load orchestrator configuration
   * Engine PRD Lines 799-841
   */
  private loadConfig(): OrchestratorConfig {
    try {
      logger.info('📋 loadConfig() called - returning hardcoded config');
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
    } catch (error) {
      logger.error('💥 FATAL: loadConfig() failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // Return minimal config to prevent crash
      return {
        id: 'universal_orchestrator',
        version: '1.0.0',
        mission: 'Emergency fallback orchestrator',
        planningRules: [],
        progressiveDisclosure: {
          enabled: false,
          batchingStrategy: 'sequential' as const,
          minBatchSize: 1,
          maxUserInterruptions: 10
        },
        resilience: {
          fallbackStrategy: 'degrade' as const,
          maxRetries: 3,
          timeoutMs: 30000
        }
      };
    }
  }
  
  /**
   * Initialize agent registry with available agents
   */
  private initializeAgentRegistry(): void {
    try {
      logger.info('🤖 Initializing agent registry with available agents...');
      
      // Discover available agents with detailed capabilities for task decomposition
      // These are the orchestrator's internal understanding of agent capabilities
      // for decomposing tasks into specific subtasks with appropriate agent assignments
      const agents: AgentCapability[] = [
        {
          agentId: 'BusinessDiscoveryAgent',
          role: 'data_enrichment',
          capabilities: [
            'business_entity_lookup',
            'ein_validation_verification', 
            'business_address_verification',
            'entity_type_detection',
            'formation_date_discovery',
            'business_status_verification',
            'corporate_officer_identification'
          ],
          availability: 'available',
          specialization: 'Discovers and validates business entity information from multiple sources including state registries and business databases'
        },
        {
          agentId: 'ProfileCollector',
          role: 'data_collection',
          capabilities: [
            'user_profile_collection',
            'guided_form_generation',
            'data_validation_rules',
            'document_parsing_extraction',
            'progressive_disclosure_forms',
            'smart_field_pre_filling',
            'validation_error_handling'
          ],
          availability: 'available',
          specialization: 'Collects and validates user information through intelligent forms with progressive disclosure and smart defaults'
        },
        {
          agentId: 'ComplianceVerificationAgent',
          role: 'legal_compliance',
          capabilities: [
            'regulatory_requirement_analysis',
            'deadline_tracking_monitoring',
            'compliance_form_preparation',
            'legal_document_generation',
            'penalty_risk_assessment',
            'filing_status_verification',
            'jurisdiction_specific_rules'
          ],
          availability: 'available',
          specialization: 'Ensures legal compliance and manages regulatory requirements across multiple jurisdictions and business types'
        },
        {
          agentId: 'FormOptimizerAgent',
          role: 'form_processing',
          capabilities: [
            'form_field_optimization',
            'data_pre_filling_automation',
            'form_completion_assistance',
            'error_prevention_validation',
            'submission_preparation',
            'document_formatting',
            'regulatory_form_compliance'
          ],
          availability: 'available',
          specialization: 'Optimizes and automates form completion processes with intelligent pre-filling and validation'
        },
        {
          agentId: 'DataEnrichmentAgent',
          role: 'data_enhancement',
          capabilities: [
            'external_data_source_integration',
            'business_data_enrichment',
            'address_standardization',
            'contact_information_validation',
            'financial_data_integration',
            'industry_classification',
            'data_quality_scoring'
          ],
          availability: 'available',
          specialization: 'Enriches collected data with external sources for completeness and accuracy validation'
        },
        {
          agentId: 'TaskCoordinatorAgent',
          role: 'workflow_coordination',
          capabilities: [
            'task_dependency_management',
            'workflow_sequencing',
            'resource_allocation',
            'timeline_optimization',
            'bottleneck_identification',
            'parallel_processing_coordination',
            'milestone_tracking'
          ],
          availability: 'available',
          specialization: 'Coordinates complex multi-step workflows and manages task dependencies for optimal execution'
        },
        {
          agentId: 'CommunicationAgent',
          role: 'user_communication',
          capabilities: [
            'notification_delivery',
            'status_update_messaging',
            'approval_request_handling',
            'escalation_management',
            'multi_channel_communication',
            'personalized_messaging',
            'urgency_level_assessment'
          ],
          availability: 'available',
          specialization: 'Manages all user communications and notifications with personalized messaging and multi-channel delivery'
        },
        {
          agentId: 'CelebrationAgent',
          role: 'achievement_recognition',
          capabilities: [
            'milestone_detection',
            'achievement_recognition',
            'progress_celebration',
            'user_motivation_enhancement',
            'completion_ceremonies',
            'success_story_creation',
            'badge_award_management'
          ],
          availability: 'available',
          specialization: 'Recognizes achievements and celebrates user progress to maintain motivation and engagement'
        },
        {
          agentId: 'MonitoringAgent',
          role: 'system_monitoring',
          capabilities: [
            'task_progress_monitoring',
            'performance_metrics_tracking',
            'error_detection_alerting',
            'system_health_assessment',
            'audit_trail_generation',
            'compliance_monitoring',
            'anomaly_detection'
          ],
          availability: 'available',
          specialization: 'Monitors system performance and task execution health with comprehensive audit trail generation'
        }
      ];
      
      logger.info(`📊 Registering ${agents.length} agents...`);
      agents.forEach((agent, index) => {
        logger.info(`🔧 Registering agent ${index + 1}/${agents.length}: ${agent.agentId} (${agent.role})`);
        this.agentRegistry.set(agent.agentId, agent);
      });
      
      logger.info(`✅ Agent registry initialized with ${this.agentRegistry.size} agents`);
    } catch (error) {
      logger.error('💥 FATAL: Agent registry initialization failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
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
   * Create execution plan using LLM with detailed task decomposition analysis
   * This is the core intelligence of the orchestrator - breaking down complex business
   * tasks into specific subtasks that can be executed by specialized agents
   * 
   * Engine PRD Lines 915-972: Orchestrator must reason about task requirements,
   * analyze available agent capabilities, and create a coordinated execution plan
   */
  private async createExecutionPlan(context: TaskContext): Promise<ExecutionPlan> {
    // Extract comprehensive task information from the task's own data (self-contained task)
    const taskType = context.currentState?.task_type || 'general';
    const taskTitle = context.currentState?.title || 'Unknown Task';
    const taskDefinition = context.metadata?.taskDefinition || context.templateSnapshot || {};
    const taskDescription = taskDefinition?.description || context.currentState?.description || 'No description provided';
    
    // Build detailed agent capability information for LLM reasoning
    const availableAgents = Array.from(this.agentRegistry.values()).map(agent => ({
      agentId: agent.agentId,
      role: agent.role,
      specialization: agent.specialization,
      capabilities: agent.capabilities,
      availability: agent.availability,
      fallbackStrategy: agent.fallbackStrategy
    }));

    // Create comprehensive prompt for task decomposition and agent assignment
    const planPrompt = `You are the Master Orchestrator for SmallBizAlly, responsible for decomposing complex business tasks into executable subtasks for specialized AI agents.

TASK TO ORCHESTRATE:
Title: "${taskTitle}"
Type: ${taskType}
Description: "${taskDescription}"

TASK GOALS:
${taskDefinition?.goals && Array.isArray(taskDefinition.goals) ? taskDefinition.goals.map((goal: string) => `- ${goal}`).join('\n') : '- Complete the task successfully'}

AVAILABLE SPECIALIST AGENTS:
${availableAgents.map(agent => `
Agent: ${agent.agentId}
Role: ${agent.role}
Specialization: ${agent.specialization}
Capabilities: ${agent.capabilities.join(', ')}
Availability: ${agent.availability}
${agent.fallbackStrategy ? `Fallback: ${agent.fallbackStrategy}` : ''}
`).join('\n')}

YOUR ORCHESTRATION RESPONSIBILITIES:
1. ANALYZE the task description and goals to understand what needs to be accomplished
2. DECOMPOSE the task into specific, actionable subtasks 
3. MATCH each subtask to the agent with the most appropriate capabilities
4. CREATE specific instructions for each agent explaining exactly what they need to do
5. COORDINATE the sequence and dependencies between subtasks
6. ANTICIPATE what data each agent will need and what they should produce

ORCHESTRATION REASONING REQUIREMENTS:
- Examine the task description thoroughly to identify all necessary subtasks
- Consider the business context and compliance requirements
- Match subtask requirements to agent capabilities precisely
- Provide specific, actionable instructions for each agent
- Consider data flow between agents (what outputs become inputs)
- Plan for error handling and fallback strategies

RESPONSE FORMAT (JSON only):
{
  "reasoning": {
    "task_analysis": "Your analysis of what this task requires and the business context",
    "subtask_decomposition": [
      {
        "subtask": "Specific subtask description",
        "required_capabilities": ["capability1", "capability2"],
        "assigned_agent": "AgentName",
        "rationale": "Why this agent is best suited for this subtask"
      }
    ],
    "coordination_strategy": "How the agents will work together and handle dependencies"
  },
  "phases": [
    {
      "name": "Phase Name (e.g., Data Collection, Validation, Processing)",
      "subtasks": [
        {
          "description": "Detailed description of what needs to be done",
          "agent": "AgentName",
          "specific_instruction": "Exact instruction for the agent - what to do, how to do it, what to focus on",
          "input_data": {"key": "Expected input data structure"},
          "expected_output": "What this subtask should produce for the next phase",
          "success_criteria": ["How to know this subtask succeeded", "Measurable outcome"]
        }
      ],
      "parallel_execution": true/false,
      "dependencies": ["Previous phase names that must complete first"]
    }
  ],
  "estimated_duration": "Realistic time estimate (e.g., 10-15 minutes)",
  "user_interactions": "none/minimal/guided/extensive"
}

CRITICAL: Respond ONLY with valid JSON. No explanatory text, no markdown, just the JSON object matching the exact schema above.`;
    
    // Log the complete prompt for tracing
    logger.info('🤖 LLM EXECUTION PLAN PROMPT', {
      contextId: context.contextId,
      prompt: planPrompt.substring(0, 500),
      promptLength: planPrompt.length,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022'
    });

    const llmResponse = await this.llmProvider.complete({
      prompt: planPrompt,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      systemPrompt: this.config.mission
    });
    
    // Log the complete response for tracing
    logger.info('🎯 LLM EXECUTION PLAN RESPONSE', {
      contextId: context.contextId,
      response: llmResponse.content.substring(0, 500),
      responseLength: llmResponse.content.length,
      isValidJSON: (() => {
        try { JSON.parse(llmResponse.content); return true; } catch { return false; }
      })()
    });
    
    // Parse JSON response with comprehensive error handling and validation
    let plan: ExecutionPlan;
    try {
      const parsedPlan = JSON.parse(llmResponse.content);
      
      // Validate the plan structure matches our enhanced schema
      if (!parsedPlan.reasoning || !parsedPlan.phases) {
        throw new Error('Invalid plan structure: missing reasoning or phases');
      }
      
      // Log the orchestrator's reasoning for debugging and audit trail
      logger.info('🧠 ORCHESTRATOR REASONING', {
        contextId: context.contextId,
        taskAnalysis: parsedPlan.reasoning.task_analysis,
        subtaskCount: parsedPlan.reasoning.subtask_decomposition?.length || 0,
        coordinationStrategy: parsedPlan.reasoning.coordination_strategy
      });
      
      // Log detailed subtask decomposition for traceability
      if (parsedPlan.reasoning.subtask_decomposition) {
        parsedPlan.reasoning.subtask_decomposition.forEach((subtask: any, index: number) => {
          logger.info(`📋 SUBTASK ${index + 1}: ${subtask.subtask}`, {
            contextId: context.contextId,
            assignedAgent: subtask.assigned_agent,
            requiredCapabilities: subtask.required_capabilities,
            rationale: subtask.rationale
          });
        });
      }
      
      plan = parsedPlan as ExecutionPlan;
      
    } catch (error) {
      logger.error('Failed to parse LLM execution plan response', {
        response: llmResponse.content.substring(0, 300),
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create a robust fallback plan that still follows the enhanced structure
      plan = {
        reasoning: {
          task_analysis: `Fallback analysis for ${taskType} task due to LLM parsing failure`,
          subtask_decomposition: [{
            subtask: 'Manual task completion with user guidance',
            required_capabilities: ['user_profile_collection', 'guided_form_generation'],
            assigned_agent: 'ProfileCollector',
            rationale: 'ProfileCollector can handle user interaction when automation fails'
          }],
          coordination_strategy: 'Single-agent fallback with user guidance and manual completion'
        },
        phases: [{
          name: 'Manual Task Processing',
          subtasks: [{
            description: 'Guide user through manual task completion',
            agent: 'ProfileCollector',
            specific_instruction: 'Create guided forms and collect necessary information from user to complete the task manually',
            input_data: { taskType, taskTitle, fallback: true },
            expected_output: 'Completed task data collected from user',
            success_criteria: ['User has provided all required information', 'Task marked as completed']
          }],
          parallel_execution: false,
          dependencies: []
        }],
        estimated_duration: '15-20 minutes',
        user_interactions: 'extensive'
      } as any;
    }
    
    // Store the complete execution plan including reasoning for audit trail
    await this.recordContextEntry(context, {
      operation: 'execution_plan_reasoning_recorded',
      data: { 
        reasoning: (plan as any).reasoning,
        phaseCount: plan.phases.length,
        totalSubtasks: plan.phases.reduce((total: number, phase: any) => 
          total + (phase.subtasks?.length || 0), 0)
      },
      reasoning: 'Detailed orchestrator reasoning and subtask decomposition recorded for traceability'
    });
    
    // Validate and optimize plan before execution
    return this.optimizePlan(plan, context);
  }
  
  /**
   * Execute a phase of the plan with enhanced subtask coordination
   * Each phase now contains specific subtasks with detailed instructions for agents
   * This method coordinates the execution of subtasks and manages data flow between them
   */
  private async executePhase(
    context: TaskContext,
    phase: ExecutionPhase
  ): Promise<any> {
    logger.info('🚀 Executing enhanced phase with subtask coordination', {
      contextId: context.contextId,
      phaseName: phase.name,
      subtaskCount: (phase as any).subtasks?.length || 0,
      parallelExecution: (phase as any).parallel_execution || false
    });
    
    const phaseStart = Date.now();
    const results: any[] = [];
    const uiRequests: UIRequest[] = [];
    const subtasks = (phase as any).subtasks || [];
    
    // Enhanced execution: Handle subtasks with specific instructions
    if (subtasks.length > 0) {
      logger.info('📋 Processing subtasks with detailed agent instructions', {
        contextId: context.contextId,
        subtasks: subtasks.map((st: any) => ({
          description: st.description,
          agent: st.agent,
          instruction: st.specific_instruction?.substring(0, 100) + '...'
        }))
      });
      
      // Execute subtasks (parallel or sequential based on phase configuration)
      if ((phase as any).parallel_execution) {
        // Execute all subtasks in parallel for efficiency
        const subtaskPromises = subtasks.map((subtask: any) => 
          this.executeSubtask(context, subtask, phase)
        );
        const subtaskResults = await Promise.allSettled(subtaskPromises);
        
        // Process results and collect UI requests
        subtaskResults.forEach((result: any, index: number) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.uiRequests) {
              uiRequests.push(...result.value.uiRequests);
            }
          } else {
            logger.error(`Subtask ${index + 1} failed`, {
              contextId: context.contextId,
              subtask: subtasks[index].description,
              error: result.reason
            });
          }
        });
      } else {
        // Execute subtasks sequentially, passing data between them
        let phaseData = {};
        
        for (const subtask of subtasks) {
          try {
            const subtaskResult = await this.executeSubtask(context, subtask, phase, phaseData);
            results.push(subtaskResult);
            
            // Pass output data to next subtask
            if (subtaskResult.outputData) {
              phaseData = { ...phaseData, ...subtaskResult.outputData };
            }
            
            // Collect UI requests
            if (subtaskResult.uiRequests) {
              uiRequests.push(...subtaskResult.uiRequests);
            }
            
          } catch (error) {
            logger.error('Subtask execution failed', {
              contextId: context.contextId,
              subtask: subtask.description,
              agent: subtask.agent,
              error: error instanceof Error ? error.message : String(error)
            });
            
            // Apply fallback strategy for failed subtask
            const fallbackResult = await this.handleSubtaskFailure(context, subtask, error);
            results.push(fallbackResult);
          }
        }
      }
    } else {
      // Fallback to legacy agent execution for backward compatibility
      logger.warn('⚠️ Phase has no subtasks, falling back to legacy agent execution', {
        contextId: context.contextId,
        phaseName: phase.name
      });
      
      for (const agentId of (phase.agents || [])) {
        const agent = this.agentRegistry.get(agentId);
        
        if (!agent) {
          logger.warn('Agent not found in registry', { agentId });
          continue;
        }
        
        if (agent.availability === 'available') {
          const agentResult = await this.executeAgent(context, agent, phase);
          results.push(agentResult);
          
          if (agentResult.uiRequests) {
            uiRequests.push(...agentResult.uiRequests);
          }
        } else {
          const fallbackResult = await this.applyFallbackStrategy(context, agent, phase);
          results.push(fallbackResult);
          
          if ((fallbackResult as any).uiRequests) {
            uiRequests.push(...(fallbackResult as any).uiRequests);
          }
        }
      }
    }
    
    // Log phase completion with enhanced metrics
    const duration = Date.now() - phaseStart;
    logger.info('✅ Phase execution completed', {
      contextId: context.contextId,
      phaseName: phase.name,
      subtaskCount: subtasks.length,
      resultsCount: results.length,
      uiRequestCount: uiRequests.length,
      duration,
      successRate: results.filter((r: any) => r.status === 'completed').length / results.length
    });
    
    return {
      phaseId: (phase as any).id || phase.name,
      phaseName: phase.name,
      status: 'completed',
      results,
      uiRequests,
      duration,
      subtaskResults: results
    };
  }
  
  /**
   * Execute a specific subtask with detailed agent instructions
   * This is where the orchestrator's decomposition gets translated into concrete agent actions
   * 
   * @param context - The task context
   * @param subtask - The specific subtask with detailed instructions
   * @param phase - The parent phase for context
   * @param inputData - Data passed from previous subtasks
   */
  private async executeSubtask(
    context: TaskContext,
    subtask: any,
    phase: ExecutionPhase,
    inputData: any = {}
  ): Promise<any> {
    logger.info('🎯 Executing subtask with specific agent instruction', {
      contextId: context.contextId,
      subtaskDescription: subtask.description,
      assignedAgent: subtask.agent,
      specificInstruction: subtask.specific_instruction?.substring(0, 150) + '...'
    });
    
    // Find the agent in our registry
    const agent = Array.from(this.agentRegistry.values())
      .find(a => a.agentId === subtask.agent);
    
    if (!agent) {
      throw new Error(`Agent ${subtask.agent} not found in registry`);
    }
    
    if (agent.availability !== 'available') {
      throw new Error(`Agent ${subtask.agent} is not available (${agent.availability})`);
    }
    
    // Create comprehensive agent request with specific instructions
    const request: AgentRequest = {
      requestId: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentRole: agent.role,
      instruction: subtask.specific_instruction, // This is the key enhancement - specific instructions!
      data: {
        // Combine expected input data structure with actual input data
        ...subtask.input_data,
        ...inputData,
        taskContext: {
          contextId: context.contextId,
          taskType: context.currentState?.task_type,
          taskTitle: context.currentState?.title
        }
      },
      context: { 
        urgency: 'medium' as const,
        subtaskDescription: subtask.description,
        expectedOutput: subtask.expected_output,
        successCriteria: subtask.success_criteria
      },
      taskContext: context
    };
    
    // Log the detailed agent instruction for traceability
    logger.info('📝 AGENT INSTRUCTION DISPATCH', {
      contextId: context.contextId,
      agentId: agent.agentId,
      requestId: request.requestId,
      instruction: subtask.specific_instruction,
      expectedOutput: subtask.expected_output,
      successCriteria: subtask.success_criteria
    });
    
    // Execute the agent with specific instructions
    // In a real implementation, this would call the actual agent instance
    // For now, simulate intelligent agent execution based on the instruction
    const agentResponse = await this.simulateIntelligentAgentExecution(agent, request, subtask);
    
    // Record the subtask execution for audit trail
    await this.recordContextEntry(context, {
      operation: 'subtask_executed',
      data: {
        subtask: subtask.description,
        agent: subtask.agent,
        instruction: subtask.specific_instruction,
        response: agentResponse.data,
        success: agentResponse.status === 'completed'
      },
      reasoning: `Subtask "${subtask.description}" executed by ${subtask.agent} with specific instruction`
    });
    
    return {
      subtaskId: subtask.description,
      agent: subtask.agent,
      status: agentResponse.status,
      data: agentResponse.data,
      outputData: agentResponse.data, // Data to pass to next subtask
      uiRequests: agentResponse.uiRequests || [],
      reasoning: agentResponse.reasoning,
      duration: Date.now() - Date.now() // Placeholder timing
    };
  }
  
  /**
   * Simulate intelligent agent execution based on specific instructions
   * In production, this would dispatch to actual agent instances
   * 
   * @param agent - The agent capability definition
   * @param request - The detailed agent request
   * @param subtask - The subtask definition
   */
  private async simulateIntelligentAgentExecution(
    agent: AgentCapability,
    request: AgentRequest,
    subtask: any
  ): Promise<AgentResponse> {
    // Simulate agent processing based on the specific instruction
    logger.info('🤖 Simulating intelligent agent execution', {
      agentId: agent.agentId,
      role: agent.role,
      instructionLength: request.instruction?.length || 0,
      hasSuccessCriteria: subtask.success_criteria?.length > 0
    });
    
    // Simulate different response patterns based on agent type and instruction
    const responseData: any = {
      agentId: agent.agentId,
      subtaskCompleted: subtask.description,
      instruction_received: request.instruction,
      processing_result: `${agent.agentId} processed the instruction: ${request.instruction?.substring(0, 100)}...`
    };
    
    // Add agent-specific simulation data
    switch (agent.role) {
      case 'data_collection':
        responseData.collectedData = { 
          userProfile: 'simulated user data',
          forms: ['form1', 'form2']
        };
        break;
      case 'data_enrichment':
        responseData.enrichedData = {
          businessInfo: 'simulated business lookup result',
          validation: 'completed'
        };
        break;
      case 'legal_compliance':
        responseData.complianceCheck = {
          requirements: ['req1', 'req2'],
          status: 'compliant'
        };
        break;
      case 'form_processing':
        responseData.optimizedForms = {
          preFilledFields: 15,
          validationRules: 8
        };
        break;
    }
    
    return {
      status: 'completed' as const,
      data: responseData,
      reasoning: `${agent.agentId} completed subtask "${subtask.description}" following specific instruction: ${request.instruction?.substring(0, 100)}...`
    };
  }
  
  /**
   * Handle subtask execution failure with appropriate fallback strategies
   * 
   * @param context - The task context
   * @param subtask - The failed subtask
   * @param error - The error that occurred
   */
  private async handleSubtaskFailure(
    context: TaskContext,
    subtask: any,
    error: any
  ): Promise<any> {
    logger.error('🚨 Subtask execution failed, applying fallback strategy', {
      contextId: context.contextId,
      subtask: subtask.description,
      agent: subtask.agent,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Record the failure for audit trail
    await this.recordContextEntry(context, {
      operation: 'subtask_failed',
      data: {
        subtask: subtask.description,
        agent: subtask.agent,
        error: error instanceof Error ? error.message : String(error),
        fallback_applied: true
      },
      reasoning: `Subtask "${subtask.description}" failed, applying fallback strategy`
    });
    
    // Return a fallback result that allows the process to continue
    return {
      subtaskId: subtask.description,
      agent: subtask.agent,
      status: 'needs_input' as const,
      data: {
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
        manual_completion_required: true
      },
      uiRequests: [{
        requestId: `fallback_${Date.now()}`,
        templateType: 'smart_text_input' as any,
        semanticData: {
          title: `Manual Input Required: ${subtask.description}`,
          description: `We encountered an issue with automated processing. Please provide the required information manually.`,
          instruction: subtask.specific_instruction,
          expectedOutput: subtask.expected_output
        },
        context: {
          fallback: true,
          originalSubtask: subtask.description,
          agent: subtask.agent
        }
      }],
      reasoning: `Subtask failed, requesting manual user input as fallback`
    };
  }

  /**
   * Execute a specific agent (legacy method for backward compatibility)
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
    logger.info('Executing agent (legacy mode)', {
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
        prompt: optimizationPrompt,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        systemPrompt: 'You optimize UI request ordering for minimal user interruption.'
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
      prompt: prompt,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.5,
      systemPrompt: 'You provide clear, helpful guidance for manual task completion.'
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
  
  // recordContextEntry method moved to BaseAgent as protected method
  // Now all agents including OrchestratorAgent can use this.recordContextEntry()
  
  /**
   * =============================================================================
   * PURE A2A SYSTEM - AGENT LIFECYCLE MANAGEMENT
   * =============================================================================
   * 
   * These methods replace AgentManager functionality with pure A2A approach.
   * OrchestratorAgent now manages the entire agent ecosystem.
   */
  
  /**
   * Initialize the entire agent system using A2A discovery
   */
  public async initializeAgentSystem(): Promise<void> {
    logger.info('🚀 Initializing Pure A2A Agent System');
    
    try {
      // Import agentDiscovery service
      const { agentDiscovery } = await import('../services/agent-discovery');
      
      // Discover all agents from YAML configurations
      logger.info('🔍 Discovering agents from YAML configurations...');
      this.agentCapabilities = await agentDiscovery.discoverAgents();
      
      // Log discovered capabilities
      logger.info('📊 Agent Capabilities Discovered:', {
        count: this.agentCapabilities.size,
        agents: Array.from(this.agentCapabilities.keys())
      });
      
      // Print capability report for debugging
      const capabilityReport = agentDiscovery.generateCapabilityReport();
      logger.info('\n' + capabilityReport);
      
      logger.info('✅ Pure A2A Agent System initialized successfully');
    } catch (error) {
      logger.error('💥 Failed to initialize A2A Agent System', error);
      throw error;
    }
  }
  
  /**
   * Configure agents for execution plan via DI and SSE subscription
   * 
   * This method creates agents via DI and subscribes them to the task message bus.
   * Agents remain active, listening for updates and working autonomously.
   * 
   * @param plan - The execution plan with agent requirements
   * @param taskId - The task ID for the message bus
   */
  private async configureAgentsForExecution(plan: ExecutionPlan, taskId: string): Promise<void> {
    // Extract all unique agents from all phases
    const requiredAgents = new Set<string>();
    for (const phase of plan.phases) {
      phase.agents.forEach(agent => requiredAgents.add(agent));
    }
    
    logger.info('Configuring agents for execution plan', {
      taskId,
      requiredAgents: Array.from(requiredAgents),
      phaseCount: plan.phases.length
    });
    
    // Track which agents are subscribed to this task
    const subscribedAgents = new Set<string>();
    
    for (const agentId of requiredAgents) {
      try {
        // Create agent via DI and configure for task
        await this.createAgentForTask(agentId, taskId);
        subscribedAgents.add(agentId);
        
        logger.info(`Agent ${agentId} configured for task ${taskId}`);
      } catch (error) {
        logger.error(`Failed to configure agent ${agentId}`, error);
        // Continue with other agents even if one fails
      }
    }
    
    // Store subscription tracking
    this.activeTaskSubscriptions.set(taskId, subscribedAgents);
    
    // Broadcast execution plan to all subscribed agents
    await this.broadcastTaskEvent(taskId, {
      type: 'EXECUTION_PLAN',
      plan: {
        taskId,
        phases: plan.phases,
        requiredAgents: Array.from(subscribedAgents),
        coordinator: 'orchestrator_agent'
      },
      timestamp: new Date().toISOString()
    });
    
    logger.info('All agents configured and execution plan broadcast', {
      taskId,
      subscribedCount: subscribedAgents.size
    });
  }
  
  /**
   * Create agent instance via Dependency Injection and configure for task
   * 
   * CRITICAL: Agents are NOT stored - they're created per-task and configured
   * to subscribe to the task-centered message bus. Agents remain active listening
   * for updates and analyze each event to determine if they can proceed.
   * 
   * @param agentId - The agent type to create
   * @param taskId - The task to subscribe the agent to
   * @returns The configured agent instance
   */
  public async createAgentForTask(agentId: string, taskId: string): Promise<any> {
    try {
      logger.info(`🤖 Creating agent via DI: ${agentId} for task: ${taskId}`);
      
      // Use Dependency Injection Container directly
      const { DIContainer } = await import('../services/dependency-injection');
      
      // Check if agent is registered in DI
      if (DIContainer.isAgentRegistered(agentId)) {
        // Create agent with SSE subscriptions already configured
        const agent = await DIContainer.resolveAgent(agentId, taskId);
        
        // Track active subscription
        if (!this.activeTaskSubscriptions.has(taskId)) {
          this.activeTaskSubscriptions.set(taskId, new Set());
        }
        this.activeTaskSubscriptions.get(taskId)!.add(agentId);
        
        logger.info(`✅ Agent created via DI and subscribed to task: ${agentId}`);
        return agent;
      } else {
        // Fallback to agentDiscovery if not in DI container
        const { agentDiscovery } = await import('../services/agent-discovery');
        const agent = await agentDiscovery.instantiateAgent(agentId, taskId);
        
        // Configure agent to subscribe to task message bus
        await this.configureAgentForTask(agent, taskId);
        return agent;
      }
    
    } catch (error) {
      logger.error(`❌ Failed to create agent: ${agentId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Configure an agent to subscribe to task-centered message bus
   * 
   * The agent will listen for events and analyze each update to determine
   * if it can continue its work, is blocked, or has completed.
   * 
   * @param agent - The agent instance to configure
   * @param taskId - The task to subscribe to
   */
  private async configureAgentForTask(agent: any, taskId: string): Promise<void> {
    // Subscribe agent to task events via SSE
    if (agent && typeof agent.subscribeToTaskEvents === 'function') {
      await agent.subscribeToTaskEvents(taskId, async (event: any) => {
        // Agent analyzes event to determine if it can proceed
        logger.debug('Agent received task event', {
          agentId: agent.specializedTemplate?.agent?.id || 'unknown',
          taskId,
          eventType: event.type
        });
        
        // Agent's internal logic will handle the event
        // It may announce completion, blockage, or continue working
      });
      
      logger.info('Agent subscribed to task message bus', {
        agentId: agent.specializedTemplate?.agent?.id || 'unknown',
        taskId
      });
    }
  }
  
  /**
   * Route A2A message via SSE broadcast
   * 
   * Instead of direct agent-to-agent calls, messages are broadcast
   * on the task message bus for loose coupling. Target agents listening
   * on the bus will receive and process the message.
   */
  public async routeA2AMessage(fromAgentId: string, toAgentId: string, message: any, taskId?: string): Promise<any> {
    try {
      // Validate communication permissions using A2A protocol
      const { agentDiscovery } = await import('../services/agent-discovery');
      
      if (!agentDiscovery.canCommunicate(fromAgentId, toAgentId)) {
        throw new Error(`A2A communication not allowed: ${fromAgentId} -> ${toAgentId}`);
      }
      
      // Broadcast message on SSE for target agent
      // If no taskId provided, use a system-wide channel
      const channel = taskId || 'system';
      
      await this.broadcastTaskEvent(channel, {
        type: 'A2A_MESSAGE',
        from: fromAgentId,
        to: toAgentId,
        message,
        timestamp: new Date().toISOString()
      });
      
      logger.debug(`A2A message broadcast: ${fromAgentId} -> ${toAgentId}`, {
        channel,
        messageType: message.type
      });
      
      return { 
        status: 'message_broadcast', 
        from: fromAgentId,
        to: toAgentId,
        channel 
      };
    } catch (error) {
      logger.error(`Failed A2A message: ${fromAgentId} -> ${toAgentId}`, error);
      throw error;
    }
  }
  
  /**
   * Handle agent-to-orchestrator requests for assistance
   * This enables agents to communicate needs back to the orchestrator
   * Engine PRD Lines 975-982: Agents can request help from orchestrator
   */
  public async handleAgentRequest(
    taskId: string, 
    fromAgentId: string, 
    request: OrchestratorRequest
  ): Promise<OrchestratorResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info('🤖 AGENT REQUEST: Processing agent assistance request', {
        taskId,
        fromAgent: fromAgentId,
        requestType: request.type,
        priority: request.priority,
        requestId
      });

      // Analyze the request and determine response
      const response = await this.analyzeAgentRequest(taskId, fromAgentId, request, requestId);

      // Record the orchestrator's decision process
      // For now, we'll skip recording if we can't get context easily
      // This would normally fetch from database
      try {
        await this.recordContextEntry(
          { contextId: taskId } as TaskContext,
          {
            operation: 'agent_request_processed',
            data: {
              fromAgent: fromAgentId,
              requestType: request.type,
              priority: request.priority,
              responseStatus: response.status,
              reasoning: response.message
            },
            reasoning: `Processed ${request.type} request from ${fromAgentId}: ${response.status}`
          }
        );
      } catch (recordError) {
        logger.warn('Failed to record context entry', { 
          error: recordError instanceof Error ? recordError.message : String(recordError) 
        });
      }

      return response;
    } catch (error) {
      logger.error('Failed to process agent request', {
        taskId,
        fromAgent: fromAgentId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'denied',
        requestId,
        message: `Failed to process request: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        alternatives: [
          {
            option: 'Retry request',
            description: 'Resubmit the request after a brief delay'
          },
          {
            option: 'Escalate to user',
            description: 'Request user intervention for this issue'
          }
        ],
        responseTime: new Date().toISOString(),
        confidence: 0.3
      };
    }
  }

  /**
   * Analyze an agent's request and provide orchestration guidance
   */
  private async analyzeAgentRequest(
    taskId: string,
    fromAgentId: string,
    request: OrchestratorRequest,
    requestId: string
  ): Promise<OrchestratorResponse> {
    try {
      // Use LLM to analyze the request and provide guidance
      const analysisPrompt = `You are the orchestrator for a multi-agent system.
An agent needs assistance with a task.

AGENT: ${fromAgentId}
REQUEST TYPE: ${request.type}
PRIORITY: ${request.priority}
CONTEXT: ${JSON.stringify(request.context, null, 2)}

Analyze this request and provide appropriate guidance.
Consider:
1. The urgency and priority of the request
2. What resources or other agents might help
3. Any specific instructions or data needed

Respond with JSON only:
{
  "status": "approved" | "denied" | "deferred" | "modified" | "escalated",
  "message": "Brief explanation of the response",
  "provided": {
    "agents": ["array of agent IDs if provided"],
    "tools": ["array of tool names if provided"],
    "resourcesAllocated": [{"type": "resource type", "amount": "resource amount"}]
  },
  "nextSteps": [
    {
      "action": "description of action",
      "expectedCompletion": "time estimate",
      "dependencies": ["array of dependencies"]
    }
  ],
  "alternatives": [
    {
      "option": "alternative approach",
      "description": "description of alternative",
      "tradeoffs": ["array of tradeoffs"]
    }
  ]
}`;

      const llmResponse = await this.llmProvider.complete({
        prompt: analysisPrompt,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        systemPrompt: this.config.mission
      });

      // Parse response with fallback
      let response: OrchestratorResponse;
      try {
        const parsed = JSON.parse(llmResponse.content);
        response = {
          status: parsed.status || 'approved',
          requestId,
          message: parsed.message || 'Request received and being processed',
          provided: parsed.provided,
          nextSteps: parsed.nextSteps,
          alternatives: parsed.alternatives,
          responseTime: new Date().toISOString(),
          confidence: parsed.confidence || 0.8
        };
      } catch (error) {
        logger.warn('Failed to parse LLM response for agent request', { error });
        response = {
          status: 'approved',
          requestId,
          message: 'Request approved with fallback logic',
          nextSteps: [
            {
              action: 'Continue with your current approach',
              expectedCompletion: '5 minutes'
            },
            {
              action: 'Report any issues to orchestrator',
              expectedCompletion: 'As needed'
            }
          ],
          responseTime: new Date().toISOString(),
          confidence: 0.5
        };
      }

      return response;
    } catch (error) {
      logger.error('Failed to analyze agent request', {
        taskId,
        fromAgentId,
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'denied',
        requestId,
        message: 'Failed to analyze request due to internal error',
        alternatives: [
          {
            option: 'Retry request',
            description: 'Resubmit the request after a brief delay'
          }
        ],
        responseTime: new Date().toISOString(),
        confidence: 0.2
      };
    }
  }

  /**
   * Convert ComputedState to TaskContext for compatibility
   */
  private convertComputedStateToTaskContext(state: any, taskId: string): TaskContext {
    return {
      contextId: taskId,
      taskTemplateId: state.metadata?.templateId || 'unknown',
      tenantId: state.metadata?.userId || 'system',
      createdAt: state.metadata?.createdAt || new Date().toISOString(),
      currentState: state,
      history: state.history || [],
      templateSnapshot: state.metadata?.template || {}
    };
  }

  /**
   * Create task using pure A2A system
   */
  public async createTask(taskRequest: any): Promise<string> {
    const taskContext = {
      contextId: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskTemplateId: taskRequest.templateId,
      tenantId: taskRequest.userId,
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'pending',
        phase: 'initialization',
        completeness: 0,
        data: {}
      },
      history: [],
      templateSnapshot: {},
      metadata: taskRequest.metadata || {}
    };

    logger.info('Creating task with Pure A2A system', {
      contextId: taskContext.contextId,
      templateId: taskContext.taskTemplateId
    });

    // Save task to database if userId provided
    if (taskRequest.userId) {
      const db = this.getDBService();
      await db.createTask(taskRequest.userId, {
        id: taskContext.contextId,
        user_id: taskRequest.userId,
        title: `${taskRequest.templateId} Task`,
        description: `Task for ${taskRequest.businessId}`,
        task_type: taskRequest.templateId || 'general',
        business_id: taskRequest.businessId,
        template_id: taskRequest.templateId,
        status: 'pending',
        priority: taskRequest.priority || 'medium',
        deadline: taskRequest.deadline,
        metadata: taskRequest.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      logger.info('Task saved to database', { contextId: taskContext.contextId });
    }

    // Create execution plan with agent requirements
    const executionPlan = await this.createExecutionPlan(taskContext as any);
    
    // Configure agents via DI for this task's message bus
    await this.configureAgentsForExecution(executionPlan, taskContext.contextId);
    
    // Start orchestration - agents work autonomously via SSE
    await this.orchestrateTask(taskContext as any);
    
    return taskContext.contextId;
  }
  
  /**
   * Get task status using direct database access
   */
  public async getTaskStatus(taskId: string, userId: string): Promise<any> {
    try {
      const db = this.getDBService();
      const task = await db.getTask(userId, taskId);
      
      if (!task) {
        return null;
      }

      return {
        taskId: task.id,
        userId: task.user_id,
        status: task.status,
        priority: task.priority,
        businessId: task.business_id,
        templateId: task.template_id,
        metadata: task.metadata,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at
      };
    } catch (error) {
      logger.error('Failed to get task status', { taskId, error });
      return null;
    }
  }
  
  /**
   * Get user tasks using direct database access
   */
  public async getUserTasks(userId: string): Promise<any[]> {
    try {
      const db = this.getDBService();
      const tasks = await db.getUserTasks(userId);
      
      return tasks.map(task => ({
        taskId: task.id,
        userId: task.user_id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        businessId: task.business_id,
        templateId: task.template_id,
        metadata: task.metadata,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at
      }));
    } catch (error) {
      logger.error('Failed to get user tasks', error);
      return [];
    }
  }
  
  /**
   * A2A Discovery Methods - Pure A2A Protocol
   */
  public async getDiscoveredCapabilities(): Promise<any[]> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.getCapabilities();
  }
  
  public async findAgentsBySkill(skill: string): Promise<any[]> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.findAgentsBySkill(skill);
  }
  
  public async findAgentsByRole(role: string): Promise<any[]> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.findAgentsByRole(role);
  }
  
  public async getAgentRouting(agentId: string): Promise<{ canReceiveFrom: string[], canSendTo: string[] } | undefined> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    const capability = agentDiscovery.getAgentCapability(agentId);
    if (capability) {
      return {
        canReceiveFrom: capability.canReceiveFrom,
        canSendTo: capability.canSendTo
      };
    }
    return undefined;
  }
  
  public async canAgentsCommunicate(fromAgent: string, toAgent: string): Promise<boolean> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.canCommunicate(fromAgent, toAgent);
  }
  
  public async getCapabilityReport(): Promise<string> {
    const { agentDiscovery } = await import('../services/agent-discovery');
    return agentDiscovery.generateCapabilityReport();
  }
  
  /**
   * System health check for pure A2A system
   */
  public isSystemHealthy(): boolean {
    // In pure A2A system, health means orchestrator is running
    // and can discover agents on-demand
    return this.agentCapabilities.size > 0;
  }
  
  /**
   * Shutdown agent system
   */
  public async shutdownSystem(): Promise<void> {
    logger.info('Shutting down Pure A2A Agent System');
    
    // Notify all subscribed agents via SSE that system is shutting down
    // Agents listening on task message buses will receive shutdown signal
    for (const [taskId] of this.activeTaskSubscriptions.entries()) {
      try {
        await this.broadcastTaskEvent(taskId, {
          type: 'SYSTEM_SHUTDOWN',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error broadcasting shutdown to task', { taskId, error });
      }
    }

    // Clear all task subscriptions
    this.activeTaskSubscriptions.clear();
    this.agentCapabilities.clear();
    this.agentRegistry.clear();

    logger.info('Pure A2A Agent System shut down');
  }
  
}