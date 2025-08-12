/**
 * FluidUI Interpreter Service
 * 
 * Engine PRD Implementation (Lines 881-914)
 * Interprets semantic UI requests into dynamic components
 * 
 * CORE PRINCIPLE:
 * Agents generate semantic data describing WHAT to show
 * FluidUI interprets this into HOW to show it
 * Complete separation of business logic from presentation
 */

import { logger } from '../utils/logger';
import {
  UIRequest,
  UITemplateType,
  ValidationRule,
  LayoutHints
} from '../types/engine-types';

/**
 * Template registry mapping
 */
interface TemplateRegistry {
  [key: string]: ComponentTemplate;
}

/**
 * Component template definition
 */
interface ComponentTemplate {
  type: UITemplateType;
  component: string; // React component name
  defaultProps: Record<string, any>;
  requiredData: string[];
  optionalData?: string[];
  validation?: ValidationRule[];
  layout?: LayoutHints;
}

/**
 * Interpreted UI element ready for rendering
 */
export interface InterpretedUIElement {
  id: string;
  component: string;
  props: Record<string, any>;
  validation?: ValidationRule[];
  layout?: LayoutHints;
  metadata: {
    templateType: UITemplateType;
    requestId: string;
    contextId?: string;
  };
}

/**
 * FluidUI Interpreter Service
 * Singleton service for interpreting UI requests
 */
export class FluidUIInterpreter {
  private static instance: FluidUIInterpreter;
  private templateRegistry: TemplateRegistry;
  
  private constructor() {
    this.templateRegistry = this.initializeTemplateRegistry();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): FluidUIInterpreter {
    if (!FluidUIInterpreter.instance) {
      FluidUIInterpreter.instance = new FluidUIInterpreter();
    }
    return FluidUIInterpreter.instance;
  }
  
