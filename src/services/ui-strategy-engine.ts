/**
 * UI Strategy Engine
 * 
 * Determines optimal UI strategies for agent-user interactions
 * based on context, confidence levels, and user progression
 */

import { UIRequest, UITemplateType } from '../types/task-engine.types';

export interface UIStrategyContext {
  userProgress: number;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  dataConfidence?: number;
  previousInteractions?: number;
  taskType?: string;
  agentRole?: string;
}

export interface UIStrategy {
  templateType: string;
  layoutStrategy: 'progressive' | 'all_at_once' | 'wizard' | 'cards';
  interactionMode: 'form' | 'conversation' | 'hybrid' | 'guided';
  visualElements: string[];
  priorityFields?: string[];
  optionalFields?: string[];
  validationLevel: 'strict' | 'moderate' | 'relaxed';
  assistanceLevel: 'minimal' | 'contextual' | 'comprehensive';
}

export interface UIComponent {
  type: 'card' | 'form' | 'notification' | 'progress' | 'celebration';
  priority: number;
  config: Record<string, any>;
}

export class UIStrategyEngine {
  private static instance: UIStrategyEngine;

  private constructor() {}

  public static getInstance(): UIStrategyEngine {
    if (!UIStrategyEngine.instance) {
      UIStrategyEngine.instance = new UIStrategyEngine();
    }
    return UIStrategyEngine.instance;
  }

  /**
   * Determine the optimal UI strategy based on context
   */
  determineStrategy(context: UIStrategyContext): UIStrategy {
    const { userProgress, deviceType, urgency, dataConfidence = 0, taskType } = context;
    
    // Default strategy
    let strategy: UIStrategy = {
      templateType: 'standard_form',
      layoutStrategy: 'progressive',
      interactionMode: 'form',
      visualElements: ['progress_bar'],
      validationLevel: 'moderate',
      assistanceLevel: 'contextual'
    };

    // Adjust based on progress
    if (userProgress < 25) {
      // Early stage: More guidance needed
      strategy.layoutStrategy = 'wizard';
      strategy.interactionMode = 'guided';
      strategy.assistanceLevel = 'comprehensive';
      strategy.visualElements.push('tutorial_tips', 'help_bubbles');
    } else if (userProgress > 75) {
      // Near completion: Streamline experience
      strategy.layoutStrategy = 'all_at_once';
      strategy.validationLevel = 'strict';
      strategy.visualElements.push('completion_indicator');
    }

    // Adjust based on device
    if (deviceType === 'mobile') {
      strategy.layoutStrategy = 'cards';
      strategy.visualElements.push('swipe_indicators');
      strategy.interactionMode = strategy.interactionMode === 'form' ? 'hybrid' : strategy.interactionMode;
    } else if (deviceType === 'desktop') {
      strategy.visualElements.push('sidebar_navigation', 'keyboard_shortcuts');
    }

    // Adjust based on urgency
    if (urgency === 'critical') {
      strategy.layoutStrategy = 'all_at_once';
      strategy.assistanceLevel = 'minimal';
      strategy.visualElements = ['alert_banner', 'deadline_timer'];
      strategy.validationLevel = 'relaxed'; // Speed over perfection
    } else if (urgency === 'high') {
      strategy.visualElements.push('urgency_indicator');
    }

    // Adjust based on confidence (but don't override guided mode for early users)
    if (dataConfidence > 0.8) {
      if (userProgress >= 25) { // Only change if not early stage
        strategy.interactionMode = 'form';
      }
      strategy.validationLevel = 'strict';
      strategy.assistanceLevel = 'minimal';
    } else if (dataConfidence < 0.3 && dataConfidence > 0) { // Only if confidence is provided
      if (userProgress >= 25) { // Only change if not early stage
        strategy.interactionMode = 'conversation';
      }
      strategy.assistanceLevel = 'comprehensive';
      strategy.validationLevel = 'relaxed';
    }

    // Task-specific adjustments
    if (taskType === 'onboarding') {
      strategy.visualElements.push('welcome_message', 'progress_milestones');
      strategy.interactionMode = 'guided';
    } else if (taskType === 'compliance') {
      strategy.validationLevel = 'strict';
      strategy.visualElements.push('requirement_checklist', 'deadline_calendar');
    }

    return strategy;
  }

