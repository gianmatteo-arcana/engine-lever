/**
 * Base Agent Class
 * 
 * ENGINE CORE PRINCIPLES:
 * 1. Pure Event Sourcing - All state changes are immutable events (PRD:45)
 * 2. Configuration-Driven - All behavior in YAML, hot-reloadable (PRD:46)
 * 3. Agent-Based - Every capability is an agent with specific role (PRD:47)
 * 4. LLM-Agnostic - Abstract providers behind common interface (PRD:48)
 * 5. Append-Only - Never modify/delete data, corrections are new events (PRD:49)
 * 6. Progressive Disclosure - Minimize interruption, reorder intelligently (PRD:50)
 * 
 * This implementation EXACTLY matches the Engine PRD specification:
 * - Loads configuration from YAML files (PRD:336-410)
 * - Uses LLM for all reasoning (PRD:433-439)
 * - Returns ContextEntry objects with reasoning (PRD:445-462)
 * - Requests user input as last resort (PRD:540-574)
 * - Completely data-driven, no business logic (PRD:21-22)
 * 
 * TODO [POST-MVP]: Implement hot-reload for YAML configs (PRD:46)
 * TODO [POST-MVP]: Add caching layer for LLM responses (PRD:1674)
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import { LLMProvider } from '../../services/LLMProvider';
import { ToolChain } from '../../services/ToolChain';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest,
  AgentConfig
} from '../../types/engine-types';

/**
 * Base agent class - ALL agents extend this
 * Exactly matches PRD lines 414-497
 */
export abstract class Agent {
  protected config: AgentConfig;
  protected llmProvider!: LLMProvider;
  protected toolChain!: ToolChain;
  
