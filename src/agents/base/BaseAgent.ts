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
import { LLMProvider } from '../../services/llm-provider';
import type { ToolChain } from '../../toolchain/ToolChain';
import { 
  BaseAgentTemplate,
  SpecializedAgentConfig,
  BaseAgentRequest,
  BaseAgentResponse,
  ContextEntry
} from '../../types/base-agent-types';
import { TaskContext, OrchestratorRequest, OrchestratorResponse } from '../../types/task-engine.types';
import { DatabaseService } from '../../services/database';
import { logger, createTaskLogger } from '../../utils/logger';
import { taskPerformanceTracker } from '../../services/task-performance-tracker';
import { a2aEventBus } from '../../services/a2a-event-bus';
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
  protected agentConfig: BaseAgentTemplate;
  protected specializedTemplate: SpecializedAgentConfig;
  protected llmProvider!: LLMProvider;
  protected toolChain!: ToolChain;
  protected businessId: string;
  protected userId?: string;
  protected taskContext?: any; // Will be injected via dependency injection
  
  // SSE subscription management for real-time context updates
  private sseUnsubscribe?: () => void;
  private dynamicContextData: Record<string, any> = {};
  
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
    this.agentConfig = this.loadBaseTemplate();
    
    // Load specialized configuration
    this.specializedTemplate = this.loadSpecializedConfig(specializedConfigPath);
    
    // Validate inheritance
    this.validateInheritance();
    
    // Initialize services
    // Import the actual implementations
    const { LLMProvider: LLMProviderImpl } = require('../../services/llm-provider');
    
    // Use getInstance for LLMProvider (singleton pattern)
    this.llmProvider = LLMProviderImpl.getInstance();
    
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
      
      // Debug logging to check if user_input_protocol is loaded
      if (baseYaml.agent_template?.context_patterns?.user_input_protocol) {
        logger.debug('✅ user_input_protocol loaded from YAML', {
          length: baseYaml.agent_template.context_patterns.user_input_protocol.length
        });
      } else {
        logger.warn('⚠️ user_input_protocol NOT found in YAML', {
          hasAgentTemplate: !!baseYaml.agent_template,
          hasContextPatterns: !!baseYaml.agent_template?.context_patterns,
          contextPatternKeys: Object.keys(baseYaml.agent_template?.context_patterns || {})
        });
      }
      
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
    const base = this.agentConfig;
    const specialized = this.specializedTemplate.agent;
    
    // Debug: Check if user_input_protocol is available
    if (base.context_patterns?.user_input_protocol) {
      logger.debug('✅ user_input_protocol available in buildPrompt', {
        length: base.context_patterns.user_input_protocol.length,
        preview: base.context_patterns.user_input_protocol.substring(0, 50)
      });
    } else {
      logger.warn('⚠️ user_input_protocol NOT available in buildPrompt', {
        hasContextPatterns: !!base.context_patterns,
        keys: base.context_patterns ? Object.keys(base.context_patterns) : []
      });
    }
    
    // Extract context data from TaskContext if available
    const contextData = request.taskContext?.currentState?.data || {};
    const taskHistory = request.taskContext?.history || [];
    
    // Extract ALL tool results and data from task history
    const toolResults = taskHistory
      .filter((entry: any) => entry.operation === 'system.tool_executed' && entry.data?.success)
      .map((entry: any) => ({
        tool: entry.data.tool,
        params: entry.data.params,
        // Include full result if available, not just preview
        result: entry.data.result || entry.data.resultPreview,
        resultPreview: entry.data.resultPreview,
        // Extract any additional metadata
        metadata: entry.metadata,
        timestamp: entry.timestamp
      }));
    
    // Also extract any accumulated data from context updates
    const accumulatedData = taskHistory
      .filter((entry: any) => entry.data && entry.operation !== 'system.tool_executed')
      .reduce((acc: any, entry: any) => {
        return { ...acc, ...entry.data };
      }, {});
    
    return `
# Base Agent Principles (ALWAYS APPLY)

## Core Principles
${base.universal_principles.core_mandate}

## Decision Priority Framework
${base.universal_principles.decision_priority}

## Ethical Boundaries
${base.universal_principles.ethical_boundaries}

# Task Context

## Context Information
- Business ID: ${this.businessId}
- User ID: ${this.userId || 'System'}
${contextData.name ? `- Name: ${contextData.name}` : ''}
${contextData.type ? `- Type: ${contextData.type}` : ''}
${contextData.taskType ? `- Task Type: ${contextData.taskType}` : ''}
${contextData.state ? `- State: ${contextData.state}` : ''}

## Context Data
${JSON.stringify(contextData, null, 2)}

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

## Previously Retrieved Data
${toolResults.length > 0 ? `The following information has already been retrieved by tools:
${toolResults.map((result: any) => `
### Tool: ${result.tool}
Parameters: ${JSON.stringify(result.params)}
Full Result:
${typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
${result.timestamp ? `Timestamp: ${result.timestamp}` : ''}
`).join('\n---\n')}

CRITICAL: Extract and utilize ALL information from the above results. Do not request data that already exists.
` : 'No tool results available yet.'}

## Accumulated Context Data
${Object.keys(accumulatedData).length > 0 ? JSON.stringify(accumulatedData, null, 2) : 'No accumulated data yet.'}

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

# Response Schema (MANDATORY FORMAT)
Your response MUST be valid JSON matching this EXACT schema:
{
  "status": "completed|needs_input|delegated|error",
  "contextUpdate": {
    "operation": "descriptive_operation_name",
    "data": { 
      "relevant": "structured data",
      "results": "action outcomes",
      "uiRequest": {  // ← CRITICAL: uiRequest goes HERE when status="needs_input"
        "templateType": "form|approval|choice|file_upload",
        "title": "Clear, user-friendly title",
        "instructions": "What the user needs to do",
        "fields": [
          {
            "name": "field_name",
            "type": "text|email|select|number",
            "label": "User-friendly label",
            "required": true,
            "placeholder": "Helpful hint"
          }
        ]
      }
    },
    "reasoning": "Clear explanation of decision process",
    "confidence": 0.85
  }
}

STATUS VALUES (CRITICAL - USE CORRECTLY):
- "completed": Task/subtask finished successfully, all work done, no user input needed
  Example: Successfully analyzed data, generated report, saved results
  
- "needs_input": MUST have user input to continue, cannot proceed without it
  Example: Missing required business information, need user approval, require clarification
  IMPORTANT: Always include a uiRequest when returning this status
  
- "delegated": Passed work to another specialized agent
  Example: Forwarding compliance check to compliance_agent
  
- "error": Unrecoverable failure, cannot continue even with user input  
  Example: API unavailable, invalid configuration, critical system error
  IMPORTANT: This is terminal - use "needs_input" if user can help resolve it

# Additional Response Requirements
- Use ONLY the JSON format shown above - no additional text
- Include confidence scoring (0.0-1.0) for all decisions
- Provide detailed reasoning explaining your decision process
- Follow universal error handling patterns if errors occur
- Batch any UI requests for efficiency (progressive disclosure)

# UI Request Guidelines
${base.communication.with_user.ui_creation_guidelines}

# 🎯 PERFECT LLM PROMPT: USER INPUT REQUIREMENTS (MANDATORY)
${base.context_patterns?.user_input_protocol || '⚠️ USER_INPUT_PROTOCOL NOT LOADED - When you need user input, you MUST set status="needs_input" AND include a uiRequest object at contextUpdate.data.uiRequest'}

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
    // Log the raw LLM response for debugging
    logger.debug('Raw LLM response received', {
      agentId: this.specializedTemplate.agent.id,
      responseType: typeof llmResponse,
      responseKeys: Object.keys(llmResponse || {}),
      hasStatus: !!llmResponse.status,
      hasContextUpdate: !!llmResponse.contextUpdate,
      response: JSON.stringify(llmResponse).substring(0, 500)
    });

    // Validate response structure with better error messages
    if (!llmResponse.status) {
      logger.error('LLM response validation failed - missing status field', {
        agentId: this.specializedTemplate.agent.id,
        receivedFields: Object.keys(llmResponse || {}),
        expectedStatus: ['completed', 'needs_input', 'delegated', 'error']
      });
      throw new Error(`LLM response missing required status field. Received fields: ${Object.keys(llmResponse || {}).join(', ')}`);
    }
    
    if (!llmResponse.contextUpdate) {
      logger.error('LLM response validation failed - missing contextUpdate field', {
        agentId: this.specializedTemplate.agent.id,
        receivedFields: Object.keys(llmResponse || {}),
        response: JSON.stringify(llmResponse).substring(0, 200)
      });
      throw new Error(`LLM response missing required contextUpdate field. Received fields: ${Object.keys(llmResponse || {}).join(', ')}`);
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
      status: this.validateStatus(llmResponse.status, llmResponse.contextUpdate),
      contextUpdate: contextEntry,
      confidence: this.validateConfidence(llmResponse.confidence || contextEntry.confidence),
      fallback_strategy: llmResponse.fallback_strategy,
      uiRequests: llmResponse.uiRequests || [],
      error: llmResponse.error,
      partial_result: llmResponse.partial_result
    };
  }
  
  /**
   * Validate status field with strict uiRequest requirement
   */
  private validateStatus(status: any, contextUpdate?: any): 'completed' | 'needs_input' | 'delegated' | 'error' {
    const validStatuses = ['completed', 'needs_input', 'delegated', 'error'];
    
    if (!validStatuses.includes(status)) {
      console.warn(`Invalid status '${status}', defaulting to 'completed'`);
      return 'completed';
    }
    
    // 🚨 STRICT REQUIREMENT: needs_input MUST have uiRequest
    if (status === 'needs_input') {
      const hasUIRequest = contextUpdate?.data?.uiRequest;
      if (!hasUIRequest) {
        const errorMsg = `VALIDATION ERROR: Agent ${this.specializedTemplate.agent.id} returned status='needs_input' without contextUpdate.data.uiRequest. This violates the strict requirement.`;
        logger.error(errorMsg, {
          agentId: this.specializedTemplate.agent.id,
          status,
          hasContextUpdate: !!contextUpdate,
          hasData: !!contextUpdate?.data,
          hasUIRequest: hasUIRequest
        });
        throw new Error(errorMsg);
      }
    }
    
    return status;
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
      base: this.agentConfig,
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
    if (!this.agentConfig) {
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
      
      // 🔍 PROGRAMMATIC UIREQUEST DETECTION
      // Check if agent response contains a UIRequest in the data and handle it automatically
      await this.handleUIRequestDetection(response, { contextId, taskId, task });
      
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
   * =============================================================================
   * DATA ACQUISITION PROTOCOL - TOOLCHAIN FIRST, UI FALLBACK
   * =============================================================================
   * 
   * Implements the YAML-defined data acquisition protocol:
   * 1. FIRST: Check toolchain for tools that can provide needed data
   * 2. SECOND: Use toolchain tools to gather information  
   * 3. THIRD: Generate UIRequest only if toolchain can't help
   * 4. ALWAYS: Record the data acquisition process
   */
  
  /**
   * Intelligently acquire missing data using LLM reasoning and available tools
   */
  protected async acquireDataWithToolchain(
    missingData: string[],
    taskContext: TaskContext
  ): Promise<{
    acquiredData: Record<string, any>;
    stillMissing: string[];
    toolResults: Array<{ tool: string; success: boolean; reason: string }>;
    requiresUserInput: boolean;
  }> {
    if (!this.toolChain) {
      logger.warn('ToolChain not available for data acquisition');
      return {
        acquiredData: {},
        stillMissing: missingData,
        toolResults: [],
        requiresUserInput: true
      };
    }
    
    logger.info('🧠 Using LLM reasoning to acquire missing data', {
      contextId: taskContext.contextId,
      missingData
    });
    
    // Get all available tools from the toolchain
    const availableTools = await this.toolChain.getAvailableTools();
    
    // Use LLM to reason about which tools can help
    const toolSelectionPrompt = `