  /**
   * Initialize template registry with all UI templates
   * Engine PRD Lines 900-914
   */
  private initializeTemplateRegistry(): TemplateRegistry {
    return {
      [UITemplateType.ActionPillGroup]: {
        type: UITemplateType.ActionPillGroup,
        component: 'ActionPillGroup',
        defaultProps: {
          variant: 'default',
          layout: 'horizontal'
        },
        requiredData: ['actions'],
        optionalData: ['title', 'description'],
        layout: {
          width: 'full',
          alignment: 'center'
        }
      },
      
      [UITemplateType.FoundYouCard]: {
        type: UITemplateType.FoundYouCard,
        component: 'FoundYouCard',
        defaultProps: {
          animated: true,
          celebratory: true
        },
        requiredData: ['businessInfo'],
        optionalData: ['confidence', 'sources', 'actions'],
        layout: {
          width: 'medium',
          alignment: 'center',
          spacing: 'comfortable'
        }
      },
      
      [UITemplateType.SmartTextInput]: {
        type: UITemplateType.SmartTextInput,
        component: 'SmartTextInput',
        defaultProps: {
          autoComplete: true,
          validation: 'onChange'
        },
        requiredData: ['fields'],
        optionalData: ['title', 'description', 'guidance'],
        validation: [
          { type: 'required', fields: ['*'] }
        ],
        layout: {
          width: 'medium',
          alignment: 'left'
        }
      },
      
      [UITemplateType.ProgressIndicator]: {
        type: UITemplateType.ProgressIndicator,
        component: 'ProgressIndicator',
        defaultProps: {
          showPercentage: true,
          animated: true
        },
        requiredData: ['current', 'total'],
        optionalData: ['label', 'sublabel'],
        layout: {
          width: 'full',
          alignment: 'center'
        }
      },
      
      [UITemplateType.DocumentUpload]: {
        type: UITemplateType.DocumentUpload,
        component: 'DocumentUpload',
        defaultProps: {
          multiple: false,
          acceptedFormats: ['.pdf', '.doc', '.docx', '.jpg', '.png']
        },
        requiredData: ['purpose'],
        optionalData: ['acceptedFormats', 'maxSize', 'guidance'],
        layout: {
          width: 'medium',
          alignment: 'center'
        }
      },
      
      [UITemplateType.DataSummary]: {
        type: UITemplateType.DataSummary,
        component: 'DataSummary',
        defaultProps: {
          collapsible: true,
          editable: false
        },
        requiredData: ['data'],
        optionalData: ['title', 'sections', 'actions'],
        layout: {
          width: 'large',
          alignment: 'left'
        }
      },
      
      [UITemplateType.SteppedWizard]: {
        type: UITemplateType.SteppedWizard,
        component: 'SteppedWizard',
        defaultProps: {
          showProgress: true,
          allowSkip: false,
          allowBack: true
        },
        requiredData: ['steps'],
        optionalData: ['currentStep', 'title', 'description'],
        layout: {
          width: 'large',
          alignment: 'center',
          fullHeight: true
        }
      },
      
      [UITemplateType.ApprovalRequest]: {
        type: UITemplateType.ApprovalRequest,
        component: 'ApprovalRequest',
        defaultProps: {
          requiresConfirmation: true,
          showDetails: true
        },
        requiredData: ['item', 'actions'],
        optionalData: ['urgency', 'deadline', 'consequences'],
        layout: {
          width: 'medium',
          alignment: 'center',
          priority: 'high'
        }
      },
      
      [UITemplateType.ErrorDisplay]: {
        type: UITemplateType.ErrorDisplay,
        component: 'ErrorDisplay',
        defaultProps: {
          dismissible: true,
          showDetails: false
        },
        requiredData: ['error'],
        optionalData: ['suggestion', 'actions', 'supportLink'],
        layout: {
          width: 'medium',
          alignment: 'center',
          variant: 'error'
        }
      },
      
      [UITemplateType.SuccessScreen]: {
        type: UITemplateType.SuccessScreen,
        component: 'SuccessScreen',
        defaultProps: {
          animated: true,
          confetti: true
        },
        requiredData: ['message'],
        optionalData: ['title', 'nextSteps', 'summary'],
        layout: {
          width: 'full',
          alignment: 'center',
          fullHeight: true
        }
      },
      
      [UITemplateType.InstructionPanel]: {
        type: UITemplateType.InstructionPanel,
        component: 'InstructionPanel',
        defaultProps: {
          numbered: true,
          collapsible: false
        },
        requiredData: ['instructions'],
        optionalData: ['title', 'supportLinks', 'estimatedTime'],
        layout: {
          width: 'large',
          alignment: 'left'
        }
      },
      
      [UITemplateType.WaitingScreen]: {
        type: UITemplateType.WaitingScreen,
        component: 'WaitingScreen',
        defaultProps: {
          showSpinner: true,
          showProgress: false
        },
        requiredData: ['message'],
        optionalData: ['estimatedTime', 'currentStep', 'details'],
        layout: {
          width: 'full',
          alignment: 'center',
          fullHeight: true
        }
      }
    };
  }
  
  /**
   * Interpret UI request into renderable component
   * Engine PRD Lines 881-890
   */
  public interpret(request: UIRequest): InterpretedUIElement {
    logger.info('Interpreting UI request', {
      requestId: request.requestId,
      templateType: request.templateType
    });
    
    const template = this.templateRegistry[request.templateType];
    
    if (!template) {
      logger.error('Unknown template type', { type: request.templateType });
      throw new Error(`Unknown UI template type: ${request.templateType}`);
    }
    
    // Validate required data
    this.validateRequiredData(request, template);
    
    // Merge semantic data with defaults
    const props = this.buildComponentProps(request, template);
    
    // Apply any transformations
    const transformed = this.applyTransformations(props, template);
    
    // Build interpreted element
    const interpreted: InterpretedUIElement = {
      id: `ui_${request.requestId}`,
      component: template.component,
      props: transformed,
      validation: template.validation,
      layout: this.mergeLayout(template.layout, request.layoutHints),
      metadata: {
        templateType: request.templateType,
        requestId: request.requestId,
        contextId: request.context?.contextId
      }
    };
    
    logger.info('UI request interpreted', {
      requestId: request.requestId,
      component: template.component
    });
    
    return interpreted;
  }
  
