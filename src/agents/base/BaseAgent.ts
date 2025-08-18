/**
 * 🏛️ **UNIVERSAL AGENT ARCHITECTURE - BaseAgent Foundation**
 * 
 * 🎯 **CRITICAL ARCHITECTURAL PRINCIPLES - MANDATORY FOR ALL AGENTS**
 * 
 * This base class enforces the core architectural pattern that ALL agents must follow:
 * 
 * ## 1. 🚫 **FORBIDDEN PATTERNS - NEVER VIOLATE THESE**
 * 
 * ❌ **NO hardcoded entity types** (LLC, Corporation, Partnership, etc.)
 * ❌ **NO geographic assumptions** (California, US-specific logic)
 * ❌ **NO task-specific business logic** (SOI filing, compliance-specific rules)
 * ❌ **NO jurisdiction-specific code** (state laws, local regulations)
 * 
 * ## 2. ✅ **MANDATORY PATTERNS - ALWAYS FOLLOW THESE**
 * 
 * ✅ **Agents focus on ROLES and expertise** - Each agent has ONE clear mission
 * ✅ **Task Templates provide context** - All specific logic comes from YAML configuration
 * ✅ **Generic and reusable** - Must work with ANY jurisdiction/entity type
 * ✅ **Toolchain integration** - Access external tools through ToolChain interface
 * ✅ **Complete traceability** - Record every decision with reasoning in TaskContext
 * 
 * ## 3. 🏗️ **ARCHITECTURAL PATTERN: "Built Generically, Grounded in Examples"**
 * 
 * **Agent Code (TypeScript):**
 * - Generic algorithms and business logic
 * - Universal data structures and interfaces  
 * - Tool access patterns and error handling
 * - Context recording and state management
 * 
 * **Task Templates (YAML):**
 * - Jurisdiction-specific rules and requirements
 * - Entity type definitions and mappings
 * - Tool configurations and data sources
 * - Workflow steps and UI templates
 * 
 * ## 4. 🔧 **TOOLCHAIN INTEGRATION PATTERN**
 * 
 * All agents access external tools through ToolChain:
 * ```typescript
 * // TODO: Access ToolChain for [agent-specific capability]
 * // const toolName = await this.toolChain.getTool('tool_name');
 * // const result = await toolName.performAction(parameters);
 * ```
 * 
 * ## 5. 📋 **TASK CONTEXT RECORDING**
 * 
 * Every agent action MUST be recorded:
 * ```typescript
 * await this.recordContextEntry(context, {
 *   operation: 'descriptive_operation_name',
 *   data: { relevant: 'data' },
 *   reasoning: 'Clear explanation of why this action was taken'
 * });
 * ```
 * 
 * ## 6. ⚠️ **ENFORCEMENT**
 * 
 * Violations will be rejected in code review:
 * - Search code for: `LLC|Corporation|California|SOI|Secretary of State`
 * - Agent code must work with ANY Task Template configuration
 * - All specifics come from Task Templates, not agent code
 * 
 * **Remember**: Agents provide CAPABILITIES, Task Templates define WORKFLOWS
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import * as path from 'path';
import { UnifiedLLMProvider } from '../../services/unified-llm-provider';
import type { ToolChain } from '../../services/tool-chain';
import { 
  BaseAgentTemplate,
  SpecializedAgentConfig,
  BaseAgentRequest,
  BaseAgentResponse,
  ContextEntry
} from '../../types/base-agent-types';
import { TaskContext } from '../../types/engine-types';
import { DatabaseService } from '../../services/database';
import { logger } from '../../utils/logger';
import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent
} from '../../types/a2a-types';

/**
 * BaseAgent Class - Unified Agent Foundation
 * 
 * Consolidates all base agent functionality into a single class that:
 * - Loads and merges YAML configurations (base + specialized)
 * - Enforces business context and access control
 * - Manages task context and state progression
 * - Provides standardized LLM interaction patterns
 * - Implements A2A AgentExecutor interface for event-driven execution
 */
export abstract class BaseAgent implements AgentExecutor {
  protected baseTemplate: BaseAgentTemplate;
  protected specializedTemplate: SpecializedAgentConfig;
  protected llmProvider!: UnifiedLLMProvider;
  protected toolChain!: ToolChain;
  protected businessId: string;
  protected userId?: string;
  protected taskContext?: any; // Will be injected via dependency injection
  