You are an intelligent agent that needs to acquire missing data.

Missing data needed:
${missingData.map(item => `- ${item}`).join('\n')}

Available tools:
${Array.isArray(availableTools) && availableTools.length > 0 
  ? availableTools.map(tool => `- ${tool.name}: ${tool.description}\n  Capabilities: ${tool.capabilities?.join(', ') || 'N/A'}`).join('\n')
  : 'No tools currently available'}

Task context:
${JSON.stringify(taskContext.currentState?.data || {}, null, 2)}

Analyze which tools could help acquire the missing data.
For each piece of missing data, identify the best tool to use.

Respond with a JSON object:
{
  "reasoning": "Your analysis of how to acquire the data",
  "tool_plan": [
    {
      "missing_item": "name of missing data",
      "tool_id": "id of tool to use",
      "tool_name": "name of tool",
      "parameters": {}
    }
  ],
  "cannot_acquire": ["list of items that no tool can help with"]
}
`;
    
    const toolSelectionResponse = await this.llmProvider.complete({
      prompt: toolSelectionPrompt,
      temperature: 0.3,
      maxTokens: 1000,
      responseFormat: 'json'
    });
    
    const toolPlan = this.safeJsonParse(toolSelectionResponse.content);
    
    // Execute the tool plan determined by LLM reasoning
    const acquiredData: Record<string, any> = {};
    const toolResults: Array<{ tool: string; success: boolean; reason: string }> = [];
    const stillMissing: string[] = [...missingData];
    
    if (toolPlan?.tool_plan) {
      for (const step of toolPlan.tool_plan) {
        try {
          logger.info(`🔍 Executing tool: ${step.tool_name} for ${step.missing_item}`, {
            contextId: taskContext.contextId
          });
          
          const result = await this.toolChain.executeTool(step.tool_id, step.parameters || {});
          
          if (result.success && result.data) {
            // Use LLM to extract relevant data from tool result
            const extractionPrompt = `
Tool ${step.tool_name} returned this data:
${JSON.stringify(result.data, null, 2)}

Extract the value for: ${step.missing_item}

Respond with JSON:
{
  "found": true/false,
  "value": "extracted value or null",
  "confidence": 0.0-1.0
}
`;
            
            const extraction = await this.llmProvider.complete({
              prompt: extractionPrompt,
              temperature: 0.1,
              maxTokens: 200,
              responseFormat: 'json'
            });
            
            const extracted = this.safeJsonParse(extraction.content);
            if (extracted?.found && extracted.value) {
              acquiredData[step.missing_item] = extracted.value;
              const index = stillMissing.indexOf(step.missing_item);
              if (index > -1) stillMissing.splice(index, 1);
              
              toolResults.push({
                tool: step.tool_name,
                success: true,
                reason: `Acquired ${step.missing_item} with confidence ${extracted.confidence}`
              });
            } else {
              toolResults.push({
                tool: step.tool_name,
                success: false,
                reason: `Could not extract ${step.missing_item} from tool result`
              });
            }
          } else {
            toolResults.push({
              tool: step.tool_name,
              success: false,
              reason: result.error || 'Tool execution failed'
            });
          }
        } catch (error) {
          toolResults.push({
            tool: step.tool_name || 'unknown',
            success: false,
            reason: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }
    
    // Add items that cannot be acquired to stillMissing
    if (toolPlan?.cannot_acquire) {
      for (const item of toolPlan.cannot_acquire) {
        if (!stillMissing.includes(item)) {
          stillMissing.push(item);
        }
      }
    }
    
    // Record the toolchain acquisition attempt
    await this.recordContextEntry(taskContext, {
      operation: 'toolchain_data_acquisition',
      data: {
        requestedFields: missingData,
        acquiredData,
        stillMissing,
        toolResults,
        toolsAttempted: toolPlan?.tool_plan?.length || 0,
        successfulTools: toolResults?.filter(r => r.success).length || 0
      },
      reasoning: `Attempted to acquire missing data using ${toolPlan?.tool_plan?.length || 0} toolchain tools. ${Object.keys(acquiredData).length} fields acquired, ${stillMissing.length} still missing.`
    });
    
    return {
      acquiredData,
      stillMissing,
      toolResults,
      requiresUserInput: stillMissing.length > 0
    };
  }
  
  /**
   * Create a UIRequest for missing data after toolchain attempts
   */
  protected async createDataAcquisitionUIRequest(
    missingFields: string[],
    taskContext: TaskContext,
    toolchainResults: Array<{ tool: string; success: boolean; reason: string }> = []
  ): Promise<any> {
    const config = this.agentConfig.data_acquisition_protocol;
    
    const fieldDefinitions = await this.createFieldDefinitionsForMissingData(missingFields, taskContext);
    
    // Ensure toolchainResults is always an array
    const results = toolchainResults || [];
    
    return {
      type: 'form',
      title: 'Additional Information Required',
      description: 'We need some additional information to continue with your request.',
      fields: fieldDefinitions,
      instructions: results.length > 0 
        ? `We attempted to find this information automatically using ${results.length} different sources, but were unable to locate all required details. Please provide the missing information below.`
        : 'Please provide the following information to continue with your request.',
      context: {
        reason: 'toolchain_acquisition_failed',
        missingFields,
        taskType: taskContext.currentState?.data?.taskType || 'general',
        toolchainResults: results,
        attemptedSources: results.map(r => r.tool)
      }
    };
  }
  
  /**
   * Helper method to safely parse JSON from strings
   */
  private safeJsonParse(content: any): any {
    if (typeof content === 'object') {
      return content;
    }
    
    if (typeof content !== 'string') {
      return null;
    }
    
    try {
      return JSON.parse(content);
    } catch (error) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {}
      }
      return null;
    }
  }
  
  
  /**
   * Create field definitions for missing data using LLM reasoning
   */
  private async createFieldDefinitionsForMissingData(
    missingFields: string[],
    taskContext: TaskContext
  ): Promise<any[]> {
    // Use LLM to generate appropriate field definitions based on context
    const fieldGenerationPrompt = `
Generate form field definitions for the following missing data fields.

Missing fields:
${missingFields.map(field => `- ${field}`).join('\n')}

Task context:
${JSON.stringify(taskContext.currentState?.data || {}, null, 2)}

For each field, generate an appropriate form field definition with:
- id: field identifier (use the field name from the missing fields list)
- label: human-readable label (concise, 1-3 words)
- type: appropriate input type (text, email, tel, select, textarea, etc.)
- required: whether the field is required
- placeholder: example value (for text fields only, e.g., "name@company.com" for email)
- help: "" (leave empty - good UI needs no explanation)
- options: (for select fields only) array of {value, label} options

IMPORTANT RULES:
1. For "entity_type" field, ALWAYS use type "select" with these options:
   - {value: "llc", label: "Limited Liability Company (LLC)"}
   - {value: "corporation", label: "Corporation"}
   - {value: "partnership", label: "Partnership"}
   - {value: "sole_proprietorship", label: "Sole Proprietorship"}
   - {value: "nonprofit", label: "Non-Profit Organization"}

2. For "formation_state" or "state" fields, use type "select" with US state options

3. For email fields (containing "email"), use type "email"

4. For phone fields (containing "phone" or "tel"), use type "tel"

