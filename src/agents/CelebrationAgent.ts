/**
 * Celebration Agent
 * EXACTLY matches PRD lines 681-720
 * 
 * Specialized agent that creates delightful moments of accomplishment
 * and motivates users through positive reinforcement
 */

import { PRDCompliantAgent } from './base/PRDCompliantAgent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest 
} from '../types/engine-types';

interface Achievement {
  id: string;
  type: 'micro' | 'milestone' | 'completion';
  title: string;
  description: string;
  progress?: number;
  timeTaken?: number;
  isPersonalBest?: boolean;
}

interface CelebrationConfig {
  type: 'micro' | 'milestone' | 'completion';
  duration: number; // seconds
  intensity: 'subtle' | 'moderate' | 'enthusiastic';
  elements: CelebrationElement[];
  message: string;
  nextAction?: string;
}

interface CelebrationElement {
  type: 'confetti' | 'sound' | 'animation' | 'badge' | 'haptic';
  enabled: boolean;
  properties?: Record<string, any>;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

interface MotivationalContext {
  userProfile: 'first_timer' | 'returning' | 'power_user' | 'struggling';
  businessType?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';
  device: 'mobile' | 'desktop' | 'tablet';
  previousAchievements: number;
}

/**
 * Success Experience Creator Agent
 */
export class CelebrationAgent extends PRDCompliantAgent {
  constructor() {
    super('/config/agents/celebration_agent.yaml');
  }

  /**
   * Main processing method - creates celebration moments
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `cel_${Date.now()}`;
    
    try {
      // Detect achievement from context
      const achievement = this.detectAchievement(context);
      
      if (!achievement) {
        // No achievement to celebrate
        return {
          status: 'completed',
          data: { noCelebration: true },
          reasoning: 'No achievement detected to celebrate at this time'
        };
      }

      // Record celebration initiation
      await this.recordContextEntry(context, {
        operation: 'celebration_initiated',
        data: { 
          achievement,
          requestId 
        },
        reasoning: `Detected ${achievement.type} achievement: ${achievement.title}`
      });

      // Determine motivational context
      const motivationalContext = this.getMotivationalContext(context, request);
      
      // Generate celebration configuration
      const celebrationConfig = this.generateCelebration(achievement, motivationalContext);
      
      // Check for earned badges
      const earnedBadges = this.checkForBadges(achievement, context);
      
      // Generate motivational message
      const message = this.generateMotivationalMessage(achievement, motivationalContext, celebrationConfig);
      
      // Record celebration details
      await this.recordContextEntry(context, {
        operation: 'celebration_generated',
        data: {
          celebrationType: celebrationConfig.type,
          duration: celebrationConfig.duration,
          message,
          badgesEarned: earnedBadges.length
        },
        reasoning: `Generated ${celebrationConfig.type} celebration with ${celebrationConfig.intensity} intensity`
      });

      // Generate celebration UI request
      const uiRequest = this.generateCelebrationUI(
        achievement,
        celebrationConfig,
        message,
        earnedBadges,
        motivationalContext
      );
      
      // Update progress
      this.updateContextProgress(context, achievement.progress || 5);
      
      return {
        status: 'needs_input',
        data: {
          achievement,
          celebration: celebrationConfig,
          badges: earnedBadges
        },
        uiRequests: [uiRequest],
        reasoning: `Created ${celebrationConfig.type} celebration for "${achievement.title}"`,
        nextAgent: this.determineNextAgent(context)
      };

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'celebration_error',
        data: { error: error.message, requestId },
        reasoning: 'Celebration generation failed'
      });

      // Even on error, try to provide some positive feedback
      return {
        status: 'completed',
        data: { 
          fallbackMessage: "Great work! Keep going! 👍"
        },
        reasoning: 'Provided fallback encouragement despite error'
      };
    }
  }

  /**
   * Detect achievement from context changes
   */
  private detectAchievement(context: TaskContext): Achievement | null {
    const currentProgress = context.currentState.completeness || 0;
    const lastEntry = context.history[context.history.length - 1];
    
    // Check for task completion
    if (context.currentState.status === 'completed') {
      return {
        id: 'task_completed',
        type: 'completion',
        title: 'Task Completed!',
        description: 'You\'ve successfully completed your task',
        progress: 100
      };
    }

    // Check for milestone progress (every 25%)
    if (currentProgress > 0 && currentProgress % 25 === 0) {
      const milestone = currentProgress === 100 ? 'completion' : 
                       currentProgress >= 75 ? 'milestone' : 'micro';
      return {
        id: `progress_${currentProgress}`,
        type: milestone,
        title: `${currentProgress}% Complete!`,
        description: this.getProgressDescription(currentProgress),
        progress: currentProgress
      };
    }

    // Check for specific operation completions
    if (lastEntry) {
      if (lastEntry.operation === 'business_found') {
        return {
          id: 'business_discovered',
          type: 'milestone',
          title: 'Business Found!',
          description: 'We found your business in public records'
        };
      }

      if (lastEntry.operation === 'profile_collection_completed') {
        return {
          id: 'profile_complete',
          type: 'milestone',
          title: 'Profile Complete!',
          description: 'Your business profile is all set'
        };
      }

      if (lastEntry.operation === 'compliance_requirements_identified') {
        return {
          id: 'compliance_ready',
          type: 'milestone',
          title: 'Compliance Roadmap Ready!',
          description: 'Your personalized compliance plan is ready'
        };
      }

      if (lastEntry.operation === 'form_optimization_completed') {
        return {
          id: 'form_optimized',
          type: 'micro',
          title: 'Smart Form Ready!',
          description: 'We\'ve simplified your form for quick completion'
        };
      }
    }

    // Check for error recovery
    const previousError = context.history.slice(-2)[0];
    if (previousError?.operation?.includes('error') && 
        lastEntry && !lastEntry.operation.includes('error')) {
      return {
        id: 'error_recovered',
        type: 'micro',
        title: 'Great Recovery!',
        description: 'You handled that like a pro'
      };
    }

    return null;
  }