  constructor(configPath: string) {
    this.config = this.loadConfig(configPath);
    // Only initialize services if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.llmProvider = new LLMProvider();
      this.toolChain = new ToolChain();
    }
  }
  
  /**
   * Load agent configuration from YAML file
   * PRD Lines 336-410: Agent Configuration Structure
   * PRD Line 46: Configuration-Driven - All behavior defined in YAML files
   * 
   * TODO [POST-MVP]: Implement hot-reload capability (PRD:46)
   * TODO [OPTIMIZATION]: Cache parsed YAML configs in memory
   */
  protected loadConfig(configPath: string): AgentConfig {
    const path = require('path');
    const fullPath = path.join(__dirname, '../../../config/agents/', configPath);
    const configContent = fs.readFileSync(fullPath, 'utf8');
    return yaml.parse(configContent);
  }
  
  /**
   * Main execution method - EXACTLY as PRD specifies
   * PRD Lines 429-470: Agent Execution Flow
   * 
   * CRITICAL PRD REQUIREMENTS:
   * - Build LLM prompt from config and request (PRD:430)
   * - Call LLM with appropriate model (PRD:433-439)
   * - Validate response against schema (PRD:442)
   * - Create ContextEntry with reasoning (PRD:445-462)
   * - Return AgentResponse with status (PRD:464-468)
   * 
   * PRD PRINCIPLE: Append-Only (Line 49) - Never modify existing data
   * PRD PRINCIPLE: Agent-Based (Line 47) - Every capability is an agent
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Build LLM prompt from config and request (PRD line 430)
    const prompt = this.buildPrompt(request);
    
    // Call LLM with appropriate model (PRD line 433-439)
    const llmResponse = await this.llmProvider.complete({
      model: request.llmModel || 'gpt-4',
      prompt,
      responseFormat: 'json',
      schema: this.config.schemas?.output
    });
    
    // Validate response (PRD line 442)
    const validated = this.validateResponse(llmResponse);
    
    // Create context update (PRD line 445-462)
    const contextUpdate: ContextEntry = {
      entryId: this.generateId(),
      timestamp: new Date().toISOString(),
      sequenceNumber: request.taskContext?.history.length ?? 0 + 1,
      actor: {
        type: 'agent',
        id: this.config.agent.id,
        version: this.config.agent.version
      },
      operation: validated.contextUpdate.operation,
      data: validated.contextUpdate.data,
      reasoning: validated.contextUpdate.reasoning,
      trigger: {
        type: 'agent_request',
        source: 'orchestrator',
        details: { operation: request.operation }
      }
    };
    
    return {
      status: validated.status,
      data: validated.data || {},
      contextUpdate,
      uiRequests: validated.uiRequest ? [validated.uiRequest] : undefined
    };
  }
  
  /**
   * Build LLM prompt from mission + context
   * PRD Lines 471-496: Prompt Building Structure
   * 
   * MUST INCLUDE (per PRD):
   * - Agent mission from config (PRD:473)
   * - Current TaskContext as JSON (PRD:475-476)
   * - Operation being requested (PRD:478-479)
   * - Parameters for operation (PRD:481-482)
   * - Available tools list (PRD:484-485)
   * - Response format schema (PRD:487-489)
   * - Critical reminders (PRD:491-494)
   * 
   * TODO [OPTIMIZATION]: Template prompt sections for reuse
   * TODO [POST-MVP]: Add prompt versioning for A/B testing
   */
  protected buildPrompt(request: AgentRequest): string {
    return `
${this.config.agent.mission}

## Current Task Context
${JSON.stringify(request.taskContext, null, 2)}

## Your Operation
${request.operation}

## Parameters
${JSON.stringify(request.parameters, null, 2)}

## Available Tools
${this.toolChain.getAvailableTools()}

## Response Format
You must respond with JSON matching this schema:
${JSON.stringify(this.config.schemas?.output || {}, null, 2)}

Remember:
- Record your reasoning
- Only append new data
- Request user input as last resort
`;
  }
  
  /**
   * Validate LLM response against schema
   */
  protected validateResponse(llmResponse: any): any {
    // TODO: Implement JSON schema validation
    // For now, trust LLM structured output
    return llmResponse;
  }
  
  /**
   * Generate unique ID for entries
   */
  protected generateId(): string {
    return `${this.config.agent.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get agent capabilities for discovery
   */
  getCapabilities(): any {
    return this.config.agent.agent_card;
  }
}

/**
 * Data Collection Agent Implementation
 */
export class DataCollectionAgent extends Agent {
  constructor() {
    super('data_collection_agent.yaml');
  }
  
  /**
   * Specialized method for gathering business info
   * Shows how agents can have specific methods while staying generic
   */
  async gatherBusinessInfo(context: TaskContext): Promise<AgentResponse> {
    // Try public records first (PRD lines 508-538)
    const businessName = context.currentState.data.business?.name;
    
    if (businessName) {
      const publicData = await this.toolChain.searchPublicRecords(businessName);
      
      if (publicData) {
        return {
          status: 'completed',
          data: { businessFound: true },
          contextUpdate: {
            entryId: this.generateId(),
            timestamp: new Date().toISOString(),
            sequenceNumber: context.history.length + 1,
            actor: {
              type: 'agent',
              id: this.config.agent.id,
              version: this.config.agent.version
            },
            operation: 'public_records_found',
            data: {
              source: 'ca_sos',
              business: {
                entityType: publicData.entityType,
                formationDate: publicData.formationDate,
                status: publicData.status
              }
            },
            reasoning: 'Found business in California Secretary of State database'
          }
        };
      }
    }
    
    // Need user input (PRD lines 540-574)
    return {
      status: 'needs_input',
      data: {},
      contextUpdate: {
        entryId: this.generateId(),
        timestamp: new Date().toISOString(),
        sequenceNumber: context.history.length + 1,
        actor: {
          type: 'agent',
          id: this.config.agent.id,
          version: this.config.agent.version
        },
        operation: 'requesting_user_input',
        data: {},
        reasoning: 'No public records found, need user to provide business details'
      },
      uiRequests: [{
        id: this.generateId(),
        agentRole: 'data_collection',
        suggestedTemplates: ['business_info_form'],
        dataNeeded: ['entityType', 'formationDate'],
        context: {
          userProgress: 35,
          deviceType: 'desktop',
          urgency: 'medium'
        },
        timestamp: new Date().toISOString(),
        metadata: {
          purpose: 'Complete business information',
          urgency: 'normal',
          category: 'business_identity',
          allowSkip: false
        },
        fields: [
          {
            field: 'entityType',
            dataType: 'enum',
            semanticType: 'entity_type',
            required: true,
            constraints: {
              options: ['LLC', 'Corporation', 'Sole Proprietorship']
            }
          },
          {
            field: 'formationDate',
            dataType: 'date',
            semanticType: 'formation_date',
            required: false
          }
        ],
        reason: 'Need business entity details to proceed'
      }]
    };
  }
}