  /**
   * Interpret multiple UI requests
   */
  public interpretBatch(requests: UIRequest[]): InterpretedUIElement[] {
    return requests.map(request => this.interpret(request));
  }
  
  /**
   * Validate required data is present
   */
  private validateRequiredData(request: UIRequest, template: ComponentTemplate): void {
    for (const field of template.requiredData) {
      if (!(field in request.semanticData)) {
        throw new Error(
          `Required field '${field}' missing for template ${template.type}`
        );
      }
    }
  }
  
  /**
   * Build component props from semantic data
   */
  private buildComponentProps(
    request: UIRequest,
    template: ComponentTemplate
  ): Record<string, any> {
    const props: Record<string, any> = {
      ...template.defaultProps,
      ...request.semanticData,
      requestId: request.requestId
    };
    
    // Add context if present
    if (request.context) {
      props.context = request.context;
    }
    
    // Add actions if present
    if (request.actions) {
      props.actions = request.actions;
    }
    
    return props;
  }
  
  /**
   * Apply any necessary transformations
   */
  private applyTransformations(
    props: Record<string, any>,
    template: ComponentTemplate
  ): Record<string, any> {
    // Apply template-specific transformations
    switch (template.type) {
      case UITemplateType.FoundYouCard:
        // Ensure business info is properly structured
        if (props.businessInfo && typeof props.businessInfo === 'object') {
          props.businessInfo = {
            name: props.businessInfo.name || 'Unknown Business',
            type: props.businessInfo.type || 'Unknown Type',
            ...props.businessInfo
          };
        }
        break;
        
      case UITemplateType.SmartTextInput:
        // Ensure fields have proper structure
        if (Array.isArray(props.fields)) {
          props.fields = props.fields.map((field: any) => ({
            id: field.id || `field_${Math.random().toString(36).substr(2, 9)}`,
            type: field.type || 'text',
            label: field.label || field.id,
            ...field
          }));
        }
        break;
        
      case UITemplateType.ActionPillGroup:
        // Ensure actions have proper structure
        if (Array.isArray(props.actions)) {
          props.actions = props.actions.map((action: any) => ({
            id: action.id || `action_${Math.random().toString(36).substr(2, 9)}`,
            label: action.label || action.id,
            variant: action.variant || 'default',
            ...action
          }));
        }
        break;
    }
    
    return props;
  }
  
  /**
   * Merge layout hints
   */
  private mergeLayout(
    defaultLayout?: LayoutHints,
    requestLayout?: LayoutHints
  ): LayoutHints {
    return {
      ...defaultLayout,
      ...requestLayout
    };
  }
  
  /**
   * Get available template types
   */
  public getAvailableTemplates(): UITemplateType[] {
    return Object.keys(this.templateRegistry) as UITemplateType[];
  }
  
  /**
   * Get template requirements
   */
  public getTemplateRequirements(type: UITemplateType): ComponentTemplate | null {
    return this.templateRegistry[type] || null;
  }
  
  /**
   * Validate UI request without interpreting
   */
  public validateRequest(request: UIRequest): { valid: boolean; errors?: string[] } {
    try {
      const template = this.templateRegistry[request.templateType];
      
      if (!template) {
        return {
          valid: false,
          errors: [`Unknown template type: ${request.templateType}`]
        };
      }
      
      const errors: string[] = [];
      
      // Check required fields
      for (const field of template.requiredData) {
        if (!(field in request.semanticData)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
      
      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }
}