  /**
   * Get motivational context for personalization
   */
  private getMotivationalContext(context: TaskContext, request: AgentRequest): MotivationalContext {
    const userData = context.currentState.data.user || {};
    const businessData = context.currentState.data.business || {};
    const previousAchievements = context.history.filter(e => 
      e.operation === 'celebration_generated'
    ).length;

    // Determine user profile
    let userProfile: MotivationalContext['userProfile'] = 'returning';
    if (previousAchievements === 0) {
      userProfile = 'first_timer';
    } else if (previousAchievements > 10) {
      userProfile = 'power_user';
    } else if (context.history.some(e => e.operation?.includes('error'))) {
      userProfile = 'struggling';
    }

    // Get time of day
    const hour = new Date().getHours();
    let timeOfDay: MotivationalContext['timeOfDay'] = 'afternoon';
    if (hour < 12) timeOfDay = 'morning';
    else if (hour < 18) timeOfDay = 'afternoon';
    else if (hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'late_night';

    return {
      userProfile,
      businessType: businessData.industry || businessData.entityType,
      timeOfDay,
      device: request.context?.deviceType || 'desktop',
      previousAchievements
    };
  }

  /**
   * Generate celebration configuration
   */
  private generateCelebration(
    achievement: Achievement, 
    context: MotivationalContext
  ): CelebrationConfig {
    let intensity: CelebrationConfig['intensity'] = 'moderate';
    let duration = 3;
    const elements: CelebrationElement[] = [];

    // Adjust based on achievement type
    switch (achievement.type) {
      case 'completion':
        intensity = 'enthusiastic';
        duration = 5;
        elements.push(
          { type: 'confetti', enabled: true, properties: { density: 'high' } },
          { type: 'sound', enabled: true, properties: { file: 'success.mp3' } },
          { type: 'animation', enabled: true, properties: { type: 'fullscreen' } }
        );
        break;
      
      case 'milestone':
        intensity = 'moderate';
        duration = 3;
        elements.push(
          { type: 'confetti', enabled: true, properties: { density: 'medium' } },
          { type: 'sound', enabled: true, properties: { file: 'achievement.mp3' } }
        );
        break;
      
      case 'micro':
        intensity = 'subtle';
        duration = 1;
        elements.push(
          { type: 'animation', enabled: true, properties: { type: 'checkmark' } }
        );
        break;
    }

    // Adjust for user profile
    if (context.userProfile === 'first_timer') {
      intensity = 'enthusiastic';
      duration += 1;
    } else if (context.userProfile === 'power_user') {
      intensity = 'subtle';
      duration = Math.max(1, duration - 1);
    }

    // Add haptic for mobile
    if (context.device === 'mobile') {
      elements.push({ type: 'haptic', enabled: true, properties: { pattern: 'success' } });
    }

    return {
      type: achievement.type,
      duration,
      intensity,
      elements,
      message: '', // Will be filled by generateMotivationalMessage
      nextAction: this.suggestNextAction(achievement, context)
    };
  }

  /**
   * Check if user earned any badges
   */
  private checkForBadges(achievement: Achievement, context: TaskContext): Badge[] {
    const badges: Badge[] = [];
    const now = new Date().toISOString();

    // Speed Demon badge
    if (achievement.timeTaken && achievement.timeTaken < 120) {
      badges.push({
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Completed in under 2 minutes',
        icon: '⚡',
        earnedAt: now
      });
    }

    // First Timer badge
    if (context.history.filter(e => e.operation === 'celebration_generated').length === 0) {
      badges.push({
        id: 'first_timer',
        name: 'First Timer',
        description: 'Completed your first task',
        icon: '🌟',
        earnedAt: now
      });
    }

    // Perfectionist badge
    if (!context.history.some(e => e.operation?.includes('error'))) {
      badges.push({
        id: 'perfectionist',
        name: 'Perfectionist',
        description: 'No errors or corrections',
        icon: '💎',
        earnedAt: now
      });
    }

    // Comeback Kid badge
    if (context.history.some(e => e.operation?.includes('error')) && 
        achievement.type === 'completion') {
      badges.push({
        id: 'comeback_kid',
        name: 'Comeback Kid',
        description: 'Recovered from an error to complete',
        icon: '💪',
        earnedAt: now
      });
    }

    return badges;
  }

  /**
   * Generate personalized motivational message
   */
  private generateMotivationalMessage(
    achievement: Achievement,
    context: MotivationalContext,
    celebration: CelebrationConfig
  ): string {
    const messages: string[] = [];

    // Base message on achievement type
    if (achievement.type === 'completion') {
      messages.push('Mission accomplished! 🎉');
    } else if (achievement.type === 'milestone') {
      messages.push(achievement.title);
    } else {
      messages.push('Nice work!');
    }

    // Add context-specific message
    if (context.userProfile === 'first_timer') {
      messages.push("You're off to a fantastic start!");
    } else if (context.userProfile === 'power_user') {
      messages.push('Efficient as always.');
    } else if (context.userProfile === 'struggling') {
      messages.push("You're doing great - keep it up!");
    }

    // Add time-based message
    if (context.timeOfDay === 'morning') {
      messages.push('Starting strong today!');
    } else if (context.timeOfDay === 'late_night') {
      messages.push('Dedication pays off!');
    }

    // Add business-specific message
    if (context.businessType === 'Technology') {
      messages.push('Building something amazing!');
    } else if (context.businessType === 'Food & Beverage') {
      messages.push('Ready to serve success!');
    } else if (context.businessType === 'Professional Services') {
      messages.push('Your expertise, amplified!');
    }

    return messages.join(' ');
  }

  /**
   * Generate celebration UI request
   */
  private generateCelebrationUI(
    achievement: Achievement,
    celebration: CelebrationConfig,
    message: string,
    badges: Badge[],
    context: MotivationalContext
  ): UIRequest {
    return {
      id: `celebration_${Date.now()}`,
      agentRole: 'celebration_agent',
      suggestedTemplates: ['progress_celebration'],
      dataNeeded: [],
      context: {
        userProgress: achievement.progress || 50,
        deviceType: context.device,
        urgency: 'low'
      },
      title: achievement.title,
      description: achievement.description,
      message,
      celebration: {
        type: celebration.type,
        duration: celebration.duration,
        intensity: celebration.intensity,
        elements: celebration.elements
      },
      badges: badges.map(b => ({
        ...b,
        animation: 'fadeInScale'
      })),
      actions: {
        continue: () => ({ action: 'continue_after_celebration' }),
        share: () => ({ action: 'share_achievement', achievement }),
        viewBadges: () => ({ action: 'view_all_badges' })
      },
      nextAction: celebration.nextAction,
      timing: {
        autoAdvance: celebration.duration * 1000,
        skipEnabled: celebration.type === 'micro'
      }
    };
  }

  /**
   * Helper methods
   */
  private getProgressDescription(progress: number): string {
    if (progress === 25) return "You're off to a great start!";
    if (progress === 50) return "Halfway there - you've got this!";
    if (progress === 75) return "Almost done - final stretch!";
    if (progress === 100) return "Perfect! You've completed everything!";
    return `${progress}% complete`;
  }

  private suggestNextAction(achievement: Achievement, context: MotivationalContext): string {
    if (achievement.type === 'completion') {
      return 'View your accomplishments';
    }
    if (achievement.progress && achievement.progress < 100) {
      return 'Continue to next step';
    }
    return 'Keep going!';
  }

  private determineNextAgent(context: TaskContext): string | undefined {
    // If task is complete, no next agent
    if (context.currentState.status === 'completed') {
      return undefined;
    }
    
    // Otherwise, return to orchestrator
    return 'orchestrator';
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
        id: 'celebration_agent',
        version: this.config.version
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning
    };

    context.history.push(contextEntry);
  }
}