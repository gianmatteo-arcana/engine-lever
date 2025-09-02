/**
 * Business Memory Tool
 * 
 * Provides read/write access to persistent business knowledge extracted from completed tasks.
 * Read access is available to all agents via ToolChain.
 * Write access is restricted to KnowledgeExtractionAgent.
 * 
 * Part of Issue #55: Knowledge Extraction and Business Memory System
 */

import { DatabaseService } from '../services/database';
import { logger } from '../utils/logger';

export type KnowledgeType = 'profile' | 'preference' | 'pattern' | 'relationship' | 'compliance';

export type KnowledgeCategory = 
  | 'identity' 
  | 'structure' 
  | 'contact_info' 
  | 'operations' 
  | 'financial'
  | 'compliance_status'
  | 'communication'
  | 'decision_making'
  | 'documentation';

export interface BusinessMemorySearchParams {
  businessId: string;
  categories?: KnowledgeCategory[];
  knowledgeTypes?: KnowledgeType[];
  minConfidence?: number;
  includeExpired?: boolean;
}

export interface ExtractedKnowledge {
  businessId: string;
  knowledgeType: KnowledgeType;
  category: KnowledgeCategory;
  fieldName: string;
  fieldValue: any;
  confidence: number;
  sourceTaskId?: string;
  sourceEventId?: string;
  verificationMethod?: string;
  expiresAt?: Date;
}

export interface BusinessKnowledge {
  facts: Record<string, any>;
  preferences: Record<string, any>;
  patterns: Record<string, any>;
  relationships: Record<string, any>;
  metadata: {
    lastUpdated: string;
    factCount: number;
    averageConfidence: number;
  };
}

export class BusinessMemoryTool {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Search business memory for relevant knowledge
   * Available to ALL agents via ToolChain
   */
  async searchMemory(params: BusinessMemorySearchParams): Promise<BusinessKnowledge> {
    try {
      const {
        businessId,
        categories,
        knowledgeTypes,
        minConfidence = 0.7,
        includeExpired = false
      } = params;

      logger.info('[BusinessMemory] Searching memory', {
        businessId,
        categories,
        knowledgeTypes,
        minConfidence
      });

      // Build query
      let query = this.db.getServiceClient()
        .from('business_knowledge')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .gte('confidence', minConfidence);

      // Apply filters
      if (categories && categories.length > 0) {
        query = query.in('category', categories);
      }

      if (knowledgeTypes && knowledgeTypes.length > 0) {
        query = query.in('knowledge_type', knowledgeTypes);
      }

      if (!includeExpired) {
        query = query.or('expires_at.is.null,expires_at.gt.now()');
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[BusinessMemory] Search failed', error);
        throw error;
      }

      // Organize knowledge by type
      const knowledge: BusinessKnowledge = {
        facts: {},
        preferences: {},
        patterns: {},
        relationships: {},
        metadata: {
          lastUpdated: new Date().toISOString(),
          factCount: 0,
          averageConfidence: 0
        }
      };

      if (!data || data.length === 0) {
        logger.info('[BusinessMemory] No knowledge found for business', { businessId });
        return knowledge;
      }

      // Process and organize results
      let totalConfidence = 0;
      
      for (const item of data) {
        const container = this.getKnowledgeContainer(knowledge, item.knowledge_type);
        
        // Use dot notation to set nested values
        this.setNestedValue(container, item.field_name, item.field_value);
        
        totalConfidence += item.confidence;
        knowledge.metadata.factCount++;
        
        // Track most recent update
        if (item.updated_at > knowledge.metadata.lastUpdated) {
          knowledge.metadata.lastUpdated = item.updated_at;
        }
      }

      // Calculate average confidence
      if (knowledge.metadata.factCount > 0) {
        knowledge.metadata.averageConfidence = totalConfidence / knowledge.metadata.factCount;
      }

      logger.info('[BusinessMemory] Found knowledge', {
        businessId,
        factCount: knowledge.metadata.factCount,
        averageConfidence: knowledge.metadata.averageConfidence
      });

      return knowledge;
    } catch (error) {
      logger.error('[BusinessMemory] Search error', error);
      throw error;
    }
  }