Respond with a JSON array of field definitions.
`;
    
    try {
      const response = await this.llmProvider.complete({
        prompt: fieldGenerationPrompt,
        temperature: 0.3,
        maxTokens: 1500,
        responseFormat: 'json'
      });
      
      const fieldDefinitions = this.safeJsonParse(response.content);
      
      if (Array.isArray(fieldDefinitions)) {
        return fieldDefinitions;
      }
    } catch (error) {
      logger.error('Failed to generate field definitions with LLM', {
        error: error instanceof Error ? error.message : String(error),
        missingFields
      });
    }
    
    // Fallback to generic field definitions if LLM fails
    return missingFields.map(field => {
      const fieldLower = field.toLowerCase();
      const label = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      // Determine field type based on field name
      let type: string = 'text';
      let options: any[] | undefined;
      
      if (fieldLower === 'entity_type' || fieldLower === 'business_type') {
        type = 'select';
        options = [
          { value: 'llc', label: 'Limited Liability Company (LLC)' },
          { value: 'corporation', label: 'Corporation' },
          { value: 'partnership', label: 'Partnership' },
          { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
          { value: 'nonprofit', label: 'Non-Profit Organization' }
        ];
      } else if (fieldLower.includes('email')) {
        type = 'email';
      } else if (fieldLower.includes('phone') || fieldLower.includes('tel')) {
        type = 'tel';
      } else if (fieldLower.includes('state') && !fieldLower.includes('statement')) {
        type = 'select';
        options = [
          { value: 'CA', label: 'California' },
          { value: 'TX', label: 'Texas' },
          { value: 'NY', label: 'New York' },
          { value: 'FL', label: 'Florida' },
          { value: 'IL', label: 'Illinois' },
          { value: 'PA', label: 'Pennsylvania' },
          { value: 'OH', label: 'Ohio' },
          { value: 'GA', label: 'Georgia' },
          { value: 'NC', label: 'North Carolina' },
          { value: 'MI', label: 'Michigan' }
          // Add more states as needed
        ];
      } else if (fieldLower.includes('description') || fieldLower.includes('notes')) {
        type = 'textarea';
      }
      
      // Create helpful placeholder examples
      let placeholder: string | undefined = '';
      
      if (type === 'select') {
        placeholder = undefined; // Selects use their first option as placeholder
      } else if (type === 'email') {
        placeholder = 'name@company.com';
      } else if (type === 'tel') {
        placeholder = '(555) 123-4567';
      } else if (fieldLower.includes('ein')) {
        placeholder = '12-3456789';
      } else if (fieldLower.includes('business') && fieldLower.includes('name')) {
        placeholder = 'Acme Corporation';
      } else if (fieldLower.includes('address')) {
        placeholder = '123 Main Street';
      } else if (fieldLower.includes('city')) {
        placeholder = 'San Francisco';
      } else if (fieldLower.includes('zip')) {
        placeholder = '94105';
      } else {
        // Default to empty - let the label guide the user
        placeholder = '';
      }
      
      const fieldDef: any = {
        id: field,
        label,
        type,
        required: true,
        placeholder,
        help: '' // No help text - let the UI be self-explanatory
      };
      
      if (options) {
        fieldDef.options = options;
      }
      
      return fieldDef;
    });
  }

   /**
   * 🧠 EMERGENT REASONING ENGINE - ReAct Pattern Implementation
   * 
   * This method implements the Reasoning + Acting (ReAct) pattern, enabling agents to:
   * 1. Think about what they need
   * 2. Act by using tools
   * 3. Observe results
   * 4. Think again with new information
   * 5. Repeat until conclusion
   * 
   * The architecture is designed for EMERGENT BEHAVIOR - agents can discover
   * novel ways to combine tools and solve problems we never explicitly programmed.
   * 
   * IMPORTANT: This implementation preserves the base agent inheritance model,
   * integrating ReAct as an enhancement rather than a replacement.
   */
  async executeInternal(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    // Extract taskId for performance tracking and structured logging
    const taskId = request.taskContext?.contextId || 'unknown';
    const taskLogger = createTaskLogger(taskId);
    
    // Constants for ReAct loop control
    // TODO: Simple optimization - Make MAX_ITERATIONS configurable per task complexity
    // Easy win: onboarding might need 5, complex business discovery might need 15
    // Could read from task template: template.configuration?.maxReActIterations || 10
    const MAX_ITERATIONS = 10; // Generous limit to allow complex reasoning
    const ENABLE_REACT = true; // Feature flag for ReAct pattern
    
    // Check if we should use ReAct pattern or fall back to simple reasoning
    // ReAct is only enabled when tools are available
    if (!ENABLE_REACT || !this.toolChain) {
      return this.executeSimpleReasoning(request);
    }
    
    // Initialize reasoning context
    const reasoningContext = {
      iterations: [] as any[],
      toolResults: {} as Record<string, any>,
      accumulatedKnowledge: {} as Record<string, any>,
      startTime: Date.now()
    };

    // Subscribe to real-time context updates via SSE
    // This allows agents to receive UI responses and other agent updates during execution
    if (request.taskContext?.contextId) {
      await this.subscribeToContextUpdates(request.taskContext.contextId);
    }
    
    // Get available tools dynamically
    const availableTools = await this.toolChain.getAvailableTools();
    
    logger.info('🔄 Starting ReAct reasoning loop', {
      agentId: this.specializedTemplate.agent.id,
      taskId: request.taskContext?.contextId,
      availableTools: availableTools.length
    });
    
    // ReAct loop
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      // Build iterative prompt with accumulated context
      const iterativePrompt = await this.buildReActPrompt(request, reasoningContext, availableTools, iteration);
      
      // Record system-level iteration start
      await this.recordContextEntry(request.taskContext!, {
        operation: 'system.reasoning_iteration_start',
        data: {
          iteration,
          hasToolResults: Object.keys(reasoningContext.toolResults).length > 0,
          elapsedMs: Date.now() - reasoningContext.startTime
        },
        reasoning: `Starting reasoning iteration ${iteration}`,
        confidence: 1.0,
        trigger: {
          type: 'system_event',
          source: 'react_loop',
          details: { iteration }
        }
      });
      
      // Call LLM for this iteration with performance tracking
      taskLogger.info(`Starting LLM call for iteration ${iteration}`, { 
        agentType: this.specializedTemplate.agent.id,
        iteration 
      });
      
      const llmStartTime = Date.now();
      const llmResult = await taskPerformanceTracker.measureOperation(
        taskId,
        'llm_call',
        `${this.specializedTemplate.agent.id}_iteration_${iteration}`,
        async () => await this.llmProvider.complete({
          prompt: iterativePrompt,
          model: request.llmModel || process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
          temperature: 0.3,
          systemPrompt: `You are ${this.specializedTemplate.agent.name}, an autonomous agent with the ability to reason and use tools iteratively to accomplish your goals.`
        }),
        { agentType: this.specializedTemplate.agent.id, iteration, mode: 'react' }
      );
      const llmDuration = Date.now() - llmStartTime;
      
      // Parse iteration response
      let iterationResponse: any;
      try {
        iterationResponse = this.safeJsonParse(llmResult.content);
        if (!iterationResponse) {
          throw new Error('Failed to parse LLM response as JSON');
        }
      } catch (error) {
        logger.error('ReAct iteration parse error', {
          agentId: this.specializedTemplate.agent.id,
          iteration,
          error: error instanceof Error ? error.message : String(error)
        });
        // Attempt recovery by asking for clarification
        continue;
      }
      
      // Record this iteration for context accumulation
      reasoningContext.iterations.push({
        number: iteration,
        thought: iterationResponse.thought,
        action: iterationResponse.action,
        details: iterationResponse.details,
        timestamp: new Date().toISOString()
      });
      
      // Log the reasoning thought
      logger.info('💭 Agent reasoning', {
        agentId: this.specializedTemplate.agent.id,
        iteration,
        thought: iterationResponse.thought,
        action: iterationResponse.action
      });
      
      // Handle different actions
      if (iterationResponse.action === 'tool') {
        // Agent wants to use a tool
        const toolResult = await this.executeToolAction(
          iterationResponse.details,
          request.taskContext!,
          iteration
        );
        
        // Store tool result for next iteration
        const toolKey = `${iterationResponse.details.tool}_${iteration}`;
        reasoningContext.toolResults[toolKey] = toolResult;
        
        // Detect if stuck (circular tool usage)
        if (this.detectCircularReasoning(reasoningContext)) {
          logger.warn('⚠️ Circular reasoning detected', {
            agentId: this.specializedTemplate.agent.id,
            iteration
          });
          iterationResponse.action = 'help';
          iterationResponse.details = {
            reason: 'circular_reasoning_detected',
            pattern: 'Repeating same tool calls without progress'
          };
        }
        
      } else if (iterationResponse.action === 'answer') {
        // Agent has reached a conclusion
        logger.info('✅ Agent reached conclusion', {
          agentId: this.specializedTemplate.agent.id,
          iteration,
          totalDuration: Date.now() - reasoningContext.startTime
        });
        
        // Record semantic conclusion
        await this.recordContextEntry(request.taskContext!, {
          operation: iterationResponse.details.operation || 'reasoning_complete',
          data: iterationResponse.details.data || iterationResponse.details,
          reasoning: iterationResponse.details.reasoning || iterationResponse.thought,
          confidence: iterationResponse.details.confidence || 0.8
        });
        
        // Convert to standard response format
        return this.formatReActResponse(iterationResponse, reasoningContext, request);
        
      } else if (iterationResponse.action === 'help') {
        // Agent is stuck and needs orchestrator help
        logger.warn('🆘 Agent requesting help', {
          agentId: this.specializedTemplate.agent.id,
          iteration,
          reason: iterationResponse.details?.reason
        });
        
        // Record the blockage
        await this.recordContextEntry(request.taskContext!, {
          operation: 'agent_blocked',
          data: {
            iteration,
            blockageReason: iterationResponse.details?.reason || 'unspecified',
            attempted: reasoningContext.iterations.map(i => ({
              action: i.action,
              tool: i.details?.tool
            })),
            needed: iterationResponse.details?.needed || []
          },
          reasoning: `Agent stuck: ${iterationResponse.thought}`,
          confidence: 0.5
        });
        
        // Clean up SSE subscription before returning
        this.unsubscribeFromContextUpdates();
        
        // Return with needs_input status for orchestrator to handle
        return {
          status: 'needs_input',
          contextUpdate: {
            entryId: this.generateEntryId(),
            sequenceNumber: iteration,
            timestamp: new Date().toISOString(),
            actor: {
              type: 'agent',
              id: this.specializedTemplate.agent.id,
              version: this.specializedTemplate.agent.version
            },
            operation: 'blocked_need_help',
            data: {
              blockage: iterationResponse.details,
              reasoningTrace: reasoningContext.iterations
            },
            reasoning: iterationResponse.thought,
            confidence: 0.5,
            trigger: {
              type: 'orchestrator_request',
              source: 'react_blockage',
              details: { iteration }
            }
          },
          confidence: 0.5
        };
        
      } else if (iterationResponse.action === 'continue') {
        // Agent wants to continue reasoning in next iteration
        logger.debug('↻ Agent continuing to next iteration', {
          agentId: this.specializedTemplate.agent.id,
          iteration
        });
        
        // Extract any interim knowledge
        if (iterationResponse.details?.learned) {
          Object.assign(reasoningContext.accumulatedKnowledge, iterationResponse.details.learned);
        }
        
      } else if (iterationResponse.action === 'needs_user_input') {
        // Agent determined it needs user input
        // CRITICAL: Must follow established UIRequest pattern from base_agent.yaml
        logger.info('👤 Agent needs user input', {
          agentId: this.specializedTemplate.agent.id,
          iteration
        });
        
        // Generate proper form fields based on what the agent needs
        // The agent MUST explicitly specify what data it needs in details.needed_fields
        const neededFields = iterationResponse.details?.needed_fields || 
                            iterationResponse.details?.required_data ||
                            iterationResponse.details?.missing_fields;
        
        // Validate that agent explicitly specified fields
        if (!Array.isArray(neededFields) || neededFields.length === 0) {
          // Agent failed to specify what fields it needs - this is an error
          logger.error('❌ Agent requested user input without specifying needed_fields', {
            agentId: this.specializedTemplate.agent.id,
            iteration,
            details: iterationResponse.details
          });
          
          // Clean up SSE subscription before returning
          this.unsubscribeFromContextUpdates();
          
          // Return to help state - agent needs guidance
          return {
            status: 'needs_input', 
            contextUpdate: {
              entryId: this.generateEntryId(),
              sequenceNumber: iteration,
              timestamp: new Date().toISOString(),
              actor: {
                type: 'agent',
                id: this.specializedTemplate.agent.id,
                version: this.specializedTemplate.agent.version
              },
              operation: 'agent_error',
              data: {
                error: 'missing_field_specification',
                message: 'Agent must explicitly specify needed_fields when requesting user input',
                attempted_action: 'needs_user_input',
                hint: 'Use details.needed_fields array to specify exactly which fields you need from the user'
              },
              reasoning: 'Agent requested user input but failed to specify what fields are needed',
              confidence: 0.2,
              trigger: {
                type: 'orchestrator_request',
                source: 'react_validation_failure',
                details: { iteration }
              }
            },
            confidence: 0.2
          };
        }
        
        // Generate proper field definitions from explicitly specified fields
        const fields = await this.createFieldDefinitionsForMissingData(neededFields, request.taskContext);
        
        // Ensure UIRequest is properly structured with user-facing instructions
        let uiRequest = iterationResponse.details?.uiRequest || {};
        
        // Always ensure we have proper user-facing content
        if (!uiRequest.templateType) {
          uiRequest.templateType = 'form';
        }
        
        if (!uiRequest.title || uiRequest.title === 'Information Required') {
          uiRequest.title = 'Business Information Required';
        }
        
        // Check if instructions look like agent reasoning (contains "I should", "I need", etc.)
        const agentReasoningPatterns = /\b(I should|I need|I must|I will|task to|following.*principles|reviewing.*context|check if we have)\b/i;
        
        if (uiRequest.instructions && 
            (uiRequest.instructions.length > 100 || agentReasoningPatterns.test(uiRequest.instructions))) {
          // Remove verbose or agent-facing instructions
          uiRequest.instructions = undefined;
        }
        
        // Provide minimal but helpful context when needed
        if (!uiRequest.instructions || uiRequest.instructions.trim() === '') {
          // Context-aware brief instructions based on what we're collecting
          if (fields.some(f => f.id === 'entity_type' || f.id === 'business_type')) {
            uiRequest.instructions = 'Tell us about your business.';
          } else if (fields.some(f => f.id === 'ein' || f.id === 'tax_id')) {
            uiRequest.instructions = 'Tax and registration details.';
          } else if (fields.length === 1) {
            // Single field doesn't need instructions
            uiRequest.instructions = '';
          } else {
            uiRequest.instructions = 'Complete these details to proceed.';
          }
        }
        
        // Always add the fields we generated
        uiRequest.fields = fields;
        
        // Validate UIRequest has required fields
        if (!uiRequest.templateType || !uiRequest.title || !uiRequest.instructions) {
          logger.warn('⚠️ Incomplete UIRequest generated', {
            agentId: this.specializedTemplate.agent.id,
            iteration,
            uiRequest
          });
        }
        
        // Clean up SSE subscription before returning
        this.unsubscribeFromContextUpdates();
        
        // Return in standard format with UIRequest in correct location
        // Per base_agent.yaml: uiRequest MUST be in contextUpdate.data.uiRequest
        return {
          status: 'needs_input', // Standard status enum value
          contextUpdate: {
            entryId: this.generateEntryId(),
            sequenceNumber: iteration,
            timestamp: new Date().toISOString(),
            actor: {
              type: 'agent',
              id: this.specializedTemplate.agent.id,
              version: this.specializedTemplate.agent.version
            },
            operation: 'user_input_required',
            data: { 
              // CRITICAL: uiRequest goes in data.uiRequest per base_agent.yaml
              uiRequest,
              // Include context about why input is needed
              reason: iterationResponse.thought,
              attemptedTools: reasoningContext.iterations
                .filter((i: any) => i.action === 'tool')
                .map((i: any) => i.details?.tool)
            },
            reasoning: iterationResponse.thought,
            confidence: 0.9,
            trigger: {
              type: 'orchestrator_request',
              source: 'react_user_need',
              details: { iteration }
            }
          },
          confidence: 0.9
        };
      }
      
      // Check if we're at max iterations
      if (iteration === MAX_ITERATIONS) {
        logger.error('⚠️ Hit max iterations without conclusion', {
          agentId: this.specializedTemplate.agent.id,
          totalDuration: Date.now() - reasoningContext.startTime
        });
        
        // Return what we have with error status
        // Clean up SSE subscription before returning error
        this.unsubscribeFromContextUpdates();
        
        return {
          status: 'error',
          contextUpdate: {
            entryId: this.generateEntryId(),
            sequenceNumber: iteration,
            timestamp: new Date().toISOString(),
            actor: {
              type: 'agent',
              id: this.specializedTemplate.agent.id,
              version: this.specializedTemplate.agent.version
            },
            operation: 'max_iterations_reached',
            data: {
              iterations: MAX_ITERATIONS,
              reasoningTrace: reasoningContext.iterations,
              partialResults: reasoningContext.accumulatedKnowledge
            },
            reasoning: 'Reached maximum reasoning iterations without conclusion',
            confidence: 0.3,
            trigger: {
              type: 'system_event',
              source: 'react_limit',
              details: { maxIterations: MAX_ITERATIONS }
            }
          },
          confidence: 0.3
        };
      }
    }
    
    // Clean up SSE subscription at the end of successful execution
    this.unsubscribeFromContextUpdates();
    
    // Should never reach here, but safety fallback
    return this.executeSimpleReasoning(request);
  }
  
  /**
   * Execute simple single-pass reasoning (original behavior)
   * 
   * This is the fallback when ReAct is disabled or tools are unavailable.
   * It uses the standard inherited prompt structure without iteration.
   */
  private async executeSimpleReasoning(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    // Build standard inherited prompt (base + specialized)
    const fullPrompt = this.buildInheritedPrompt(request);
    
    logger.info('📝 Using simple single-pass reasoning', {
      agentId: this.specializedTemplate.agent.id,
      taskId: request.taskContext?.contextId,
      reason: !this.toolChain ? 'No toolchain available' : 'ReAct disabled'
    });
    
    // Call LLM with standard approach with performance tracking
    const taskId = request.taskContext?.contextId || 'unknown';
    const taskLogger = createTaskLogger(taskId);
    
    taskLogger.info(`Starting LLM call (standard mode)`, { 
      agentType: this.specializedTemplate.agent.id
    });
    
    const llmResult = await taskPerformanceTracker.measureOperation(
      taskId,
      'llm_call',
      `${this.specializedTemplate.agent.id}_standard`,
      async () => await this.llmProvider.complete({
        prompt: fullPrompt,
        model: request.llmModel || process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        systemPrompt: this.specializedTemplate.agent?.mission || 'You are a helpful AI assistant.'
      }),
      { agentType: this.specializedTemplate.agent.id, mode: 'standard' }
    );
    
    // Parse and validate response
    let llmResponse: any;
    try {
      llmResponse = this.safeJsonParse(llmResult.content);
      if (!llmResponse) {
        throw new Error('Failed to parse LLM response as JSON');
      }
    } catch (error) {
      logger.error('Failed to parse simple reasoning response', {
        agentId: this.specializedTemplate.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Invalid LLM response format');
    }
    
    // Use existing validation
    return this.enforceStandardSchema(llmResponse, request);
  }

  /**
   * Build the ReAct prompt for each iteration
   * 
   * This method integrates the base agent inheritance model with ReAct enhancements.
   * It preserves all base principles while adding iterative reasoning capabilities.
   * 
   * Key design decisions:
   * - Starts with full inherited prompt structure
   * - Adds ReAct-specific instructions as an enhancement layer
   * - Maintains standard response schema from base_agent.yaml
   * - Preserves ethical boundaries and decision frameworks
   */
  private async buildReActPrompt(
    request: BaseAgentRequest,
    reasoningContext: any,
    availableTools: any[],
    iteration: number
  ): Promise<string> {
    // Start with the full inherited prompt (base + specialized)
    // This ensures we maintain all principles, ethics, and specialized capabilities
    const basePrompt = this.buildInheritedPrompt(request);
    
    // Extract iteration context for ReAct enhancement
    const previousThoughts = reasoningContext.iterations
      .slice(-3) // Show last 3 iterations to maintain context without explosion
      .map((i: any) => `Iteration ${i.number}: ${i.thought} → Action: ${i.action}`)
      .join('\n');
    
    const toolResultsSummary = Object.entries(reasoningContext.toolResults)
      .slice(-5) // Show last 5 tool results
      .map(([key, result]: [string, any]) => {
        // Don't truncate tool results - agents need full data to make decisions
        const resultData = result.data || result;
        
        // For California business search, ensure we show all key fields
        if (key.includes('california_business_search') && resultData) {
          // Extract and format key business information
          if (Array.isArray(resultData) && resultData.length > 0) {
            const business = resultData[0];
            return `${key}: [SUCCESS] Found business:
  - Entity Name: ${business.entityName}
  - Entity Number: ${business.entityNumber}
  - EIN: ${business.ein || 'Not found'}
  - Status: ${business.status}
  - Principal Address: ${business.principalAddress || business.streetAddress || 'Not found'}
  - Mailing Address: ${business.mailingAddress || 'Not found'}
  - Registered Agent: ${business.agentName || 'Not found'}
  - Agent Address: ${business.agentAddress || 'Not found'}
  - CEO/President: ${business.ceoName || business.presidentName || 'Not found'}
  - Full Data Available: Yes`;
          }
        }
        
        // For other tools, show more data but with reasonable limits
        const resultStr = JSON.stringify(resultData);
        if (resultStr.length > 1000) {
          // For very large results, show key fields and indicate more is available
          return `${key}: ${result.success === false ? '[FAILED] ' : '[SUCCESS] '}${resultStr.substring(0, 800)}... [${resultStr.length} chars total]`;
        }
        return `${key}: ${result.success === false ? '[FAILED] ' : '[SUCCESS] '}${resultStr}`;
      })
      .join('\n\n');
    
    // Extract available data by combining multiple sources in order of precedence:
    // 1. Fresh context from database (base data)
    // 2. Dynamic context from SSE updates (real-time data) 
    // 3. Request parameters (highest precedence)
    let availableData = {};
    
    // 1. If we have a contextId, fetch fresh context and extract all available data
    if (request.taskContext?.contextId) {
      const freshContext = await this.fetchFreshTaskContext(request.taskContext.contextId);
      if (freshContext) {
        const contextData = this.extractAvailableDataFromContext(freshContext);
        Object.assign(availableData, contextData);
        
        logger.debug('📚 Enhanced availableData with fresh context', {
          agentId: this.specializedTemplate.agent.id,
          contextId: request.taskContext.contextId,
          contextDataKeys: Object.keys(contextData)
        });
      }
    }

    // 2. Add dynamic context data from SSE updates (real-time updates)
    const dynamicData = this.getDynamicContextData();
    if (Object.keys(dynamicData).length > 0) {
      Object.assign(availableData, dynamicData);
      
      logger.debug('🔄 Enhanced availableData with dynamic SSE updates', {
        agentId: this.specializedTemplate.agent.id,
        dynamicDataKeys: Object.keys(dynamicData)
      });
    }

    // 3. Request parameters take highest precedence (can override everything)
    Object.assign(availableData, request.parameters || {});
    
    logger.debug('📊 Final availableData composition', {
      agentId: this.specializedTemplate.agent.id,
      totalKeys: Object.keys(availableData).length,
      keys: Object.keys(availableData).slice(0, 10) // Show first 10 to avoid log spam
    });
    
    // Append ReAct enhancement to the inherited prompt
    return `${basePrompt}

