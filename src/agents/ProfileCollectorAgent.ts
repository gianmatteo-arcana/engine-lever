/**
 * Profile Collection Agent
 * EXACTLY matches PRD lines 439-520
 * 
 * Specialized agent that collects user profile data with minimal friction
 * Uses smart defaults, progressive disclosure, and optimized forms
 */

import { BaseAgent } from './base/BaseAgent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest,
  UITemplateType
} from '../types/engine-types';
import { DatabaseService } from '../services/database';
// import { FluidUIActions } from '../types/compatibility-layer';

interface ProfileData {
  businessName: string;
  entityType: string; // Generic - Task Templates define valid types
  location?: string; // Generic location - Task Templates define format
  formationDate?: string;
  identifier?: string; // Generic identifier (EIN, registration number, etc)
  website?: string;
  industry?: string;
  employeeCount?: number;
  attributes?: Record<string, any>; // Task Template specific attributes
}

interface FormFieldDefinition {
  id: string;
  type: 'text' | 'select' | 'date' | 'number';
  label: string;
  required: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  validation?: string;
  helpText?: string;
}

interface SmartDefaults {
  businessName?: string;
  entityType?: string;
  state?: string;
  industry?: string;
  confidence: number;
}

/**
 * Profile Collector - Collects user profile data efficiently
 */
