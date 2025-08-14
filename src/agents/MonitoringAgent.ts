/**
 * Monitoring Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * AGENT MISSION: Monitor system health, verify task completion, and maintain audit trails.
 * Detect anomalies, track performance metrics, and ensure compliance workflows execute correctly.
 * 
 * This agent is GENERAL PURPOSE - it provides monitoring and quality assurance capabilities
 * while working with Task Templates for specific workflow verification. The agent monitors
 * all system components and generates alerts based on configurable thresholds.
 */

import { BaseAgent } from './base/BaseAgent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest,
  UITemplateType
} from '../types/engine-types';
import { DatabaseService } from '../services/database';

interface SystemHealthMetrics {
  agentResponseTime: number;
  databaseQueryTime: number;
  apiConnectivity: number;
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  lastChecked: string;
}

interface PerformanceAlert {
  severity: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: string;
  threshold?: number;
  actualValue?: number;
}

interface AuditSummary {
  checksPerformed: number;
  anomaliesDetected: number;
  complianceStatus: 'compliant' | 'warning' | 'violation';
  lastAuditTime: string;
  retentionCompliance: boolean;
}

interface TaskVerificationResult {
  taskId: string;
  completionStatus: 'completed' | 'partial' | 'failed' | 'pending';
  verifiedOutcomes: string[];
  missedOutcomes: string[];
  qualityScore: number;
  recommendedActions: string[];
}

interface MonitoringThresholds {
  agentResponseTime: number;
  databaseQueryTime: number;
  externalApiTimeout: number;
  agentSuccessRate: number;
  paymentSuccessRate: number;
  portalConnectivity: number;
}

/**
 * Monitoring Agent - Consolidated BaseAgent Implementation
 */
export class MonitoringAgent extends BaseAgent {
  private readonly defaultThresholds: MonitoringThresholds = {
    agentResponseTime: 5000,
    databaseQueryTime: 2000,
    externalApiTimeout: 30000,
    agentSuccessRate: 95,
    paymentSuccessRate: 98,
    portalConnectivity: 99
  };