  constructor(
    specializedConfigPath: string,
    businessId: string,
    userId?: string
  ) {
    // Store business context for access control
    this.businessId = businessId;
    this.userId = userId;
    
    if (!businessId) {
      throw new Error('BaseAgent requires businessId for access control');
    }
    // Load base template (universal foundation)
    this.baseTemplate = this.loadBaseTemplate();
    
    // Load specialized configuration
    this.specializedTemplate = this.loadSpecializedConfig(specializedConfigPath);
    
    // Validate inheritance
    this.validateInheritance();
    
    // Initialize services (mock in test environment)
    if (process.env.NODE_ENV === 'test') {
      // Create mock instances for testing
      this.llmProvider = {
        complete: jest.fn().mockResolvedValue({
          status: 'completed',
          contextUpdate: {
            operation: 'test_operation',
            data: { result: 'success' },
            reasoning: 'Test reasoning',
            confidence: 0.9
          },
          confidence: 0.9
        })
      } as any;
      this.toolChain = {
        getAvailableTools: jest.fn().mockReturnValue('mock tools')
      } as any;
    } else {
      // Import the actual implementations
      const { UnifiedLLMProvider: UnifiedLLMProviderImpl } = require('../../services/unified-llm-provider');
      
      // Use getInstance for UnifiedLLMProvider (singleton pattern)
      this.llmProvider = UnifiedLLMProviderImpl.getInstance();
      
      // ToolChain requires Supabase - let CredentialVault handle validation
      // The validation happens at the actual point of connection
      const { ToolChain: ToolChainImpl } = require('../../services/tool-chain');
      
      try {
        this.toolChain = new ToolChainImpl();
      } catch (error: any) {
        // If CredentialVault fails, add context about where it failed
        console.error(`
========================================
🚨 AGENT INITIALIZATION FAILED 🚨
========================================
Failed to initialize ToolChain/CredentialVault during agent startup.
This typically means Supabase configuration is missing or invalid.

Error: ${error.message}

Check the error message above for specific configuration issues.
========================================
`);
        throw error;
      }
    }
  }
  
