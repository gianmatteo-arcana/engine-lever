/**
 * Data Collection Agent
 * 
 * Responsible for:
 * - Collecting business information from users
 * - Validating data formats and completeness
 * - CBC API lookups (when credentials available)
 * - Storing collected data in task context
 */

import { BaseA2AAgent, A2ATask, A2ATaskResult } from '../base/BaseA2AAgent';
import { logger } from '../../utils/logger';
import { 
  TaskContext,
  UIAugmentationRequest,
  FormField
} from '../../types/task-context';

interface BusinessData {
  businessName?: string;
  ein?: string;
  entityType?: string;
  state?: string;
  formationDate?: string;
  registeredAgent?: {
    name?: string;
    address?: string;
  };
  principalAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  officers?: Array<{
    name: string;
    title: string;
    address?: string;
  }>;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

export class DataCollectionAgent extends BaseA2AAgent {
  constructor() {
    super('data-collection-agent-001', 'data_collection_agent', {
      name: 'Business Data Collection Agent',
      skills: [
        'form_data_collection',
        'data_validation',
        'cbc_api_lookup',
        'ein_validation',
        'address_validation'
      ],
      version: '1.0.0'
    });
  }

  /**
   * Execute data collection tasks
   */
  protected async executeWithTenantContext(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    try {
      switch (task.type) {
        case 'collect_business_data':
          return await this.collectBusinessData(task, tenantDb);
          
        case 'validate_data':
          return await this.validateData(task, tenantDb);
          
        case 'cbc_lookup':
          return await this.performCBCLookup(task, tenantDb);
          
        case 'update_business_data':
          return await this.updateBusinessData(task, tenantDb);
          
        default:
          throw new Error(`Unknown data collection task type: ${task.type}`);
      }
    } catch (error) {
      logger.error('Data collection execution failed', { error, taskId: task.id });
      throw error;
    }
  }

  /**
   * Collect business data through UI augmentation
   */
  private async collectBusinessData(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    const taskContext = task.input as TaskContext;
    const { phaseGoals = [] } = task.input;

    try {
      // Determine what data we need to collect based on goals
      const requiredFields = this.determineRequiredFields(phaseGoals);
      
      // Check what data we already have
      const existingData = taskContext.sharedContext.business || {};
      const missingFields = this.identifyMissingFields(requiredFields, existingData);

      if (missingFields.length === 0) {
        // All required data already collected
        return {
          status: 'complete',
          result: {
            message: 'All required data already collected',
            collectedData: existingData
          }
        };
      }

      // Create UI augmentation request for missing fields
      const uiRequest = this.createDataCollectionUI(missingFields, existingData);
      const augmentationId = await this.createUIAugmentationRequest(task.id, uiRequest);

      return {
        status: 'pending_user_input',
        uiAugmentation: {
          action: 'request',
          data: uiRequest
        },
        result: {
          augmentationId,
          requestedFields: missingFields
        }
      };

    } catch (error) {
      logger.error('Failed to collect business data', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'DATA_COLLECTION_FAILED',
          message: 'Failed to initiate data collection',
          details: error
        }
      };
    }
  }

