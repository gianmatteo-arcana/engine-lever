/**
 * Tests for UI Strategy Engine
 */

import { UIStrategyEngine, UIStrategyContext } from '../ui-strategy-engine';
import { UIRequest } from '../../types/engine-types';

describe('UIStrategyEngine', () => {
  let engine: UIStrategyEngine;

  beforeEach(() => {
    engine = UIStrategyEngine.getInstance();
  });

  describe('singleton pattern', () => {
    it('should maintain single instance', () => {
      const instance1 = UIStrategyEngine.getInstance();
      const instance2 = UIStrategyEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('determineStrategy', () => {
    it('should provide wizard layout for early stage users', () => {
      const context: UIStrategyContext = {
        userProgress: 10,
        deviceType: 'desktop',
        urgency: 'low'
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.layoutStrategy).toBe('wizard');
      expect(strategy.interactionMode).toBe('guided');
      expect(strategy.assistanceLevel).toBe('comprehensive');
      expect(strategy.visualElements).toContain('tutorial_tips');
      expect(strategy.visualElements).toContain('help_bubbles');
    });

    it('should streamline for users near completion', () => {
      const context: UIStrategyContext = {
        userProgress: 85,
        deviceType: 'desktop',
        urgency: 'medium'
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.layoutStrategy).toBe('all_at_once');
      expect(strategy.validationLevel).toBe('strict');
      expect(strategy.visualElements).toContain('completion_indicator');
    });

    it('should adapt for mobile devices', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'mobile',
        urgency: 'low'
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.layoutStrategy).toBe('cards');
      expect(strategy.visualElements).toContain('swipe_indicators');
      expect(strategy.interactionMode).toBe('hybrid');
    });

    it('should optimize for critical urgency', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: 'critical'
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.layoutStrategy).toBe('all_at_once');
      expect(strategy.assistanceLevel).toBe('minimal');
      expect(strategy.visualElements).toContain('alert_banner');
      expect(strategy.visualElements).toContain('deadline_timer');
      expect(strategy.validationLevel).toBe('relaxed');
    });

    it('should use form mode for high confidence data', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: 'medium',
        dataConfidence: 0.9
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.interactionMode).toBe('form');
      expect(strategy.validationLevel).toBe('strict');
      expect(strategy.assistanceLevel).toBe('minimal');
    });

    it('should use conversation mode for low confidence data', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: 'medium',
        dataConfidence: 0.2
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.interactionMode).toBe('conversation');
      expect(strategy.assistanceLevel).toBe('comprehensive');
      expect(strategy.validationLevel).toBe('relaxed');
    });

    it('should customize for onboarding tasks', () => {
      const context: UIStrategyContext = {
        userProgress: 0,
        deviceType: 'desktop',
        urgency: 'low',
        taskType: 'onboarding'
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.visualElements).toContain('welcome_message');
      expect(strategy.visualElements).toContain('progress_milestones');
      expect(strategy.interactionMode).toBe('guided');
    });

    it('should enforce strict validation for compliance tasks', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: 'medium',
        taskType: 'compliance'
      };

      const strategy = engine.determineStrategy(context);

      expect(strategy.validationLevel).toBe('strict');
      expect(strategy.visualElements).toContain('requirement_checklist');
      expect(strategy.visualElements).toContain('deadline_calendar');
    });
  });

  describe('generateComponents', () => {
    it('should generate form component for form interaction mode', () => {
      const strategy = {
        templateType: 'standard_form',
        layoutStrategy: 'progressive' as const,
        interactionMode: 'form' as const,
        visualElements: ['progress_bar'],
        validationLevel: 'moderate' as const,
        assistanceLevel: 'contextual' as const
      };

      const components = engine.generateComponents(strategy, ['name', 'email']);

      expect(components).toHaveLength(2); // form + progress bar
      expect(components[0].type).toBe('progress');
      expect(components[1].type).toBe('form');
      expect(components[1].config.fields).toEqual(['name', 'email']);
    });

    it('should generate chat cards for conversation mode', () => {
      const strategy = {
        templateType: 'chat',
        layoutStrategy: 'progressive' as const,
        interactionMode: 'conversation' as const,
        visualElements: [],
        validationLevel: 'relaxed' as const,
        assistanceLevel: 'comprehensive' as const
      };

      const components = engine.generateComponents(strategy, ['businessName']);

      expect(components).toHaveLength(1);
      expect(components[0].type).toBe('card');
      expect(components[0].config.style).toBe('chat');
      expect(components[0].config.prompts).toBeDefined();
    });

    it('should generate wizard for guided mode', () => {
      const strategy = {
        templateType: 'wizard',
        layoutStrategy: 'wizard' as const,
        interactionMode: 'guided' as const,
        visualElements: [],
        validationLevel: 'moderate' as const,
        assistanceLevel: 'contextual' as const
      };

      const components = engine.generateComponents(strategy, ['field1', 'field2']);

      expect(components).toHaveLength(1);
      expect(components[0].type).toBe('card');
      expect(components[0].config.style).toBe('wizard');
      expect(components[0].config.steps).toBeDefined();
      expect(components[0].config.showProgress).toBe(true);
    });

    it('should generate hybrid components for hybrid mode', () => {
      const strategy = {
        templateType: 'hybrid',
        layoutStrategy: 'progressive' as const,
        interactionMode: 'hybrid' as const,
        visualElements: [],
        validationLevel: 'moderate' as const,
        assistanceLevel: 'contextual' as const
      };

      const components = engine.generateComponents(
        strategy, 
        ['field1', 'field2', 'field3', 'field4']
      );

      expect(components).toHaveLength(2);
      expect(components[0].type).toBe('form');
      expect(components[0].config.fields).toHaveLength(3); // First 3 fields
      expect(components[0].config.expandable).toBe(true);
      expect(components[0].config.chatAssist).toBe(true);
      expect(components[1].type).toBe('card');
      expect(components[1].config.style).toBe('assistant');
    });

    it('should add celebration component when included in visual elements', () => {
      const strategy = {
        templateType: 'standard_form',
        layoutStrategy: 'progressive' as const,
        interactionMode: 'form' as const,
        visualElements: ['celebration'],
        validationLevel: 'moderate' as const,
        assistanceLevel: 'contextual' as const
      };

      const components = engine.generateComponents(strategy, ['field1']);

      const celebrationComponent = components.find(c => c.type === 'celebration');
      expect(celebrationComponent).toBeDefined();
      expect(celebrationComponent?.config.trigger).toBe('on_complete');
    });

    it('should sort components by priority', () => {
      const strategy = {
        templateType: 'standard_form',
        layoutStrategy: 'progressive' as const,
        interactionMode: 'form' as const,
        visualElements: ['progress_bar', 'celebration'],
        validationLevel: 'moderate' as const,
        assistanceLevel: 'contextual' as const
      };

      const components = engine.generateComponents(strategy, ['field1']);

      expect(components[0].priority).toBeLessThanOrEqual(components[1].priority);
      if (components[2]) {
        expect(components[1].priority).toBeLessThanOrEqual(components[2].priority);
      }
    });
  });

  describe('createUIRequest', () => {
    it('should create complete UI request', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: 'medium'
      };

      const uiRequest = engine.createUIRequest(
        'business_discovery',
        ['businessName', 'entityType'],
        context
      );

      expect(uiRequest.requestId).toMatch(/^ui_\d+_[a-z0-9]+$/);
      expect(uiRequest.semanticData.agentRole).toBe('business_discovery');
      expect(uiRequest.semanticData.dataNeeded).toEqual(['businessName', 'entityType']);
      expect(uiRequest.templateType).toBe('smart_text_input');
      expect(uiRequest.context).toBeDefined();
    });

    it('should include strategy in context', () => {
      const context: UIStrategyContext = {
        userProgress: 25,
        deviceType: 'mobile',
        urgency: 'low'
      };

      const uiRequest = engine.createUIRequest(
        'profile_collector',
        ['email'],
        context
      );

      expect((uiRequest.context as any).uiStrategy).toBeDefined();
      expect(uiRequest.context?.userProgress).toBe(25);
    });

    it('should suggest agent-specific templates', () => {
      const context: UIStrategyContext = {
        userProgress: 50,
        deviceType: 'desktop',
        urgency: 'medium'
      };

      const complianceRequest = engine.createUIRequest(
        'compliance_analyzer',
        ['requirements'],
        context
      );

      expect(complianceRequest.templateType).toBe('smart_text_input');
      expect(complianceRequest.semanticData.suggestedTemplates).toContain('requirement_list');

      const celebrationRequest = engine.createUIRequest(
        'celebration_agent',
        [],
        context
      );

      expect(celebrationRequest.semanticData.suggestedTemplates).toContain('celebration_modal');
      expect(celebrationRequest.semanticData.suggestedTemplates).toContain('achievement_card');
    });
  });

  describe('analyzeInteraction', () => {
    it('should identify quick completion', () => {
      const uiRequest: UIRequest = {
        requestId: 'test',
        templateType: 'smart_text_input' as any,
        semanticData: {
          agentRole: 'test',
          suggestedTemplates: [],
          dataNeeded: ['field1', 'field2'],
          context: {} as any
        }
      };

      const response = { field1: 'value1', field2: 'value2' };
      const analysis = engine.analyzeInteraction(uiRequest as any, response, 25000);

      expect(analysis.success).toBe(true);
      expect(analysis.insights).toContain('User completed quickly - consider streamlining');
      expect(analysis.insights).toContain('Perfect completion - strategy working well');
    });

    it('should identify slow completion', () => {
      const uiRequest: UIRequest = {
        requestId: 'test',
        templateType: 'smart_text_input' as any,
        semanticData: {
          agentRole: 'test',
          suggestedTemplates: [],
          dataNeeded: ['field1'],
          context: {} as any
        }
      };

      const response = { field1: 'value1' };
      const analysis = engine.analyzeInteraction(uiRequest as any, response, 350000);

      expect(analysis.insights).toContain('User took long time - may need more guidance');
    });

    it('should identify low completion rate', () => {
      const uiRequest: UIRequest = {
        requestId: 'test',
        templateType: 'smart_text_input' as any,
        semanticData: {
          agentRole: 'test',
          suggestedTemplates: [],
          dataNeeded: ['field1', 'field2', 'field3', 'field4'],
          context: {} as any
        }
      };

      const response = { field1: 'value1' };
      const analysis = engine.analyzeInteraction(uiRequest as any, response, 60000);

      expect(analysis.success).toBe(false);
      expect(analysis.insights).toContain('Low completion rate - consider reducing required fields');
    });

    it('should identify multiple edits', () => {
      const uiRequest: UIRequest = {
        requestId: 'test',
        templateType: 'smart_text_input' as any,
        semanticData: {
          agentRole: 'test',
          suggestedTemplates: [],
          dataNeeded: ['field1']
        },
        context: {} as any
      };

      const response = { 
        field1: 'value1',
        _edits: 5 
      };
      const analysis = engine.analyzeInteraction(uiRequest, response, 60000);

      expect(analysis.insights).toContain('Multiple edits detected - improve validation or guidance');
    });

    it('should handle null response', () => {
      const uiRequest: UIRequest = {
        requestId: 'test',
        templateType: 'smart_text_input' as any,
        semanticData: {
          agentRole: 'test',
          suggestedTemplates: [],
          dataNeeded: ['field1']
        },
        context: {} as any
      };

      const analysis = engine.analyzeInteraction(uiRequest, null, 60000);

      expect(analysis.success).toBe(false);
      expect(analysis.insights).toContain('Low completion rate - consider reducing required fields');
    });
  });
});