/**
 * Onboarding-specific types that extend the core engine types
 * These types are specific to the onboarding flow and multi-tenant features
 */

import { TaskContext } from './engine-types';

// Multi-tenant security context
export interface TenantContext {
  businessId: string;          // Primary tenant identifier
  sessionUserId?: string;      // Current session user (for UI interactions)
  dataScope: 'user' | 'business'; // Access boundary
  allowedAgents: string[];     // Which agents can access this task
  tenantName?: string;         // For audit trails
  isolationLevel: 'strict' | 'standard'; // Compliance requirement
  userToken?: string;          // JWT for RLS enforcement
}

// UI Augmentation Request from agents
export interface UIAugmentationRequest {
  agentRole: string;
  requestId: string;
  timestamp: string;
  priority?: number;
  
  // Tenant context for security
  tenantContext?: {
    businessId: string;
    sessionUserId?: string;
  };
  
  // Pure semantic data - no layout instructions
  metadata: {
    purpose: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    allowSkip: boolean;
    skipConsequence?: string;
    estimatedTime?: number; // seconds
  };
  
  // What information is needed
  requirementLevel: {
    minimumRequired: string[];      // Field IDs that must be provided
    recommended: string[];          // Nice to have
    optional: string[];            // Can be skipped
    conditionallyRequired: Array<{
      fieldId: string;
      condition: string;           // JS expression
      reason: string;
    }>;
  };
  
  // Presentation hints (semantic, not visual)
  presentation: {
    title: string;
    subtitle?: string;
    icon?: string;                 // Semantic icon name
    theme?: 'primary' | 'secondary' | 'warning' | 'success';
    position?: 'modal' | 'inline' | 'sidebar';
    allowSkip?: boolean;
    skipLabel?: string;
  };
  
  // Action pills for quick actions
  actionPills?: Array<{
    id: string;
    label: string;
    type: 'primary' | 'secondary' | 'danger' | 'success' | 'quick';
    icon?: string;
    action: {
      type: 'submit' | 'navigate' | 'external' | 'help';
      payload?: any;
    };
    visibility?: {
      condition?: string;          // JS expression
      showAfter?: number;         // milliseconds
      hideAfter?: number;         // milliseconds
    };
  }>;
  
  // Form sections with fields
  formSections?: Array<{
    id: string;
    title?: string;
    description?: string;
    collapsible?: boolean;
    initiallyCollapsed?: boolean;
    layout?: 'vertical' | 'horizontal' | 'grid';
    fields: Array<FormField>;
  }>;
  
  // Context about the request
  context: {
    currentPhase?: string;
    progressPercentage?: number;
    estimatedTimeRemaining?: string;
    whyNeeded?: string;
    helpText?: string;
    impactOfSkipping?: string;
  };
  
  // Response handling configuration
  responseConfig: {
    validationRules?: Array<{
      field: string;
      rule: string;
      message: string;
      severity: 'error' | 'warning';
    }>;
    successMessage?: string;
    onSuccessAction?: string;
    targetContextPath?: string;    // Where to store in TaskContext
    partialSubmitAllowed?: boolean;
    timeoutMs?: number;
  };
}

// Form field definition
export interface FormField {
  id: string;
  name: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'select' | 'radio' | 'checkbox' | 
        'autocomplete' | 'date' | 'file' | 'ein' | 'ssn' | 'currency';
  label: string;
  requirementLevel?: 'required' | 'recommended' | 'optional';
  requirementReason?: string;
  
  config?: {
    placeholder?: string;
    defaultValue?: any;
    helpText?: string;
    tooltip?: string;
    mask?: string;                // Input mask pattern
    autocompleteSource?: string;  // API endpoint
    options?: Array<{
      value: string;
      label: string;
      description?: string;
      icon?: string;
    }>;
    showRequirementBadge?: boolean;
    optionalLabel?: string;
  };
  
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;             // Regex pattern
    customValidator?: string;     // Named validator
    errorMessage?: string;
    warningMessage?: string;
  };
  
  behavior?: {
    validateOnChange?: boolean;
    validateOnBlur?: boolean;
    fetchDataOn?: 'mount' | 'focus' | 'change';
    transformValue?: string;      // Named transformer
    skipIfEmpty?: boolean;
  };
  
  visibility?: {
    dependsOn?: string;          // Field ID
    condition?: string;          // JS expression
  };
  
  conditionalRequirement?: {
    condition: string;
    reason: string;
  };
}

// UI Response from frontend
export interface UIAugmentationResponse {
  requestId: string;
  taskId: string;
  agentRole: string;
  timestamp: string;
  
  // User's input data
  formData: Record<string, any>;
  
  // Which action was taken
  actionTaken: {
    type: 'submit' | 'cancel' | 'skip' | 'help';
    actionPillId?: string; // If triggered by action pill
  };
  
  // Client-side validation results
  validationStatus: {
    isValid: boolean;
    errors?: Array<{
      field: string;
      message: string;
    }>;
  };
  
  // User interaction metrics
  metrics?: {
    timeToComplete: number; // milliseconds
    fieldInteractions: Record<string, number>; // field interactions count
    abandonedFields?: string[]; // fields user started but didn't complete
  };
}

// Required inputs tracking
export interface RequiredInput {
  fieldName: string;
  required: boolean;
  stage: number;
  collected?: boolean;
  value?: any;
  collectedAt?: string;
  collectedBy?: string; // agent role or 'user'
}

// Orchestrator configuration
export interface OrchestratorConfig {
  model: 'gpt-4' | 'claude-3' | 'claude-3.5';
  temperature?: number;
  maxRetries: number;
  timeoutMinutes: number;
  atomicExecution: boolean;
  fallbackToRules?: boolean;
}

// Onboarding-specific task context
export interface OnboardingTaskContext extends TaskContext {
  taskType: 'onboarding';
  tenantContext: TenantContext;
  sharedContext: TaskContext['currentState']['data'] & {
    onboarding?: {
      currentStage: number;
      completedStages: number[];
      startedAt: string;
      lastActiveAt: string;
      source: 'google' | 'email' | 'invite';
    };
  };
}