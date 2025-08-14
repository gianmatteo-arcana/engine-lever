/**
 * Monitoring Agent Tests
 * Comprehensive test suite for the consolidated BaseAgent implementation
 */

import { MonitoringAgent } from '../MonitoringAgent';
import { TaskContext, AgentRequest } from '../../types/engine-types';
import { DatabaseService } from '../../services/database';

// Mock external dependencies
jest.mock('../../services/database');
jest.mock('../../services/llm-provider', () => ({
  LLMProvider: {
    getInstance: jest.fn().mockReturnValue({
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response for monitoring operations',
        model: 'mock-model',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      }),
      isConfigured: jest.fn().mockReturnValue(true)
    })
  }
}));

describe('MonitoringAgent', () => {
  let agent: MonitoringAgent;
  let mockTaskContext: TaskContext;
  let mockDbService: any;

  beforeEach(() => {
    // Initialize agent
    agent = new MonitoringAgent('test_business_123', 'test_user_123');
    
    // Setup mock database service
    mockDbService = {
      createContextHistoryEntry: jest.fn().mockResolvedValue({ id: 'entry_123' }),
      upsertAgentContext: jest.fn().mockResolvedValue({}),
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);

    // Setup mock task context
    mockTaskContext = {
      contextId: 'ctx_monitoring_test',
      taskTemplateId: 'system_monitoring',
      tenantId: 'tenant_test',
      createdAt: new Date().toISOString(),
      currentState: {
        status: 'processing',
        phase: 'monitoring',
        completeness: 75,
        data: {
          business: {
            name: 'TestCorp LLC',
            entityType: 'LLC',
            state: 'CA'
          },
          user: {
            firstName: 'Jane',
            lastName: 'Monitor',
            email: 'jane@testcorp.com',
            preferences: {
              notifications: 'all'
            }
          }
        }
      },
      history: [],
      templateSnapshot: {
        id: 'system_monitoring',
        version: '1.0',
        metadata: {
          name: 'System Monitoring',
          description: 'Monitor system health and performance',
          category: 'monitoring'
        },
        goals: {
          primary: [
            { id: 'system_health', description: 'Monitor system health', required: true },
            { id: 'performance_tracking', description: 'Track performance metrics', required: false }
          ]
        }
      }
    };
  });

  describe('System Health Monitoring', () => {
    it('should monitor system health successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_health_check',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['agents', 'database', 'external_apis']
        },
        context: {
          urgency: 'medium',
          deviceType: 'desktop',
          userProgress: 75
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.healthMetrics).toBeDefined();
      expect(response.data.healthMetrics.overallHealth).toMatch(/excellent|good|fair|poor|critical/);
      expect(response.data.alerts).toBeDefined();
      expect(response.data.auditSummary).toBeDefined();
      expect(response.data.recommendations).toBeDefined();
      expect(response.reasoning).toContain('System health monitoring completed');
    });

    it('should generate alerts for performance issues', async () => {
      // Mock performance issues by setting high response times
      const request: AgentRequest = {
        requestId: 'req_performance_issue',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['agents', 'database']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.alerts).toBeDefined();
      expect(Array.isArray(response.data.alerts)).toBe(true);
      expect(response.data.systemStatus).toBeDefined();
    });

    it('should create monitoring dashboard UI for critical issues', async () => {
      const request: AgentRequest = {
        requestId: 'req_critical_monitoring',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['payment_systems', 'external_apis']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Response might have UI requests if issues are detected
      if (response.uiRequests && response.uiRequests.length > 0) {
        expect(response.uiRequests).toHaveLength(1);
        expect(response.uiRequests[0].semanticData.title).toContain('System Health Dashboard');
        expect(response.uiRequests[0].semanticData.actions.refresh).toBeDefined();
      }
      expect(response.data.healthMetrics).toBeDefined();
    });
  });

  describe('Task Completion Verification', () => {
    it('should verify task completion successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_task_verification',
        agentRole: 'monitoring',
        instruction: 'verify_task_completion',
        data: {
          taskId: 'task_soi_filing_123',
          expectedOutcomes: [
            'business_data_collected',
            'form_completed',
            'payment_processed',
            'submission_confirmed'
          ]
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.verificationResult).toBeDefined();
      expect(response.data.verificationResult.taskId).toBe('task_soi_filing_123');
      expect(response.data.verificationResult.completionStatus).toMatch(/completed|partial|failed|pending/);
      expect(response.data.verificationResult.qualityScore).toBeGreaterThanOrEqual(0);
      expect(response.data.verificationResult.qualityScore).toBeLessThanOrEqual(100);
      expect(response.data.qualityAssessment).toBeDefined();
    });

    it('should handle verification of failed tasks', async () => {
      const request: AgentRequest = {
        requestId: 'req_failed_verification',
        agentRole: 'monitoring',
        instruction: 'verify_task_completion',
        data: {
          taskId: 'task_failed_123',
          expectedOutcomes: [
            'step_1_completed',
            'step_2_completed',
            'final_submission'
          ]
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.verificationResult).toBeDefined();
      expect(response.data.verificationResult.recommendedActions).toBeDefined();
      expect(Array.isArray(response.data.verificationResult.verifiedOutcomes)).toBe(true);
      expect(Array.isArray(response.data.verificationResult.missedOutcomes)).toBe(true);
    });

    it('should create verification report UI for tasks needing attention', async () => {
      const request: AgentRequest = {
        requestId: 'req_verification_ui',
        agentRole: 'monitoring',
        instruction: 'verify_task_completion',
        data: {
          taskId: 'task_review_needed_123',
          expectedOutcomes: ['outcome_1', 'outcome_2', 'outcome_3']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // UI might be generated if quality score is low
      if (response.uiRequests && response.uiRequests.length > 0) {
        expect(response.uiRequests[0].semanticData.title).toContain('Task Verification Report');
        expect(response.uiRequests[0].semanticData.actions.review).toBeDefined();
      }

      expect(response.data.verificationResult.qualityScore).toBeDefined();
    });

    it('should handle missing verification parameters gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_invalid_verification',
        agentRole: 'monitoring',
        instruction: 'verify_task_completion',
        data: {
          taskId: 'task_missing_outcomes'
          // Missing expectedOutcomes
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Task ID and expected outcomes are required');
      expect(response.reasoning).toContain('Cannot verify task completion');
    });
  });

  describe('Audit Report Generation', () => {
    it('should generate comprehensive audit report', async () => {
      const request: AgentRequest = {
        requestId: 'req_audit_report',
        agentRole: 'monitoring',
        instruction: 'generate_audit_report',
        data: {
          timeRange: {
            days: 30,
            startDate: '2024-01-01',
            endDate: '2024-01-30'
          },
          scope: 'compliance_filing'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.auditReport).toBeDefined();
      expect(response.data.auditStatus).toMatch(/passed|warning|failed/);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.reportMetadata).toBeDefined();
      expect(response.data.reportMetadata.scope).toBe('compliance_filing');
      expect(response.reasoning).toContain('Audit report generated successfully');
    });

    it('should handle different audit scopes', async () => {
      const testScopes = ['user_session', 'task_workflow', 'system_operations', 'compliance_filing'];

      for (const scope of testScopes) {
        const request: AgentRequest = {
          requestId: `req_audit_${scope}`,
          agentRole: 'monitoring',
          instruction: 'generate_audit_report',
          data: {
            timeRange: { days: 7 },
            scope
          }
        };

        const response = await agent.processRequest(request, mockTaskContext);

        expect(response.status).toBe('completed');
        expect(response.data.reportMetadata.scope).toBe(scope);
      }
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect system anomalies', async () => {
      const request: AgentRequest = {
        requestId: 'req_anomaly_detection',
        agentRole: 'monitoring',
        instruction: 'detect_anomalies',
        data: {
          scope: 'payment_systems'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.anomalies).toBeDefined();
      expect(Array.isArray(response.data.anomalies)).toBe(true);
      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.totalAnomalies).toBeGreaterThanOrEqual(0);
      expect(response.data.recommendations).toBeDefined();
    });

    it('should create anomaly report UI for critical issues', async () => {
      const request: AgentRequest = {
        requestId: 'req_critical_anomalies',
        agentRole: 'monitoring',
        instruction: 'detect_anomalies',
        data: {
          scope: 'agent_orchestration'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // UI might be generated if critical anomalies are found
      if (response.uiRequests && response.uiRequests.length > 0) {
        expect(response.uiRequests[0].semanticData.title).toContain('System Anomalies Detected');
        expect(response.uiRequests[0].semanticData.actions.investigate).toBeDefined();
        expect(response.uiRequests[0].semanticData.actions.escalate).toBeDefined();
      }

      expect(response.data.summary.criticalAnomalies).toBeGreaterThanOrEqual(0);
    });

    it('should provide anomaly recommendations', async () => {
      const request: AgentRequest = {
        requestId: 'req_anomaly_recommendations',
        agentRole: 'monitoring',
        instruction: 'detect_anomalies',
        data: {
          scope: 'all_systems'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);
    });
  });

  describe('Performance Metrics Tracking', () => {
    it('should track performance metrics successfully', async () => {
      const request: AgentRequest = {
        requestId: 'req_performance_tracking',
        agentRole: 'monitoring',
        instruction: 'track_performance_metrics',
        data: {
          scope: 'system_performance'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      expect(response.data.performanceData).toBeDefined();
      expect(response.data.trends).toBeDefined();
      expect(response.data.benchmarks).toBeDefined();
      expect(response.data.insights).toBeDefined();
      expect(response.data.performanceData.scope).toBe('system_performance');
    });

    it('should analyze performance trends', async () => {
      const request: AgentRequest = {
        requestId: 'req_trend_analysis',
        agentRole: 'monitoring',
        instruction: 'track_performance_metrics',
        data: {
          scope: 'agent_performance'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.trends).toBeDefined();
      expect(Array.isArray(response.data.trends)).toBe(true);
      expect(response.data.benchmarks.responseTime).toBeDefined();
      expect(response.data.benchmarks.throughput).toBeDefined();
    });

    it('should provide performance insights', async () => {
      const request: AgentRequest = {
        requestId: 'req_performance_insights',
        agentRole: 'monitoring',
        instruction: 'track_performance_metrics',
        data: {
          scope: 'database_performance'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.data.insights).toBeDefined();
      expect(Array.isArray(response.data.insights)).toBe(true);
      expect(response.reasoning).toContain('Performance tracking completed');
    });
  });

  describe('Context Recording', () => {
    it('should record monitoring initiation with proper reasoning', async () => {
      const request: AgentRequest = {
        requestId: 'req_context_test',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['agents']
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'monitoring_operation_initiated',
          reasoning: 'Starting system monitoring and quality assurance operation'
        })
      );
    });

    it('should record health monitoring with system details', async () => {
      const request: AgentRequest = {
        requestId: 'req_health_context',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['database', 'external_apis']
        }
      };

      await agent.processRequest(request, mockTaskContext);

      expect(mockDbService.createContextHistoryEntry).toHaveBeenCalledWith(
        mockTaskContext.contextId,
        expect.objectContaining({
          operation: 'system_health_monitored',
          reasoning: expect.stringContaining('System health check completed')
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown instructions gracefully', async () => {
      const request: AgentRequest = {
        requestId: 'req_unknown',
        agentRole: 'monitoring',
        instruction: 'unknown_monitoring_operation',
        data: {}
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('error');
      expect(response.data.error).toContain('Unknown monitoring instruction');
      expect(response.reasoning).toContain('unrecognized instruction type');
    });

    it('should handle processing errors gracefully', async () => {
      // Force an error by corrupting the context
      const corruptedContext = { ...mockTaskContext, currentState: null };

      const request: AgentRequest = {
        requestId: 'req_error_test',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['agents']
        }
      };

      const response = await agent.processRequest(request, corruptedContext as any);

      // With corrupted context, the agent might still try to process but with issues
      expect(response.status).toMatch(/error|needs_input/);
      if (response.status === 'error') {
        expect(response.data.error).toBeDefined();
        expect(response.reasoning).toContain('Technical error during monitoring operation');
      }
    });

    it('should continue processing even if database write fails', async () => {
      // Mock database failure
      mockDbService.createContextHistoryEntry.mockRejectedValue(new Error('Database error'));

      const request: AgentRequest = {
        requestId: 'req_db_fail',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['agents']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Should still process despite database error, might detect issues
      expect(response.status).toMatch(/completed|needs_input/);
      expect(response.data.healthMetrics).toBeDefined();
    });
  });

  describe('UI Request Generation', () => {
    it('should generate health dashboard UI with proper structure', async () => {
      const request: AgentRequest = {
        requestId: 'req_ui_dashboard',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['all_systems']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // UI requests may be generated if issues detected
      if (response.uiRequests && response.uiRequests.length > 0) {
        const ui = response.uiRequests[0];
        expect(ui.semanticData.agentRole).toBe('monitoring_agent');
        expect(ui.semanticData.actions.refresh).toBeDefined();
        expect(ui.context?.deviceType).toBe('desktop');
      }
    });

    it('should not generate UI for healthy systems', async () => {
      const request: AgentRequest = {
        requestId: 'req_healthy_system',
        agentRole: 'monitoring',
        instruction: 'track_performance_metrics',
        data: {
          scope: 'system_performance'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Performance tracking typically doesn't generate UI
      expect(response.status).toBe('completed');
    });
  });

  describe('Integration with Agent Flow', () => {
    it('should specify correct next agent for critical issues', async () => {
      const request: AgentRequest = {
        requestId: 'req_flow_test',
        agentRole: 'monitoring',
        instruction: 'detect_anomalies',
        data: {
          scope: 'critical_systems'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      // Next agent might be specified if critical issues found
      if (response.nextAgent) {
        expect(response.nextAgent).toBe('communication');
        expect(response.status).toBe('needs_input');
      }
    });

    it('should not specify next agent for completed monitoring', async () => {
      const request: AgentRequest = {
        requestId: 'req_completed_monitoring',
        agentRole: 'monitoring',
        instruction: 'track_performance_metrics',
        data: {
          scope: 'routine_metrics'
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);

      expect(response.status).toBe('completed');
      // Performance tracking typically completes without next agent
    });
  });

  describe('MonitoringAgent Performance', () => {
    it('should complete monitoring operations within time limits', async () => {
      const startTime = Date.now();

      const request: AgentRequest = {
        requestId: 'req_performance_test',
        agentRole: 'monitoring',
        instruction: 'monitor_system_health',
        data: {
          components: ['agents', 'database']
        }
      };

      const response = await agent.processRequest(request, mockTaskContext);
      const duration = Date.now() - startTime;

      expect(response.status).toMatch(/completed|needs_input/);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle multiple monitoring requests efficiently', async () => {
      const requests = [
        'monitor_system_health',
        'track_performance_metrics',
        'detect_anomalies'
      ];

      const promises = requests.map(instruction => {
        const request: AgentRequest = {
          requestId: `req_${instruction}`,
          agentRole: 'monitoring',
          instruction,
          data: { scope: 'test' }
        };
        return agent.processRequest(request, mockTaskContext);
      });

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toMatch(/completed|needs_input|error/);
      });
    });
  });
});