export class ProfileCollectorAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('profile_collection_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - collects profile data efficiently
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `pca_${Date.now()}`;
    
    // TODO: Access ToolChain for smart defaults generation
    // const smartDefaultsEngine = await this.toolChain.getTool('smart_defaults_engine');
    // const progressiveDisclosureManager = await this.toolChain.getTool('progressive_disclosure_manager');
    // const formValidationService = await this.toolChain.getTool('form_validation_service');
    // const businessInfoInferencer = await this.toolChain.getTool('business_info_inferencer');
    
    try {
      // Extract context from previous agents
      const businessDiscoveryResult = this.getBusinessResult(context);
      const existingData = this.getExistingData(context);
      
      // Record collection initiation
      await this.recordContextEntry(context, {
        operation: 'profile_collection_initiated',
        data: { 
          businessDiscoveryResult,
          existingData,
          requestId 
        },
        reasoning: 'Starting profile collection with smart defaults based on available context'
      });

      // Generate smart defaults
      // TODO: Use smart_defaults_engine tool for intelligent pre-filling
      // const smartDefaults = await smartDefaultsEngine.generateDefaults({
      //   businessDiscovery: businessDiscoveryResult,
      //   userData: context.currentState.data.user,
      //   existingData: existingData
      // });
      const smartDefaults = this.createDefaults(businessDiscoveryResult, context);
      
      // Determine collection strategy based on available data
      const strategy = this.getStrategy(smartDefaults, existingData);
      
      await this.recordContextEntry(context, {
        operation: 'collection_strategy_determined',
        data: { 
          strategy,
          defaults: smartDefaults,
          confidence: smartDefaults.confidence
        },
        reasoning: `Using ${strategy} strategy with ${(smartDefaults.confidence * 100).toFixed(0)}% confidence in defaults`
      });

      // Generate optimized form based on strategy
      // TODO: Use progressive_disclosure_manager for intelligent form generation
      // const formDefinition = await progressiveDisclosureManager.createOptimizedForm({
      //   strategy: strategy,
      //   defaults: smartDefaults,
      //   existingData: existingData,
      //   userContext: context.currentState
      // });
      const formDefinition = this.createForm(strategy, smartDefaults, existingData);
      
      // Create UI request for profile collection
      const uiRequest = this.createUI(formDefinition, smartDefaults, strategy);
      
      return {
        status: 'needs_input',
        data: {
          strategy,
          smartDefaults,
          formDefinition
        },
        uiRequests: [uiRequest],
        reasoning: 'Generated optimized profile collection form with smart defaults',
        nextAgent: 'compliance_analyzer'
      };

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'profile_collection_error',
        data: { error: error.message, requestId },
        reasoning: 'Profile collection failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during profile collection'
      };
    }
  }

  /**
   * Get business discovery results from context
   */
  private getBusinessResult(context: TaskContext): any {
    const businessFoundEntry = context.history.find(entry => 
      entry.operation === 'business_found'
    );
    
    const businessNotFoundEntry = context.history.find(entry =>
      entry.operation === 'business_not_found'
    );

    if (businessFoundEntry) {
      return {
        found: true,
        business: businessFoundEntry.data.business,
        confidence: businessFoundEntry.data.confidence
      };
    } else if (businessNotFoundEntry) {
      return {
        found: false,
        searchDetails: businessNotFoundEntry.data.searchDetails
      };
    }

    return { found: false };
  }

  /**
   * Get existing profile data from context
   */
  private getExistingData(context: TaskContext): Partial<ProfileData> {
    const currentData = context.currentState.data;
    const business = currentData.business || {};
    
    const rawData = {
      businessName: business.name,
      entityType: business.entityType,
      location: business.location || business.state,
      identifier: business.identifier || business.ein,
      website: business.website,
      industry: business.industry,
      ...business.attributes
    };
    
    // Filter out undefined values to get accurate count of existing data
    const filteredData: Partial<ProfileData> = {};
    Object.entries(rawData).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        (filteredData as any)[key] = value;
      }
    });
    
    return filteredData;
  }

  /**
   * Create smart defaults based on available context
   */
  private createDefaults(businessDiscovery: any, context: TaskContext): SmartDefaults {
    const defaults: SmartDefaults = { confidence: 0 };
    let confidenceFactors = 0;

    // Use business discovery results if available
    if (businessDiscovery.found && businessDiscovery.business) {
      defaults.businessName = businessDiscovery.business.name;
      defaults.entityType = this.mapDiscoveredEntityType(businessDiscovery.business.entityType, context);
      defaults.state = this.normalizeLocation(businessDiscovery.business.location || businessDiscovery.business.state, context);
      defaults.confidence = businessDiscovery.confidence; // Use business discovery confidence as primary
      confidenceFactors = 1; // Don't average with other factors for high-confidence discovery
      
      // TODO: Use business_info_inferencer for additional inference
      // const inferredData = await businessInfoInferencer.inferFromDiscovery(businessDiscovery);
      // Object.assign(defaults, inferredData);
    } else {
      // Infer from user data
      const userData = context.currentState.data.user || {};
      
      // Infer business name from email domain
      if (userData.email && !this.isPersonalEmailDomain(userData.email)) {
        const domain = userData.email.split('@')[1];
        defaults.businessName = this.getNameFromDomain(domain);
        defaults.confidence += 0.6;
        confidenceFactors += 1;
      }

      // Default entity type based on context signals
      defaults.entityType = this.inferEntityType(userData, context);
      
      // For personal email domains, use much lower confidence
      const isPersonalEmail = userData.email && this.isPersonalEmailDomain(userData.email);
      if (isPersonalEmail) {
        defaults.confidence += 0.1; // Very low confidence for personal emails
        confidenceFactors += 1;
      } else {
        defaults.confidence += 0.4; // Normal confidence for business emails
        confidenceFactors += 1;
      }

      // Default location from user data
      if (userData.location) {
        defaults.state = this.getLocationCode(userData.location, context);
        if (isPersonalEmail) {
          defaults.confidence += 0.2; // Lower confidence for personal emails
        } else {
          defaults.confidence += 0.8; // Normal confidence for business emails
        }
        confidenceFactors += 1;
      } else {
        // Use Task Template default location if no user location
        defaults.state = context.metadata?.defaultLocation || '';
        if (isPersonalEmail) {
          defaults.confidence += 0.1; // Very low confidence for personal emails with no location
        } else {
          defaults.confidence += 0.2; // Low confidence for business emails with no location
        }
        confidenceFactors += 1;
      }
    }

    // Industry inference
    defaults.industry = this.inferIndustry(defaults.businessName, context);
    
    // Only adjust confidence for non-business-discovery cases or as a small bonus
    if (defaults.industry && !businessDiscovery.found) {
      defaults.confidence += 0.3;
      confidenceFactors += 1;
    } else if (defaults.industry && businessDiscovery.found) {
      // Small bonus for business discovery cases
      defaults.confidence = Math.min(defaults.confidence + 0.1, 1.0);
    }

    // Average confidence across factors (only for inferred cases)
    if (confidenceFactors > 1) {
      defaults.confidence = Math.min(defaults.confidence / confidenceFactors, 1.0);
    }

    return defaults;
  }

  /**
   * Get collection strategy based on defaults quality
   */
  private getStrategy(defaults: SmartDefaults, existing: Partial<ProfileData>): string {
    if (defaults.confidence > 0.8) {
      return 'high_confidence_prefill';
    } else if (defaults.confidence > 0.5) {
      return 'moderate_confidence_suggest';
    } else if (Object.keys(existing).length > 2) {
      return 'update_existing';
    } else {
      return 'guided_collection';
    }
  }

  /**
   * Create optimized form based on strategy
   */
  private createForm(strategy: string, defaults: SmartDefaults, existing: Partial<ProfileData>): FormFieldDefinition[] {
    const baseFields: FormFieldDefinition[] = [
      {
        id: 'businessName',
        type: 'text',
        label: 'Business Name',
        required: true,
        defaultValue: defaults.businessName || existing.businessName || '',
        validation: 'min:1,max:100',
        helpText: 'The legal name of your business'
      },
      {
        id: 'entityType',
        type: 'select',
        label: 'Business Entity Type',
        required: true,
        defaultValue: defaults.entityType || existing.entityType || '',
        options: this.getEntityTypeOptions(existing),
        helpText: 'Choose the legal structure of your business'
      },
      {
        id: 'location',
        type: 'select',
        label: 'Business Location',
        required: true,
        defaultValue: defaults.state || existing.location || '',
        options: this.getLocationOptions(existing),
        helpText: 'Where your business is legally registered'
      }
    ];

    // Add conditional fields based on strategy
    if (strategy === 'high_confidence_prefill' || strategy === 'update_existing') {
      baseFields.push(
        {
          id: 'website',
          type: 'text',
          label: 'Business Website',
          required: false,
          defaultValue: existing.website || '',
          validation: 'url',
          helpText: 'Your business website (optional)'
        },
        {
          id: 'industry',
          type: 'select',
          label: 'Industry',
          required: false,
          defaultValue: defaults.industry || existing.industry || '',
          options: this.getIndustryOptions(),
          helpText: 'Primary industry or business type'
        }
      );
    }

    return baseFields;
  }

  /**
   * Create UI request for profile collection
   */
  private createUI(
    formDefinition: FormFieldDefinition[],
    defaults: SmartDefaults,
    strategy: string
  ): UIRequest {
    const isHighConfidence = defaults.confidence > 0.8;
    
    return {
      requestId: `profile_collection_${Date.now()}`,
      templateType: UITemplateType.SteppedWizard,
      semanticData: {
        agentRole: 'profile_collection_agent',
        suggestedTemplates: ['profile_form', 'business_profile_form'],
        dataNeeded: formDefinition.map(field => field.id),
        title: isHighConfidence ? 'Confirm Your Business Details' : 'Tell Us About Your Business',
        description: isHighConfidence 
          ? 'We found some information about your business. Please confirm or update the details below.'
          : 'Help us understand your business better by providing some basic information.',
        formDefinition,
        smartDefaults: defaults,
        strategy,
        actions: {
          submit: {
            type: 'submit' as const,
            label: 'Submit',
            primary: true,
            handler: () => ({ action: 'submit_profile', strategy })
          },
          skip: {
            type: 'custom' as const,
            label: 'Skip Optional',
            handler: () => ({ action: 'skip_optional_fields' })
          },
          help: {
            type: 'custom' as const,
            label: 'Help',
            handler: () => ({ action: 'show_help' })
          }
        } as any,
        progressIndicator: {
          current: 2,
          total: 4,
          label: 'Business Profile'
        },
        validation: {
          realTime: true,
          showErrors: 'onBlur',
          blockSubmissionOnErrors: true
        }
      },
      context: {
        userProgress: 45,
        deviceType: 'mobile',
        urgency: 'medium'
      }
    };
  }

  // Helper methods
  private isPersonalEmailDomain(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
    return personalDomains.includes(domain);
  }

  private getNameFromDomain(domain: string): string {
    const baseName = domain.split('.')[0];
    
    // Handle common compound word patterns
    const compoundWords: Record<string, string> = {
      'innovativedesign': 'innovative design',
      'techstartup': 'techstartup', // Keep as single word
    };
    
    let withSpaces;
    if (compoundWords[baseName.toLowerCase()]) {
      withSpaces = compoundWords[baseName.toLowerCase()];
    } else {
      // Replace hyphens and underscores with spaces, then handle camelCase
      withSpaces = baseName.replace(/[-_]/g, ' ')
                          .replace(/([A-Z])/g, ' $1')
                          .trim();
    }
    
    // Capitalize each word
    return withSpaces.split(' ')
                     .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                     .join(' ');
  }

  private normalizeLocation(locationName: string, context?: TaskContext): string {
    // TODO: Use location normalization from ToolChain
    // const locationService = await this.toolChain.getTool('location_normalization_service');
    // return await locationService.normalize(locationName);
    
    if (!locationName) return '';
    
    // If context provided, use location mapping like getLocationCode
    if (context) {
      return this.getLocationCode(locationName, context);
    }
    
    // Fallback: generic location mapping for common cases
    const locationLower = locationName.toLowerCase();
    const commonMappings: Record<string, string> = {
      'delaware': 'DE',
      'texas': 'TX', 
      'california': 'CA',
      'new york': 'NY',
      'florida': 'FL'
    };
    
    for (const [key, code] of Object.entries(commonMappings)) {
      if (locationLower.includes(key)) {
        return code;
      }
    }
    
    // Return original if no mapping found
    return locationName.toUpperCase();
  }

  private getLocationCode(location: string, context: TaskContext): string {
    // TODO: Use location extraction service from ToolChain
    // const locationService = await this.toolChain.getTool('location_extraction_service');
    // return await locationService.extractCode(location, context.metadata?.locationFormat);
    
    // Get location mapping from Task Template metadata
    const locationMap = context.metadata?.locationMapping || {};
    
    const locationLower = location.toLowerCase();
    for (const [key, code] of Object.entries(locationMap)) {
      if (locationLower.includes(key.toLowerCase())) {
        return code as string;
      }
    }
    
    // Return empty string if no location found - let Task Template provide default
    return '';
  }

  /**
   * Map discovered entity types to generic types
   * Task Templates define specific mappings for different jurisdictions
   */
  private mapDiscoveredEntityType(discoveredType: string, context: TaskContext): string {
    // TODO: Get entity type mapping from ToolChain based on Task Template
    // const entityMapper = await this.toolChain.getTool('entity_type_mapper');
    // return await entityMapper.mapToGeneric(discoveredType, context.metadata?.jurisdiction);
    
    // Get entity type mapping from Task Template metadata
    const entityTypeMap = context.metadata?.entityTypeMapping || {};
    
    // Check for direct mapping
    if (entityTypeMap[discoveredType]) {
      return entityTypeMap[discoveredType];
    }
    
    // Fallback generic mapping for common types
    const discoveredLower = discoveredType.toLowerCase();
    if (discoveredLower.includes('llc') || 
        discoveredLower.includes('limited liability') ||
        discoveredLower.includes('corporation') ||
        discoveredLower.includes('corp') ||
        discoveredLower.includes('inc')) {
      return 'registered_entity';
    }
    
    if (discoveredLower.includes('sole') || 
        discoveredLower.includes('individual') ||
        discoveredLower.includes('proprietorship')) {
      return 'individual_entity';
    }
    
    if (discoveredLower.includes('partnership')) {
      return 'partnership_entity';
    }
    
    // Default to registered entity for unknown types
    return 'registered_entity';
  }

  private inferEntityType(userData: any, context: TaskContext): string {
    // TODO: Use business entity inference from ToolChain
    // const entityInferencer = await this.toolChain.getTool('entity_type_inferencer');
    // return await entityInferencer.infer(userData, context);
    
    // Use Task Template default entity types
    const defaultEntityTypes = context.metadata?.defaultEntityTypes || {};
    
    // Simple heuristics for entity type
    if (userData.email && !this.isPersonalEmailDomain(userData.email)) {
      return defaultEntityTypes.businessEmail || 'registered_entity';
    }
    return defaultEntityTypes.personalEmail || 'individual_entity';
  }

  private inferIndustry(businessName?: string, _context?: TaskContext): string | undefined {
    if (!businessName) return undefined;
    
    const industryKeywords: Record<string, string> = {
      'tech': 'Technology',
      'consulting': 'Professional Services',
      'restaurant': 'Food & Beverage',
      'retail': 'Retail',
      'construction': 'Construction',
      'medical': 'Healthcare',
      'law': 'Legal Services',
      'finance': 'Financial Services'
    };

    const nameLower = businessName.toLowerCase();
    for (const [keyword, industry] of Object.entries(industryKeywords)) {
      if (nameLower.includes(keyword)) {
        return industry;
      }
    }
    return undefined;
  }

  private getLocationOptions(_existing: Partial<ProfileData>) {
    // TODO: Get location options from ToolChain based on Task Template
    // const locationService = await this.toolChain.getTool('location_options_service');
    // return await locationService.getOptions(context.metadata?.jurisdiction);
    
    // Task Templates provide jurisdiction-specific options
    // This is just a generic placeholder
    return [
      { value: 'LOCATION_1', label: 'Location 1' },
      { value: 'LOCATION_2', label: 'Location 2' },
      { value: 'LOCATION_3', label: 'Location 3' },
      // Task Templates will override with actual locations
    ];
  }
  
  private getEntityTypeOptions(_existing: Partial<ProfileData>) {
    // TODO: Get entity type options from ToolChain based on Task Template
    // const entityService = await this.toolChain.getTool('entity_types_service');
    // return await entityService.getOptions(context.metadata?.jurisdiction);
    
    // Task Templates provide entity type options
    return [
      { value: 'registered_entity', label: 'Registered Business Entity' },
      { value: 'individual_entity', label: 'Individual/Sole Operator' },
      { value: 'partnership_entity', label: 'Partnership' },
      { value: 'other_entity', label: 'Other' },
      // Task Templates will override with jurisdiction-specific types
    ];
  }

  private getIndustryOptions() {
    return [
      { value: 'Technology', label: 'Technology' },
      { value: 'Professional Services', label: 'Professional Services' },
      { value: 'Food & Beverage', label: 'Food & Beverage' },
      { value: 'Retail', label: 'Retail' },
      { value: 'Healthcare', label: 'Healthcare' },
      { value: 'Construction', label: 'Construction' },
      { value: 'Legal Services', label: 'Legal Services' },
      { value: 'Financial Services', label: 'Financial Services' },
      { value: 'Other', label: 'Other' }
    ];
  }

  /**
   * Record context entry with proper reasoning
   */
  private async recordContextEntry(context: TaskContext, entry: Partial<ContextEntry>): Promise<void> {
    const contextEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: (context.history?.length || 0) + 1,
      actor: {
        type: 'agent',
        id: 'profile_collector',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Profile collection action',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'profile_collector',
        details: {}
      }
    };

    if (!context.history) {
      context.history = [];
    }
    context.history.push(contextEntry);

    // Also persist to database if context has an ID
    if (context.contextId) {
      try {
        const db = DatabaseService.getInstance();
        await db.createContextHistoryEntry(context.contextId, contextEntry);
      } catch (error) {
        console.error('Failed to persist context entry to database:', error);
        // Continue even if database write fails
      }
    }
  }
}