  constructor(businessId: string, userId?: string) {
    super('monitoring_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - handles all monitoring operations
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `ma_${Date.now()}`;
    
    try {
      // Record monitoring operation initiation
      await this.recordContextEntry(context, {
        operation: 'monitoring_operation_initiated',
        data: { 
          operationType: request.instruction,
          requestId 
        },
        reasoning: 'Starting system monitoring and quality assurance operation'
      });

      // Route based on instruction - GENERAL MONITORING OPERATIONS
      switch (request.instruction) {
        case 'monitor_system_health':
          return await this.monitorSystemHealth(request, context);
        
        case 'verify_task_completion':
          return await this.verifyTaskCompletion(request, context);
        
        case 'generate_audit_report':
          return await this.generateAuditReport(request, context);
        
        case 'detect_anomalies':
          return await this.detectAnomalies(request, context);
        
        case 'track_performance_metrics':
          return await this.trackPerformanceMetrics(request, context);
        
        default:
          await this.recordContextEntry(context, {
            operation: 'unknown_monitoring_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for monitoring operation'
          });

          return {
            status: 'error',
            data: { error: `Unknown monitoring instruction: ${request.instruction}` },
            reasoning: 'Monitoring agent cannot process unrecognized instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'monitoring_operation_error',
        data: { error: error.message, requestId },
        reasoning: 'Monitoring operation failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during monitoring operation'
      };
    }
  }

  /**
   * Monitor overall system health and performance
   */
  private async monitorSystemHealth(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const components = request.data?.components || ['agents', 'database', 'external_apis', 'payment_systems'];
    
    // Perform comprehensive health check
    const healthMetrics = await this.performHealthCheck(components);
    const alerts = this.generateHealthAlerts(healthMetrics);
    const auditSummary = this.createAuditSummary(healthMetrics, alerts);

    await this.recordContextEntry(context, {
      operation: 'system_health_monitored',
      data: { 
        healthMetrics,
        alerts,
        componentsChecked: components,
        overallStatus: healthMetrics.overallHealth
      },
      reasoning: `System health check completed for ${components.length} components. Status: ${healthMetrics.overallHealth}, ${alerts.length} alerts generated`
    });

    // Generate monitoring dashboard UI
    const uiRequest = this.createHealthDashboardUI(healthMetrics, alerts, auditSummary);

    const hasIssues = alerts.some(alert => alert.severity === 'critical' || alert.severity === 'warning');

    return {
      status: hasIssues ? 'needs_input' : 'completed',
      data: { 
        healthMetrics,
        alerts,
        auditSummary,
        systemStatus: healthMetrics.overallHealth,
        recommendations: this.generateHealthRecommendations(healthMetrics, alerts)
      },
      uiRequests: hasIssues ? [uiRequest] : undefined,
      reasoning: `System health monitoring completed. Overall status: ${healthMetrics.overallHealth}. ${alerts.length} alerts generated.`,
      nextAgent: hasIssues ? 'communication' : undefined
    };
  }

  /**
   * Verify task completion and quality assurance
   */
  private async verifyTaskCompletion(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { taskId, expectedOutcomes } = request.data || {};
    
    if (!taskId || !expectedOutcomes) {
      return {
        status: 'error',
        data: { error: 'Task ID and expected outcomes are required for verification' },
        reasoning: 'Cannot verify task completion without task ID and expected outcomes'
      };
    }

    // Perform task verification
    const verificationResult = await this.performTaskVerification(taskId, expectedOutcomes, context);
    
    await this.recordContextEntry(context, {
      operation: 'task_completion_verified',
      data: { 
        taskId,
        verificationResult,
        qualityScore: verificationResult.qualityScore,
        completionStatus: verificationResult.completionStatus
      },
      reasoning: `Task verification completed for ${taskId}. Status: ${verificationResult.completionStatus}, Quality score: ${verificationResult.qualityScore}/100`
    });

    // Generate verification report UI if issues found
    const needsAttention = verificationResult.completionStatus !== 'completed' || verificationResult.qualityScore < 85;
    const uiRequest = needsAttention ? this.createVerificationReportUI(verificationResult) : undefined;

    return {
      status: verificationResult.completionStatus === 'completed' ? 'completed' : 'needs_input',
      data: { 
        verificationResult,
        taskId,
        qualityAssessment: {
          passed: verificationResult.qualityScore >= 85,
          score: verificationResult.qualityScore,
          issues: verificationResult.missedOutcomes
        }
      },
      uiRequests: uiRequest ? [uiRequest] : undefined,
      reasoning: `Task verification completed. Status: ${verificationResult.completionStatus}, Quality: ${verificationResult.qualityScore}%`,
      nextAgent: needsAttention ? 'ux_optimization_agent' : undefined
    };
  }

  /**
   * Generate comprehensive audit report
   */
  private async generateAuditReport(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { timeRange, scope } = request.data || {};
    
    // Generate audit report based on scope
    const auditReport = await this.compileAuditReport(timeRange, scope, context);
    const complianceStatus = this.assessComplianceStatus(auditReport);

    await this.recordContextEntry(context, {
      operation: 'audit_report_generated',
      data: { 
        auditReport,
        scope,
        timeRange,
        complianceStatus,
        totalEntries: auditReport.totalEntries
      },
      reasoning: `Audit report generated for ${scope} scope covering ${timeRange?.days || 'default'} days. Status: ${complianceStatus}`
    });

    return {
      status: 'completed',
      data: { 
        auditReport,
        complianceStatus,
        recommendations: this.generateComplianceRecommendations(auditReport),
        reportMetadata: {
          generatedAt: new Date().toISOString(),
          scope,
          coverage: timeRange
        }
      },
      reasoning: `Audit report generated successfully for ${scope}. Compliance status: ${complianceStatus}`
    };
  }

  /**
   * Detect system anomalies and performance issues
   */
  private async detectAnomalies(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const monitoringScope = request.data?.scope || 'all_systems';
    
    // Perform anomaly detection
    const anomalies = await this.performAnomalyDetection(monitoringScope, context);
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');

    await this.recordContextEntry(context, {
      operation: 'anomaly_detection_completed',
      data: { 
        anomalies,
        scope: monitoringScope,
        criticalCount: criticalAnomalies.length,
        totalCount: anomalies.length
      },
      reasoning: `Anomaly detection completed for ${monitoringScope}. Found ${anomalies.length} anomalies, ${criticalAnomalies.length} critical`
    });

    // Generate anomaly report UI if critical issues found
    const uiRequest = criticalAnomalies.length > 0 ? this.createAnomalyReportUI(anomalies) : undefined;

    return {
      status: criticalAnomalies.length > 0 ? 'needs_input' : 'completed',
      data: { 
        anomalies,
        summary: {
          totalAnomalies: anomalies.length,
          criticalAnomalies: criticalAnomalies.length,
          scope: monitoringScope
        },
        recommendations: this.generateAnomalyRecommendations(anomalies)
      },
      uiRequests: uiRequest ? [uiRequest] : undefined,
      reasoning: `Anomaly detection completed. Found ${anomalies.length} anomalies, ${criticalAnomalies.length} requiring immediate attention`,
      nextAgent: criticalAnomalies.length > 0 ? 'communication' : undefined
    };
  }

  /**
   * Track and analyze performance metrics
   */
  private async trackPerformanceMetrics(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const metricsScope = request.data?.scope || 'system_performance';
    
    // Collect performance metrics
    const performanceData = await this.collectPerformanceMetrics(metricsScope);
    const trends = this.analyzePerformanceTrends(performanceData);

    await this.recordContextEntry(context, {
      operation: 'performance_metrics_tracked',
      data: { 
        performanceData,
        trends,
        scope: metricsScope,
        timestamp: new Date().toISOString()
      },
      reasoning: `Performance metrics collected and analyzed for ${metricsScope}. ${trends.length} trends identified`
    });

    return {
      status: 'completed',
      data: { 
        performanceData,
        trends,
        benchmarks: this.getPerformanceBenchmarks(),
        insights: this.generatePerformanceInsights(performanceData, trends)
      },
      reasoning: `Performance tracking completed for ${metricsScope}. ${trends.length} performance trends analyzed`
    };
  }

  // Helper methods for monitoring operations
  private async performHealthCheck(_components: string[]): Promise<SystemHealthMetrics> {
    // Mock health check implementation
    
    // Simulate component checks
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const agentResponseTime = Math.random() * 3000 + 500; // 500-3500ms
    const databaseQueryTime = Math.random() * 1500 + 200; // 200-1700ms
    const apiConnectivity = Math.random() * 20 + 80; // 80-100%
    
    let overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' = 'excellent';
    
    if (agentResponseTime > this.defaultThresholds.agentResponseTime || 
        databaseQueryTime > this.defaultThresholds.databaseQueryTime ||
        apiConnectivity < 95) {
      overallHealth = 'good';
    }
    
    if (apiConnectivity < 90) {
      overallHealth = 'fair';
    }
    
    if (apiConnectivity < 80) {
      overallHealth = 'poor';
    }
    
    if (apiConnectivity < 70) {
      overallHealth = 'critical';
    }

    return {
      agentResponseTime,
      databaseQueryTime,
      apiConnectivity,
      overallHealth,
      lastChecked: new Date().toISOString()
    };
  }

  private generateHealthAlerts(metrics: SystemHealthMetrics): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    if (metrics.agentResponseTime > this.defaultThresholds.agentResponseTime) {
      alerts.push({
        severity: 'warning',
        component: 'agent_system',
        message: `Agent response time ${metrics.agentResponseTime}ms exceeds threshold`,
        timestamp: new Date().toISOString(),
        threshold: this.defaultThresholds.agentResponseTime,
        actualValue: metrics.agentResponseTime
      });
    }

    if (metrics.databaseQueryTime > this.defaultThresholds.databaseQueryTime) {
      alerts.push({
        severity: 'warning',
        component: 'database',
        message: `Database query time ${metrics.databaseQueryTime}ms exceeds threshold`,
        timestamp: new Date().toISOString(),
        threshold: this.defaultThresholds.databaseQueryTime,
        actualValue: metrics.databaseQueryTime
      });
    }

    if (metrics.apiConnectivity < this.defaultThresholds.portalConnectivity) {
      const severity = metrics.apiConnectivity < 80 ? 'critical' : 'warning';
      alerts.push({
        severity,
        component: 'external_apis',
        message: `API connectivity ${metrics.apiConnectivity}% below threshold`,
        timestamp: new Date().toISOString(),
        threshold: this.defaultThresholds.portalConnectivity,
        actualValue: metrics.apiConnectivity
      });
    }

    return alerts;
  }

  private createAuditSummary(metrics: SystemHealthMetrics, alerts: PerformanceAlert[]): AuditSummary {
    return {
      checksPerformed: 15,
      anomaliesDetected: alerts.length,
      complianceStatus: alerts.some(a => a.severity === 'critical') ? 'violation' : 
                       alerts.some(a => a.severity === 'warning') ? 'warning' : 'compliant',
      lastAuditTime: new Date().toISOString(),
      retentionCompliance: true
    };
  }

  private generateHealthRecommendations(metrics: SystemHealthMetrics, alerts: PerformanceAlert[]): string[] {
    const recommendations: string[] = [];

    if (alerts.some(a => a.component === 'agent_system')) {
      recommendations.push('Consider scaling agent resources or optimizing response logic');
    }

    if (alerts.some(a => a.component === 'database')) {
      recommendations.push('Review database queries and consider index optimization');
    }

    if (alerts.some(a => a.component === 'external_apis')) {
      recommendations.push('Check external API status and implement retry mechanisms');
    }

    if (metrics.overallHealth === 'poor' || metrics.overallHealth === 'critical') {
      recommendations.push('Immediate system review required - consider maintenance window');
    }

    return recommendations.length > 0 ? recommendations : ['System operating within normal parameters'];
  }

  private async performTaskVerification(taskId: string, expectedOutcomes: string[], _context: TaskContext): Promise<TaskVerificationResult> {
    // Mock task verification implementation
    const verifiedOutcomes: string[] = [];
    const missedOutcomes: string[] = [];

    // Simulate outcome verification
    for (const outcome of expectedOutcomes) {
      // 85% success rate simulation
      if (Math.random() > 0.15) {
        verifiedOutcomes.push(outcome);
      } else {
        missedOutcomes.push(outcome);
      }
    }

    const qualityScore = Math.round((verifiedOutcomes.length / expectedOutcomes.length) * 100);
    
    let completionStatus: 'completed' | 'partial' | 'failed' | 'pending' = 'completed';
    if (qualityScore < 50) {
      completionStatus = 'failed';
    } else if (qualityScore < 100) {
      completionStatus = 'partial';
    }

    const recommendedActions: string[] = [];
    if (missedOutcomes.length > 0) {
      recommendedActions.push(`Address ${missedOutcomes.length} missed outcomes`);
      recommendedActions.push('Review task execution workflow');
    }

    return {
      taskId,
      completionStatus,
      verifiedOutcomes,
      missedOutcomes,
      qualityScore,
      recommendedActions
    };
  }

  private async compileAuditReport(timeRange: any, scope: string, _context: TaskContext): Promise<any> {
    // Mock audit report compilation
    return {
      totalEntries: Math.floor(Math.random() * 1000) + 100,
      scope,
      timeRange,
      complianceViolations: Math.floor(Math.random() * 5),
      successfulOperations: Math.floor(Math.random() * 950) + 50,
      generatedAt: new Date().toISOString()
    };
  }

  private assessComplianceStatus(auditReport: any): 'compliant' | 'warning' | 'violation' {
    if (auditReport.complianceViolations === 0) return 'compliant';
    if (auditReport.complianceViolations <= 2) return 'warning';
    return 'violation';
  }

  private generateComplianceRecommendations(auditReport: any): string[] {
    const recommendations: string[] = [];
    
    if (auditReport.complianceViolations > 0) {
      recommendations.push(`Address ${auditReport.complianceViolations} compliance violations`);
      recommendations.push('Review audit trail retention policies');
    }

    return recommendations.length > 0 ? recommendations : ['Audit compliance maintained successfully'];
  }

  private async performAnomalyDetection(_scope: string, _context: TaskContext): Promise<PerformanceAlert[]> {
    const anomalies: PerformanceAlert[] = [];
    
    // Mock anomaly detection
    if (Math.random() > 0.7) {
      anomalies.push({
        severity: 'warning',
        component: 'payment_processor',
        message: 'Unusual payment processing latency detected',
        timestamp: new Date().toISOString()
      });
    }

    if (Math.random() > 0.9) {
      anomalies.push({
        severity: 'critical',
        component: 'agent_orchestrator',
        message: 'Agent orchestration failure rate elevated',
        timestamp: new Date().toISOString()
      });
    }

    return anomalies;
  }

  private generateAnomalyRecommendations(anomalies: PerformanceAlert[]): string[] {
    return anomalies.map(anomaly => `Investigate ${anomaly.component}: ${anomaly.message}`);
  }

  private async collectPerformanceMetrics(scope: string): Promise<any> {
    // Mock performance metrics collection
    return {
      scope,
      metrics: {
        averageResponseTime: Math.random() * 2000 + 500,
        throughput: Math.random() * 100 + 50,
        errorRate: Math.random() * 5,
        resourceUtilization: Math.random() * 30 + 40
      },
      timestamp: new Date().toISOString()
    };
  }

  private analyzePerformanceTrends(_performanceData: any): any[] {
    // Mock trend analysis
    return [
      {
        metric: 'response_time',
        trend: 'stable',
        change: '+2%',
        significance: 'low'
      },
      {
        metric: 'throughput',
        trend: 'improving',
        change: '+15%',
        significance: 'medium'
      }
    ];
  }

  private getPerformanceBenchmarks(): any {
    return {
      responseTime: { target: 1000, acceptable: 2000 },
      throughput: { target: 100, minimum: 50 },
      errorRate: { target: 1, maximum: 5 }
    };
  }

  private generatePerformanceInsights(performanceData: any, trends: any[]): string[] {
    const insights: string[] = [];
    
    if (trends.some(t => t.trend === 'improving')) {
      insights.push('System performance is showing positive trends');
    }
    
    if (performanceData.metrics.errorRate > 2) {
      insights.push('Error rate elevated - investigate root causes');
    }

    return insights.length > 0 ? insights : ['Performance metrics within expected ranges'];
  }

  // UI Creation methods
  private createHealthDashboardUI(metrics: SystemHealthMetrics, alerts: PerformanceAlert[], audit: AuditSummary): UIRequest {
    return {
      requestId: `health_dashboard_${Date.now()}`,
      templateType: UITemplateType.DataSummary,
      semanticData: {
        agentRole: 'monitoring_agent',
        title: 'System Health Dashboard',
        description: `System status: ${metrics.overallHealth.toUpperCase()}`,
        healthMetrics: metrics,
        alerts,
        auditSummary: audit,
        overallStatus: metrics.overallHealth,
        actions: {
          refresh: {
            type: 'custom',
            label: 'Refresh Status',
            handler: () => ({ action: 'refresh_health_check' })
          },
          view_details: {
            type: 'custom',
            label: 'View Details',
            handler: () => ({ action: 'view_detailed_metrics' })
          },
          acknowledge_alerts: alerts.length > 0 ? {
            type: 'submit',
            label: 'Acknowledge Alerts',
            primary: true,
            handler: () => ({ action: 'acknowledge_alerts', alertIds: alerts.map(a => a.timestamp) })
          } : undefined
        }
      },
      context: {
        userProgress: 100,
        deviceType: 'desktop',
        urgency: alerts.some(a => a.severity === 'critical') ? 'high' : 'medium'
      }
    } as any;
  }

  private createVerificationReportUI(result: TaskVerificationResult): UIRequest {
    return {
      requestId: `verification_report_${Date.now()}`,
      templateType: UITemplateType.DataSummary,
      semanticData: {
        agentRole: 'monitoring_agent',
        title: `Task Verification Report: ${result.taskId}`,
        description: `Quality score: ${result.qualityScore}% - ${result.completionStatus}`,
        verificationResult: result,
        qualityScore: result.qualityScore,
        completionStatus: result.completionStatus,
        actions: {
          approve: result.qualityScore >= 85 ? {
            type: 'submit',
            label: 'Approve Task',
            primary: true,
            handler: () => ({ action: 'approve_task_completion', taskId: result.taskId })
          } : undefined,
          review: {
            type: 'custom',
            label: 'Review Issues',
            handler: () => ({ action: 'review_task_issues', taskId: result.taskId, issues: result.missedOutcomes })
          },
          retry: result.completionStatus === 'failed' ? {
            type: 'custom',
            label: 'Retry Task',
            handler: () => ({ action: 'retry_task_execution', taskId: result.taskId })
          } : undefined
        }
      },
      context: {
        userProgress: result.qualityScore,
        deviceType: 'desktop',
        urgency: result.completionStatus === 'failed' ? 'high' : 'medium'
      }
    } as any;
  }

  private createAnomalyReportUI(anomalies: PerformanceAlert[]): UIRequest {
    return {
      requestId: `anomaly_report_${Date.now()}`,
      templateType: UITemplateType.ErrorDisplay,
      semanticData: {
        agentRole: 'monitoring_agent',
        title: 'System Anomalies Detected',
        description: `${anomalies.length} anomalies found, ${anomalies.filter(a => a.severity === 'critical').length} critical`,
        anomalies,
        severity: anomalies.some(a => a.severity === 'critical') ? 'critical' : 'warning',
        actions: {
          investigate: {
            type: 'submit',
            label: 'Start Investigation',
            primary: true,
            handler: () => ({ action: 'investigate_anomalies', anomalies: anomalies.map(a => a.component) })
          },
          escalate: {
            type: 'custom',
            label: 'Escalate to Admin',
            handler: () => ({ action: 'escalate_anomalies', severity: 'critical' })
          },
          suppress: {
            type: 'custom',
            label: 'Suppress Alerts',
            handler: () => ({ action: 'suppress_anomaly_alerts', duration: '1hour' })
          }
        }
      },
      context: {
        userProgress: 0,
        deviceType: 'desktop',
        urgency: 'high'
      }
    } as any;
  }

  /**
   * Record context entry with proper reasoning
   */
  private async recordContextEntry(context: TaskContext, entry: Partial<ContextEntry>): Promise<void> {
    const contextEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: (context.history?.length || 0) + 1,
      actor: {
        type: 'agent',
        id: 'monitoring_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Monitoring operation',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'monitoring',
        details: {}
      }
    };

    if (!context.history) {
      context.history = [];
    }
    context.history.push(contextEntry);

    // Also persist to database if context has an ID
    if (context.contextId) {
      try {
        const db = DatabaseService.getInstance();
        await db.createContextHistoryEntry(context.contextId, contextEntry);
      } catch (error) {
        console.error('Failed to persist context entry to database:', error);
        // Continue even if database write fails
      }
    }
  }
}