  /**
   * Validate collected data
   */
  private async validateData(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    const { businessData } = task.input;

    try {
      const validation = this.validateBusinessData(businessData);

      if (!validation.isValid) {
        // Request corrections through UI
        const uiRequest = this.createValidationErrorUI(validation.errors, businessData);
        const augmentationId = await this.createUIAugmentationRequest(task.id, uiRequest);

        return {
          status: 'pending_user_input',
          uiAugmentation: {
            action: 'request',
            data: uiRequest
          },
          result: {
            augmentationId,
            validationErrors: validation.errors
          }
        };
      }

      // Data is valid
      return {
        status: 'complete',
        result: {
          message: 'Data validation successful',
          warnings: validation.warnings,
          validatedData: businessData
        }
      };

    } catch (error) {
      logger.error('Data validation failed', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Failed to validate data',
          details: error
        }
      };
    }
  }

  /**
   * Perform CBC API lookup
   */
  private async performCBCLookup(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    const { businessName, entityNumber } = task.input;

    try {
      // TODO: Implement actual CBC API call when credentials are available
      const cbcApiKey = process.env.CBC_API_KEY;
      const cbcApiUrl = process.env.CBC_API_URL;

      if (!cbcApiKey) {
        logger.warn('CBC API credentials not configured, returning mock data');
        
        // Return mock data for testing
        return {
          status: 'complete',
          result: {
            source: 'mock',
            businessInfo: {
              name: businessName,
              entityNumber: entityNumber || 'C1234567',
              status: 'ACTIVE',
              type: 'CORPORATION',
              formationDate: '2020-01-15',
              registeredAgent: {
                name: 'Mock Registered Agent Inc.',
                address: '123 Main St, San Francisco, CA 94105'
              }
            },
            disclaimer: 'This is mock data. CBC API credentials pending.'
          }
        };
      }

      // Real CBC API implementation would go here
      /*
      const response = await fetch(`${cbcApiUrl}/business/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cbcApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ businessName, entityNumber })
      });
      
      const data = await response.json();
      */

      throw new Error('CBC API integration pending implementation');

    } catch (error) {
      logger.error('CBC lookup failed', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'CBC_LOOKUP_FAILED',
          message: 'Failed to perform CBC lookup',
          details: error
        }
      };
    }
  }

  /**
   * Update business data in task context
   */
  private async updateBusinessData(
    task: A2ATask,
    tenantDb: any
  ): Promise<A2ATaskResult> {
    const { updates } = task.input;

    try {
      // Update agent context with collected data
      await this.updateAgentContext(task.id, {
        context_data: {
          collectedData: updates,
          lastUpdated: new Date().toISOString()
        },
        deliverables: [
          {
            type: 'business_data',
            data: updates,
            timestamp: new Date().toISOString()
          }
        ]
      });

      return {
        status: 'complete',
        result: {
          message: 'Business data updated successfully',
          updatedFields: Object.keys(updates)
        }
      };

    } catch (error) {
      logger.error('Failed to update business data', { error, taskId: task.id });
      return {
        status: 'error',
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update business data',
          details: error
        }
      };
    }
  }

  /**
   * Determine required fields based on goals
   */
  private determineRequiredFields(goals: string[]): string[] {
    const fieldMapping: Record<string, string[]> = {
      'collect_business_name': ['businessName'],
      'collect_ein': ['ein'],
      'collect_entity_type': ['entityType'],
      'collect_formation_date': ['formationDate'],
      'collect_registered_agent': ['registeredAgent.name', 'registeredAgent.address'],
      'collect_principal_address': ['principalAddress.street', 'principalAddress.city', 'principalAddress.state', 'principalAddress.zip'],
      'collect_officers': ['officers']
    };

    const requiredFields = new Set<string>();
    
    goals.forEach(goal => {
      const fields = fieldMapping[goal] || [];
      fields.forEach(field => requiredFields.add(field));
    });

    // Always require basic fields for onboarding
    if (goals.some(g => g.includes('onboarding'))) {
      requiredFields.add('businessName');
      requiredFields.add('ein');
      requiredFields.add('entityType');
    }

    return Array.from(requiredFields);
  }

  /**
   * Identify missing fields
   */
  private identifyMissingFields(required: string[], existing: any): string[] {
    return required.filter(field => {
      const value = this.getNestedValue(existing, field);
      return value === undefined || value === null || value === '';
    });
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Create UI augmentation for data collection
   */
  private createDataCollectionUI(
    fields: string[],
    existingData: any
  ): UIAugmentationRequest {
    const formFields: FormField[] = fields.map(field => this.createFormField(field, existingData));

    return {
      agentRole: this.agentRole,
      requestId: this.generateId(),
      timestamp: new Date().toISOString(),
      metadata: {
        purpose: 'Collect business information',
        urgency: 'medium',
        category: 'data_collection',
        allowSkip: false
      },
      requirementLevel: {
        minimumRequired: fields.filter(f => 
          ['businessName', 'ein', 'entityType'].includes(f)
        ),
        recommended: fields.filter(f => 
          !['businessName', 'ein', 'entityType'].includes(f)
        ),
        optional: [],
        conditionallyRequired: []
      },
      presentation: {
        title: 'Business Information',
        subtitle: 'Please provide the following information about your business',
        icon: 'business',
        theme: 'primary',
        position: 'modal'
      },
      formSections: [{
        id: 'business_info',
        title: 'Business Details',
        fields: formFields
      }],
      context: {
        currentPhase: 'data_collection',
        whyNeeded: 'This information is required to complete your business profile and comply with state regulations.',
        helpText: 'All information will be securely stored and used only for compliance purposes.'
      },
      responseConfig: {
        validationRules: this.getValidationRules(fields),
        successMessage: 'Business information collected successfully',
        targetContextPath: 'sharedContext.business'
      }
    };
  }

  /**
   * Create form field definition
   */
  private createFormField(fieldPath: string, existingData: any): FormField {
    const fieldDefinitions: Record<string, Partial<FormField>> = {
      businessName: {
        id: 'businessName',
        name: 'businessName',
        type: 'text',
        label: 'Business Name',
        config: {
          placeholder: 'Enter your business name',
          helpText: 'Legal name as registered with the state'
        },
        validation: {
          required: true,
          minLength: 2,
          maxLength: 200
        }
      },
      ein: {
        id: 'ein',
        name: 'ein',
        type: 'ein',
        label: 'EIN (Employer Identification Number)',
        config: {
          placeholder: 'XX-XXXXXXX',
          mask: '99-9999999',
          helpText: 'Federal tax identification number'
        },
        validation: {
          required: true,
          pattern: '^\\d{2}-\\d{7}$',
          errorMessage: 'EIN must be in format XX-XXXXXXX'
        }
      },
      entityType: {
        id: 'entityType',
        name: 'entityType',
        type: 'select',
        label: 'Entity Type',
        config: {
          options: [
            { value: 'corporation', label: 'Corporation' },
            { value: 'llc', label: 'Limited Liability Company (LLC)' },
            { value: 'partnership', label: 'Partnership' },
            { value: 'sole_proprietorship', label: 'Sole Proprietorship' }
          ]
        },
        validation: {
          required: true
        }
      },
      formationDate: {
        id: 'formationDate',
        name: 'formationDate',
        type: 'date',
        label: 'Formation Date',
        config: {
          helpText: 'Date the business was registered with the state'
        }
      }
    };

    const baseField: FormField = {
      id: fieldPath,
      name: fieldPath,
      type: 'text',
      label: this.humanizeFieldName(fieldPath),
      requirementLevel: 'required'
    };

    return { ...baseField, ...(fieldDefinitions[fieldPath] || {}) };
  }

  /**
   * Create UI for validation errors
   */
  private createValidationErrorUI(
    errors: Array<{ field: string; message: string }>,
    data: any
  ): UIAugmentationRequest {
    // Similar to createDataCollectionUI but highlights errors
    const ui = this.createDataCollectionUI(errors.map(e => e.field), data);
    
    ui.metadata.purpose = 'Correct validation errors';
    ui.metadata.urgency = 'high';
    ui.presentation.title = 'Please Correct the Following';
    ui.presentation.theme = 'warning';
    
    return ui;
  }

  /**
   * Validate business data
   */
  private validateBusinessData(data: BusinessData): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Validate EIN format
    if (data.ein && !this.isValidEIN(data.ein)) {
      errors.push({
        field: 'ein',
        message: 'EIN must be in format XX-XXXXXXX'
      });
    }

    // Validate required fields
    if (!data.businessName?.trim()) {
      errors.push({
        field: 'businessName',
        message: 'Business name is required'
      });
    }

    if (!data.entityType) {
      errors.push({
        field: 'entityType',
        message: 'Entity type is required'
      });
    }

    // Validate state code
    if (data.state && !this.isValidStateCode(data.state)) {
      errors.push({
        field: 'state',
        message: 'Invalid state code'
      });
    }

    // Formation date validation
    if (data.formationDate) {
      const date = new Date(data.formationDate);
      if (date > new Date()) {
        errors.push({
          field: 'formationDate',
          message: 'Formation date cannot be in the future'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate EIN format
   */
  private isValidEIN(ein: string): boolean {
    return /^\d{2}-\d{7}$/.test(ein);
  }

  /**
   * Validate state code
   */
  private isValidStateCode(state: string): boolean {
    const validStates = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI']; // Add all states
    return validStates.includes(state.toUpperCase());
  }

  /**
   * Get validation rules for fields
   */
  private getValidationRules(fields: string[]): any[] {
    const rules: any[] = [];

    if (fields.includes('ein')) {
      rules.push({
        field: 'ein',
        rule: 'regex:^\\d{2}-\\d{7}$',
        message: 'EIN must be in format XX-XXXXXXX',
        severity: 'error'
      });
    }

    if (fields.includes('businessName')) {
      rules.push({
        field: 'businessName',
        rule: 'required',
        message: 'Business name is required',
        severity: 'error'
      });
    }

    return rules;
  }

  /**
   * Convert field path to human-readable label
   */
  private humanizeFieldName(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/\./g, ' - ')
      .trim();
  }
}