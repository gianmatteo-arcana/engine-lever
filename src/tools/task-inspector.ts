/**
 * Task Inspector
 * 
 * Advanced debugging and inspection tool for task execution,
 * providing deep insights into agent behavior, state transitions,
 * and performance characteristics.
 */

import { StateComputer, ComputedState } from '../services/state-computer';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse 
} from '../types/engine-types';
import { DatabaseService } from '../services/database';
import { logger } from '../utils/logger';

export interface InspectionReport {
  taskId: string;
  timestamp: string;
  summary: {
    status: string;
    phase: string;
    completeness: number;
    totalEvents: number;
    activeAgents: string[];
    dataQuality: number;
  };
  timeline: TimelineEntry[];
  stateTransitions: StateTransition[];
  agentMetrics: AgentMetrics[];
  dataLineage: DataLineage[];
  anomalies: Anomaly[];
  recommendations: string[];
}

export interface TimelineEntry {
  timestamp: string;
  sequenceNumber: number;
  agent: string;
  operation: string;
  duration?: number;
  impact: 'high' | 'medium' | 'low';
}

export interface StateTransition {
  fromState: string;
  toState: string;
  trigger: string;
  timestamp: string;
  dataChanges: Record<string, any>;
}

export interface AgentMetrics {
  agentId: string;
  invocations: number;
  avgResponseTime: number;
  successRate: number;
  dataContribution: number;
  errors: number;
}

export interface DataLineage {
  field: string;
  origin: string;
  transformations: Array<{
    agent: string;
    operation: string;
    timestamp: string;
  }>;
  currentValue: any;
  confidence: number;
}

export interface Anomaly {
  type: 'performance' | 'data' | 'sequence' | 'state';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  timestamp: string;
  context: Record<string, any>;
}

export class TaskInspector {
  private static instance: TaskInspector;
  private dbService: DatabaseService;

  private constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  public static getInstance(): TaskInspector {
    if (!TaskInspector.instance) {
      TaskInspector.instance = new TaskInspector();
    }
    return TaskInspector.instance;
  }

  /**
   * Perform comprehensive inspection of a task
   */
  async inspectTask(taskContext: TaskContext): Promise<InspectionReport> {
    const startTime = Date.now();
    
    try {
      // Extract basic information
      const summary = this.generateSummary(taskContext);
      const timeline = this.buildTimeline(taskContext.history);
      const stateTransitions = this.analyzeStateTransitions(taskContext.history);
      const agentMetrics = this.calculateAgentMetrics(taskContext.history);
      const dataLineage = this.traceDataLineage(taskContext.history);
      const anomalies = this.detectAnomalies(taskContext);
      const recommendations = this.generateRecommendations(
        summary,
        agentMetrics,
        anomalies
      );

      const report: InspectionReport = {
        taskId: taskContext.contextId,
        timestamp: new Date().toISOString(),
        summary,
        timeline,
        stateTransitions,
        agentMetrics,
        dataLineage,
        anomalies,
        recommendations
      };

      // Log inspection completion
      logger.info('Task inspection completed', {
        taskId: taskContext.contextId,
        duration: Date.now() - startTime,
        anomaliesFound: anomalies.length
      });

      return report;
    } catch (error) {
      logger.error('Task inspection failed', { error, taskId: taskContext.contextId });
      throw error;
    }
  }

  /**
   * Generate task summary
   */
  private generateSummary(context: TaskContext): InspectionReport['summary'] {
    const activeAgents = this.getActiveAgents(context.history);
    const dataQuality = this.assessDataQuality(context.currentState);

    return {
      status: context.currentState.status,
      phase: context.currentState.phase,
      completeness: context.currentState.completeness,
      totalEvents: context.history.length,
      activeAgents,
      dataQuality
    };
  }

