/**
 * KnowledgeExtractionAgent
 * 
 * Analyzes completed task contexts to extract reusable business knowledge.
 * Works asynchronously after task completion to build progressive learning.
 * 
 * Part of Issue #55: Knowledge Extraction and Business Memory System
 */

import { BaseAgent } from './base/BaseAgent';
import { BusinessMemoryTool, ExtractedKnowledge } from '../tools/business-memory';
import { logger } from '../utils/logger';

export interface KnowledgeExtractionRequest {
  contextId: string;
  taskTemplateId: string;
  businessId: string;
  completedTaskData: any;
}

export interface KnowledgeExtractionResult {
  status: 'completed' | 'partial' | 'no_knowledge_found' | 'failed';
  extractedCount: number;
  averageConfidence: number;
  reasoning: string;
}

/**
 * KnowledgeExtractionAgent
 * 
 * Specialized agent for extracting and persisting business knowledge
 * from completed tasks. Has write access to BusinessMemoryTool.
 */
export class KnowledgeExtractionAgent extends BaseAgent {
  private businessMemory: BusinessMemoryTool;
  
  constructor(businessId: string, contextId: string) {
    // Load the knowledge extraction agent configuration
    super('knowledge_extraction_agent.yaml', businessId, contextId);
    
    // Initialize with write access to business memory
    this.businessMemory = new BusinessMemoryTool();
  }
  
  /**
   * Extract knowledge from a completed task
   * Called asynchronously after task completion
   */
  async extractKnowledge(request: KnowledgeExtractionRequest): Promise<KnowledgeExtractionResult> {
    try {
      logger.info('[KnowledgeExtraction] Starting knowledge extraction', {
        contextId: request.contextId,
        businessId: request.businessId,
        taskTemplateId: request.taskTemplateId
      });
      
      // Use LLM to analyze the completed task data
      const extractionPrompt = `
You are a Knowledge Extraction Agent analyzing a completed task to extract reusable business knowledge.

Task Type: ${request.taskTemplateId}
Business ID: ${request.businessId}
Completed Task Data:
${JSON.stringify(request.completedTaskData, null, 2)}

Analyze this data and extract:
1. Business facts (verified information about the business)
2. User preferences (communication style, decision patterns)
3. Behavioral patterns (if observed multiple times)
4. Business relationships (vendors, advisors, etc.)

For each piece of knowledge, determine:
- The confidence level (0.0-1.0) based on verification method
- The appropriate category (identity, structure, contact_info, operations, financial, etc.)
- Whether it should expire (temporary facts like employee count might change)

Only extract knowledge with confidence >= 0.6.
Prefer verified sources over user-provided data when available.
`;

      const response = await this.llmProvider.complete({
        prompt: extractionPrompt,
        maxTokens: 2000,
        temperature: 0.3,
        responseFormat: 'json'
      });
      
      // Parse JSON response safely
      let extractionResult: any;
      try {
        extractionResult = JSON.parse(response.content);
      } catch (error) {
        logger.warn('[KnowledgeExtraction] Failed to parse LLM response', {
          contextId: request.contextId,
          error: error instanceof Error ? error.message : String(error)
        });
        extractionResult = null;
      }
      
      if (!extractionResult || extractionResult.status === 'failed') {
        logger.warn('[KnowledgeExtraction] Failed to extract knowledge', {
          contextId: request.contextId,
          reason: extractionResult?.reasoning || 'LLM extraction failed'
        });
        
        return {
          status: 'failed',
          extractedCount: 0,
          averageConfidence: 0,
          reasoning: extractionResult?.reasoning || 'Failed to extract knowledge from task data'
        };
      }
      
      // Convert extracted knowledge to proper format for persistence
      const knowledgeItems: ExtractedKnowledge[] = [];
      
      // Process facts
      if (extractionResult.extractedKnowledge?.facts) {
        for (const fact of extractionResult.extractedKnowledge.facts) {
          knowledgeItems.push({
            businessId: request.businessId,
            knowledgeType: 'profile',
            category: fact.category,
            fieldName: fact.fieldName,
            fieldValue: fact.fieldValue,
            confidence: fact.confidence,
            sourceTaskId: request.contextId,
            verificationMethod: fact.verificationMethod,
            expiresAt: fact.ttlDays ? 
              new Date(Date.now() + fact.ttlDays * 24 * 60 * 60 * 1000) : 
              undefined
          });
        }
      }
      
      // Process preferences
      if (extractionResult.extractedKnowledge?.preferences) {
        for (const pref of extractionResult.extractedKnowledge.preferences) {
          knowledgeItems.push({
            businessId: request.businessId,
            knowledgeType: 'preference',
            category: pref.category,
            fieldName: `preference.${pref.preference}`,
            fieldValue: pref.value,
            confidence: pref.confidence,
            sourceTaskId: request.contextId
          });
        }
      }
      
      // Process patterns
      if (extractionResult.extractedKnowledge?.patterns) {
        for (const pattern of extractionResult.extractedKnowledge.patterns) {
          knowledgeItems.push({
            businessId: request.businessId,
            knowledgeType: 'pattern',
            category: 'operations', // Default category for patterns
            fieldName: `pattern.${pattern.patternType}`,
            fieldValue: {
              observation: pattern.observation,
              occurrences: pattern.occurrences
            },
            confidence: pattern.confidence,
            sourceTaskId: request.contextId
          });
        }
      }
      
      // Process relationships
      if (extractionResult.extractedKnowledge?.relationships) {
        for (const rel of extractionResult.extractedKnowledge.relationships) {
          knowledgeItems.push({
            businessId: request.businessId,
            knowledgeType: 'relationship',
            category: 'structure', // Default category for relationships
            fieldName: `relationship.${rel.relationshipType}`,
            fieldValue: {
              entityName: rel.entityName,
              role: rel.role
            },
            confidence: rel.confidence,
            sourceTaskId: request.contextId
          });
        }
      }
      
      // Persist the extracted knowledge
      if (knowledgeItems.length > 0) {
        await this.businessMemory.persistKnowledge(knowledgeItems);
        
        // Calculate average confidence
        const avgConfidence = knowledgeItems.reduce((sum, item) => sum + item.confidence, 0) / knowledgeItems.length;
        
        logger.info('[KnowledgeExtraction] Successfully persisted knowledge', {
          contextId: request.contextId,
          businessId: request.businessId,
          extractedCount: knowledgeItems.length,
          averageConfidence: avgConfidence
        });
        
        return {
          status: extractionResult.status || 'completed',
          extractedCount: knowledgeItems.length,
          averageConfidence: avgConfidence,
          reasoning: extractionResult.reasoning
        };
      } else {
        logger.info('[KnowledgeExtraction] No knowledge extracted from task', {
          contextId: request.contextId,
          businessId: request.businessId,
          reasoning: extractionResult.reasoning
        });
        
        return {
          status: 'no_knowledge_found',
          extractedCount: 0,
          averageConfidence: 0,
          reasoning: extractionResult.reasoning || 'No extractable knowledge found in task data'
        };
      }
      
    } catch (error) {
      logger.error('[KnowledgeExtraction] Error extracting knowledge', {
        contextId: request.contextId,
        businessId: request.businessId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        status: 'failed',
        extractedCount: 0,
        averageConfidence: 0,
        reasoning: `Knowledge extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}