  /**
   * Persist extracted knowledge (Only KnowledgeExtractionAgent has access)
   * Handles deduplication and confidence updates
   */
  async persistKnowledge(knowledge: ExtractedKnowledge[]): Promise<void> {
    try {
      logger.info('[BusinessMemory] Persisting knowledge', {
        count: knowledge.length
      });

      for (const item of knowledge) {
        await this.upsertKnowledge(item);
      }

      logger.info('[BusinessMemory] Knowledge persisted successfully');
    } catch (error) {
      logger.error('[BusinessMemory] Persist error', error);
      throw error;
    }
  }

  /**
   * Upsert a single knowledge item
   * If the field already exists with lower confidence, update it
   * If confidence is higher, replace the existing value
   */
  private async upsertKnowledge(knowledge: ExtractedKnowledge): Promise<void> {
    const {
      businessId,
      fieldName,
      confidence
    } = knowledge;

    // Check if this field already exists
    const { data: existing } = await this.db.getServiceClient()
      .from('business_knowledge')
      .select('id, confidence')
      .eq('business_id', businessId)
      .eq('field_name', fieldName)
      .eq('is_active', true)
      .single();

    if (existing) {
      // Only update if new confidence is higher
      if (confidence > existing.confidence) {
        // Mark old record as inactive
        await this.db.getServiceClient()
          .from('business_knowledge')
          .update({ is_active: false })
          .eq('id', existing.id);

        // Insert new record
        await this.insertKnowledge(knowledge);
        
        logger.info('[BusinessMemory] Updated existing knowledge with higher confidence', {
          fieldName,
          oldConfidence: existing.confidence,
          newConfidence: confidence
        });
      } else {
        logger.info('[BusinessMemory] Skipped update - existing confidence is higher', {
          fieldName,
          existingConfidence: existing.confidence,
          newConfidence: confidence
        });
      }
    } else {
      // Insert new knowledge
      await this.insertKnowledge(knowledge);
      logger.info('[BusinessMemory] Added new knowledge', { fieldName, confidence });
    }
  }

  /**
   * Insert new knowledge record
   */
  private async insertKnowledge(knowledge: ExtractedKnowledge): Promise<void> {
    const { error } = await this.db.getServiceClient()
      .from('business_knowledge')
      .insert({
        business_id: knowledge.businessId,
        knowledge_type: knowledge.knowledgeType,
        category: knowledge.category,
        field_name: knowledge.fieldName,
        field_value: knowledge.fieldValue,
        confidence: knowledge.confidence,
        source_task_id: knowledge.sourceTaskId,
        source_event_id: knowledge.sourceEventId,
        verification_method: knowledge.verificationMethod,
        expires_at: knowledge.expiresAt,
        extracted_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Get the appropriate container based on knowledge type
   */
  private getKnowledgeContainer(knowledge: BusinessKnowledge, type: string): Record<string, any> {
    switch (type) {
      case 'profile':
        return knowledge.facts;
      case 'preference':
        return knowledge.preferences;
      case 'pattern':
        return knowledge.patterns;
      case 'relationship':
        return knowledge.relationships;
      default:
        return knowledge.facts;
    }
  }

  /**
   * Set a value using dot notation (e.g., "profile.ein" -> { profile: { ein: value } })
   */
  private setNestedValue(obj: Record<string, any>, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Clear expired knowledge entries
   * Called periodically by maintenance jobs
   */
  async clearExpiredKnowledge(): Promise<number> {
    try {
      const { data, error } = await this.db.getServiceClient()
        .from('business_knowledge')
        .update({ is_active: false })
        .lt('expires_at', new Date().toISOString())
        .eq('is_active', true)
        .select('id');

      if (error) {
        logger.error('[BusinessMemory] Failed to clear expired knowledge', error);
        throw error;
      }

      const count = data?.length || 0;
      if (count > 0) {
        logger.info('[BusinessMemory] Cleared expired knowledge', { count });
      }

      return count;
    } catch (error) {
      logger.error('[BusinessMemory] Error clearing expired knowledge', error);
      throw error;
    }
  }
}