  /**
   * Load base agent template from YAML
   * Contains common principles and patterns shared by all agents
   */
  private loadBaseTemplate(): BaseAgentTemplate {
    try {
      // Try multiple path resolutions for Railway compatibility
      let baseContent: string;
      const possiblePaths = [
        path.join(process.cwd(), 'config/agents/base_agent.yaml'), // Production (Railway)
        path.join(__dirname, '../../../config/agents/base_agent.yaml'), // Development
        path.join('/app/config/agents/base_agent.yaml') // Docker/Railway absolute path
      ];
      
      let loadedPath: string | null = null;
      for (const basePath of possiblePaths) {
        try {
          baseContent = fs.readFileSync(basePath, 'utf8');
          loadedPath = basePath;
          break;
        } catch {
          // Try next path
        }
      }
      
      if (!loadedPath) {
        throw new Error('Could not find base_agent.yaml in any of the expected locations');
      }
      
      const baseYaml = yaml.parse(baseContent!);
      
      // Return the agent_template section (common patterns)
      return baseYaml.agent_template || baseYaml.base_agent;
    } catch (error) {
      throw new Error(`Failed to load base agent template: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Load specialized agent configuration with inheritance support
   */
  private loadSpecializedConfig(configPath: string): SpecializedAgentConfig {
    try {
      // Try multiple path resolutions for Railway compatibility
      let configContent: string;
      const possiblePaths = [
        path.join(process.cwd(), 'config/agents/', configPath), // Production (Railway)
        path.join(__dirname, '../../../config/agents/', configPath), // Development
        path.join('/app/config/agents/', configPath) // Docker/Railway absolute path
      ];
      
      let loadedPath: string | null = null;
      for (const fullPath of possiblePaths) {
        try {
          configContent = fs.readFileSync(fullPath, 'utf8');
          loadedPath = fullPath;
          break;
        } catch {
          // Try next path
        }
      }
      
      if (!loadedPath) {
        throw new Error(`Could not find config file ${configPath} in any of the expected locations`);
      }
      
      const config = yaml.parse(configContent!);
      
      // Check if agent extends base_agent (inheritance pattern)
      if (config.agent?.extends === 'base_agent') {
        // Agent explicitly inherits from base template
        logger.info(`✅ Successfully loaded specialized config for ${config.agent.id}`);
      }
      return config;
    } catch (error) {
      throw new Error(`Failed to load specialized config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate that specialized config properly inherits from base
   * Ensures naming conventions and required fields
   */
  private validateInheritance(): void {
    const agent = this.specializedTemplate.agent;
    
    if (!agent) {
      throw new Error('Specialized config missing agent section');
    }
    
    // Validate required fields follow naming conventions
    if (!agent.id) {
      throw new Error('Agent missing id field');
    }
    
    if (!agent.id.endsWith('_agent')) {
      console.warn(`Agent ID '${agent.id}' should end with '_agent' for consistency`);
    }
    
    if (!agent.role) {
      throw new Error('Agent missing role field');
    }
    
    if (!agent.role.endsWith('_specialist')) {
      console.warn(`Agent role '${agent.role}' should end with '_specialist' for consistency`);
    }
    
    // Validate required schemas exist
    if (!this.specializedTemplate.schemas) {
      throw new Error('Specialized config missing schemas section');
    }
    
    if (!this.specializedTemplate.schemas.output) {
      throw new Error(`Agent ${agent.id} missing required output schema`);
    }
    
    // Validate mission exists
    if (!agent.mission || agent.mission.trim() === '') {
      throw new Error(`Agent ${agent.id} missing required mission statement`);
    }
  }
  
  
  /**
   * Build prompt from merged base + specialized templates
   * 
   * Combines base principles, specialized capabilities, and business context
   * to create a comprehensive prompt for the LLM
   */
  private buildInheritedPrompt(request: BaseAgentRequest): string {
    const base = this.baseTemplate;
    const specialized = this.specializedTemplate.agent;
    
    // Extract business profile from TaskContext if available
    const businessProfile = request.taskContext?.businessProfile || {};
    const taskHistory = request.taskContext?.history || [];
    
    return `
# Base Agent Principles (ALWAYS APPLY)

## Core Principles
${base.universal_principles.core_mandate}

## Decision Priority Framework
${base.universal_principles.decision_priority}

## Ethical Boundaries
${base.universal_principles.ethical_boundaries}

# Business Context

## Business Information
- Business ID: ${this.businessId}
- User ID: ${this.userId || 'System'}
${businessProfile.name ? `- Business Name: ${businessProfile.name}` : ''}
${businessProfile.entityType ? `- Entity Type: ${businessProfile.entityType}` : ''}
${businessProfile.industry ? `- Industry: ${businessProfile.industry}` : ''}
${businessProfile.state ? `- State: ${businessProfile.state}` : ''}

## Business Profile
${JSON.stringify(businessProfile, null, 2)}

# Your Specialization

## Agent Identity
- ID: ${specialized.id}
- Role: ${specialized.role}
- Version: ${specialized.version}

## Agent Mission
${specialized.mission}

## Agent Skills
${specialized.agent_card.skills.map(skill => `- ${skill}`).join('\n')}

${specialized.agent_card.specializations ? `## Specializations\n${specialized.agent_card.specializations.map(spec => `- ${spec}`).join('\n')}` : ''}

## Available Tools
${this.formatTools()}

# Current Request

## Task Context
${JSON.stringify(request.taskContext, null, 2)}

## Task History (Last 5 Entries)
${taskHistory.slice(-5).map((entry: any) => `- ${entry.operation}: ${entry.reasoning}`).join('\n')}

## Operation Requested
${request.operation}

## Parameters
${JSON.stringify(request.parameters, null, 2)}

${request.constraints ? `## Constraints\n${JSON.stringify(request.constraints, null, 2)}` : ''}

${request.urgency ? `## Urgency Level\n${request.urgency}` : ''}

# Access Control
IMPORTANT: You are working on behalf of Business ID: ${this.businessId}
- Only access data related to this business
- Do not access or modify data for other businesses
- All operations must be scoped to this business context

TODO: Integrate long-term memory for this business when available

# Standard Reasoning Framework (MANDATORY)

Follow these exact steps:

1. **Analyze**: ${base.reasoning_framework.analyze.instruction}
   Expected output: ${base.reasoning_framework.analyze.output}

2. **Assess**: ${base.reasoning_framework.assess.instruction}
   Expected output: ${base.reasoning_framework.assess.output}

3. **Plan**: ${base.reasoning_framework.plan.instruction}
   Expected output: ${base.reasoning_framework.plan.output}

4. **Execute**: ${base.reasoning_framework.execute.instruction}
   Expected output: ${base.reasoning_framework.execute.output}

5. **Record**: ${base.reasoning_framework.record.instruction}
   Expected output: ${base.reasoning_framework.record.output}

# Context Writing Pattern (MANDATORY)
${base.context_patterns.write_pattern}

# Context Entry Schema (Required Format)
Your contextUpdate MUST follow this exact format:
${base.context_patterns.context_entry_schema}

# Response Requirements
- Use JSON format matching the specialized output schema
- Include confidence scoring (0.0-1.0) for all decisions
- Provide detailed reasoning explaining your decision process
- Follow universal error handling patterns if errors occur
- Batch any UI requests for efficiency (progressive disclosure)

# UI Request Guidelines
${base.communication.with_user.ui_creation_guidelines}

# Examples from Specialized Configuration
${this.formatExamples()}

Remember: You are an autonomous agent following the universal principles while applying your specialized expertise.
`;
  }
  
  /**
   * Format tools section for prompt
   */
  private formatTools(): string {
    const tools = this.specializedTemplate.tools;
    if (!tools || (Array.isArray(tools) && tools.length === 0)) {
      return 'No specialized tools configured';
    }
    
    if (Array.isArray(tools)) {
      return tools.map(tool => `- ${tool}`).join('\n');
    }
    
    return Object.entries(tools)
      .map(([category, toolList]) => {
        if (Array.isArray(toolList)) {
          return `## ${category}\n${toolList.map(tool => `- ${tool}`).join('\n')}`;
        }
        return `## ${category}\n- ${toolList}`;
      })
      .join('\n\n');
  }
  
  /**
   * Format examples from specialized configuration
   */
  private formatExamples(): string {
    const examples = this.specializedTemplate.examples;
    if (!examples) return 'No examples configured';
    
    return Object.entries(examples)
      .map(([exampleName, example]) => `## ${exampleName}\n${JSON.stringify(example, null, 2)}`)
      .join('\n\n');
  }
  
