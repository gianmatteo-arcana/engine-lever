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
import { agentDiscovery, AgentCapability } from '../services/agent-discovery';
import {
  TaskContext,
  TaskTemplate,
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
 * Enhanced Agent capability definition with detailed specializations
 * Extends the AgentCapability from agent-discovery service with additional orchestration metadata
 */
interface EnhancedAgentCapability extends AgentCapability {
  capabilities?: string[]; // Mapped from skills for orchestration compatibility
  specialization?: string; // Detailed description of agent's domain expertise
  estimatedProcessingTime?: string; // e.g., "2-5 minutes", "real-time", "24-48 hours" 
  dependencies?: string[]; // Other agents or services this agent requires
  outputFormat?: string; // What type of data/results this agent produces
  fallbackStrategy?: 'user_input' | 'alternative_agent' | 'defer';
}

/**
 * Enhanced JSON Schema for LLM execution plan responses
 * Ensures structured reasoning and proper task decomposition
 */
const EXECUTION_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    reasoning: {
      type: "object",
      properties: {
        task_analysis: { 
          type: "string",
          description: "Analysis of the task requirements and complexity"
        },
        subtask_decomposition: { 
          type: "array",
          description: "Breakdown of the main task into specific subtasks",
          items: { 
            type: "object",
            properties: {
              subtask: { type: "string", description: "Specific subtask to be completed" },
              required_capabilities: { 
                type: "array", 
                items: { type: "string" },
                description: "List of agent capabilities needed for this subtask"
              },
              assigned_agent: { 
                type: "string",
                description: "ID of the agent best suited for this subtask"
              },
              rationale: { 
                type: "string",
                description: "Why this agent was selected for this subtask"
              },
              estimated_duration: {
                type: "string",
                description: "Expected time to complete this subtask"
              },
              dependencies: {
                type: "array",
                items: { type: "string" },
                description: "Other subtasks that must complete before this one"
              }
            },
            required: ["subtask", "required_capabilities", "assigned_agent", "rationale"]
          }
        },
        coordination_strategy: { 
          type: "string",
          description: "How subtasks will be coordinated and data will flow between agents"
        },
        fallback_plans: {
          type: "array",
          items: {
            type: "object", 
            properties: {
              scenario: { type: "string" },
              fallback_action: { type: "string" }
            }
          },
          description: "Contingency plans if agents are unavailable or tasks fail"
        }
      },
      required: ["task_analysis", "subtask_decomposition", "coordination_strategy"]
    },
    execution_plan: {
      type: "object",
      properties: {
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              agent_instructions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    agent_id: { type: "string" },
                    instruction: { type: "string" },
                    context_data: { type: "object" },
                    expected_output: { type: "string" }
                  }
                }
              },
              success_criteria: { type: "array", items: { type: "string" } },
              estimated_duration: { type: "string" }
            }
          }
        },
        overall_timeline: { type: "string" },
        risk_assessment: { type: "string" }
      },
      required: ["phases"]
    }
  },
  required: ["reasoning", "execution_plan"]
};

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
  private agentRegistry: Map<string, EnhancedAgentCapability>;
  private agentRegistryInitialized: boolean = false;
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
      
      logger.info('📋 Agent registry will be lazily initialized on first use...');
      
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
   * Ensure agent registry is initialized (lazy initialization)
   */
  private async ensureAgentRegistryInitialized(): Promise<void> {
    if (!this.agentRegistryInitialized) {
      await this.initializeAgentRegistry();
      this.agentRegistryInitialized = true;
    }
  }

  /**
   * Initialize agent registry using AgentDiscoveryService
   * Uses existing YAML agent configurations with DI factory pattern
   * Addresses PR feedback: leverage agent-discovery.ts and use DI pattern
   */
  private async initializeAgentRegistry(): Promise<void> {
    try {
      logger.info('🤖 Initializing agent registry using AgentDiscoveryService...');
      
      // Discover agents from YAML configurations
      const discoveredCapabilities = await agentDiscovery.discoverAgents();
      
      // Convert AgentCapability to EnhancedAgentCapability with orchestration metadata
      for (const [agentId, capability] of discoveredCapabilities) {
        const enhancedCapability: EnhancedAgentCapability = {
          ...capability,
          // Map skills to capabilities for compatibility
          capabilities: capability.skills || [],
          // Add orchestration-specific metadata
          specialization: this.getAgentSpecialization(agentId),
          estimatedProcessingTime: this.getEstimatedProcessingTime(agentId),
          dependencies: this.getAgentDependencies(agentId),
          outputFormat: this.getAgentOutputFormat(agentId),
          fallbackStrategy: this.getFallbackStrategy(agentId)
        };
        
        this.agentRegistry.set(agentId, enhancedCapability);
        
        logger.info(`🔧 Registered agent: ${agentId} with ${capability.skills.length} skills`, {
          role: capability.role,
          availability: capability.availability,
          specialization: enhancedCapability.specialization
        });
      }
      
      logger.info(`✅ Agent registry initialized with ${this.agentRegistry.size} agents from YAML configurations`);
      logger.info(`🎯 Total capabilities available: ${Array.from(this.agentRegistry.values()).reduce((sum, agent) => sum + (agent.capabilities?.length || 0), 0)}`);
    } catch (error) {
      logger.error('💥 FATAL: Agent registry initialization failed!', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get agent specialization description based on agent ID
   * Maps agent IDs to their domain expertise descriptions
   */
  private getAgentSpecialization(agentId: string): string {
    const specializations: Record<string, string> = {
      'profile_collection_agent': 'Collects and validates user business information through intelligent forms and guided workflows',
      'celebration_agent': 'Recognizes achievements and milestones to enhance user motivation and satisfaction',
      'entity_compliance_agent': 'Analyzes legal and regulatory requirements specific to business entity type and jurisdiction',
      'ux_optimization_agent': 'Optimizes user experience and interface flows for maximum efficiency and satisfaction',
      'monitoring_agent': 'Monitors system performance and user interactions to provide insights and optimization recommendations',
      'communication_agent': 'Manages user communications, notifications, and interaction workflows',
      'data_collection_agent': 'Enhances collected data with external sources and intelligent analysis',
      'agency_interaction_agent': 'Manages interactions with external government agencies and third-party services',
      'legal_compliance_agent': 'Handles legal document preparation and compliance verification processes',
      'payment_agent': 'Manages payment processing and financial transaction workflows'
    };
    
    return specializations[agentId] || 'Specialized agent for business process automation';
  }

  /**
   * Get estimated processing time for agent operations
   */
  private getEstimatedProcessingTime(agentId: string): string {
    const processingTimes: Record<string, string> = {
      'profile_collection_agent': 'real-time',
      'celebration_agent': 'real-time',
      'entity_compliance_agent': '5-10 minutes',
      'ux_optimization_agent': 'real-time',
      'monitoring_agent': 'continuous',
      'communication_agent': 'real-time',
      'data_collection_agent': '3-8 minutes',
      'agency_interaction_agent': '5-30 minutes',
      'legal_compliance_agent': '10-20 minutes',
      'payment_agent': '2-5 minutes'
    };
    
    return processingTimes[agentId] || '2-10 minutes';
  }

  /**
   * Get agent dependencies
   */
  private getAgentDependencies(agentId: string): string[] {
    const dependencies: Record<string, string[]> = {
      'profile_collection_agent': ['ui_components', 'validation_services'],
      'celebration_agent': ['progress_tracking', 'ui_components'],
      'entity_compliance_agent': ['legal_databases', 'regulatory_apis'],
      'ux_optimization_agent': ['analytics_platform', 'ui_components'],
      'monitoring_agent': ['analytics_platform', 'logging_systems'],
      'communication_agent': ['notification_services', 'email_service'],
      'data_collection_agent': ['external_data_sources', 'validation_services'],
      'agency_interaction_agent': ['secure_credentials', 'network_access'],
      'legal_compliance_agent': ['legal_databases', 'document_services'],
      'payment_agent': ['payment_gateways', 'security_services']
    };
    
    return dependencies[agentId] || ['database_access'];
  }

  /**
   * Get agent output format
   */
  private getAgentOutputFormat(agentId: string): string {
    const outputFormats: Record<string, string> = {
      'profile_collection_agent': 'validated_user_profile',
      'celebration_agent': 'celebration_experiences',
      'entity_compliance_agent': 'compliance_action_plan',
      'ux_optimization_agent': 'optimized_user_flows',
      'monitoring_agent': 'performance_insights',
      'communication_agent': 'notification_confirmations',
      'data_collection_agent': 'enriched_business_intelligence',
      'agency_interaction_agent': 'submission_confirmations',
      'legal_compliance_agent': 'legal_document_packages',
      'payment_agent': 'payment_confirmations'
    };
    
    return outputFormats[agentId] || 'structured_data_output';
  }

  /**
   * Get fallback strategy for agent
   */
  private getFallbackStrategy(agentId: string): 'user_input' | 'alternative_agent' | 'defer' {
    const fallbackStrategies: Record<string, 'user_input' | 'alternative_agent' | 'defer'> = {
      'profile_collection_agent': 'user_input',
      'celebration_agent': 'defer',
      'entity_compliance_agent': 'user_input',
      'ux_optimization_agent': 'defer',
      'monitoring_agent': 'defer',
      'communication_agent': 'alternative_agent',
      'data_collection_agent': 'user_input',
      'agency_interaction_agent': 'user_input',
      'legal_compliance_agent': 'user_input',
      'payment_agent': 'user_input'
    };
    
    return fallbackStrategies[agentId] || 'user_input';
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
   * Enhanced execution plan creation using LLM with detailed agent capabilities
   * Implements formalized task decomposition and intelligent agent coordination
   * Engine PRD Lines 915-972
   */
  private async createExecutionPlan(context: TaskContext): Promise<ExecutionPlan> {
    try {
      // Ensure agent registry is initialized from YAML configurations
      await this.ensureAgentRegistryInitialized();
      
      logger.info('🧠 ORCHESTRATOR REASONING: Starting enhanced execution plan generation', {
        contextId: context.contextId,
        templateId: context.taskTemplateId,
        agentCount: this.agentRegistry.size
      });

      const template = context.templateSnapshot;
      
      // Enhanced LLM prompt with detailed agent capabilities for intelligent task decomposition
      const enhancedPlanPrompt = `You are an expert task orchestrator responsible for creating comprehensive execution plans.

## TASK ANALYSIS
Task Template: ${JSON.stringify(template, null, 2)}
Current Context: ${JSON.stringify(context.currentState, null, 2)}

## AVAILABLE AGENTS WITH DETAILED CAPABILITIES
${Array.from(this.agentRegistry.values()).map(agent => `
### ${agent.agentId} (${agent.role})
- **Specialization**: ${agent.specialization}
- **Capabilities**: ${agent.capabilities?.join(', ') || 'None specified'}
- **Processing Time**: ${agent.estimatedProcessingTime}
- **Dependencies**: ${agent.dependencies?.join(', ') || 'None'}
- **Output Format**: ${agent.outputFormat}
- **Availability**: ${agent.availability}
`).join('\n')}

## ORCHESTRATION REQUIREMENTS
1. **Task Decomposition**: Analyze the task description and break it down into specific subtasks
2. **Agent Assignment**: Match each subtask to the most appropriate agent based on capabilities
3. **Coordination Strategy**: Define how agents will coordinate and share data
4. **Progressive Disclosure**: Minimize user interruptions through intelligent batching
5. **Fallback Planning**: Provide contingency plans for agent unavailability

## RESPONSE FORMAT
You MUST respond with ONLY valid JSON matching this exact schema:

${JSON.stringify(EXECUTION_PLAN_JSON_SCHEMA, null, 2)}

## INSTRUCTIONS
- Provide detailed reasoning for each decision
- Focus on the "WHY" behind agent assignments
- Consider dependencies between subtasks
- Plan for data flow between agents
- Include specific agent instructions for each phase
- Estimate realistic timelines
- Address potential failure scenarios

RESPOND WITH JSON ONLY - NO ADDITIONAL TEXT.`;

      logger.info('📋 SUBTASK DECOMPOSITION: Sending enhanced prompt to LLM', {
        promptLength: enhancedPlanPrompt.length,
        agentCapabilities: Array.from(this.agentRegistry.values()).reduce((sum, agent) => sum + (agent.capabilities?.length || agent.skills?.length || 0), 0)
      });

      // Use updated model for better JSON reasoning
      const llmResponse = await this.llmProvider.complete({
        prompt: enhancedPlanPrompt,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.1, // Lower temperature for more consistent JSON responses
        systemPrompt: `${this.config.mission}\n\nYou are an expert at task analysis and agent coordination. Always respond with valid JSON only.`
      });

      logger.info('🤖 LLM RESPONSE: Received execution plan response', {
        responseLength: llmResponse.content.length,
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022'
      });

      // Enhanced JSON parsing with fallback strategy
      let planResponse;
      try {
        planResponse = JSON.parse(llmResponse.content);
        logger.info('✅ JSON PARSING: Successfully parsed LLM response');
      } catch (parseError) {
        logger.error('❌ JSON PARSING FAILED: Attempting fallback extraction', { 
          error: parseError instanceof Error ? parseError.message : String(parseError),
          responsePreview: llmResponse.content.substring(0, 200) 
        });
        
        // Fallback: Try to extract JSON from response
        const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            planResponse = JSON.parse(jsonMatch[0]);
            logger.info('✅ FALLBACK JSON EXTRACTION: Successfully extracted JSON from response');
          } catch (fallbackError) {
            logger.error('❌ FALLBACK FAILED: Unable to extract valid JSON', { 
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) 
            });
            throw new Error(`LLM response parsing failed: ${fallbackError}`);
          }
        } else {
          throw new Error('No JSON content found in LLM response');
        }
      }

      // Log orchestrator reasoning for audit trail
      if (planResponse.reasoning) {
        logger.info('🎯 AGENT INSTRUCTION DISPATCH: Orchestrator reasoning captured', {
          taskAnalysis: planResponse.reasoning.task_analysis,
          subtaskCount: planResponse.reasoning.subtask_decomposition?.length || 0,
          coordinationStrategy: planResponse.reasoning.coordination_strategy
        });

        // Log each subtask assignment with reasoning
        planResponse.reasoning.subtask_decomposition?.forEach((subtask: any, index: number) => {
          logger.info(`📌 SUBTASK ${index + 1}: ${subtask.subtask}`, {
            assignedAgent: subtask.assigned_agent,
            requiredCapabilities: subtask.required_capabilities,
            rationale: subtask.rationale,
            estimatedDuration: subtask.estimated_duration
          });
        });
      }

      // Convert enhanced response to ExecutionPlan format
      const enhancedPlan = this.convertToExecutionPlan(planResponse, context);
      
      // Record orchestration event for audit trail
      await this.recordContextEntry(context, {
        operation: 'orchestration_reasoning_complete',
        data: { 
          reasoning: planResponse.reasoning,
          agentInstructions: planResponse.execution_plan?.phases?.length || 0,
          totalSubtasks: planResponse.reasoning?.subtask_decomposition?.length || 0
        },
        reasoning: 'Completed intelligent task decomposition and agent instruction generation'
      });

      logger.info('🎉 ENHANCED ORCHESTRATION: Execution plan created successfully', {
        contextId: context.contextId,
        phaseCount: enhancedPlan.phases.length,
        totalSubtasks: planResponse.reasoning?.subtask_decomposition?.length || 0
      });

      return enhancedPlan;

    } catch (error) {
      logger.error('💥 ORCHESTRATION FAILED: Enhanced execution plan creation failed', {
        contextId: context.contextId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Record failure for audit trail
      await this.recordContextEntry(context, {
        operation: 'orchestration_failed',
        data: { 
          error: error instanceof Error ? error.message : String(error),
          strategy: 'fallback_to_manual_mode'
        },
        reasoning: 'LLM-powered orchestration failed, system will provide manual guidance'
      });

      // Return basic fallback plan
      return this.createFallbackPlan(context);
    }
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
      strategy: (agent as any).fallbackStrategy || this.config.resilience.fallbackStrategy
    });
    
    const strategy = (agent as any).fallbackStrategy || this.config.resilience.fallbackStrategy;
    
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
        model: process.env.LLM_DEFAULT_MODEL || 'claude-3-sonnet-20240229',
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
      model: process.env.LLM_DEFAULT_MODEL || 'claude-3-sonnet-20240229',
      temperature: 0.5,
      systemPrompt: 'You provide clear, helpful guidance for manual task completion.'
    });
    
    return response.content.split('\n').filter((line: string) => line.trim());
  }
  
  /**
   * Convert enhanced LLM response to ExecutionPlan format
   * Implements agent instruction generation with subtask coordination
   */
  private convertToExecutionPlan(planResponse: any, context: TaskContext): ExecutionPlan {
    try {
      logger.info('🔄 PLAN CONVERSION: Converting enhanced response to ExecutionPlan format', {
        contextId: context.contextId,
        hasReasoning: !!planResponse.reasoning,
        hasExecutionPlan: !!planResponse.execution_plan
      });

      const phases: ExecutionPhase[] = [];
      
      if (planResponse.execution_plan?.phases) {
        phases.push(...planResponse.execution_plan.phases.map((phase: any, index: number) => ({
          id: phase.id || `phase_${index + 1}`,
          name: phase.name || `Phase ${index + 1}`,
          description: phase.description || 'Generated phase',
          agents: phase.agent_instructions?.map((instr: any) => instr.agent_id) || [],
          dependencies: [],
          operation: 'execute',
          input: {
            agentInstructions: phase.agent_instructions || [],
            successCriteria: phase.success_criteria || [],
            estimatedDuration: phase.estimated_duration
          }
        })));
      }

      // If no phases provided, create default phases from subtask decomposition
      if (phases.length === 0 && planResponse.reasoning?.subtask_decomposition) {
        logger.info('📋 PHASE GENERATION: Creating phases from subtask decomposition');
        
        const groupedTasks = this.groupSubtasksByPhase(planResponse.reasoning.subtask_decomposition);
        
        groupedTasks.forEach((tasks, phaseIndex) => {
          phases.push({
            id: `generated_phase_${phaseIndex + 1}`,
            name: `${tasks[0]?.subtask || 'Task Execution'} Phase`,
            description: `Execute subtasks: ${tasks.map(t => t.subtask).join(', ')}`,
            agents: tasks.map(t => t.assigned_agent),
            dependencies: [],
            operation: 'execute',
            input: {
              agentInstructions: tasks.map(task => ({
                agent_id: task.assigned_agent,
                instruction: task.subtask,
                context_data: { capabilities: task.required_capabilities },
                expected_output: `Completion of: ${task.subtask}`
              })),
              successCriteria: tasks.map(t => `${t.subtask} completed successfully`),
              estimatedDuration: tasks[0]?.estimated_duration || '5-10 minutes'
            }
          });
        });
      }

      const executionPlan: ExecutionPlan = {
        id: `plan_${context.contextId}`,
        phases,
        metadata: {
          reasoning: planResponse.reasoning,
          generatedAt: new Date().toISOString(),
          totalSubtasks: planResponse.reasoning?.subtask_decomposition?.length || 0,
          estimatedDuration: planResponse.execution_plan?.overall_timeline || 'Variable'
        }
      };

      logger.info('✅ PLAN CONVERSION: Successfully converted to ExecutionPlan', {
        phaseCount: phases.length,
        totalAgentInstructions: phases.reduce((sum, phase) => sum + (phase.input?.agentInstructions?.length || 0), 0)
      });

      return executionPlan;

    } catch (error) {
      logger.error('❌ PLAN CONVERSION FAILED: Error converting response to ExecutionPlan', {
        error: error instanceof Error ? error.message : String(error)
      });

      // Return minimal fallback plan
      return {
        id: `fallback_plan_${context.contextId}`,
        phases: [{
          id: 'fallback_phase',
          name: 'Manual Task Completion',
          description: 'Complete task manually due to orchestration failure',
          agents: [],
          dependencies: [],
          operation: 'user_input',
          input: { message: 'Please complete this task manually' }
        }],
        metadata: {
          isFallback: true,
          reason: 'Plan conversion failed'
        }
      };
    }
  }

  /**
   * Group subtasks into logical phases for execution
   * Implements intelligent batching and dependency management
   */
  private groupSubtasksByPhase(subtasks: any[]): any[][] {
    const phases: any[][] = [];
    const processed = new Set<number>();

    // Simple grouping strategy - can be enhanced with dependency analysis
    subtasks.forEach((subtask, index) => {
      if (!processed.has(index)) {
        const phase = [subtask];
        processed.add(index);
        
        // Look for related subtasks that can be executed in parallel
        subtasks.forEach((otherSubtask, otherIndex) => {
          if (!processed.has(otherIndex) && 
              this.canExecuteInParallel(subtask, otherSubtask)) {
            phase.push(otherSubtask);
            processed.add(otherIndex);
          }
        });
        
        phases.push(phase);
      }
    });

    return phases;
  }

  /**
   * Determine if two subtasks can be executed in parallel
   * Based on agent capabilities and dependencies
   */
  private canExecuteInParallel(task1: any, task2: any): boolean {
    // Don't parallelize if same agent is assigned
    if (task1.assigned_agent === task2.assigned_agent) {
      return false;
    }

    // Don't parallelize if one depends on the other
    if (task1.dependencies?.includes(task2.subtask) || 
        task2.dependencies?.includes(task1.subtask)) {
      return false;
    }

    // Can parallelize if different agents with no dependencies
    return true;
  }

  /**
   * Create fallback execution plan when LLM orchestration fails
   * Provides graceful degradation to manual mode
   */
  private createFallbackPlan(context: TaskContext): ExecutionPlan {
    logger.info('🔄 FALLBACK PLAN: Creating manual execution plan', {
      contextId: context.contextId
    });

    return {
      id: `fallback_plan_${context.contextId}`,
      phases: [
        {
          id: 'manual_guidance_phase',
          name: 'Manual Task Guidance',
          description: 'Provide manual guidance when automated orchestration is unavailable',
          agents: [],
          dependencies: [],
          operation: 'user_input',
          input: {
            uiRequests: [
              {
                requestId: `manual_${Date.now()}`,
                template: 'manual_guidance' as UITemplateType,
                context: context.currentState,
                data: {
                  taskType: context.taskTemplateId,
                  message: 'Automated orchestration is temporarily unavailable. Please complete this task manually.',
                  availableAgents: Array.from(this.agentRegistry.values()).map(agent => ({
                    id: agent.agentId,
                    role: agent.role,
                    capabilities: agent.capabilities,
                    availability: agent.availability
                  }))
                }
              }
            ]
          }
        }
      ],
      metadata: {
        isFallback: true,
        reason: 'LLM orchestration failed',
        fallbackStrategy: 'manual_guidance',
        createdAt: new Date().toISOString()
      }
    };
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
      
      // Check for capability overlap using capabilities or skills
      const candidateCapabilities = (candidate as EnhancedAgentCapability).capabilities || candidate.skills || [];
      const agentCapabilities = (agent as EnhancedAgentCapability).capabilities || agent.skills || [];
      const overlap = candidateCapabilities.filter(c => 
        agentCapabilities.includes(c)
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
   * @param userId - The user ID for proper tenant isolation
   */
  private async configureAgentsForExecution(plan: ExecutionPlan, taskId: string, userId?: string): Promise<void> {
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
        // Create agent via DI and configure for task with user context
        await this.createAgentForTask(agentId, taskId, userId);
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
   * Addresses PR feedback: "Sub-Agents should be requested for a Task and User-ID"
   * 
   * @param agentId - The agent type to create
   * @param taskId - The task to subscribe the agent to
   * @param userId - The user ID for proper tenant isolation
   * @returns The configured agent instance
   */
  public async createAgentForTask(agentId: string, taskId: string, userId?: string): Promise<any> {
    try {
      logger.info(`🤖 Creating agent via DI: ${agentId} for task: ${taskId}`, {
        userId: userId || 'system',
        agentId,
        taskId
      });
      
      // Use Dependency Injection Container directly
      const { DIContainer } = await import('../services/dependency-injection');
      
      // Check if agent is registered in DI
      if (DIContainer.isAgentRegistered(agentId)) {
        // Create agent with SSE subscriptions already configured
        // The DI factory will handle task-specific and user-specific configuration
        const agent = await DIContainer.resolveAgent(agentId, taskId);
        
        // Track active subscription
        if (!this.activeTaskSubscriptions.has(taskId)) {
          this.activeTaskSubscriptions.set(taskId, new Set());
        }
        this.activeTaskSubscriptions.get(taskId)!.add(agentId);
        
        logger.info(`✅ Agent created via DI and subscribed to task: ${agentId}`, {
          userId: userId || 'system',
          subscriptionTracked: true
        });
        return agent;
      } else {
        // Fallback to agentDiscovery for agents not yet in DI container
        logger.warn(`Agent not in DI container, using fallback: ${agentId}`);
        const agent = await agentDiscovery.instantiateAgent(agentId, 'system', userId);
        
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
    
    // Configure agents via DI for this task's message bus with user context
    await this.configureAgentsForExecution(executionPlan, taskContext.contextId, taskContext.tenantId);
    
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