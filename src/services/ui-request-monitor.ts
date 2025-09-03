/**
 * UIRequest Monitor Service
 * 
 * Automatically detects UIRequest events and starts UXOptimizationAgent when multiple
 * UIRequests are detected for the same context. This maintains separation of concerns
 * by keeping orchestration and UX optimization separate.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { agentDiscovery } from './agent-discovery';
import type { TaskContext, UIRequest } from '../types/task-engine.types';

interface UIRequestEvent {
  contextId: string;
  uiRequests: UIRequest[];
  timestamp: number;
}

class UIRequestMonitorService extends EventEmitter {
  private static instance: UIRequestMonitorService;
  private activeOptimizers: Map<string, any> = new Map();
  private pendingUIRequests: Map<string, UIRequestEvent[]> = new Map();
  private readonly DETECTION_WINDOW_MS = 5000; // 5 second window to detect multiple UIRequests

  private constructor() {
    super();
    this.setupEventListeners();
  }

  public static getInstance(): UIRequestMonitorService {
    if (!UIRequestMonitorService.instance) {
      UIRequestMonitorService.instance = new UIRequestMonitorService();
    }
    return UIRequestMonitorService.instance;
  }

  private setupEventListeners(): void {
    // Listen for UIRequest creation events
    this.on('ui_requests_detected', this.handleUIRequestsDetected.bind(this));
    
    logger.info('📊 UIRequest Monitor Service initialized');
  }

  /**
   * Called when UIRequests are sent to frontend
   * This is the entry point from OrchestratorAgent
   */
  public notifyUIRequestsSent(context: TaskContext, uiRequests: UIRequest[]): void {
    const contextId = context.contextId;
    
    logger.debug('📥 UIRequests detected', {
      contextId,
      count: uiRequests.length
    });

    // Store this event
    if (!this.pendingUIRequests.has(contextId)) {
      this.pendingUIRequests.set(contextId, []);
    }
    
    this.pendingUIRequests.get(contextId)!.push({
      contextId,
      uiRequests,
      timestamp: Date.now()
    });

    // Check if we should start optimization
    this.checkForOptimizationNeeded(contextId);
  }

  private checkForOptimizationNeeded(contextId: string): void {
    const events = this.pendingUIRequests.get(contextId) || [];
    const now = Date.now();
    
    // Remove old events outside detection window
    const recentEvents = events.filter(event => 
      (now - event.timestamp) < this.DETECTION_WINDOW_MS
    );
    this.pendingUIRequests.set(contextId, recentEvents);

    // Count total UIRequests in recent window
    const totalUIRequests = recentEvents.reduce((sum, event) => sum + event.uiRequests.length, 0);
    
    if (totalUIRequests > 1 && !this.activeOptimizers.has(contextId)) {
      logger.info('🎯 Multiple UIRequests detected, starting UXOptimizationAgent', {
        contextId,
        totalUIRequests,
        eventCount: recentEvents.length
      });
      
      this.emit('ui_requests_detected', contextId, recentEvents);
    }
  }

  private async handleUIRequestsDetected(contextId: string, _events: UIRequestEvent[]): Promise<void> {
    try {
      // Get context from first event to extract tenant/user info
      // In practice, we'd need to pass this info or retrieve it
      const tenantId = 'system'; // TODO: Extract from context
      const userId = undefined;   // TODO: Extract from context

      // Instantiate UXOptimizationAgent
      const uxAgent = await agentDiscovery.instantiateAgent(
        'ux_optimization_agent',
        tenantId,
        userId
      );

      // Mark as active
      this.activeOptimizers.set(contextId, uxAgent);

      // Start the agent in background listening mode
      const agentRequest = {
        taskContext: { contextId } as TaskContext,
        operation: 'start_listening',
        parameters: {
          contextId,
          mode: 'background'
        }
      };

      // Start agent and handle result
      (uxAgent as any).process(agentRequest)
        .then((result: any) => {
          if (result.status === 'completed') {
            logger.info('✅ UXOptimizationAgent started successfully', { contextId });
          } else {
            logger.warn('⚠️ UXOptimizationAgent failed to start', {
              contextId,
              status: result.status
            });
            this.activeOptimizers.delete(contextId);
          }
        })
        .catch((error: any) => {
          logger.error('❌ Error starting UXOptimizationAgent', {
            contextId,
            error: error instanceof Error ? error.message : String(error)
          });
          this.activeOptimizers.delete(contextId);
        });

    } catch (error) {
      logger.error('❌ Failed to handle UIRequests detection', {
        contextId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clean up completed contexts
   */
  public markContextCompleted(contextId: string): void {
    this.pendingUIRequests.delete(contextId);
    
    if (this.activeOptimizers.has(contextId)) {
      logger.info('🧹 Cleaning up UXOptimizationAgent for completed context', { contextId });
      this.activeOptimizers.delete(contextId);
    }
  }
}

export const uiRequestMonitor = UIRequestMonitorService.getInstance();