# 🔄 ReAct Pattern Enhancement (ITERATION ${iteration})

You are now reasoning iteratively with tool access. This is iteration ${iteration} of maximum ${10}.

## 📊 Available Data from Request
${Object.keys(availableData).length > 0 ? 
  `You have access to the following data:
${JSON.stringify(availableData, null, 2)}

Note: Tool execution layer has universal guards against invalid parameters.` 
  : 
  'No data provided yet - you may need to request user input first'}

## 🛠️ Available Tools for This Task (USE THESE FIRST!)
${availableTools.map(t => {
  // Highlight the California Business Search tool
  if (t.name === 'searchBusinessEntity') {
    return `⭐ **${t.name}**: ${t.description}
     Can find: addresses, entity numbers, status, officers, agent info
     Example: searchBusinessEntity("ARCANA DWELL, LLC", "CA")`;
  }
  return `- ${t.name}: ${t.description}`;
}).join('\n') || 'No tools available'}

**IMPORTANT: Always check if a tool can provide the information before asking the user!**

## Previous Iterations Context
${previousThoughts || 'This is your first iteration - no previous context'}

## Tool Results From Previous Iterations
${toolResultsSummary || 'No tools have been used yet'}

## Accumulated Knowledge
${JSON.stringify(reasoningContext.accumulatedKnowledge, null, 2) || '{}'}