  /**
   * Build execution timeline
   */
  private buildTimeline(history: ContextEntry[]): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];
    let previousTimestamp: Date | null = null;

    for (const entry of history) {
      const currentTimestamp = new Date(entry.timestamp);
      const duration = previousTimestamp 
        ? currentTimestamp.getTime() - previousTimestamp.getTime()
        : undefined;

      timeline.push({
        timestamp: entry.timestamp,
        sequenceNumber: entry.sequenceNumber,
        agent: entry.actor.id,
        operation: entry.operation,
        duration,
        impact: this.assessOperationImpact(entry)
      });

      previousTimestamp = currentTimestamp;
    }

    return timeline;
  }

  /**
   * Analyze state transitions
   */
  private analyzeStateTransitions(history: ContextEntry[]): StateTransition[] {
    const transitions: StateTransition[] = [];
    
    for (let i = 1; i < history.length; i++) {
      const prevState = StateComputer.computeStateAtSequence(history, i - 1);
      const currState = StateComputer.computeStateAtSequence(history, i);
      
      // Check for state changes
      if (prevState.status !== currState.status || prevState.phase !== currState.phase) {
        const dataChanges = this.compareData(prevState.data, currState.data);
        
        transitions.push({
          fromState: `${prevState.status}:${prevState.phase}`,
          toState: `${currState.status}:${currState.phase}`,
          trigger: history[i].operation,
          timestamp: history[i].timestamp,
          dataChanges
        });
      }
    }

    return transitions;
  }

  /**
   * Calculate agent performance metrics
   */
  private calculateAgentMetrics(history: ContextEntry[]): AgentMetrics[] {
    const metricsMap = new Map<string, AgentMetrics>();

    for (const entry of history) {
      const agentId = entry.actor.id;
      
      if (!metricsMap.has(agentId)) {
        metricsMap.set(agentId, {
          agentId,
          invocations: 0,
          avgResponseTime: 0,
          successRate: 100,
          dataContribution: 0,
          errors: 0
        });
      }

      const metrics = metricsMap.get(agentId)!;
      metrics.invocations++;
      
      // Count data contributions
      if (entry.data && Object.keys(entry.data).length > 0) {
        metrics.dataContribution += Object.keys(entry.data).length;
      }

      // Track errors
      if (entry.operation.includes('error') || entry.operation.includes('failed')) {
        metrics.errors++;
        metrics.successRate = ((metrics.invocations - metrics.errors) / metrics.invocations) * 100;
      }
    }

    // Calculate average response times (mock for now)
    for (const metrics of metricsMap.values()) {
      metrics.avgResponseTime = Math.random() * 100 + 50; // 50-150ms mock
    }

    return Array.from(metricsMap.values());
  }

  /**
   * Trace data lineage
   */
  private traceDataLineage(history: ContextEntry[]): DataLineage[] {
    const lineageMap = new Map<string, DataLineage>();

    for (const entry of history) {
      if (!entry.data) continue;

      for (const [field, value] of Object.entries(entry.data)) {
        const fieldPath = this.flattenObject(entry.data, field);
        
        for (const path of fieldPath) {
          if (!lineageMap.has(path)) {
            lineageMap.set(path, {
              field: path,
              origin: entry.actor.id,
              transformations: [],
              currentValue: value,
              confidence: 1.0
            });
          }

          const lineage = lineageMap.get(path)!;
          lineage.transformations.push({
            agent: entry.actor.id,
            operation: entry.operation,
            timestamp: entry.timestamp
          });
          lineage.currentValue = value;
          
          // Adjust confidence based on transformations
          lineage.confidence = Math.max(0.5, 1.0 - (lineage.transformations.length * 0.1));
        }
      }
    }

    return Array.from(lineageMap.values());
  }

  /**
   * Detect anomalies in task execution
   */
  private detectAnomalies(context: TaskContext): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check for long gaps between events
    for (let i = 1; i < context.history.length; i++) {
      const gap = new Date(context.history[i].timestamp).getTime() - 
                  new Date(context.history[i - 1].timestamp).getTime();
      
      if (gap > 5000) { // More than 5 seconds
        anomalies.push({
          type: 'performance',
          severity: 'warning',
          description: `Long gap (${gap}ms) between events ${i - 1} and ${i}`,
          timestamp: context.history[i].timestamp,
          context: {
            previousOperation: context.history[i - 1].operation,
            currentOperation: context.history[i].operation
          }
        });
      }
    }

    // Check for repeated operations
    const operationCounts = new Map<string, number>();
    for (const entry of context.history) {
      const count = (operationCounts.get(entry.operation) || 0) + 1;
      operationCounts.set(entry.operation, count);
      
      if (count > 3) {
        anomalies.push({
          type: 'sequence',
          severity: 'warning',
          description: `Operation '${entry.operation}' repeated ${count} times`,
          timestamp: entry.timestamp,
          context: { operation: entry.operation, count }
        });
      }
    }

    // Check for stuck state
    if (context.currentState.status === 'processing' && 
        context.history.length > 10 &&
        context.currentState.completeness < 50) {
      anomalies.push({
        type: 'state',
        severity: 'critical',
        description: 'Task appears stuck in processing state',
        timestamp: new Date().toISOString(),
        context: {
          eventCount: context.history.length,
          completeness: context.currentState.completeness
        }
      });
    }

    // Check for data quality issues
    const missingFields = this.checkRequiredFields(context.currentState.data);
    if (missingFields.length > 0) {
      anomalies.push({
        type: 'data',
        severity: 'warning',
        description: `Missing required fields: ${missingFields.join(', ')}`,
        timestamp: new Date().toISOString(),
        context: { missingFields }
      });
    }

    return anomalies;
  }

  /**
   * Generate recommendations based on inspection
   */
  private generateRecommendations(
    summary: InspectionReport['summary'],
    metrics: AgentMetrics[],
    anomalies: Anomaly[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    const slowAgents = metrics.filter(m => m.avgResponseTime > 200);
    if (slowAgents.length > 0) {
      recommendations.push(
        `Consider optimizing these slow agents: ${slowAgents.map(a => a.agentId).join(', ')}`
      );
    }

    // Error rate recommendations
    const errorProneAgents = metrics.filter(m => m.successRate < 90);
    if (errorProneAgents.length > 0) {
      recommendations.push(
        `Investigate high error rates in: ${errorProneAgents.map(a => a.agentId).join(', ')}`
      );
    }

    // Completeness recommendations
    if (summary.completeness < 50 && summary.totalEvents > 5) {
      recommendations.push(
        'Task progress is slow. Consider reviewing agent workflow or data requirements.'
      );
    }

    // Data quality recommendations
    if (summary.dataQuality < 80) {
      recommendations.push(
        'Data quality is below threshold. Implement additional validation or data enrichment.'
      );
    }

    // Anomaly-based recommendations
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      recommendations.push(
        `Address ${criticalAnomalies.length} critical anomalies immediately.`
      );
    }

    // Workflow optimization
    const repeatedOps = anomalies.filter(a => a.type === 'sequence');
    if (repeatedOps.length > 0) {
      recommendations.push(
        'Detected repeated operations. Consider implementing retry limits or circuit breakers.'
      );
    }

    return recommendations;
  }

  /**
   * Helper: Get active agents from history
   */
  private getActiveAgents(history: ContextEntry[]): string[] {
    const agents = new Set<string>();
    const recentThreshold = Date.now() - 60000; // Last minute

    for (const entry of history) {
      const timestamp = new Date(entry.timestamp).getTime();
      if (timestamp > recentThreshold) {
        agents.add(entry.actor.id);
      }
    }

    return Array.from(agents);
  }

  /**
   * Helper: Assess data quality
   */
  private assessDataQuality(state: ComputedState): number {
    const data = state.data;
    let score = 100;

    // Check for null/undefined values
    const nullCount = this.countNullValues(data);
    score -= nullCount * 5;

    // Check for empty strings
    const emptyCount = this.countEmptyStrings(data);
    score -= emptyCount * 3;

    // Check for completeness
    const completenessRatio = state.completeness / 100;
    score = score * completenessRatio;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Helper: Assess operation impact
   */
  private assessOperationImpact(entry: ContextEntry): 'high' | 'medium' | 'low' {
    // High impact operations
    if (entry.operation.includes('completed') || 
        entry.operation.includes('failed') ||
        entry.operation.includes('requirements_identified')) {
      return 'high';
    }

    // Medium impact operations
    if (entry.operation.includes('found') ||
        entry.operation.includes('collected') ||
        entry.operation.includes('started')) {
      return 'medium';
    }

    // Low impact operations
    return 'low';
  }

  /**
   * Helper: Compare data objects
   */
  private compareData(prev: any, curr: any): Record<string, any> {
    const changes: Record<string, any> = {};

    // Find added fields
    for (const key in curr) {
      if (!(key in prev)) {
        changes[`+${key}`] = curr[key];
      } else if (JSON.stringify(prev[key]) !== JSON.stringify(curr[key])) {
        changes[`~${key}`] = { from: prev[key], to: curr[key] };
      }
    }

    // Find removed fields
    for (const key in prev) {
      if (!(key in curr)) {
        changes[`-${key}`] = prev[key];
      }
    }

    return changes;
  }

  /**
   * Helper: Flatten nested object
   */
  private flattenObject(obj: any, prefix = ''): string[] {
    const paths: string[] = [];

    for (const key in obj) {
      const path = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        paths.push(...this.flattenObject(obj[key], path));
      } else {
        paths.push(path);
      }
    }

    return paths;
  }

  /**
   * Helper: Check required fields
   */
  private checkRequiredFields(data: any): string[] {
    const required = [
      'business.name',
      'business.entityType',
      'business.state'
    ];

    const missing: string[] = [];
    for (const field of required) {
      const parts = field.split('.');
      let value = data;
      
      for (const part of parts) {
        value = value?.[part];
      }
      
      if (!value) {
        missing.push(field);
      }
    }

    return missing;
  }

  /**
   * Helper: Count null values
   */
  private countNullValues(obj: any, count = 0): number {
    for (const key in obj) {
      if (obj[key] === null || obj[key] === undefined) {
        count++;
      } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        count = this.countNullValues(obj[key], count);
      }
    }
    return count;
  }

  /**
   * Helper: Count empty strings
   */
  private countEmptyStrings(obj: any, count = 0): number {
    for (const key in obj) {
      if (obj[key] === '') {
        count++;
      } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        count = this.countEmptyStrings(obj[key], count);
      }
    }
    return count;
  }

  /**
   * Export inspection report as JSON
   */
  exportAsJSON(report: InspectionReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export inspection report as HTML
   */
  exportAsHTML(report: InspectionReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Task Inspection Report - ${report.taskId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 1px solid #ccc; }
    .summary { background: #f5f5f5; padding: 10px; border-radius: 5px; }
    .anomaly { padding: 5px; margin: 5px 0; border-left: 3px solid; }
    .anomaly.critical { border-color: red; background: #ffe6e6; }
    .anomaly.warning { border-color: orange; background: #fff9e6; }
    .anomaly.info { border-color: blue; background: #e6f3ff; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Task Inspection Report</h1>
  <div class="summary">
    <p><strong>Task ID:</strong> ${report.taskId}</p>
    <p><strong>Status:</strong> ${report.summary.status}</p>
    <p><strong>Completeness:</strong> ${report.summary.completeness}%</p>
    <p><strong>Total Events:</strong> ${report.summary.totalEvents}</p>
    <p><strong>Data Quality:</strong> ${report.summary.dataQuality}%</p>
  </div>
  
  <h2>Anomalies (${report.anomalies.length})</h2>
  ${report.anomalies.map(a => `
    <div class="anomaly ${a.severity}">
      <strong>${a.type}:</strong> ${a.description}
    </div>
  `).join('')}
  
  <h2>Recommendations</h2>
  <ul>
    ${report.recommendations.map(r => `<li>${r}</li>`).join('')}
  </ul>
  
  <h2>Agent Metrics</h2>
  <table>
    <tr>
      <th>Agent</th>
      <th>Invocations</th>
      <th>Avg Response Time</th>
      <th>Success Rate</th>
      <th>Data Contribution</th>
    </tr>
    ${report.agentMetrics.map(m => `
      <tr>
        <td>${m.agentId}</td>
        <td>${m.invocations}</td>
        <td>${m.avgResponseTime.toFixed(2)}ms</td>
        <td>${m.successRate.toFixed(1)}%</td>
        <td>${m.dataContribution}</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>
    `;
  }
}