/**
 * Business Discovery Agent - Demo Implementation
 * 
 * Demonstrates business discovery capabilities for the A2A Event Bus demo.
 * This agent discovers and analyzes business information to provide context
 * for compliance analysis.
 */

import { BaseAgent } from '../base/BaseAgent';
import { BaseAgentRequest, BaseAgentResponse } from '../../types/base-agent-types';

export class BusinessDiscoveryAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('business_discovery_agent.yaml', businessId, userId);
  }

  /**
   * Core business discovery logic
   * Demonstrates agent reasoning and A2A event publishing
   */
  async executeInternal(request: BaseAgentRequest): Promise<BaseAgentResponse> {
    const startTime = Date.now();
    
    // Simulate business discovery process
    const discoveredData = await this.discoverBusinessInformation(request);
    
    // Create context entry with discovered information
    const contextUpdate = {
      entryId: this.generateDiscoveryEntryId(),
      sequenceNumber: (request.taskContext?.history?.length || 0) + 1,
      timestamp: new Date().toISOString(),
      actor: {
        type: 'agent' as const,
        id: 'business_discovery_agent',
        version: '1.0.0'
      },
      operation: 'business_discovered',
      data: discoveredData,
      reasoning: `Discovered business information for ${discoveredData.businessName}. ` +
                `Found entity type: ${discoveredData.entityType}, state: ${discoveredData.state}. ` +
                `Industry classification: ${discoveredData.industry}. ` +
                `Discovery completed in ${Date.now() - startTime}ms.`,
      confidence: discoveredData.confidence,
      trigger: {
        type: 'orchestrator_request' as const,
        source: 'orchestrator',
        requestId: request.parameters?.requestId
      }
    };

    return {
      status: 'completed',
      contextUpdate,
      confidence: discoveredData.confidence,
      uiRequests: [
        {
          type: 'business_profile_card',
          title: 'Business Discovered',
          data: {
            businessName: discoveredData.businessName,
            entityType: discoveredData.entityType,
            state: discoveredData.state,
            industry: discoveredData.industry,
            ein: discoveredData.ein,
            foundationDate: discoveredData.foundationDate
          },
          actions: [
            { id: 'confirm', label: 'Confirm Information' },
            { id: 'edit', label: 'Edit Details' }
          ]
        }
      ]
    };
  }

  /**
   * Simulate business discovery process
   * In production, this would integrate with external APIs
   */
  private async discoverBusinessInformation(request: BaseAgentRequest): Promise<any> {
    // Simulate API delay
    await this.wait(1500);

    // Extract business context
    const businessProfile = request.taskContext?.businessProfile || {};
    const requestData = request.parameters || {};

    // Simulate business discovery with realistic data
    return {
      businessName: businessProfile.name || requestData.businessName || 'Demo Business LLC',
      entityType: businessProfile.entityType || 'LLC',
      state: businessProfile.state || 'CA',
      industry: businessProfile.industry || 'Technology Services',
      ein: businessProfile.ein || '12-3456789',
      foundationDate: '2020-01-15',
      address: {
        street: '123 Business Ave',
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94105'
      },
      registrationStatus: 'Active',
      goodStanding: true,
      lastFilingDate: '2024-02-15',
      nextFilingDue: '2025-02-15',
      confidence: 0.92
    };
  }

  /**
   * Generate unique entry ID for discovery
   */
  private generateDiscoveryEntryId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `discovery_${timestamp}_${random}`;
  }

  /**
   * Utility: Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}