  /**
   * Generate UI components based on strategy
   */
  generateComponents(strategy: UIStrategy, dataNeeded: string[]): UIComponent[] {
    const components: UIComponent[] = [];

    // Add primary component based on interaction mode
    switch (strategy.interactionMode) {
      case 'form':
        components.push({
          type: 'form',
          priority: 1,
          config: {
            fields: dataNeeded,
            layout: strategy.layoutStrategy,
            validation: strategy.validationLevel
          }
        });
        break;
      
      case 'conversation':
        components.push({
          type: 'card',
          priority: 1,
          config: {
            style: 'chat',
            prompts: this.generateConversationalPrompts(dataNeeded),
            allowSkip: strategy.validationLevel === 'relaxed'
          }
        });
        break;
      
      case 'guided':
        components.push({
          type: 'card',
          priority: 1,
          config: {
            style: 'wizard',
            steps: this.generateWizardSteps(dataNeeded, strategy),
            showProgress: true
          }
        });
        break;
      
      case 'hybrid':
        components.push({
          type: 'form',
          priority: 1,
          config: {
            fields: dataNeeded.slice(0, 3), // Show essential fields first
            expandable: true,
            chatAssist: true
          }
        });
        components.push({
          type: 'card',
          priority: 2,
          config: {
            style: 'assistant',
            hidden: false
          }
        });
        break;
    }

    // Add visual elements
    if (strategy.visualElements.includes('progress_bar')) {
      components.push({
        type: 'progress',
        priority: 0,
        config: { sticky: true, showPercentage: true }
      });
    }

    if (strategy.visualElements.includes('celebration')) {
      components.push({
        type: 'celebration',
        priority: 3,
        config: { trigger: 'on_complete' }
      });
    }

    return components.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Create adaptive UI request based on agent needs
   */
  createUIRequest(
    agentRole: string,
    dataNeeded: string[],
    context: UIStrategyContext
  ): UIRequest {
    const strategy = this.determineStrategy(context);
    const components = this.generateComponents(strategy, dataNeeded);

    // Determine suggested templates based on strategy
    const suggestedTemplates = this.getSuggestedTemplates(strategy, agentRole);

    return {
      requestId: `ui_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateType: UITemplateType.SmartTextInput,
      semanticData: {
        agentRole,
        suggestedTemplates,
        dataNeeded,
        components: components.map(c => ({
          type: c.type,
          config: c.config
        }))
      },
      context: {
        ...context,
        uiStrategy: strategy
      }
    } as UIRequest;
  }

  /**
   * Get suggested templates based on strategy and agent
   */
  private getSuggestedTemplates(strategy: UIStrategy, agentRole: string): string[] {
    const templates: string[] = [];

    // Base templates from strategy
    if (strategy.layoutStrategy === 'wizard') {
      templates.push('wizard_flow');
    } else if (strategy.layoutStrategy === 'cards') {
      templates.push('card_stack');
    } else if (strategy.layoutStrategy === 'progressive') {
      templates.push('progressive_disclosure');
    } else {
      templates.push('standard_form');
    }

    // Agent-specific templates
    const agentTemplates: Record<string, string[]> = {
      business_discovery: ['found_you_card', 'business_search'],
      profile_collector: ['profile_form', 'smart_defaults'],
      compliance_analyzer: ['compliance_roadmap', 'requirement_list'],
      celebration_agent: ['celebration_modal', 'achievement_card'],
      ux_optimization: ['optimized_form', 'contextual_help']
    };

    if (agentTemplates[agentRole]) {
      templates.push(...agentTemplates[agentRole]);
    }

    return templates;
  }

  /**
   * Generate conversational prompts for chat-style interaction
   */
  private generateConversationalPrompts(dataNeeded: string[]): string[] {
    const prompts: string[] = [];
    
    for (const field of dataNeeded) {
      switch (field) {
        case 'businessName':
          prompts.push("What's the name of your business?");
          break;
        case 'entityType':
          prompts.push("Is your business an LLC, Corporation, or something else?");
          break;
        case 'ein':
          prompts.push("Do you have an EIN (Employer ID Number)? If so, what is it?");
          break;
        case 'state':
          prompts.push("Which state is your business registered in?");
          break;
        case 'email':
          prompts.push("What's the best email to reach you at?");
          break;
        default:
          prompts.push(`Please provide your ${this.humanizeFieldName(field)}`);
      }
    }

    return prompts;
  }

  /**
   * Generate wizard steps for guided interaction
   */
  private generateWizardSteps(dataNeeded: string[], strategy: UIStrategy): any[] {
    const steps: any[] = [];
    const fieldsPerStep = strategy.layoutStrategy === 'cards' ? 1 : 3;

    for (let i = 0; i < dataNeeded.length; i += fieldsPerStep) {
      const stepFields = dataNeeded.slice(i, i + fieldsPerStep);
      steps.push({
        title: this.getStepTitle(i / fieldsPerStep, dataNeeded.length / fieldsPerStep),
        fields: stepFields,
        validation: strategy.validationLevel,
        canSkip: strategy.validationLevel === 'relaxed'
      });
    }

    return steps;
  }

  /**
   * Get title for wizard step
   */
  private getStepTitle(currentStep: number, totalSteps: number): string {
    const stepNumber = Math.floor(currentStep) + 1;
    const total = Math.ceil(totalSteps);
    
    if (stepNumber === 1) {
      return `Let's get started (${stepNumber}/${total})`;
    } else if (stepNumber === total) {
      return `Almost done! (${stepNumber}/${total})`;
    } else {
      return `Step ${stepNumber} of ${total}`;
    }
  }

  /**
   * Convert field name to human-readable format
   */
  private humanizeFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/_/g, ' ')
      .trim();
  }

  /**
   * Analyze user behavior to optimize future strategies
   */
  analyzeInteraction(
    uiRequest: UIRequest,
    response: any,
    completionTime: number
  ): { success: boolean; insights: string[] } {
    const insights: string[] = [];
    
    // Analyze completion time
    if (completionTime < 30000) { // Less than 30 seconds
      insights.push('User completed quickly - consider streamlining');
    } else if (completionTime > 300000) { // More than 5 minutes
      insights.push('User took long time - may need more guidance');
    }

    // Analyze field completion
    const providedFields = Object.keys(response || {});
    const requestedFields = (uiRequest.semanticData as any)?.dataNeeded || [];
    const completionRate = providedFields.length / requestedFields.length;

    if (completionRate < 0.5) {
      insights.push('Low completion rate - consider reducing required fields');
    } else if (completionRate === 1) {
      insights.push('Perfect completion - strategy working well');
    }

    // Check for corrections/edits
    if (response && response._edits && response._edits > 2) {
      insights.push('Multiple edits detected - improve validation or guidance');
    }

    return {
      success: completionRate > 0.7,
      insights
    };
  }
}