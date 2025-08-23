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
import { TaskService } from '../services/task-service';
import { logger } from '../utils/logger';
import {
  TaskContext,
  ExecutionPlan,
  ExecutionPhase,
  AgentRequest,
  AgentResponse,
  UIRequest,
  UITemplateType,
  OrchestratorRequest,
  OrchestratorResponse,
  TaskStatus
} from '../types/engine-types';
import { TASK_STATUS } from '../constants/task-status';
import { 
  OrchestratorOperation,
  OrchestratorEventData 
} from '../types/orchestrator-schemas';
import { validateOrchestratorPayload } from '../validation/orchestrator-validation';

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
      
      logger.info('📋 Agent registry will be initialized dynamically from YAML on first use');
      // Agent registry is now initialized asynchronously when needed
      // since YAML files are the ONLY source of truth
      
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
   * Record orchestrator events with schema validation
   * This ensures all orchestrator events follow the defined structure
   */
  private async recordOrchestratorEvent<T extends OrchestratorOperation>(
    context: TaskContext,
    operation: T,
    data: OrchestratorEventData<T>,
    reasoning: string
  ): Promise<void> {
    try {
      // Validate the data against the schema
      const validatedData = validateOrchestratorPayload(operation, data);
      
      // Record the validated event
      await this.recordContextEntry(context, {
        operation,
        data: validatedData,
        reasoning
      });
      
      logger.info(`✅ Recorded orchestrator event: ${operation}`, {
        contextId: context.contextId,
        operation,
        dataKeys: Object.keys(validatedData)
      });
    } catch (validationError) {
      // If validation fails, record with a warning but don't duplicate
      logger.warn(`⚠️ Validation failed for orchestrator event: ${operation}`, {
        contextId: context.contextId,
        operation,
        error: validationError instanceof Error ? validationError.message : 'Unknown error'
      });
      
      // Record once with the original data and a validation warning
      await this.recordContextEntry(context, {
        operation,
        data: { ...data, validation_warning: true },
        reasoning: `${reasoning} [VALIDATION WARNING: ${validationError instanceof Error ? validationError.message : 'Schema validation failed'}]`
      });
    }
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
  private async initializeAgentRegistry(): Promise<void> {
    try {
      logger.info('🤖 Initializing agent registry dynamically from YAML files...');
      
      // Use AgentDiscoveryService singleton to discover all agents from YAML files
      // YAML files are the ONLY source of truth for agent existence
      const { agentDiscovery } = await import('../services/agent-discovery');
      const agentCapabilities = await agentDiscovery.discoverAgents();
      
      logger.info(`📊 Discovered ${agentCapabilities.size} agents from YAML configurations`);
      
      // Register each discovered agent
      agentCapabilities.forEach((agent, agentId) => {
        logger.info(`🔧 Registering agent: ${agentId} (${agent.role})`);
        this.agentRegistry.set(agentId, agent as any);
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
    
    logger.info('🎯 orchestrateTask() CALLED', {
      contextId: context.contextId,
      templateId: context.taskTemplateId,
      tenantId: context.tenantId,
      hasMetadata: !!context.metadata,
      hasTaskDefinition: !!context.metadata?.taskDefinition,
      taskDefinitionKeys: context.metadata?.taskDefinition ? Object.keys(context.metadata.taskDefinition) : []
    });
    
    // DEBUG: Log full context for tracing
    logger.debug('📊 Full TaskContext received', {
      context: JSON.stringify(context, null, 2)
    });
    
    try {
      logger.info('Starting universal task orchestration', {
        contextId: context.contextId,
        templateId: context.taskTemplateId,
        tenantId: context.tenantId,
        timestamp: new Date().toISOString()
      });
      
      // 1. Create execution plan from template
      logger.info('📝 Creating execution plan...');
      const executionPlan = await this.createExecutionPlan(context);
      this.activeExecutions.set(context.contextId, executionPlan);
      
      logger.info('✅ Execution plan created', {
        contextId: context.contextId,
        phases: executionPlan.phases.length,
        estimatedDuration: (executionPlan as any).estimated_duration,
        userInteractions: (executionPlan as any).user_interactions
      });
      
      // NOTE: createExecutionPlan() already records the 'execution_plan_created' event
      // We don't need to record it again here to avoid duplicates
      
      // 3. Execute plan phases
      let allPhasesCompleted = true;
      let phaseIndex = 0;
      
      for (const phase of executionPlan.phases) {
        phaseIndex++;
        logger.info(`📌 Executing phase ${phaseIndex}/${executionPlan.phases.length}: ${phase.name}`, {
          contextId: context.contextId,
          phaseName: phase.name,
          phaseNumber: phaseIndex,
          totalPhases: executionPlan.phases.length
        });
        
        const phaseResult = await this.executePhase(context, phase);
        
        // 4. Phase completion is tracked through subtask delegations
        // No need for separate phase_completed event to avoid duplicates
        
        // 5. Handle UI requests with progressive disclosure
        if (phaseResult.uiRequests && phaseResult.uiRequests.length > 0) {
          await this.handleProgressiveDisclosure(context, phaseResult.uiRequests);
        }
        
        // 6. Check if phase needs user input - pause execution
        // CRITICAL: When ANY agent returns 'needs_input', we MUST:
        // 1. Set task status to 'waiting_for_input' (NOT 'in_progress')
        // 2. Stop execution immediately (don't process more phases)
        // 3. Wait for user to provide the required input
        // This prevents premature task completion and ensures proper UX
        if (phaseResult.status === 'needs_input') { // Agent response status
          logger.info('⏸️ Phase requires user input, pausing task execution', {
            contextId: context.contextId,
            phaseName: phase.name,
            uiRequestCount: phaseResult.uiRequests?.length || 0
          });
          
          // Update task status to waiting_for_input
          // This tells the frontend that user action is REQUIRED to continue
          // The task is NOT failed, NOT completed, just waiting
          await this.updateTaskStatus(context, TASK_STATUS.WAITING_FOR_INPUT);
          
          // Also update the context state to reflect this
          context.currentState.status = TASK_STATUS.WAITING_FOR_INPUT;
          
          // Don't mark as complete, exit orchestration loop
          allPhasesCompleted = false;
          break;
        }
        
        // 7. Check for critical failures that should stop execution
        if (phaseResult.status === 'failed' || phaseResult.criticalError) { // Agent response status
          logger.error(`Phase ${phaseIndex} failed critically, stopping execution`, {
            contextId: context.contextId,
            phaseName: phase.name,
            error: phaseResult.error
          });
          
          // Update task status to failed
          await this.updateTaskStatus(context, TASK_STATUS.FAILED);
          
          allPhasesCompleted = false;
          break;
        }
      }
      
      // 7. Only mark task complete if all phases executed successfully
      if (allPhasesCompleted) {
        logger.info('✅ All phases completed successfully, marking task as complete', {
          contextId: context.contextId,
          phasesExecuted: phaseIndex,
          totalPhases: executionPlan.phases.length
        });
        await this.completeTaskContext(context);
      } else {
        // Check WHY we didn't complete all phases before logging
        const currentStatus = context.currentState.status;
        
        // DEBUG: Log what status we actually have
        logger.debug('Status check debug', {
          contextId: context.contextId,
          currentStatus,
          waitingForInputConstant: TASK_STATUS.WAITING_FOR_INPUT,
          statusMatch: currentStatus === TASK_STATUS.WAITING_FOR_INPUT
        });
        
        if (currentStatus === TASK_STATUS.WAITING_FOR_INPUT) {
          // Task is not incomplete - it's intentionally paused waiting for user
          logger.info('⏸️ Task execution paused - waiting for user input', {
            contextId: context.contextId,
            phasesExecuted: phaseIndex,
            totalPhases: executionPlan.phases.length,
            status: currentStatus
          });
          // Don't record as incomplete when waiting for input - this is expected behavior
        } else if (currentStatus === TASK_STATUS.FAILED) {
          // Task actually failed
          logger.error('❌ Task execution failed', {
            contextId: context.contextId,
            phasesExecuted: phaseIndex,
            totalPhases: executionPlan.phases.length,
            status: currentStatus
          });
          await this.recordContextEntry(context, {
            operation: `task_${TASK_STATUS.FAILED}`,
            data: {
              phasesCompleted: phaseIndex,
              totalPhases: executionPlan.phases.length,
              status: currentStatus,
              reason: 'Phase execution failed'
            },
            reasoning: 'Task failed during phase execution'
          });
        } else {
          // Some other unexpected state
          logger.warn('⚠️ Task execution incomplete - unexpected state', {
            contextId: context.contextId,
            phasesExecuted: phaseIndex,
            totalPhases: executionPlan.phases.length,
            status: currentStatus
          });
          await this.recordContextEntry(context, {
            operation: 'task_incomplete', // Keep as-is since there's no TASK_STATUS.INCOMPLETE
            data: {
              phasesCompleted: phaseIndex,
              totalPhases: executionPlan.phases.length,
              status: currentStatus,
              reason: 'Unexpected execution state'
            },
            reasoning: 'Task could not complete all planned phases due to unexpected state'
          });
        }
      }
      
      // Final summary log
      const finalStatus = context.currentState.status;
      const duration = Date.now() - startTime;
      
      logger.info('Task orchestration ended', {
        contextId: context.contextId,
        status: finalStatus,
        duration,
        phasesCompleted: phaseIndex,
        totalPhases: executionPlan.phases.length
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stackTrace = error instanceof Error ? error.stack : 'No stack trace available';
      logger.error('Orchestration failed', {
        contextId: context.contextId,
        error: errorMessage,
        stack: stackTrace
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
    logger.info('🧠 createExecutionPlan() starting', {
      contextId: context.contextId,
      hasAgentRegistry: this.agentRegistry.size > 0
    });
    
    // CRITICAL: Check for missing business data using toolchain-first approach
    const taskType = context.currentState?.data?.taskType || 'general';
    const businessProfile = (context as any).businessProfile || {};
    const config = this.agentConfig.data_acquisition_protocol;
    
    // Dynamic field validation based on task type and current data state
    const missingFields = taskType === 'user_onboarding' 
      ? ['business_name', 'business_type'].filter(field => !businessProfile[field])
      : [];
    
    if (missingFields.length > 0 && config?.strategy === 'toolchain_first_ui_fallback') {
      logger.info('🔧 BUSINESS DATA MISSING - Starting toolchain-first acquisition', {
        contextId: context.contextId,
        missingFields,
        taskType
      });
      
      // Use BaseAgent's toolchain-first approach
      const acquisitionResult = await this.acquireDataWithToolchain(missingFields, context);
      
      if (acquisitionResult.requiresUserInput) {
        // Create UIRequest for remaining missing fields
        const uiRequest = await this.createDataAcquisitionUIRequest(
          acquisitionResult.stillMissing,
          context,
          acquisitionResult.toolResults
        );
        
        // Return special plan that requests user input
        return this.createUIRequestExecutionPlan(context, uiRequest, acquisitionResult);
      } else {
        // Update business profile with acquired data
        Object.assign(businessProfile, acquisitionResult.acquiredData);
        (context as any).businessProfile = businessProfile;
        
        logger.info('✅ All required business data acquired from toolchain', {
          contextId: context.contextId,
          acquiredFields: Object.keys(acquisitionResult.acquiredData)
        });
      }
    }
    
    // Ensure agent registry is initialized from YAML files (the ONLY source of truth)
    if (this.agentRegistry.size === 0) {
      logger.info('📋 Initializing agent registry from YAML...');
      await this.initializeAgentRegistry();
      logger.info(`✅ Agent registry initialized with ${this.agentRegistry.size} agents`);
    }
    
    // Extract task information from the task data ONLY (no template references)
    // Template content should already be copied to task during creation
    const _mainTaskType = context.currentState?.data?.taskType || 'general';
    const taskTitle = context.currentState?.data?.title || 'Unknown Task';
    const taskDescription = context.currentState?.data?.description || 'No description provided';
    const taskDefinition = context.metadata?.taskDefinition || {};
    
    logger.info('📄 Task information extracted', {
      taskType,
      taskTitle,
      taskDescription: taskDescription.substring(0, 100),
      hasTaskDefinition: Object.keys(taskDefinition).length > 0
    });
    
    // Build detailed agent capability information for LLM reasoning
    const availableAgents = Array.from(this.agentRegistry.values()).map(agent => ({
      agentId: agent.agentId,
      role: agent.role,
      specialization: agent.specialization,
      capabilities: (agent as any).skills || [], // AgentDiscoveryService maps agent_card.skills to 'skills'
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
${(() => {
  try {
    if (taskDefinition?.goals) {
      if (Array.isArray(taskDefinition.goals)) {
        return taskDefinition.goals.map((goal: string) => `- ${goal}`).join('\n');
      } else if (taskDefinition.goals.primary && Array.isArray(taskDefinition.goals.primary)) {
        return taskDefinition.goals.primary.map((goal: any) => `- ${goal.description || goal.title || goal}`).join('\n');
      } else if (typeof taskDefinition.goals === 'string') {
        return `- ${taskDefinition.goals}`;
      }
    }
    return '- Complete the task successfully';
  } catch (error) {
    return '- Complete the task successfully (goals parsing failed)';
  }
})()}

AVAILABLE SPECIALIST AGENTS (THESE ARE THE ONLY VALID AGENTS):
${availableAgents.map(agent => `
Agent: ${agent.agentId}
Role: ${agent.role}
Specialization: ${agent.specialization}
Capabilities: ${agent.capabilities.join(', ')}
Availability: ${agent.availability}
${agent.fallbackStrategy ? `Fallback: ${agent.fallbackStrategy}` : ''}
`).join('\n')}

CRITICAL AGENT SELECTION RULES:
- You MUST use ONLY the exact agent names listed above (e.g., "profile_collection_agent", "data_collection_agent")
- DO NOT use ANY other agent names (like "ProfileCollector", "TaskCoordinatorAgent", etc.)
- If you need profile collection, use "profile_collection_agent"
- If you need task coordination, use "orchestrator_agent"
- If you need data gathering, use "data_collection_agent"

YOUR ORCHESTRATION RESPONSIBILITIES:
1. ANALYZE the task description and goals to understand what needs to be accomplished
2. DECOMPOSE the task into specific, actionable subtasks 
3. MATCH each subtask to the agent with the most appropriate capabilities FROM THE LIST ABOVE
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
        "assigned_agent": "MUST be exact agent name from the list above (e.g., profile_collection_agent)",
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
          "agent": "MUST be exact agent name from the list above (e.g., profile_collection_agent)",
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

CRITICAL REQUIREMENTS:
1. AGENT NAMES: You MUST use ONLY the exact agent names from the list above. DO NOT use "ProfileCollector", "TaskCoordinatorAgent", "BusinessDiscoveryAgent" or any other names.
2. EXAMPLES: Use "profile_collection_agent", "data_collection_agent", "orchestrator_agent", etc.
3. VALIDATION: Every agent name in your response MUST appear in the available agents list above.

Respond ONLY with valid JSON. No explanatory text, no markdown, just the JSON object matching the exact schema above.`;
    
    // Log the complete prompt for tracing
    logger.info('🤖 LLM EXECUTION PLAN PROMPT', {
      contextId: context.contextId,
      prompt: planPrompt.substring(0, 500),
      promptLength: planPrompt.length,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022'
    });

    // Log before LLM request
    logger.info('🚀 Sending request to LLM...', {
      contextId: context.contextId,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.3
    });
    
    const llmStartTime = Date.now();
    const llmResponse = await this.llmProvider.complete({
      prompt: planPrompt,
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      systemPrompt: this.config.mission
    });
    const llmDuration = Date.now() - llmStartTime;
    
    // Log the complete response for tracing
    logger.info('🎯 LLM EXECUTION PLAN RESPONSE', {
      contextId: context.contextId,
      response: llmResponse.content.substring(0, 500),
      responseLength: llmResponse.content.length,
      duration: `${llmDuration}ms`,
      isValidJSON: (() => {
        try { JSON.parse(llmResponse.content); return true; } catch { return false; }
      })()
    });
    
    // DEBUG: Log full response if needed
    logger.debug('📄 Full LLM response', {
      contextId: context.contextId,
      fullResponse: llmResponse.content
    });
    
    // Parse JSON response with comprehensive error handling and validation
    let plan: ExecutionPlan;
    try {
      const parsedPlan = JSON.parse(llmResponse.content);
      
      // Validate the plan structure matches our enhanced schema
      if (!parsedPlan.reasoning || !parsedPlan.phases) {
        throw new Error('Invalid plan structure: missing reasoning or phases');
      }
      
      // CRITICAL: Validate ALL agent names against YAML-discovered agents
      const validAgentIds = new Set(availableAgents.map(agent => agent.agentId));
      const invalidAgentNames = new Set<string>();
      
      // Check agent names in reasoning.subtask_decomposition
      if (parsedPlan.reasoning.subtask_decomposition) {
        parsedPlan.reasoning.subtask_decomposition.forEach((subtask: any) => {
          if (subtask.assigned_agent && !validAgentIds.has(subtask.assigned_agent)) {
            invalidAgentNames.add(subtask.assigned_agent);
          }
        });
      }
      
      // Check agent names in phases.subtasks
      parsedPlan.phases.forEach((phase: any) => {
        if (phase.subtasks) {
          phase.subtasks.forEach((subtask: any) => {
            if (subtask.agent && !validAgentIds.has(subtask.agent)) {
              invalidAgentNames.add(subtask.agent);
            }
          });
        }
      });
      
      // ENFORCE YAML COMPLIANCE: Reject plans with invalid agent names
      if (invalidAgentNames.size > 0) {
        const invalidNames = Array.from(invalidAgentNames);
        const validNames = Array.from(validAgentIds);
        
        logger.error('🚨 AGENT NAME VALIDATION FAILED', {
          contextId: context.contextId,
          invalidAgentNames: invalidNames,
          validAgentNames: validNames,
          llmResponse: llmResponse.content.substring(0, 200)
        });
        
        // Apply agent name correction mapping
        const correctedPlan = this.correctAgentNames(parsedPlan, invalidNames, validNames);
        
        logger.info('🔧 APPLIED AGENT NAME CORRECTIONS', {
          contextId: context.contextId,
          corrections: this.getAgentNameCorrections(),
          correctedPlan: JSON.stringify(correctedPlan, null, 2).substring(0, 300)
        });
        
        plan = correctedPlan as ExecutionPlan;
      } else {
        plan = parsedPlan as ExecutionPlan;
      }
      
      // Log the orchestrator's reasoning for debugging and audit trail
      logger.info('🧠 ORCHESTRATOR REASONING', {
        contextId: context.contextId,
        taskAnalysis: (plan as any).reasoning.task_analysis,
        subtaskCount: (plan as any).reasoning.subtask_decomposition?.length || 0,
        coordinationStrategy: (plan as any).reasoning.coordination_strategy
      });
      
      // Log detailed subtask decomposition for traceability
      if ((plan as any).reasoning.subtask_decomposition) {
        (plan as any).reasoning.subtask_decomposition.forEach((subtask: any, index: number) => {
          logger.info(`📋 SUBTASK ${index + 1}: ${subtask.subtask}`, {
            contextId: context.contextId,
            assignedAgent: subtask.assigned_agent,
            requiredCapabilities: subtask.required_capabilities,
            rationale: subtask.rationale
          });
        });
      }
      
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
            assigned_agent: 'profile_collection_agent',
            rationale: 'profile_collection_agent can handle user interaction when automation fails'
          }],
          coordination_strategy: 'Single-agent fallback with user guidance and manual completion'
        },
        phases: [{
          name: 'Manual Task Processing',
          subtasks: [{
            description: 'Guide user through manual task completion',
            agent: 'profile_collection_agent',
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
    
    // Store the execution plan with structured schema
    // Transform the reasoning.subtask_decomposition into our cleaner structure
    const subtasks = (plan as any).reasoning?.subtask_decomposition || [];
    
    await this.recordOrchestratorEvent(
      context,
      'execution_plan_created',
      {
        plan: {
          subtasks: subtasks.map((subtask: any, index: number) => ({
            name: subtask.subtask || `Subtask ${index + 1}`,
            assigned_agent: subtask.assigned_agent,
            required_capabilities: subtask.required_capabilities || [],
            dependencies: [], // Will be populated if phases define dependencies
            rationale: subtask.rationale || ''
          })),
          coordination_strategy: (plan as any).reasoning?.coordination_strategy || 'Sequential execution',
          task_analysis: (plan as any).reasoning?.task_analysis || 'Task analysis from LLM'
        }
      },
      'Created execution plan with detailed subtask decomposition'
    );
    
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
        for (let index = 0; index < subtaskResults.length; index++) {
          const result = subtaskResults[index];
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
            
            // CRITICAL: Apply fallback for failed subtask and add to results
            // Without this, failed subtasks are ignored and phases incorrectly marked as completed
            const fallbackResult = await this.handleSubtaskFailure(
              context, 
              subtasks[index], 
              result.reason
            );
            results.push(fallbackResult);
            
            // Collect UI requests from fallback
            if (fallbackResult.uiRequests) {
              uiRequests.push(...fallbackResult.uiRequests);
            }
          }
        }
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
    
    // Determine phase status based on subtask results
    // IMPORTANT: Phase status determination hierarchy:
    // 1. If ANY subtask needs input -> phase status = 'needs_input' (highest priority)
    // 2. Else if ANY subtask failed -> phase status = 'failed'
    // 3. Else all completed -> phase status = 'completed'
    // This ensures we NEVER mark a phase as complete when user input is needed
    
    // DEBUG: Log what statuses we actually have in results
    logger.debug('🔍 Phase status determination', {
      contextId: context.contextId,
      phaseName: phase.name,
      resultStatuses: results.map((r: any) => ({ 
        subtask: r.subtaskId || 'unknown',
        status: r.status 
      }))
    });
    
    const needsInput = results.some((r: any) => r.status === 'needs_input');
    const hasFailed = results.some((r: any) => r.status === 'failed' || r.status === 'error');
    const phaseStatus = needsInput ? 'needs_input' : (hasFailed ? 'failed' : 'completed');
    
    logger.info('✅ Phase execution completed', {
      contextId: context.contextId,
      phaseName: phase.name,
      subtaskCount: subtasks.length,
      resultsCount: results.length,
      uiRequestCount: uiRequests.length,
      duration,
      successRate: results.filter((r: any) => r.status === 'completed').length / results.length,
      phaseStatus
    });
    
    return {
      phaseId: (phase as any).id || phase.name,
      phaseName: phase.name,
      status: phaseStatus,
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
    
    // Try to find the agent in our registry first
    let agent = Array.from(this.agentRegistry.values())
      .find(a => a.agentId === subtask.agent);
    
    // If not in registry, try to discover it via discovery service
    if (!agent) {
      try {
        // Import and use the agent discovery service to find the agent
        const { agentDiscovery } = await import('../services/agent-discovery');
        
        // Ensure agents are discovered
        await agentDiscovery.discoverAgents();
        
        // Get capabilities (returns an array, not a Map)
        const capabilities = agentDiscovery.getCapabilities();
        
        // Find the agent in discovered capabilities
        const agentCapability = capabilities.find(cap => cap.agentId === subtask.agent);
        if (agentCapability) {
          // Add to registry for future use - properly typed as AgentCapability
          agent = {
            agentId: subtask.agent,
            role: agentCapability.role,
            capabilities: agentCapability.skills || [],
            availability: agentCapability.availability || 'available',
            specialization: agentCapability.name || subtask.agent,
            fallbackStrategy: 'user_input'
          } as AgentCapability;
          
          this.agentRegistry.set(subtask.agent, agent);
          
          logger.info('✅ Agent discovered and registered via discovery service', {
            agentId: subtask.agent,
            role: agentCapability.role,
            availability: agentCapability.availability
          });
        }
      } catch (error) {
        logger.warn('Failed to discover agent via discovery service', {
          agentId: subtask.agent,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // If still not found, throw error
    if (!agent) {
      throw new Error(`Agent ${subtask.agent} not found in registry or discovery service`);
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
    // Get the real agent instance from the discovery service singleton
    const { agentDiscovery } = await import('../services/agent-discovery');
    const agentInstance = await agentDiscovery.instantiateAgent(
      agent.agentId,
      context.tenantId,
(context.currentState as any)?.user_id
    );
    
    // Record that we're delegating this subtask (structured event)
    await this.recordOrchestratorEvent(
      context,
      'subtask_delegated',
      {
        agent_id: subtask.agent,
        subtask_name: subtask.description,
        instructions: subtask.specific_instruction || 'Execute subtask as defined',
        subtask_index: 0 // We don't have the index here, using 0 as placeholder
      },
      `Delegating subtask "${subtask.description}" to ${subtask.agent}`
    );
    
    // Execute the real agent using the AgentExecutor service (dependency injection)
    const { AgentExecutor } = await import('../services/agent-executor');
    const agentResponse = await AgentExecutor.execute(agentInstance, request);
    
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
    
    // Create an error report UIRequest
    // This should rarely happen if agents are properly configured
    // The real fix is to ensure agents always return proper UIRequests
    const errorUIRequest = {
      requestId: `error_${Date.now()}`,
      templateType: 'error_notification' as any,
      semanticData: {
        title: `Agent Error: ${subtask.agent}`,
        description: `The ${subtask.agent} encountered an error and needs configuration improvement.`,
        instruction: `Error: ${error instanceof Error ? error.message : String(error)}`,
        expectedOutput: subtask.expected_output,
        debugInfo: {
          subtask: subtask.description,
          agent: subtask.agent,
          error: error instanceof Error ? error.message : String(error)
        }
      },
      context: {
        isError: true,
        originalSubtask: subtask.description,
        agent: subtask.agent,
        agentInstruction: subtask.specific_instruction,
        expectedAgentOutput: subtask.expected_output
      }
    };
    
    // CRITICAL: Record UI_REQUEST_CREATED event so StateComputer can detect it
    await this.recordContextEntry(context, {
      operation: 'UI_REQUEST_CREATED',
      data: {
        uiRequest: errorUIRequest,
        source: 'orchestrator_error',
        subtask: subtask.description,
        agent: subtask.agent,
        isError: true
      },
      reasoning: `Agent ${subtask.agent} failed validation - needs proper UIRequest implementation`
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
      uiRequests: [errorUIRequest],
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
    
    // Use real agent execution via AgentDiscoveryService singleton
    const { agentDiscovery: discoveryService } = await import('../services/agent-discovery');
    
    try {
      logger.info('Executing real agent (legacy mode)', {
        agentId: agent.agentId,
        requestId: request.requestId
      });
      
      // Instantiate the real agent
      const agentInstance = await discoveryService.instantiateAgent(
        agent.agentId,
        context.tenantId,
  (context.currentState as any)?.user_id
      );
      
      // Execute the real agent with the request
      const agentResponse = await (agentInstance as any).executeInternal(request);
      
      return agentResponse;
    } catch (error) {
      logger.error('Failed to execute real agent in legacy mode, returning fallback', {
        agentId: agent.agentId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return basic success response as fallback
      return {
        status: 'completed' as const,
        data: {
          message: `Agent ${agent.agentId} execution attempted`,
          agentId: agent.agentId,
          fallback: true
        },
        reasoning: `Executed ${agent.role} for ${phase.name} (with fallback)`
      };
    }
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
    
    // Record FULL UI requests in context for proper persistence
    // UI requests are now stored as task_context_events
    // The recordContextEntry method will handle persistence and broadcasting
    await this.recordContextEntry(context, {
      operation: 'ui_requests_created',
      data: {
        // Store the complete UI request data for frontend consumption
        uiRequests: requests,
        // Keep summary for quick reference  
        summary: {
          count: requests.length,
          types: requests.map(r => r.templateType),
          requestIds: requests.map(r => r.requestId)
        }
      },
      reasoning: 'Requesting user input for required information'
    });
    
    // The recordContextEntry method already broadcasts the event via SSE
    // No need for additional broadcasting - the frontend will receive the
    // ui_requests_created event through the task context update stream
    
    logger.debug('UI requests created and broadcast via context event', {
      contextId: context.contextId,
      requestCount: requests.length
    });
  }
  
  /**
   * Check if task goals are achieved
   */
  private async areGoalsAchieved(context: TaskContext): Promise<boolean> {
    const taskDefinition = context.metadata?.taskDefinition || {};
    
    if (!taskDefinition.goals) {
      return true; // No goals means task is complete
    }
    
    // Check primary goals
    const goals = taskDefinition.goals;
    if (Array.isArray(goals)) {
      // Simple array of goal strings - DO NOT return true prematurely!
      // Goals are only achieved when ALL phases are complete
      return false; // Continue executing all phases
    } else if (goals.primary) {
      // Structured goals with primary/secondary
      for (const goal of goals.primary) {
        if (goal.required && !this.isGoalAchieved(context, goal)) {
          return false;
        }
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
   * Update task status in database
   * Used to track task state transitions like waiting_for_input
   */
  private async updateTaskStatus(context: TaskContext, status: TaskStatus): Promise<void> {
    logger.info(`📝 Updating task status to ${status.toUpperCase()}`, {
      contextId: context.contextId
    });
    
    try {
      const taskService = TaskService.getInstance();
      await taskService.updateTaskStatus(context.contextId, status);
      
      logger.info(`✅ Task status updated to ${status.toUpperCase()} in database`, {
        contextId: context.contextId
      });
    } catch (error) {
      logger.error('Failed to update task status', {
        contextId: context.contextId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Complete task
   */
  private async completeTaskContext(context: TaskContext): Promise<void> {
    // Log that we're updating task status
    logger.info('📝 Updating task status to COMPLETED', {
      contextId: context.contextId
    });
    
    // Update the context state to completed
    context.currentState.status = TASK_STATUS.COMPLETED;
    context.currentState.completeness = 100;
    
    // Update task status in database via TaskService
    try {
      const taskService = new TaskService(DatabaseService.getInstance());
      const completedAt = new Date().toISOString();
      
      await taskService.updateTaskStatus(context.contextId, TASK_STATUS.COMPLETED, completedAt);
      
      logger.info('✅ Task status updated to COMPLETED in database', {
        contextId: context.contextId
      });
    } catch (error) {
      logger.error('Error updating task status', {
        contextId: context.contextId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Record completion in context with updated state
    await this.recordContextEntry(context, {
      operation: `task_${TASK_STATUS.COMPLETED}`,
      data: {
        completedAt: new Date().toISOString(),
        finalState: context.currentState,
        status: 'completed',
        completeness: 100
      },
      reasoning: 'All phases executed successfully'
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
    const taskDefinition = context.metadata?.taskDefinition || {};
    
    // Generate manual steps from task goals
    const goals = taskDefinition.goals || [];
    if (Array.isArray(goals)) {
      return goals.map((goal, index) => ({
        step: index + 1,
        title: `Step ${index + 1}`,
        description: goal,
        status: 'pending'
      }));
    }
    
    // Fallback: create basic steps from task data
    return [{
      step: 1,
      title: context.currentState?.data?.title || 'Complete Task',
      description: context.currentState?.data?.description || 'Follow the instructions to complete this task',
      status: 'pending'
    }];
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
      Task: ${JSON.stringify(context.currentState?.data)}
      Task Definition: ${JSON.stringify(context.metadata?.taskDefinition)}
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
      metadata: state.metadata || {}
      // templateSnapshot omitted - agents use task data only
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
  
  /**
   * Get mapping of old agent names to YAML-based agent names
   * This ensures the LLM's old training data doesn't break the system
   */
  private getAgentNameCorrections(): Record<string, string> {
    return {
      // Common old names that LLMs might use from training data
      'ProfileCollector': 'profile_collection_agent',
      'TaskCoordinatorAgent': 'orchestrator_agent',
      'BusinessDiscoveryAgent': 'data_collection_agent',
      'DataEnrichmentAgent': 'data_collection_agent',
      'ComplianceVerificationAgent': 'legal_compliance_agent',
      'FormOptimizerAgent': 'ux_optimization_agent',
      'CelebrationAgent': 'celebration_agent',
      'MonitoringAgent': 'monitoring_agent',
      'AchievementTracker': 'celebration_agent',
      'PaymentAgent': 'payment_agent',
      'CommunicationAgent': 'communication_agent',
      'AgencyInteractionAgent': 'agency_interaction_agent',
      'EntityComplianceAgent': 'entity_compliance_agent'
    };
  }
  
  /**
   * Correct agent names in parsed plan using mapping rules
   * This is a safety net when LLM training data conflicts with YAML configuration
   */
  private correctAgentNames(parsedPlan: any, invalidNames: string[], validNames: string[]): any {
    const corrections = this.getAgentNameCorrections();
    const correctedPlan = JSON.parse(JSON.stringify(parsedPlan)); // Deep clone
    
    logger.info('🔧 CORRECTING AGENT NAMES', {
      invalidNames,
      validNames,
      availableCorrections: Object.keys(corrections)
    });
    
    // Correct names in reasoning.subtask_decomposition
    if (correctedPlan.reasoning?.subtask_decomposition) {
      correctedPlan.reasoning.subtask_decomposition.forEach((subtask: any) => {
        if (subtask.assigned_agent && corrections[subtask.assigned_agent]) {
          logger.info(`🔄 Correcting agent name: ${subtask.assigned_agent} → ${corrections[subtask.assigned_agent]}`);
          subtask.assigned_agent = corrections[subtask.assigned_agent];
        } else if (subtask.assigned_agent && !validNames.includes(subtask.assigned_agent)) {
          // If no mapping exists, use the first available agent as fallback
          const fallbackAgent = validNames[0] || 'profile_collection_agent';
          logger.warn(`⚠️ No mapping for ${subtask.assigned_agent}, using fallback: ${fallbackAgent}`);
          subtask.assigned_agent = fallbackAgent;
        }
      });
    }
    
    // Correct names in phases.subtasks
    correctedPlan.phases?.forEach((phase: any) => {
      phase.subtasks?.forEach((subtask: any) => {
        if (subtask.agent && corrections[subtask.agent]) {
          logger.info(`🔄 Correcting agent name: ${subtask.agent} → ${corrections[subtask.agent]}`);
          subtask.agent = corrections[subtask.agent];
        } else if (subtask.agent && !validNames.includes(subtask.agent)) {
          // If no mapping exists, use the first available agent as fallback
          const fallbackAgent = validNames[0] || 'profile_collection_agent';
          logger.warn(`⚠️ No mapping for ${subtask.agent}, using fallback: ${fallbackAgent}`);
          subtask.agent = fallbackAgent;
        }
      });
    });
    
    return correctedPlan;
  }
  
  /**
   * =============================================================================
   * TOOLCHAIN-FIRST UI REQUEST EXECUTION PLAN
   * =============================================================================
   * 
   * Creates execution plan when toolchain acquisition fails and UI input is needed
   */
  
  /**
   * Create execution plan that requests user input after toolchain attempts
   */
  private async createUIRequestExecutionPlan(
    context: TaskContext,
    uiRequest: any,
    acquisitionResult: any
  ): Promise<ExecutionPlan> {
    logger.info('🎯 Creating UI request execution plan after toolchain attempts', {
      contextId: context.contextId,
      stillMissingFields: acquisitionResult.stillMissingFields || acquisitionResult.stillMissing,
      toolchainResults: acquisitionResult.toolResults?.length || 0
    });
    
    // Record why we're requesting user input
    await this.recordContextEntry(context, {
      operation: 'toolchain_acquisition_failed_requesting_ui',
      data: {
        originalMissingFields: acquisitionResult.stillMissingFields || acquisitionResult.stillMissing,
        toolchainResults: acquisitionResult.toolResults || [],
        acquiredFromToolchain: acquisitionResult.acquiredData,
        requestingUserInput: true
      },
      reasoning: `Toolchain attempted ${acquisitionResult.toolResults?.length || 0} tools but could not acquire all required data. Requesting user input for remaining fields.`
    });
    
    // Create a single-phase plan that requests user input
    const uiRequestPlan: ExecutionPlan = {
      phases: [{
        name: 'User Data Collection (Post-Toolchain)',
        subtasks: [{
          description: 'Collect remaining business information from user after toolchain attempts',
          agent: 'profile_collection_agent',
          specific_instruction: `Request the following business information from the user: ${(acquisitionResult.stillMissingFields || acquisitionResult.stillMissing || []).join(', ')}. Explain that we attempted to find this information automatically but need their input for accuracy.`,
          input_data: {
            missingFields: acquisitionResult.stillMissingFields || acquisitionResult.stillMissing || [],
            toolchainResults: acquisitionResult.toolResults || [],
            acquiredData: acquisitionResult.acquiredData || {},
            context: 'toolchain_acquisition_failed'
          },
          expected_output: 'User-provided business data for remaining fields',
          success_criteria: ['All required fields provided by user', 'Data validated and stored']
        }],
        parallel_execution: false,
        dependencies: []
      }],
      reasoning: {
        task_analysis: `Toolchain tools could not provide all required data. Still need: ${(acquisitionResult.stillMissingFields || acquisitionResult.stillMissing || []).join(', ')}`,
        subtask_decomposition: [{
          subtask: 'Collect remaining business information from user',
          required_capabilities: ['user_input_collection', 'business_profile_management'],
          assigned_agent: 'profile_collection_agent',
          rationale: 'Specialized in collecting business information with user interaction after automated attempts'
        }],
        coordination_strategy: 'Single-phase user data collection as fallback after toolchain attempts'
      }
    } as any;
    
    // Add the UI request directly to the plan
    (uiRequestPlan as any).immediateUIRequest = uiRequest;
    
    return uiRequestPlan;
  }
  
  /**
   * Dynamically identify missing required fields based on task type
   * This replaces the hardcoded required_business_data configuration
   */
  private async identifyMissingRequiredFields(
    context: TaskContext, 
    taskType: string,
    businessProfile: Record<string, any>
  ): Promise<string[]> {
    const missingFields: string[] = [];
    
    // Define minimum required fields based on task type
    // This is now dynamically determined rather than hardcoded in YAML
    const taskRequirements: Record<string, string[]> = {
      'user_onboarding': ['business_name', 'business_type'],
      'soi_filing': ['business_name', 'entity_type', 'registered_agent_name'],
      'compliance_check': ['business_name', 'business_type', 'jurisdiction'],
      'general': ['business_name']
    };
    
    const requiredFields = taskRequirements[taskType] || taskRequirements['general'];
    
    // Check which fields are missing or empty
    for (const field of requiredFields) {
      const value = businessProfile[field];
      if (!value || value === '' || value === null || value === undefined) {
        missingFields.push(field);
      }
    }
    
    // Log what we found
    if (missingFields.length > 0) {
      logger.info('🔍 Identified missing required fields', {
        contextId: context.contextId,
        taskType,
        requiredFields,
        missingFields,
        presentFields: requiredFields.filter(f => !missingFields.includes(f))
      });
    }
    
    return missingFields;
  }
  
}