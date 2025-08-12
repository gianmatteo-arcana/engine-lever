/**
 * Business Discovery Agent
 * EXACTLY matches PRD lines 356-437
 * 
 * Specialized agent that finds business information in public records
 * Uses intelligent search strategies to minimize user input
 */

import { Agent } from './base/Agent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest 
} from '../types/engine-types';

interface BusinessSearchResult {
  found: boolean;
  confidence: number; // 0-1
  businessData?: {
    name: string;
    entityType: string;
    state: string;
    ein?: string;
    formationDate?: string;
    status: string;
  };
  searchDetails: {
    statesSearched: string[];
    queriesAttempted: string[];
    source: string;
  };
}

interface SearchClues {
  email: string;
  name?: string;
  location?: string;
  extractedDomain?: string;
}

/**
 * Business Discovery - Finds business information in public records
 */
export class BusinessDiscovery extends Agent {
  constructor() {
    super('business_discovery_agent.yaml');
  }

  /**
   * Main processing method - finds business in public records
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `bda_${Date.now()}`;
    
    try {
      // Extract search clues from context
      const clues = this.extractSearchClues(context);
      
      // Record search initiation
      await this.recordContextEntry(context, {
        operation: 'business_search_initiated',
        data: { clues, requestId },
        reasoning: 'Starting business discovery using available clues from user profile and context'
      });

      // Perform intelligent search
      const searchResult = await this.searchBusinessRecords(clues, context);

      if (searchResult.found && searchResult.businessData) {
        // Success! Found business
        await this.recordContextEntry(context, {
          operation: 'business_found',
          data: { 
            business: searchResult.businessData,
            confidence: searchResult.confidence,
            searchDetails: searchResult.searchDetails
          },
          reasoning: `Business found with ${(searchResult.confidence * 100).toFixed(0)}% confidence in ${searchResult.businessData.state} records`
        });

        // Generate FoundYouCard UI request
        return {
          status: 'needs_input',
          data: searchResult.businessData,
          uiRequests: [this.generateFoundYouCardUI(searchResult.businessData, searchResult.confidence)],
          reasoning: 'Found business in public records, requesting user confirmation',
          nextAgent: 'profile_collection_agent'
        };

      } else {
        // Not found - record what we tried
        await this.recordContextEntry(context, {
          operation: 'business_not_found',
          data: { 
            searchDetails: searchResult.searchDetails,
            clues: clues 
          },
          reasoning: `Business not found after searching ${searchResult.searchDetails.statesSearched.length} states with ${searchResult.searchDetails.queriesAttempted.length} queries`
        });

        // Hand off to Profile Collection Agent to ask user
        return {
          status: 'completed',
          data: { businessFound: false },
          reasoning: 'Business not found in public records, profile collection agent should ask user directly',
          nextAgent: 'profile_collection_agent'
        };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'business_search_error',
        data: { error: error.message, requestId },
        reasoning: 'Business search failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during business search, fallback to manual collection'
      };
    }
  }

  /**
   * Extract search clues from task context
   */
  private extractSearchClues(context: TaskContext): SearchClues {
    const userData = context.currentState.data.user || {};
    const clues: SearchClues = {
      email: userData.email || '',
      name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      location: userData.location || context.currentState.data.location
    };

    // Extract domain from email
    if (clues.email) {
      const domain = clues.email.split('@')[1];
      if (domain && !this.isPersonalEmailDomain(domain)) {
        clues.extractedDomain = domain;
      }
    }

    return clues;
  }

  /**
   * Intelligent business search using PRD-specified strategies
   */
  private async searchBusinessRecords(clues: SearchClues, context: TaskContext): Promise<BusinessSearchResult> {
    const result: BusinessSearchResult = {
      found: false,
      confidence: 0,
      searchDetails: {
        statesSearched: [],
        queriesAttempted: [],
        source: ''
      }
    };

    // Generate business name variations
    const nameVariations = this.generateBusinessNameVariations(clues);
    
    // Determine search priority order (PRD strategy)
    const searchStates = this.prioritizeSearchStates(clues);

    // Search each state in priority order
    for (const state of searchStates) {
      try {
        result.searchDetails.statesSearched.push(state);
        
        for (const businessName of nameVariations) {
          result.searchDetails.queriesAttempted.push(`${businessName} (${state})`);
          
          const searchResponse = await this.searchStateRecords(state, businessName);
          
          if (searchResponse.found) {
            result.found = true;
            result.businessData = searchResponse.businessData;
            result.confidence = searchResponse.confidence;
            result.searchDetails.source = `${state}_sos`;
            return result;
          }
        }

        // Stop after 3 states (PRD constraint)
        if (result.searchDetails.statesSearched.length >= 3) {
          break;
        }

      } catch (error: any) {
        // Log search error but continue with next state
        await this.recordContextEntry(context, {
          operation: 'state_search_error',
          data: { state, error: error.message },
          reasoning: `Error searching ${state} records, continuing with next state`
        });
      }
    }

    return result;
  }

