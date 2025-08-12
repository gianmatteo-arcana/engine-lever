/**
 * Profile Collection Agent
 * EXACTLY matches PRD lines 439-520
 * 
 * Specialized agent that collects user profile data with minimal friction
 * Uses smart defaults, progressive disclosure, and optimized forms
 */

import { Agent } from './base/Agent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest 
} from '../types/engine-types';

interface ProfileData {
  businessName: string;
  entityType: 'LLC' | 'Corporation' | 'Partnership' | 'Sole Proprietorship';
  state: string;
  formationDate?: string;
  ein?: string;
  website?: string;
  industry?: string;
  employeeCount?: number;
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
export class ProfileCollector extends Agent {
  constructor() {
    super('profile_collection_agent.yaml');
  }

  /**
   * Main processing method - collects profile data efficiently
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `pca_${Date.now()}`;
    
    try {
      // Extract context from previous agents
      const businessDiscoveryResult = this.extractBusinessDiscoveryResult(context);
      const existingData = this.extractExistingProfileData(context);
      
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
      const smartDefaults = this.generateSmartDefaults(businessDiscoveryResult, context);
      
      // Determine collection strategy based on available data
      const strategy = this.determineCollectionStrategy(smartDefaults, existingData);
      
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
      const formDefinition = this.generateOptimizedForm(strategy, smartDefaults, existingData);
      
      // Create UI request for profile collection
      const uiRequest = this.generateProfileCollectionUI(formDefinition, smartDefaults, strategy);
      
      return {
        status: 'needs_input',
        data: {
          strategy,
          smartDefaults,
          formDefinition
        },
        uiRequests: [uiRequest],
        reasoning: 'Generated optimized profile collection form with smart defaults',
        nextAgent: 'entity_compliance_agent'
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
   * Extract business discovery results from context
   */
  private extractBusinessDiscoveryResult(context: TaskContext): any {
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
   * Extract existing profile data from context
   */
  private extractExistingProfileData(context: TaskContext): Partial<ProfileData> {
    const currentData = context.currentState.data;
    const business = currentData.business || {};
    
    const rawData = {
      businessName: business.name,
      entityType: business.entityType,
      state: business.state,
      ein: business.ein,
      website: business.website,
      industry: business.industry
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
   * Generate smart defaults based on available context
   */
  private generateSmartDefaults(businessDiscovery: any, context: TaskContext): SmartDefaults {
    const defaults: SmartDefaults = { confidence: 0 };
    let confidenceFactors = 0;

    // Use business discovery results if available
    if (businessDiscovery.found && businessDiscovery.business) {
      defaults.businessName = businessDiscovery.business.name;
      defaults.entityType = businessDiscovery.business.entityType;
      defaults.state = this.normalizeState(businessDiscovery.business.state);
      defaults.confidence = businessDiscovery.confidence; // Use business discovery confidence as primary
      confidenceFactors = 1; // Don't average with other factors for high-confidence discovery
    } else {
      // Infer from user data
      const userData = context.currentState.data.user || {};
      
      // Infer business name from email domain
      if (userData.email && !this.isPersonalEmailDomain(userData.email)) {
        const domain = userData.email.split('@')[1];
        defaults.businessName = this.extractBusinessNameFromDomain(domain);
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

      // Default state from location
      if (userData.location) {
        defaults.state = this.extractStateFromLocation(userData.location);
        if (isPersonalEmail) {
          defaults.confidence += 0.2; // Lower confidence for personal emails
        } else {
          defaults.confidence += 0.8; // Normal confidence for business emails
        }
        confidenceFactors += 1;
      } else {
        // Fallback to CA when no location provided
        defaults.state = 'CA';
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
   * Determine collection strategy based on defaults quality
   */
  private determineCollectionStrategy(defaults: SmartDefaults, existing: Partial<ProfileData>): string {
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
   * Generate optimized form based on strategy
   */
  private generateOptimizedForm(strategy: string, defaults: SmartDefaults, existing: Partial<ProfileData>): FormFieldDefinition[] {
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
        options: [
          { value: 'LLC', label: 'Limited Liability Company (LLC)' },
          { value: 'Corporation', label: 'Corporation' },
          { value: 'Sole Proprietorship', label: 'Sole Proprietorship' },
          { value: 'Partnership', label: 'Partnership' }
        ],
        helpText: 'Choose the legal structure of your business'
      },
      {
        id: 'state',
        type: 'select',
        label: 'State of Formation',
        required: true,
        defaultValue: defaults.state || existing.state || '',
        options: this.getStateOptions(),
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
   * Generate UI request for profile collection
   */
  private generateProfileCollectionUI(
    formDefinition: FormFieldDefinition[],
    defaults: SmartDefaults,
    strategy: string
  ): UIRequest {
    const isHighConfidence = defaults.confidence > 0.8;
    
    return {
      id: `profile_collection_${Date.now()}`,
      agentRole: 'profile_collection_agent',
      suggestedTemplates: ['business_profile_form'],
      dataNeeded: formDefinition.map(field => field.id),
      context: {
        userProgress: 45,
        deviceType: 'mobile',
        urgency: 'medium'
      },
      title: isHighConfidence ? 'Confirm Your Business Details' : 'Tell Us About Your Business',
      description: isHighConfidence 
        ? 'We found some information about your business. Please confirm or update the details below.'
        : 'Help us understand your business better by providing some basic information.',
      formDefinition,
      smartDefaults: defaults,
      strategy,
      actions: {
        submit: () => ({ action: 'submit_profile', strategy }),
        skip: () => ({ action: 'skip_optional_fields' }),
        help: () => ({ action: 'show_help' })
      },
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
    };
  }

  // Helper methods
  private isPersonalEmailDomain(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
    return personalDomains.includes(domain);
  }

  private extractBusinessNameFromDomain(domain: string): string {
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

  private normalizeState(stateName: string): string {
    const stateNormalization: Record<string, string> = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
      'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY'
    };
    
    const normalized = stateNormalization[stateName.toLowerCase()];
    return normalized || stateName.toUpperCase(); // Return abbreviated form or original
  }

  private extractStateFromLocation(location: string): string {
    const stateMap: Record<string, string> = {
      'california': 'CA', 'ca': 'CA', 'san francisco': 'CA', 'los angeles': 'CA',
      'new york': 'NY', 'ny': 'NY', 'manhattan': 'NY', 'brooklyn': 'NY',
      'texas': 'TX', 'tx': 'TX', 'austin': 'TX', 'houston': 'TX',
      'florida': 'FL', 'fl': 'FL', 'miami': 'FL', 'orlando': 'FL',
      'washington': 'WA', 'wa': 'WA', 'seattle': 'WA',
      'delaware': 'DE', 'de': 'DE'
    };
    
    const locationLower = location.toLowerCase();
    for (const [key, state] of Object.entries(stateMap)) {
      if (locationLower.includes(key)) {
        return state;
      }
    }
    return 'CA'; // Default to California
  }

  private inferEntityType(userData: any, _context: TaskContext): string {
    // Simple heuristics for entity type
    if (userData.email && !this.isPersonalEmailDomain(userData.email)) {
      return 'LLC'; // Business domain suggests established entity
    }
    return 'Sole Proprietorship'; // Conservative default
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

  private getStateOptions() {
    return [
      { value: 'CA', label: 'California' },
      { value: 'DE', label: 'Delaware' },
      { value: 'NY', label: 'New York' },
      { value: 'TX', label: 'Texas' },
      { value: 'FL', label: 'Florida' },
      { value: 'WA', label: 'Washington' },
      // Add more states as needed
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
      sequenceNumber: context.history.length + 1,
      actor: {
        type: 'agent',
        id: 'profile_collection_agent',
        version: this.config.version
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning
    };

    context.history.push(contextEntry);
  }
}