## ReAct Decision Framework

For this iteration, you must decide on ONE of these actions:

### 🎯 DECISION TREE:
1. **Do I have the basic data I need?** (e.g., business name)
   - NO → Go to "REQUEST USER INPUT" 
   - YES → Continue to step 2

2. **Can tools provide additional information?**
   - YES → Go to "USE TOOL" (with valid parameters)
   - NO → Continue to step 3

3. **Do I have enough to complete the task?**
   - YES → Go to "PROVIDE ANSWER"
   - NO → Go to "REQUEST USER INPUT" for missing pieces

### 🔍 ACTION: USE TOOL (action: "tool")
Use when you need information from external systems.

Your response must include in details:
- tool: "exact_tool_name"  
- params: { /* tool-specific parameters */ }

Note: Universal validation guards will prevent invalid parameters and provide clear error messages.

### ✅ ACTION: PROVIDE ANSWER (action: "answer")
Choose this when you have sufficient information to complete the task.
Return the STANDARD RESPONSE FORMAT from above with:
- status: "completed"
- Full contextUpdate with operation, data, reasoning, confidence

### 👤 ACTION: REQUEST USER INPUT (action: "needs_user_input")
**Use when you need data that you don't have!**

Two valid scenarios:
1. **Missing basic data** - You need fundamental info to start (e.g., business name)
2. **Tools exhausted** - You tried tools but need additional private data

Check before requesting:
- Is this data in "Available Data" section above? Don't ask again!
- Could a tool find this? Only if you have params to call it
- If tools found partial data, ONLY ask for missing pieces

NEVER ask for information that tools can find:
- Business addresses (searchable via California SOS)
- Entity numbers (searchable via California SOS)
- Business status (searchable via California SOS)
- Officer names (searchable via California SOS)
- Agent information (searchable via California SOS)

Only ask users for:
- EIN/Tax ID (not in public records)
- Private contact info (emails, phone numbers)
- Internal preferences or decisions
- Information tools explicitly couldn't find

**MANDATORY RESPONSE FORMAT:**
Your response MUST include in details:
- needed_fields: ["field1", "field2", ...] // REQUIRED - explicit list of field names
- uiRequest: {
    templateType: "form",
    title: "Brief title (3-5 words)",
    instructions: "One short helpful phrase (5-8 words)"
  }

**CRITICAL REQUIREMENTS:**
- needed_fields is MANDATORY - never omit this array
- needed_fields must contain explicit field names (e.g., "ein", "business_email", "phone")
- DO NOT include fields in uiRequest - they are auto-generated from needed_fields
- If you don't specify needed_fields, your request will ERROR

Example valid response in details:
{
  needed_fields: ["ein", "business_email", "phone_number"],
  uiRequest: {
    templateType: "form",
    title: "Tax & Contact Info",
    instructions: "Private details not in public records"
  }
}

CRITICAL: If you haven't tried searchBusinessEntity yet, DO THAT FIRST!

### 4. REQUEST HELP (action: "help")
Choose this when you're stuck or detecting circular reasoning.
Your response must include in details:
- reason: "why you're stuck"
- attempted: ["what you've tried"]
- needed: ["what would help"]

### 5. CONTINUE REASONING (action: "continue")
Choose this to accumulate knowledge for next iteration.
Your response must include in details:
- learned: { /* key insights to carry forward */ }

## CRITICAL: Response Format for This Iteration

You must respond with VALID JSON:
{
  "iteration": ${iteration},
  "thought": "Your reasoning about what to do next",
  "action": "tool|answer|needs_user_input|help|continue",
  "details": {
    /* Action-specific details as described above */
  }
}