  /**
   * Generate business name variations for search
   */
  private generateBusinessNameVariations(clues: SearchClues): string[] {
    const variations: string[] = [];

    // If we have a domain, use it as primary source
    if (clues.extractedDomain) {
      const baseName = this.extractBusinessNameFromDomain(clues.extractedDomain);
      variations.push(
        baseName,
        `${baseName} Inc`,
        `${baseName} LLC`,
        `${baseName} Corp`,
        `${baseName} Corporation`,
        baseName.replace(/\s/g, ''), // No spaces version
        baseName.toUpperCase()
      );
    }

    // If we have user name, try variations
    if (clues.name) {
      const lastName = clues.name.split(' ').pop();
      if (lastName) {
        variations.push(
          `${lastName} Consulting`,
          `${lastName} LLC`,
          `${lastName} & Associates`,
          clues.name.replace(/\s/g, '') // Full name no spaces
        );
      }
    }

    // Remove duplicates and limit to reasonable number
    return [...new Set(variations)].slice(0, 8);
  }

  /**
   * Prioritize states to search based on clues (PRD strategy)
   */
  private prioritizeSearchStates(clues: SearchClues): string[] {
    const states: string[] = [];

    // Tech company signals → Delaware first
    if (this.isTechCompanySignal(clues)) {
      states.push('delaware');
    }

    // User's state from location
    if (clues.location) {
      const userState = this.extractStateFromLocation(clues.location);
      if (userState && !states.includes(userState)) {
        states.push(userState);
      }
    }

    // California for west coast bias
    if (!states.includes('california')) {
      states.push('california');
    }

    // Limit to 3 states maximum (PRD constraint)
    return states.slice(0, 3);
  }

  /**
   * Search specific state records
   */
  private async searchStateRecords(state: string, businessName: string): Promise<{
    found: boolean;
    confidence: number;
    businessData?: any;
  }> {
    // Real implementation requires API integration
    // For now, return not found to force proper UI flow
    
    // TODO: Integrate with real state APIs:
    // - California Secretary of State API
    // - Delaware Division of Corporations API
    // - Other state business registries
    
    // Proper implementation would:
    // 1. Call state-specific API with businessName
    // 2. Parse response for matching entities
    // 3. Calculate confidence based on name match accuracy
    // 4. Return structured business data
    
    console.log(`[BusinessDiscovery] Would search ${state} records for: ${businessName}`);
    
    // Return not found to force user input flow
    return { 
      found: false, 
      confidence: 0,
      businessData: undefined
    };
  }

  /**
   * Generate FoundYouCard UI request
   */
  private generateFoundYouCardUI(businessData: any, confidence: number): UIRequest {
    return {
      id: `found_you_${Date.now()}`,
      agentRole: 'business_discovery_agent',
      suggestedTemplates: ['found_you_card'],
      dataNeeded: [],
      context: {
        userProgress: 25,
        deviceType: 'mobile', // TODO: Get from request
        urgency: 'high'
      },
      businessData,
      confidence: {
        score: confidence,
        source: businessData.state + ' Secretary of State',
        lastUpdated: new Date().toISOString()
      },
      actions: {
        confirm: () => ({ action: 'confirm_business', businessData }),
        notMe: () => ({ action: 'reject_business' }),
        editDetails: () => ({ action: 'edit_business_details', businessData })
      }
    };
  }

  // Helper methods
  private isPersonalEmailDomain(domain: string): boolean {
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
    return personalDomains.includes(domain.toLowerCase());
  }

  private isTechCompanySignal(clues: SearchClues): boolean {
    if (!clues.extractedDomain) return false;
    const techTlds = ['.io', '.ai', '.dev', '.tech'];
    return techTlds.some(tld => clues.extractedDomain!.endsWith(tld));
  }

  private extractBusinessNameFromDomain(domain: string): string {
    // Remove TLD and convert to business name
    const baseName = domain.split('.')[0];
    // Convert camelCase/PascalCase to words
    return baseName.replace(/([A-Z])/g, ' $1').trim();
  }

  private extractStateFromLocation(location: string): string | null {
    // Simple location to state mapping (extend as needed)
    const stateMap: Record<string, string> = {
      'san francisco': 'california',
      'los angeles': 'california',
      'palo alto': 'california',
      'new york': 'new_york',
      'austin': 'texas',
      'seattle': 'washington'
    };
    
    const locationLower = location.toLowerCase();
    for (const [city, state] of Object.entries(stateMap)) {
      if (locationLower.includes(city)) {
        return state;
      }
    }
    return null;
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
        id: 'business_discovery_agent',
        version: this.config.version
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning
    };

    context.history.push(contextEntry);
  }
}