  /**
   * Enforce Standard Context Entry Schema
   * 
   * Validates that all contextUpdate objects follow the required schema
   * defined in base_agent.yaml. This ensures consistency across all agents.
   */
  private enforceStandardSchema(llmResponse: any, request: BaseAgentRequest): BaseAgentResponse {
    // Validate response structure
    if (!llmResponse.status) {
      throw new Error('LLM response missing required status field');
    }
    
    if (!llmResponse.contextUpdate) {
      throw new Error('LLM response missing required contextUpdate');
    }
    
    // Create context entry following the standard schema
    const contextEntry: ContextEntry = {
      entryId: this.generateEntryId(),
      sequenceNumber: (request.taskContext?.history?.length || 0) + 1,
      timestamp: new Date().toISOString(),
      actor: {
        type: 'agent',
        id: this.specializedTemplate.agent.id,
        version: this.specializedTemplate.agent.version
      },
      operation: request.operation,
      data: llmResponse.contextUpdate.data || {},
      reasoning: llmResponse.contextUpdate.reasoning || 'No reasoning provided',
      confidence: this.validateConfidence(llmResponse.contextUpdate.confidence),
      trigger: {
        type: 'orchestrator_request',
        source: 'orchestrator',
        details: { requestId: request.parameters?.requestId },
        requestId: request.parameters?.requestId
      }
    };
    
    // Return response with enforced schema
    return {
      status: this.validateStatus(llmResponse.status),
      contextUpdate: contextEntry,
      confidence: this.validateConfidence(llmResponse.confidence || contextEntry.confidence),
      fallback_strategy: llmResponse.fallback_strategy,
      uiRequests: llmResponse.uiRequests || [],
      error: llmResponse.error,
      partial_result: llmResponse.partial_result
    };
  }
  
  /**
   * Validate status field
   */
  private validateStatus(status: any): 'completed' | 'needs_input' | 'delegated' | 'error' {
    const validStatuses = ['completed', 'needs_input', 'delegated', 'error'];
    if (validStatuses.includes(status)) {
      return status;
    }
    console.warn(`Invalid status '${status}', defaulting to 'completed'`);
    return 'completed';
  }
  
  /**
   * Validate confidence score (0.0-1.0)
   */
  private validateConfidence(confidence: any): number {
    const conf = typeof confidence === 'number' ? confidence : 0.5;
    return Math.max(0, Math.min(1, conf));
  }
  