## Anti-Patterns to Avoid
- Don't repeat the same tool call with identical parameters
- Don't continue if you have the answer
- Don't skip user input requests when tools can't help
- Don't violate the base principles in your reasoning

What is your decision for iteration ${iteration}?`;
  }

  /**
   * Execute a tool action requested by the agent
   * 
   * This method:
   * 1. Validates the requested tool exists
   * 2. Executes the tool with provided parameters
   * 3. Records the tool usage as a system event
   * 4. Returns the result for the next iteration
   * 
   * Tool failures are handled gracefully - the agent can reason about
   * failures and try alternative approaches.
   */
  private async executeToolAction(
    details: any,
    taskContext: TaskContext,
    iteration: number
  ): Promise<any> {
    // TODO: Future optimization - Support parallel tool execution
    // When agent identifies multiple independent tools to call,
    // we could run them in parallel with Promise.all()
    // Example: searching multiple databases simultaneously
    const { tool, params } = details;
    const taskId = taskContext.contextId;
    const taskLogger = createTaskLogger(taskId);
    
    taskLogger.info('🔧 Executing tool action', {
      agentId: this.specializedTemplate.agent.id,
      tool,
      iteration,
      hasParams: !!params
    });
    
    try {
      // Execute the tool through ToolChain with performance tracking
      const result = await taskPerformanceTracker.measureOperation(
        taskId,
        'tool_call',
        tool,
        async () => await this.toolChain.executeTool(tool, params || {}),
        { agent: this.specializedTemplate.agent.id, iteration }
      );
      
      // Record successful tool usage as system event
      await this.recordContextEntry(taskContext, {
        operation: 'system.tool_executed',
        data: {
          tool,
          params,
          success: result.success,
          resultPreview: JSON.stringify(result.data).substring(0, 200)
        },
        reasoning: `Executed ${tool} in iteration ${iteration}`,
        confidence: 1.0,
        trigger: {
          type: 'system_event',
          source: 'react_tool_execution',
          details: { iteration, tool }
        }
      });
      
      return result;
      
    } catch (error) {
      // Tool execution failed - let agent reason about it
      logger.error('Tool execution failed', {
        agentId: this.specializedTemplate.agent.id,
        tool,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Record failure as system event
      await this.recordContextEntry(taskContext, {
        operation: 'system.tool_failed',
        data: {
          tool,
          params,
          error: error instanceof Error ? error.message : String(error)
        },
        reasoning: `Tool ${tool} failed in iteration ${iteration}`,
        confidence: 1.0,
        trigger: {
          type: 'system_event',
          source: 'react_tool_failure',
          details: { iteration, tool }
        }
      });
      
      // Return failure for agent to reason about
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        tool
      };
    }
  }

  /**
   * Detect circular reasoning patterns
   * 
   * This method analyzes the reasoning history to detect if the agent
   * is stuck in a loop, repeatedly trying the same actions without progress.
   * 
   * Detection strategies:
   * 1. Same tool called 3+ times with same params
   * 2. Alternating between same 2 tools repeatedly
   * 3. Same thought appearing multiple times
   * 
   * This allows agents to self-correct when stuck rather than spinning.
   */
  private detectCircularReasoning(reasoningContext: any): boolean {
    const iterations = reasoningContext.iterations;
    
    if (iterations.length < 3) {
      return false; // Need at least 3 iterations to detect a pattern
    }
    
    // Check for repeated tool usage with same parameters
    const toolCalls = iterations
      .filter((i: any) => i.action === 'tool')
      .map((i: any) => `${i.details?.tool}:${JSON.stringify(i.details?.params)}`);
    
    // Count occurrences of each tool call signature
    const toolCallCounts = toolCalls.reduce((acc: any, call: string) => {
      acc[call] = (acc[call] || 0) + 1;
      return acc;
    }, {});
    
    // If any tool called 3+ times with same params, we're likely stuck
    const hasRepeatedTool = Object.values(toolCallCounts).some((count: any) => count >= 3);
    
    if (hasRepeatedTool) {
      logger.warn('Circular reasoning detected: repeated tool calls', {
        agentId: this.specializedTemplate.agent.id,
        toolCallCounts
      });
      return true;
    }
    
    // Check for repeated thoughts (agent thinking same thing repeatedly)
    const thoughts = iterations.map((i: any) => i.thought?.toLowerCase());
    const lastThreeThoughts = thoughts.slice(-3);
    
    // If last 3 thoughts are very similar, we might be stuck
    if (lastThreeThoughts.length === 3) {
      const [t1, t2, t3] = lastThreeThoughts;
      if (t1 === t2 && t2 === t3) {
        logger.warn('Circular reasoning detected: repeated thoughts', {
          agentId: this.specializedTemplate.agent.id,
          repeatedThought: t1
        });
        return true;
      }
    }
    
    return false;
  }

  /**
   * Format ReAct response to standard BaseAgentResponse
   * 
   * This method converts the final iteration's answer into the standard
   * response format expected by the rest of the system.
   * 
   * CRITICAL: This must return the exact schema defined in base_agent.yaml
   * The agent's "answer" action should already provide standard format,
   * but we ensure compliance here.
   */
  private formatReActResponse(
    iterationResponse: any,
    reasoningContext: any,
    request: BaseAgentRequest
  ): BaseAgentResponse {
    // The agent should have provided standard format in details when action="answer"
    // We expect details to contain the full response structure
    const details = iterationResponse.details || {};
    
    // If agent provided full standard format, use it
    if (details.status && details.contextUpdate) {
      // Agent provided complete standard response
      return {
        status: details.status,
        contextUpdate: {
          ...details.contextUpdate,
          // Ensure required fields are present
          entryId: details.contextUpdate.entryId || this.generateEntryId(),
          sequenceNumber: details.contextUpdate.sequenceNumber || reasoningContext.iterations.length,
          timestamp: details.contextUpdate.timestamp || new Date().toISOString(),
          actor: details.contextUpdate.actor || {
            type: 'agent',
            id: this.specializedTemplate.agent.id,
            version: this.specializedTemplate.agent.version
          },
          // Add reasoning trace as debug info
          data: {
            ...details.contextUpdate.data,
            _reasoningTrace: {
              iterations: reasoningContext.iterations.length,
              toolsUsed: Object.keys(reasoningContext.toolResults),
              totalDuration: Date.now() - reasoningContext.startTime,
              knowledgeGained: reasoningContext.accumulatedKnowledge
            }
          }
        },
        confidence: details.confidence || details.contextUpdate?.confidence || 0.8
      };
    }
    
    // Fallback: construct standard format from partial details
    // This handles agents that return partial format
    const contextUpdate: ContextEntry = {
      entryId: this.generateEntryId(),
      sequenceNumber: reasoningContext.iterations.length,
      timestamp: new Date().toISOString(),
      actor: {
        type: 'agent',
        id: this.specializedTemplate.agent.id,
        version: this.specializedTemplate.agent.version
      },
      operation: details.operation || request.operation,
      data: {
        ...details.data,
        // Include reasoning trace for introspection
        _reasoningTrace: {
          iterations: reasoningContext.iterations.length,
          toolsUsed: Object.keys(reasoningContext.toolResults),
          totalDuration: Date.now() - reasoningContext.startTime,
          knowledgeGained: reasoningContext.accumulatedKnowledge
        }
      },
      reasoning: details.reasoning || iterationResponse.thought,
      confidence: details.confidence || 0.8,
      trigger: {
        type: 'orchestrator_request',
        source: 'react_conclusion',
        details: {
          iterations: reasoningContext.iterations.length,
          requestId: request.parameters?.requestId
        }
      }
    };
    
    return {
      status: 'completed', // Default to completed for answer action
      contextUpdate,
      confidence: details.confidence || 0.8
    };
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
   * 🔍 PROGRAMMATIC UIREQUEST DETECTION
   * 
   * Automatically detects UIRequest objects in agent response data and creates
   * UI_REQUEST_CREATED events without requiring LLM to call specific methods.
   * 
   * This eliminates the dependency on LLM remembering to call requestUserInput()
   * and makes the system more reliable by handling UIRequest creation programmatically.
   */
  private async handleUIRequestDetection(
    response: BaseAgentResponse,
    context: { contextId: string; taskId: string; task: any }
  ): Promise<void> {
    // Primary: Check for explicit UIRequest in contextUpdate.data.uiRequest
    let uiRequest = response.contextUpdate?.data?.uiRequest;
    
    // Robust fallback: Handle agents that return needs_input without explicit UIRequest
    if (!uiRequest && response.status === 'needs_input') {
      logger.info('🔍 Agent returned needs_input, creating UIRequest from agent context', {
        agentId: this.specializedTemplate.agent.id,
        taskId: context.taskId,
        agentRole: this.specializedTemplate.agent.role
      });
      
      // Create contextually appropriate UIRequest based on agent role and response
      uiRequest = this.createUIRequestFromAgentContext(response);
    }
    
    if (!uiRequest) {
      return; // No UIRequest needed
    }

    logger.info('🔍 UIRequest detected in agent response, handling automatically', {
      agentId: this.specializedTemplate.agent.id,
      taskId: context.taskId,
      templateType: uiRequest.templateType,
      title: uiRequest.title
    });

    try {
      // Generate unique request ID
      const requestId = require('crypto').randomUUID();
      
      // Create standardized UIRequest structure
      const standardizedUIRequest = {
        requestId,
        templateType: uiRequest.templateType || 'form',
        priority: uiRequest.priority || 'medium',
        semanticData: {
          title: uiRequest.title || 'User Input Required',
          instructions: uiRequest.instructions || 'Please provide the required information.',
          fields: uiRequest.fields || [],
          ...uiRequest.semanticData
        },
        createdBy: this.specializedTemplate.agent.id,
        createdAt: new Date().toISOString()
      };

      // Create UI_REQUEST_CREATED event
      const contextEntry: ContextEntry = {
        entryId: require('crypto').randomUUID(),
        timestamp: new Date().toISOString(),
        sequenceNumber: 0, // Will be set by recordContextEntry
        actor: {
          type: 'agent',
          id: this.specializedTemplate.agent.id,
          version: this.specializedTemplate.agent.version || '1.0.0'
        },
        operation: 'UI_REQUEST_CREATED',
        data: {
          uiRequest: standardizedUIRequest
        },
        reasoning: `Programmatically detected UIRequest from agent ${this.specializedTemplate.agent.id}: ${uiRequest.title}`,
        confidence: 0.9,
        trigger: {
          type: 'user_request',
          source: 'agent_automatic_ui_detection',
          details: {
            templateType: uiRequest.templateType || 'form',
            title: uiRequest.title || 'User Input Required',
            timestamp: new Date().toISOString()
          }
        }
      };

      // Record the context entry using the new event-based approach
      const taskContext: TaskContext = {
        contextId: context.contextId,
        taskTemplateId: context.task?.templateId || 'unknown',
        tenantId: context.task?.tenantId || 'unknown',
        createdAt: new Date().toISOString(),
        currentState: {
          status: 'in_progress',
          completeness: 50,
          data: {}
        },
        history: []
      };
      
      await this.recordContextEntry(taskContext, contextEntry);
      
      logger.info('✅ UIRequest event created programmatically', {
        agentId: this.specializedTemplate.agent.id,
        requestId,
        taskId: context.taskId
      });

      // Add the requestId to the original response data for reference
      if (response.contextUpdate?.data) {
        response.contextUpdate.data.uiRequestId = requestId;
      }

    } catch (error) {
      logger.error('❌ Failed to handle UIRequest detection', {
        agentId: this.specializedTemplate.agent.id,
        taskId: context.taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - this shouldn't break agent execution
    }
  }

  /**
   * Create contextually appropriate UIRequest when agent returns needs_input
   * This robust fallback works with actual agent response patterns
   */
  private createUIRequestFromAgentContext(response: BaseAgentResponse): any {
    const agentRole = this.specializedTemplate.agent.role;
    const agentId = this.specializedTemplate.agent.id;
    
    // Extract fields from response data if available
    let fields: any[] = [];
    if (response.contextUpdate?.data) {
      const data = response.contextUpdate.data as any;
      if (Array.isArray(data.required_fields)) {
        fields = data.required_fields.map((fieldName: string) => 
          this.createFieldFromName(fieldName)
        );
      }
    }
    
    // Agent-specific UIRequest configuration
    const agentUIRequestMap: Record<string, any> = {
      'profile_collection_specialist': {
        templateType: 'form',
        title: 'Business Profile Information',
        priority: 'high',
        instructions: 'Let\'s start with the basics about your business.',
        defaultFields: [
          {
            name: 'business_name',
            type: 'text',
            required: true,
            label: 'Business Name',
            placeholder: 'Enter your legal business name'
          },
          {
            name: 'contact_email',
            type: 'email',
            required: true,
            label: 'Contact Email',
            placeholder: 'Enter your email address'
          },
          {
            name: 'entity_type',
            type: 'select',
            required: true,
            label: 'Entity Type',
            options: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship']
          }
        ]
      },
      'data_collection_specialist': {
        templateType: 'form',
        title: 'Business Information Required',
        priority: 'high',
        instructions: 'We couldn\'t find your business in public records. Please provide the following information:',
        defaultFields: [
          {
            name: 'legalBusinessName',
            type: 'text',
            required: true,
            label: 'Legal Business Name',
            placeholder: 'Exact name as registered with state'
          },
          {
            name: 'entityType',
            type: 'select',
            required: true,
            label: 'Entity Type',
            options: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship']
          },
          {
            name: 'formationState',
            type: 'select',
            required: true,
            label: 'State of Formation',
            options: ['California', 'Delaware', 'Nevada', 'Texas', 'Other'],
            defaultValue: 'California'
          }
        ]
      }
    };
    
    // Get agent-specific configuration or fallback to generic
    const agentConfig = agentUIRequestMap[agentRole] || {
      templateType: 'form',
      title: 'Information Required',
      priority: 'medium',
      instructions: response.contextUpdate?.reasoning || 'Please provide the required information.',
      defaultFields: [
        {
          name: 'user_input',
          type: 'text',
          required: true,
          label: 'Required Information',
          placeholder: 'Please provide the requested information'
        }
      ]
    };
    
    return {
      templateType: agentConfig.templateType,
      title: agentConfig.title,
      priority: agentConfig.priority,
      instructions: agentConfig.instructions,
      fields: fields.length > 0 ? fields : agentConfig.defaultFields,
      semanticData: {
        category: 'agent_request',
        source: 'contextual_generation',
        agentRole: agentRole,
        agentId: agentId
      }
    };
  }

  /**
   * Create a form field object from a field name
   */
  private createFieldFromName(fieldName: string): any {
    const fieldMappings: Record<string, any> = {
      business_name: {
        name: 'business_name',
        type: 'text',
        required: true,
        label: 'Business Name',
        placeholder: 'Enter your legal business name'
      },
      contact_email: {
        name: 'contact_email',
        type: 'email',
        required: true,
        label: 'Contact Email',
        placeholder: 'Enter your email address'
      },
      entity_type: {
        name: 'entity_type',
        type: 'select',
        required: true,
        label: 'Entity Type',
        options: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship']
      },
      formation_state: {
        name: 'formation_state',
        type: 'select',
        required: false,
        label: 'State of Formation',
        options: ['California', 'Delaware', 'Nevada', 'Texas', 'Other']
      }
    };
    
    return fieldMappings[fieldName] || {
      name: fieldName,
      type: 'text',
      required: true,
      label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      placeholder: `Enter ${fieldName.replace(/_/g, ' ')}`
    };
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
      // Re-throw error - without persistence/broadcast, the system cannot function
      // Agents should handle this failure and implement retry mechanisms
      throw error;
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
      // Use A2A Event Bus for broadcasting (pure messaging, no database dependency)
      await a2aEventBus.broadcast({
        type: event.type || 'AGENT_UPDATE',
        taskId,
        agentId: this.specializedTemplate.agent.id,
        operation: event.operation,
        data: event.data || event,
        reasoning: event.reasoning,
        timestamp: event.timestamp || new Date().toISOString(),
        metadata: event.metadata
      });
      
      logger.debug('Task event broadcast via A2A', {
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
   * Fetch fresh task context from database
   * This ensures agents have access to all previously collected data
   * when they are instantiated mid-task or need to refresh their context
   * 
   * @param contextId - The task context ID to fetch
   * @returns Fresh task context with complete history
   * @protected
   */
  protected async fetchFreshTaskContext(contextId: string): Promise<TaskContext | null> {
    try {
      const { TaskService } = await import('../../services/task-service');
      const taskService = TaskService.getInstance();
      
      const freshContext = await taskService.getTask(contextId);
      
      if (freshContext) {
        logger.debug('📋 Fetched fresh task context from database', {
          contextId,
          agentId: this.specializedTemplate.agent.id,
          historyEvents: freshContext.history?.length || 0,
          currentState: freshContext.currentState?.status
        });
      } else {
        const isTestMode = process.env.NODE_ENV === 'test';
        if (isTestMode) {
          logger.debug('📋 Task context not in database (test mode - using mock/empty context)', {
            contextId,
            agentId: this.specializedTemplate.agent.id
          });
        } else {
          logger.warn('⚠️ Task context not found in database', {
            contextId,
            agentId: this.specializedTemplate.agent.id,
            hint: 'Task may not exist or database connection issue'
          });
        }
      }
      
      return freshContext;
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      if (isTestMode) {
        logger.debug('📋 Could not fetch task context (test mode - proceeding with defaults)', {
          contextId,
          agentId: this.specializedTemplate.agent.id
        });
      } else {
        logger.error('❌ Failed to fetch fresh task context', {
          contextId,
          agentId: this.specializedTemplate.agent.id,
          error: error instanceof Error ? error.message : String(error),
          hint: 'Check database connection and task existence'
        });
      }
      return null;
    }
  }

  /**
   * Extract all available data from task context history
   * This aggregates both UI responses and agent execution results
   * to provide complete context to the agent
   * 
   * @param context - The task context to extract data from
   * @returns Aggregated data from all sources
   * @protected
   */
  protected extractAvailableDataFromContext(context: TaskContext): Record<string, any> {
    const aggregatedData: Record<string, any> = {};
    
    // Extract data from task history
    for (const event of context.history || []) {
      // UI responses (user-provided data)
      if (event.operation === 'UI_RESPONSE_SUBMITTED' && event.data?.response) {
        Object.assign(aggregatedData, event.data.response);
        
        logger.debug('📝 Found UI response data', {
          contextId: context.contextId,
          dataKeys: Object.keys(event.data.response),
          timestamp: event.timestamp
        });
      }
      
      // Agent execution results (tool results, contextUpdate.data)
      if (event.operation?.includes('agent.') && event.data?.contextUpdate?.data) {
        Object.assign(aggregatedData, event.data.contextUpdate.data);
        
        logger.debug('🤖 Found agent execution data', {
          contextId: context.contextId,
          operation: event.operation,
          dataKeys: Object.keys(event.data.contextUpdate.data),
          timestamp: event.timestamp
        });
      }
    }
    
    // Also check current state data
    if (context.currentState?.data) {
      Object.assign(aggregatedData, context.currentState.data);
      
      logger.debug('📊 Found current state data', {
        contextId: context.contextId,
        dataKeys: Object.keys(context.currentState.data)
      });
    }
    
    logger.debug('🔄 Extracted available data from context', {
      contextId: context.contextId,
      totalKeys: Object.keys(aggregatedData).length,
      keys: Object.keys(aggregatedData).slice(0, 10) // Log first 10 keys to avoid spam
    });
    
    return aggregatedData;
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

  /**
   * ===============================================================================
   * AGENT-TO-ORCHESTRATOR DYNAMIC REQUESTS (MVP MESSAGE-PASSING ARCHITECTURE)
   * ===============================================================================
   * 
   * These methods implement the core MVP principle: agents communicate what they 
   * need dynamically instead of relying on pre-computed constraints and metadata.
   * 
   * This addresses the user's feedback that "agents can broadcast additional 
   * requests to the OrchestratorAgent" with a clear JSON schema.
   */

  /**
   * Request additional capabilities or assistance from the orchestrator
   * 
   * This implements the core MVP message-passing approach where agents
   * communicate their dynamic needs instead of relying on pre-computed
   * specializations, processing times, or dependencies.
   * 
   * @param taskId - The task context
   * @param request - Structured request following OrchestratorRequest schema
   */
  protected async requestOrchestratorAssistance(
    taskId: string, 
    request: OrchestratorRequest
  ): Promise<OrchestratorResponse> {
    try {
      // Record the request as a context entry for audit trail
      await this.recordContextEntry(
        { contextId: taskId } as TaskContext,
        {
          operation: 'orchestrator_assistance_requested',
          data: {
            requestType: request.type,
            priority: request.priority,
            capabilities: request.capabilities,
            constraints: request.constraints
          },
          reasoning: `Agent ${this.specializedTemplate.agent.id} requested orchestrator assistance: ${request.reason}`
        }
      );

      // Broadcast the request via the message bus
      await this.broadcastTaskEvent(taskId, {
        type: 'ORCHESTRATOR_REQUEST',
        fromAgent: this.specializedTemplate.agent.id,
        request,
        timestamp: new Date().toISOString()
      });

      // Get orchestrator instance and submit request
      const { OrchestratorAgent } = await import('../OrchestratorAgent');
      const orchestrator = OrchestratorAgent.getInstance();
      
      const response = await orchestrator.handleAgentRequest(taskId, this.specializedTemplate.agent.id, request);

      logger.info('Orchestrator assistance requested and received', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        requestType: request.type,
        responseStatus: response.status
      });

      return response;
    } catch (error) {
      logger.error('Failed to request orchestrator assistance', {
        agentId: this.specializedTemplate.agent.id,
        taskId,
        requestType: request.type,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Request additional agent capabilities for the current task
   * 
   * Example: A data collection agent realizes it needs compliance verification
   * and requests an entity compliance agent to be brought into the task.
   */
  protected async requestAdditionalAgents(
    taskId: string,
    agentIds: string[],
    reason: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<OrchestratorResponse> {
    return this.requestOrchestratorAssistance(taskId, {
      type: 'agent_capabilities',
      priority,
      reason,
      capabilities: agentIds.map(id => ({
        agentId: id,
        required: true
      }))
    });
  }

  /**
   * Request additional tools or data sources
   * 
   * Example: An agency interaction agent discovers it needs a new government
   * portal tool that wasn't pre-configured.
   */
  protected async requestAdditionalTools(
    taskId: string,
    tools: string[],
    reason: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<OrchestratorResponse> {
    return this.requestOrchestratorAssistance(taskId, {
      type: 'tool_access',
      priority,
      reason,
      tools: tools.map(tool => ({
        toolId: tool,
        required: true
      }))
    });
  }

  /**
   * Request user input or approval
   * 
   * Example: A payment agent discovers unusual payment requirements
   * and needs user confirmation before proceeding.
   */
  protected async requestUserInteraction(
    taskId: string,
    interactionType: string,
    details: any,
    reason: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<OrchestratorResponse> {
    return this.requestOrchestratorAssistance(taskId, {
      type: 'user_interaction',
      priority,
      reason,
      userInteraction: {
        type: interactionType,
        details,
        blocking: priority === 'urgent'
      }
    });
  }

  /**
   * Report constraints or blockers discovered during execution
   * 
   * Example: A legal compliance agent discovers the business entity type
   * requires additional documentation not initially anticipated.
   */
  protected async reportConstraints(
    taskId: string,
    constraints: Array<{constraint: string, impact: string, suggestedResolution?: string}>,
    reason: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<OrchestratorResponse> {
    return this.requestOrchestratorAssistance(taskId, {
      type: 'constraint_resolution',
      priority,
      reason,
      constraints: constraints.map(c => ({
        type: 'discovered_constraint',
        description: c.constraint,
        impact: c.impact,
        suggestedResolution: c.suggestedResolution
      }))
    });
  }

  /**
   * Standardized method for creating UIRequest events
   * 
   * This creates a UI_REQUEST_CREATED event with a properly structured UIRequest
   * that will be detected by StateComputer.computePendingUserInteractions()
   */
  protected async requestUserInput(
    taskContext: TaskContext,
    options: {
      templateType: string;
      title: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      fields?: any[];
      instructions?: string;
      semanticData?: Record<string, any>;
    }
  ): Promise<string> {
    const requestId = require('crypto').randomUUID();
    
    // Create UIRequest with standardized structure
    const uiRequest = {
      requestId,
      templateType: options.templateType,
      priority: options.priority || 'medium',
      semanticData: {
        title: options.title,
        instructions: options.instructions || 'Please provide the required information.',
        fields: options.fields || [],
        ...options.semanticData
      },
      createdBy: this.specializedTemplate.agent.id,
      createdAt: new Date().toISOString()
    };

    // Create UI_REQUEST_CREATED event
    const contextEntry: ContextEntry = {
      entryId: require('crypto').randomUUID(),
      timestamp: new Date().toISOString(),
      sequenceNumber: (taskContext.history?.length || 0) + 1,
      actor: {
        type: 'agent',
        id: this.specializedTemplate.agent.id,
        version: this.specializedTemplate.agent.version || '1.0.0'
      },
      operation: 'UI_REQUEST_CREATED',
      data: {
        uiRequest
      },
      reasoning: `Agent ${this.specializedTemplate.agent.id} requires user input: ${options.title}`,
      confidence: 0.9,
      trigger: {
        type: 'user_request',
        source: 'agent_request_user_input',
        details: {
          templateType: options.templateType,
          title: options.title,
          timestamp: new Date().toISOString()
        }
      }
    };

    // Record the context entry
    await this.recordContextEntry(taskContext, contextEntry);

    logger.info('UIRequest created', {
      agentId: this.specializedTemplate.agent.id,
      requestId,
      templateType: options.templateType,
      title: options.title,
      priority: options.priority
    });

    return requestId;
  }

  /**
   * Subscribe to SSE events for real-time task context updates
   * This enables agents to receive and incorporate new data while executing
   */
  protected async subscribeToContextUpdates(contextId: string): Promise<void> {
    if (this.sseUnsubscribe) {
      // Clean up existing subscription
      this.sseUnsubscribe();
    }

    // Import A2A Event Bus
    const { a2aEventBus } = await import('../../services/a2a-event-bus');
    
    const subscriberId = `${this.specializedTemplate.agent.id}-${Date.now()}`;
    
    logger.info('🔄 Subscribing to context updates', {
      agentId: this.specializedTemplate.agent.id,
      contextId,
      subscriberId
    });

    // Subscribe to task-specific events with skip history since we fetch fresh context separately
    this.sseUnsubscribe = a2aEventBus.subscribe(
      contextId,
      (event) => this.handleContextUpdateEvent(event),
      subscriberId,
      true // Skip history - we get fresh context via fetchFreshTaskContext
    );
  }

  /**
   * Handle incoming SSE context update events
   * Updates the dynamic context data that gets merged during prompt building
   */
  private handleContextUpdateEvent(event: any): void {
    logger.debug('📥 Received context update event', {
      agentId: this.specializedTemplate.agent.id,
      eventType: event.type,
      operation: event.operation,
      hasData: !!event.data
    });

    // Extract data from UI responses and agent executions
    if (event.type === 'UI_REQUEST_RESPONSE' && event.data) {
      // Merge UI response data into dynamic context
      Object.assign(this.dynamicContextData, event.data);
      
      logger.debug('🖥️ Updated context with UI response', {
        agentId: this.specializedTemplate.agent.id,
        newDataKeys: Object.keys(event.data),
        totalContextKeys: Object.keys(this.dynamicContextData).length
      });
    } else if (event.operation?.includes('agent.') && event.data?.contextUpdate?.data) {
      // Merge agent execution data into dynamic context
      Object.assign(this.dynamicContextData, event.data.contextUpdate.data);
      
      logger.debug('🤖 Updated context with agent execution data', {
        agentId: this.specializedTemplate.agent.id,
        sourceOperation: event.operation,
        newDataKeys: Object.keys(event.data.contextUpdate.data),
        totalContextKeys: Object.keys(this.dynamicContextData).length
      });
    }
  }

  /**
   * Get current dynamic context data accumulated from SSE events
   * This is used during prompt building to include real-time updates
   */
  protected getDynamicContextData(): Record<string, any> {
    return { ...this.dynamicContextData };
  }

  /**
   * Clean up SSE subscription when agent execution completes
   */
  protected unsubscribeFromContextUpdates(): void {
    if (this.sseUnsubscribe) {
      logger.info('👋 Unsubscribing from context updates', {
        agentId: this.specializedTemplate.agent.id
      });
      this.sseUnsubscribe();
      this.sseUnsubscribe = undefined;
    }
    
    // Clear dynamic context data
    this.dynamicContextData = {};
  }

}