  /**
   * Generate unique entry ID following standard format
   */
  private generateEntryId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `entry_${timestamp}_${random}`;
  }
  
  /**
   * Set the task context for this agent instance
   * Used for dependency injection of task-specific data
   */
  setTaskContext(taskContext: any): void {
    this.taskContext = taskContext;
    
    // Validate business context matches
    if (taskContext.businessId && taskContext.businessId !== this.businessId) {
      throw new Error(`Task context businessId (${taskContext.businessId}) does not match agent businessId (${this.businessId})`);
    }
  }
  
  /**
   * Validate that an operation is allowed for the current business context
   * Ensures agents can only access data for their assigned business
   */
  protected validateBusinessAccess(targetBusinessId: string): void {
    if (targetBusinessId !== this.businessId) {
      throw new Error(`Access denied: Agent can only operate on businessId ${this.businessId}, not ${targetBusinessId}`);
    }
  }
  
  /**
   * Get the current business context
   * Used by specialized agents to scope their operations
   */
  protected getBusinessContext(): { businessId: string; userId?: string } {
    return {
      businessId: this.businessId,
      userId: this.userId
    };
  }
  
  /**
   * Get agent capabilities from specialized config
   * Enhanced with A2A protocol discovery information
   */
  getCapabilities(): any {
    const agent = this.specializedTemplate.agent;
    const a2a = agent.a2a || {};
    
    return {
      // Basic agent information
      id: agent.id,
      name: agent.name,
      role: agent.role,
      version: agent.version,
      extends: agent.extends || 'base_agent',
      
      // Skills and specializations
      skills: agent.agent_card?.skills || [],
      specializations: agent.agent_card?.specializations || [],
      
      // A2A Protocol capabilities
      a2a: {
        protocolVersion: a2a.protocolVersion || '1.0.0',
        communicationMode: a2a.communicationMode || 'async',
        messageFormats: a2a.messageFormats || ['json'],
        routing: {
          canReceiveFrom: a2a.routing?.canReceiveFrom || [],
          canSendTo: a2a.routing?.canSendTo || []
        },
        messageHandling: a2a.messageHandling || {
          bufferSize: 50,
          timeoutMs: 30000,
          retryEnabled: true
        }
      },
      
      // Operations this agent can perform
      operations: Object.keys(this.specializedTemplate.operations || {}),
      
      // Current availability status
      availability: this.getAvailabilityStatus()
    };
  }
  
  /**
   * Get A2A protocol routing information
   * Allows other agents to discover communication capabilities
   * 
   * ## How A2A Routing Works:
   * 
   * The A2A (Agent-to-Agent) protocol defines which agents can communicate
   * with each other through explicit routing rules in their YAML configs.
   * 
   * ### Routing Configuration:
   * Each agent's YAML file contains an `a2a.routing` section that defines:
   * - `canReceiveFrom`: List of agent IDs that can send messages to this agent
   * - `canSendTo`: List of agent IDs this agent can send messages to
   * 
   * ### Example YAML Configuration:
   * ```yaml
   * agent:
   *   id: business_discovery
   *   a2a:
   *     routing:
   *       canReceiveFrom: 
   *         - orchestrator
   *         - profile_collector
   *       canSendTo:
   *         - data_enrichment_agent
   *         - entity_compliance_agent
   * ```
   * 
   * ### Communication Flow Example:
   * 1. OrchestratorAgent wants to send task to BusinessDiscoveryAgent
   * 2. Orchestrator calls: `canCommunicateWith('business_discovery')` → true
   * 3. BusinessDiscovery calls: `canReceiveFrom('orchestrator')` → true
   * 4. Message is allowed and processed
   * 
   * ### Routing Table Visualization:
   * ```
   * orchestrator ──────► business_discovery ──────► data_enrichment
   *      │                      │                         │
   *      ▼                      ▼                         ▼
   * profile_collector    entity_compliance       task_coordinator
   * ```
   * 
   * @returns Object with arrays of agent IDs for inbound and outbound routing
   */
  getA2ARouting(): { canReceiveFrom: string[], canSendTo: string[] } {
    const a2a = this.specializedTemplate.agent.a2a || {};
    
    // Start with static routing from YAML config
    let canReceiveFrom = a2a.routing?.canReceiveFrom || [];
    let canSendTo = a2a.routing?.canSendTo || [];
    
    // ARCHITECTURAL DECISION: Dynamic routing for orchestrator
    // Only the OrchestratorAgent should be able to send to ALL agents
    // This prevents chaotic inter-agent communication while allowing
    // the orchestrator to coordinate all agents dynamically
    if (this.specializedTemplate.agent.id === 'orchestrator') {
      // Orchestrator can send to any agent discovered in the system
      // This will be populated dynamically by AgentManager
      canSendTo = ['*']; // Special value meaning "all agents"
    }
    
    // All agents can receive from orchestrator by default
    // This ensures new agents are automatically reachable
    if (!canReceiveFrom.includes('orchestrator')) {
      canReceiveFrom.push('orchestrator');
    }
    
    return {
      canReceiveFrom,
      canSendTo
    };
  }
  
  
  /**
   * Check if this agent can receive from another agent
   */
  canReceiveFrom(sourceAgentId: string): boolean {
    const routing = this.getA2ARouting();
    return routing.canReceiveFrom.includes(sourceAgentId);
  }
  
  /**
   * Get agent's availability status
   * Can be overridden by subclasses for dynamic status
   */
  protected getAvailabilityStatus(): 'available' | 'busy' | 'offline' {
    // Default implementation - always available
    // Subclasses can override for more sophisticated status
    return 'available';
  }
  
  
  /**
   * Get merged configuration for debugging
   */
  getFullConfiguration(): { base: BaseAgentTemplate; specialized: SpecializedAgentConfig } {
    return {
      base: this.baseTemplate,
      specialized: this.specializedTemplate
    };
  }
  
  /**
   * Validate agent configuration integrity
   */
  validateConfiguration(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check base template loaded
    if (!this.baseTemplate) {
      errors.push('Base template not loaded');
    }
    
    // Check specialized config
    if (!this.specializedTemplate?.agent) {
      errors.push('Specialized agent configuration missing');
    }
    
    // Check required fields
    const agent = this.specializedTemplate?.agent;
    if (agent) {
      if (!agent.id) errors.push('Agent ID missing');
      if (!agent.role) errors.push('Agent role missing');
      if (!agent.mission) errors.push('Agent mission missing');
      
      // Check naming conventions
      if (agent.id && !agent.id.endsWith('_agent')) {
        warnings.push('Agent ID should end with "_agent"');
      }
      
      if (agent.role && !agent.role.endsWith('_specialist')) {
        warnings.push('Agent role should end with "_specialist"');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * A2A AgentExecutor Implementation
   * Executes agent logic based on request context and publishes events
   */
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const startTime = Date.now();
    const { userMessage, task, taskId, contextId } = requestContext;
    
    try {
      logger.info('Agent execution started', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        contextId
      });
      
      // Execute agent reasoning directly with A2A context
      // TODO: Consider refactoring executeInternal to accept RequestContext directly
      const agentRequest: BaseAgentRequest = {
        operation: 'a2a_execute',
        parameters: {
          userMessage,
          task,
          a2aContext: requestContext // Pass A2A context directly
        },
        taskContext: {
          contextId,
          taskId,
          task,
          businessProfile: { businessId: this.businessId }
        }
      };
      
      // Execute core agent reasoning (🧠 THE INTELLIGENCE HAPPENS HERE)
      const response = await this.executeInternal(agentRequest);
      
      // Publish response as events
      await this.publishResponseEvents(response, taskId, eventBus);
      
      // Mark task as completed if successful
      if (response.status === 'completed') {
        const statusUpdate: TaskStatusUpdateEvent = {
          taskId,
          status: 'completed',
          final: true
        };
        await eventBus.publish(statusUpdate);
      }
      
      logger.info('Agent execution completed', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      logger.error('Agent execution failed', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Publish error event
      const errorUpdate: TaskStatusUpdateEvent = {
        taskId,
        status: 'failed',
        final: true
      };
      await eventBus.publish(errorUpdate);
      
      throw error;
    }
  }
  
  /**
   * Cancel a running task
   * Required by AgentExecutor interface
   */
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    logger.info('Cancelling task', {
      agentId: this.specializedTemplate.agent.id,
      taskId
    });
    
    // Publish cancellation event
    const cancelUpdate: TaskStatusUpdateEvent = {
      taskId,
      status: 'canceled',
      final: true
    };
    
    await eventBus.publish(cancelUpdate);
    
    // Clean up any agent-specific resources
    this.cleanupTask(taskId);
  }
  
  /**
   * 🧠 AGENT REASONING CORE - WHERE THE INTELLIGENCE HAPPENS
   * 
   * This is the CRITICAL METHOD where actual agent reasoning occurs.
   * Everything before this point is protocol adaptation and setup.
   * Everything after this point is event emission and response formatting.
   * 
   * ## WHAT HAPPENS HERE:
   * 1. **LLM Interaction** - The agent's "brain" processes the request
   * 2. **Domain Expertise** - Specialized agent knowledge is applied
   * 3. **Decision Making** - The agent chooses what actions to take
   * 4. **Response Generation** - Structured output with reasoning
   * 5. **Context Recording** - Decision process is documented
   * 
   * ## ARCHITECTURAL SIGNIFICANCE:
   * - This method contains the ACTUAL ARTIFICIAL INTELLIGENCE
   * - Subclasses can override this to implement specialized reasoning
   * - The LLM call here is where costs are incurred and intelligence is generated
   * - All agent behavior stems from what happens in this method
   * 
   * ## FOR DEBUGGING/MONITORING:
   * - Monitor this method to understand agent decision-making
   * - Log entries here show the agent's thought process
   * - Performance metrics here indicate reasoning complexity
   * 
   * Internal execution method (core reasoning engine)
   * This is the heart of agent intelligence - subclasses override for specialized behavior
   */
  async executeInternal(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    // Build merged prompt from base + specialized templates
    const fullPrompt = this.buildInheritedPrompt(request);
    
    // Call LLM with merged prompt
    const llmResponse = await this.llmProvider.complete({
      prompt: fullPrompt,
      model: request.llmModel || process.env.LLM_DEFAULT_MODEL || 'claude-3-sonnet-20240229',
      temperature: 0.3,
      systemPrompt: this.specializedTemplate.agent?.mission || 'You are a helpful AI assistant that follows instructions precisely.'
    });
    
    // Validate and enforce standard schema
    const validatedResponse = this.enforceStandardSchema(llmResponse, request);
    
    return validatedResponse;
  }
  
  /**
   * Publish agent response as A2A events
   */
  private async publishResponseEvents(
    response: BaseAgentResponse,
    taskId: string,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    // Publish context update as task update
    if (response.contextUpdate) {
      const taskUpdate: Task = {
        id: taskId,
        status: response.status === 'completed' ? 'completed' : 'running',
        result: {
          operation: response.contextUpdate.operation,
          data: response.contextUpdate.data,
          reasoning: response.contextUpdate.reasoning,
          confidence: response.confidence
        }
      };
      
      await eventBus.publish(taskUpdate);
    }
    
    // Publish UI requests as task artifacts if present
    if (response.uiRequests && response.uiRequests.length > 0) {
      const artifactUpdate: TaskArtifactUpdateEvent = {
        taskId,
        artifacts: response.uiRequests
      };
      await eventBus.publish(artifactUpdate);
    }
  }
  
  /**
   * Clean up task-specific resources
   * Can be overridden by subclasses for specific cleanup
   */
  protected cleanupTask(taskId: string): void {
    // Default implementation - subclasses can override
    logger.debug('Cleaning up task resources', { taskId });
  }

  /**
   * Record entry in task context using SSE broadcasting
   * CRITICAL: No in-memory state - database is single source of truth
   * 
   * This broadcasts events on the SSE message bus for loose coupling.
   * All agents subscribe to the task-centered message bus and react to events.
   * 
   * @param context - The task context to update
   * @param entry - Partial context entry (will be completed with defaults)
   * @protected - Available to all child agents
   */
  protected async recordContextEntry(
    context: TaskContext,
    entry: Partial<ContextEntry>
  ): Promise<void> {
    const fullEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: 0, // Will be determined by database sequence
      actor: {
        type: 'agent',
        id: this.specializedTemplate.agent.id,
        version: this.specializedTemplate.agent.version
      },
      operation: entry.operation || 'agent_operation',
      data: entry.data || {},
      reasoning: entry.reasoning || `Operation by ${this.specializedTemplate.agent.name}`,
      confidence: entry.confidence || 0.8,
      trigger: entry.trigger || {
        type: 'orchestrator_request',
        source: 'orchestrator',
        details: { requestId: `req_${Date.now()}` },
        requestId: `req_${Date.now()}`
      },
      ...entry
    };
    
    // NO IN-MEMORY STORAGE - Database is the single source of truth
    // Events are broadcast via SSE for loose coupling
    
    // CRITICAL: Persist to database for durability
    // Using the unified task_context_events table (event sourcing architecture)
    try {
      const dbService = DatabaseService.getInstance();
      
      // In the TaskContext, the contextId IS the taskId
      // This is part of the universal engine architecture
      const taskId = context.contextId;
      
      // Use the agent's userId if available, otherwise fall back to system
      const userId = this.userId || context.tenantId || 'system';
      
      await dbService.createTaskContextEvent(userId, taskId, {
        contextId: context.contextId,
        actorType: fullEntry.actor.type,
        actorId: fullEntry.actor.id,
        operation: fullEntry.operation,
        data: fullEntry.data,
        reasoning: fullEntry.reasoning || '',
        trigger: { 
          source: this.specializedTemplate.agent.id, 
          timestamp: fullEntry.timestamp 
        }
      });
      
      // Broadcast event on SSE message bus for loose coupling
      // All agents listening to this task will receive the update
      await this.broadcastTaskEvent(taskId, {
        type: 'TASK_CONTEXT_UPDATE',
        taskId,
        agentId: this.specializedTemplate.agent.id,
        operation: fullEntry.operation,
        data: fullEntry.data,
        timestamp: fullEntry.timestamp
      });
      
      logger.debug('Context entry persisted and broadcast via SSE', {
        agentId: this.specializedTemplate.agent.id,
        contextId: context.contextId,
        operation: fullEntry.operation
      });
    } catch (error) {
      logger.error('Failed to persist/broadcast context entry', {
        agentId: this.specializedTemplate.agent.id,
        contextId: context.contextId,
        operation: fullEntry.operation,
        error: error instanceof Error ? error.message : String(error)
      });
      // Throw error - without persistence/broadcast, the system cannot function
      // But this should be monitored and handled via retry mechanism
    }
  }

  /**
   * =============================================================================
   * SSE MESSAGE BUS - LOOSE COUPLING & EVENT-DRIVEN COMMUNICATION
   * =============================================================================
   * 
   * These methods implement SSE-based messaging for loose coupling between agents.
   * Agents subscribe to task-centered message buses and react to events.
   * Database is the single source of truth, SSE provides real-time updates.
   */

  /**
   * Broadcast a task event via SSE for loose coupling
   * All agents subscribed to this task will receive the update
   * 
   * @param taskId - The task to broadcast to
   * @param event - The event to broadcast
   * @protected
   */
  protected async broadcastTaskEvent(taskId: string, event: any): Promise<void> {
    try {
      const dbService = DatabaseService.getInstance();
      // Use PostgreSQL NOTIFY to broadcast to all SSE subscribers
      await dbService.notifyTaskContextUpdate(taskId, event.type || 'AGENT_UPDATE', event);
      
      logger.debug('Task event broadcast via SSE', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        eventType: event.type
      });
    } catch (error) {
      logger.error('Failed to broadcast task event', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Subscribe to task events via SSE
   * Agents use this to listen for updates and determine if they can proceed
   * 
   * TODO: Implement SSE reconnection scenarios
   *   - Handle connection drops and automatic reconnection
   *   - Implement exponential backoff for reconnection attempts
   *   - Queue missed events during disconnection
   *   - Add connection health monitoring
   * 
   * TODO: Add database failure recovery
   *   - Implement circuit breaker pattern for database operations
   *   - Add retry logic with configurable attempts
   *   - Fallback to cached data when database is unavailable
   *   - Log and alert on persistent failures
   * 
   * @param taskId - The task to subscribe to
   * @param handler - The event handler
   * @protected
   */
  protected async subscribeToTaskEvents(
    taskId: string,
    handler: (event: any) => Promise<void>
  ): Promise<() => void> {
    const dbService = DatabaseService.getInstance();
    
    // Subscribe to PostgreSQL LISTEN/NOTIFY for this task
    const unsubscribe = await dbService.listenForTaskUpdates(taskId, async (payload) => {
      try {
        // Analyze if this event affects this agent's work
        if (this.shouldHandleEvent(payload)) {
          await handler(payload);
        }
      } catch (error) {
        logger.error('Error handling task event', {
          agentId: this.specializedTemplate.agent.id,
          taskId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    logger.info('Agent subscribed to task events', {
      agentId: this.specializedTemplate.agent.id,
      taskId
    });
    
    return unsubscribe;
  }

  /**
   * Determine if this agent should handle an event
   * Agents analyze each update to determine if they can proceed
   * 
   * @param event - The event to analyze
   * @returns true if this agent should handle the event
   * @protected
   */
  protected shouldHandleEvent(event: any): boolean {
    // Base implementation - agents can override for specific logic
    // Check if event is relevant to this agent's current work
    return event.data?.targetAgentId === this.specializedTemplate.agent.id ||
           event.type === 'ORCHESTRATOR_COMMAND' ||
           event.type === 'TASK_BLOCKED' ||
           event.type === 'DEPENDENCY_RESOLVED';
  }

  /**
   * Announce that this agent is blocked and needs something
   * Other agents listen for these announcements to provide help
   * 
   * @param taskId - The task context
   * @param blockage - Description of what's blocking
   * @protected
   */
  protected async announceBlockage(taskId: string, blockage: {
    reason: string;
    needs: string[];
    data?: any;
  }): Promise<void> {
    await this.broadcastTaskEvent(taskId, {
      type: 'AGENT_BLOCKED',
      agentId: this.specializedTemplate.agent.id,
      blockage,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Agent announced blockage', {
      agentId: this.specializedTemplate.agent.id,
      taskId,
      reason: blockage.reason
    });
  }

  /**
   * Announce that this agent has completed its work
   * 
   * @param taskId - The task context
   * @param result - The work product
   * @protected
   */
  protected async announceCompletion(taskId: string, result: any): Promise<void> {
    await this.broadcastTaskEvent(taskId, {
      type: 'AGENT_COMPLETED',
      agentId: this.specializedTemplate.agent.id,
      result,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Agent announced completion', {
      agentId: this.specializedTemplate.agent.id,
      taskId
    });
  }

  /**
   * =============================================================================
   * PURE A2A MESSAGING - DIRECT AGENT COMMUNICATION
   * =============================================================================
   * 
   * These methods allow agents to communicate directly using the A2A protocol
   * without needing a central AgentManager. Each agent can discover and 
   * communicate with other agents autonomously.
   */

  /**
   * Send a message to another agent using A2A protocol
   */
  protected async sendA2AMessage(toAgentId: string, message: any): Promise<any> {
    try {
      // Get orchestrator instance for A2A messaging
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      // Use orchestrator's A2A messaging system
      return await orchestrator.routeA2AMessage(
        this.specializedTemplate.agent.id,
        toAgentId,
        message
      );
    } catch (error) {
      logger.error(`Failed to send A2A message to ${toAgentId}`, {
        fromAgent: this.specializedTemplate.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Handle incoming A2A messages (override in subclasses for specific behavior)
   */
  public async handleMessage(fromAgentId: string, message: any): Promise<any> {
    logger.info(`Agent ${this.specializedTemplate.agent.id} received A2A message from ${fromAgentId}`, {
      messageType: message.type || 'unknown',
      hasData: !!message.data
    });
    
    // Default implementation - just acknowledge
    return {
      status: 'acknowledged',
      agentId: this.specializedTemplate.agent.id,
      receivedFrom: fromAgentId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Discover peer agents using A2A protocol
   */
  protected async discoverPeerAgents(): Promise<any[]> {
    try {
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      return await orchestrator.getDiscoveredCapabilities();
    } catch (error) {
      logger.error('Failed to discover peer agents', {
        agentId: this.specializedTemplate.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Find agents by skill using A2A discovery
   */
  protected async findAgentsBySkill(skill: string): Promise<any[]> {
    try {
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      return await orchestrator.findAgentsBySkill(skill);
    } catch (error) {
      logger.error(`Failed to find agents by skill: ${skill}`, {
        agentId: this.specializedTemplate.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Check if this agent can communicate with another agent
   */
  protected async canCommunicateWith(toAgentId: string): Promise<boolean> {
    try {
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      return await orchestrator.canAgentsCommunicate(
        this.specializedTemplate.agent.id,
        toAgentId
      );
    } catch (error) {
      logger.error(`Failed to check communication permissions with ${toAgentId}`, {
        agentId: this.specializedTemplate.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get routing information for this agent
   */
  protected async getMyRouting(): Promise<{ canReceiveFrom: string[], canSendTo: string[] } | undefined> {
    try {
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      return await orchestrator.getAgentRouting(this.specializedTemplate.agent.id);
    } catch (error) {
      logger.error('Failed to get routing information', {
        agentId: this.specializedTemplate.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  /**
   * Request another agent to be created for a task via DI
   * The agent will be subscribed to the task's message bus
   */
  protected async requestAgentSpawn(agentId: string, taskId?: string): Promise<any> {
    try {
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      // Use task ID if provided, otherwise use a system channel
      const channel = taskId || 'system';
      
      // Create agent via DI and subscribe to task message bus
      return await orchestrator.createAgentForTask(agentId, channel);
    } catch (error) {
      logger.error(`Failed to request agent for task: ${agentId}`, {
        requestingAgent: this.specializedTemplate.agent.id,
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

}