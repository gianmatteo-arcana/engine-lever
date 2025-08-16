/**
 * A2A Event Bus Demo API
 * 
 * Isolated demo API that showcases A2A Event Bus capabilities
 * without depending on demo agent classes outside src directory.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

interface A2ADemoSession {
  id: string;
  contextId: string;
  status: 'initializing' | 'running' | 'completed' | 'error';
  agents: Array<{
    type: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    startedAt?: number;
    completedAt?: number;
  }>;
  events: Array<{
    timestamp: number;
    agent: string;
    action: string;
    status: string;
    reasoning?: string;
    data?: any;
  }>;
  createdAt: number;
}

// In-memory demo sessions
const demoSessions = new Map<string, A2ADemoSession>();

/**
 * Start A2A Event Bus Demo Session
 */
router.post('/start-demo', async (req: Request, res: Response) => {
  try {
    const { scenario = 'compliance-analysis' } = req.body;
    
    const sessionId = `a2a-demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const contextId = `demo-ctx-${sessionId}`;
    
    logger.info('Starting A2A demo session', { sessionId, scenario });
    
    const session: A2ADemoSession = {
      id: sessionId,
      contextId,
      status: 'initializing',
      agents: [
        { type: 'BusinessDiscoveryAgent', status: 'pending' },
        { type: 'ComplianceAnalyzer', status: 'pending' }
      ],
      events: [],
      createdAt: Date.now()
    };
    
    demoSessions.set(sessionId, session);
    
    // Start demo execution asynchronously
    executeDemoScenario(sessionId, scenario).catch(error => {
      logger.error('Demo execution failed', { sessionId, error: error.message });
      session.status = 'error';
    });
    
    res.json({
      sessionId,
      contextId,
      status: 'started',
      message: 'A2A Event Bus demo session started',
      sseEndpoint: `/api/a2a-demo/stream/${sessionId}`,
      statusEndpoint: `/api/a2a-demo/status/${sessionId}`
    });
    
  } catch (error) {
    logger.error('Failed to start A2A demo', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      error: 'Failed to start demo session',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Demo Session Status
 */
router.get('/status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = demoSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Demo session not found' });
  }
  
  res.json({
    sessionId,
    contextId: session.contextId,
    status: session.status,
    agents: session.agents,
    eventCount: session.events.length,
    duration: Date.now() - session.createdAt,
    lastActivity: session.events.length > 0 ? 
      session.events[session.events.length - 1].timestamp : session.createdAt
  });
});

/**
 * Server-Sent Events stream for real-time demo updates
 */
router.get('/stream/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = demoSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Demo session not found' });
  }
  
  logger.info('SSE stream requested for A2A demo', { sessionId });
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'demo_connected',
    sessionId,
    contextId: session.contextId,
    timestamp: Date.now()
  })}\n\n`);
  
  // Send historical events
  session.events.forEach(event => {
    res.write(`data: ${JSON.stringify({
      type: 'demo_event',
      sessionId,
      ...event
    })}\n\n`);
  });
  
  // Set up real-time event forwarding
  const eventInterval = setInterval(() => {
    const currentSession = demoSessions.get(sessionId);
    if (!currentSession) {
      clearInterval(eventInterval);
      return;
    }
    
    // Send heartbeat
    res.write(`data: ${JSON.stringify({
      type: 'demo_heartbeat',
      sessionId,
      timestamp: Date.now(),
      status: currentSession.status
    })}\n\n`);
  }, 10000);
  
  // Clean up on client disconnect
  req.on('close', () => {
    logger.info('SSE client disconnected from A2A demo', { sessionId });
    clearInterval(eventInterval);
  });
});

/**
 * Execute Demo Scenario
 */
async function executeDemoScenario(sessionId: string, scenario: string) {
  const session = demoSessions.get(sessionId);
  if (!session) return;
  
  try {
    session.status = 'running';
    
    logger.info('Executing A2A demo scenario', { sessionId, scenario });
    
    // Phase 1: Business Discovery Agent
    await executeBusinessDiscovery(sessionId);
    
    // Phase 2: Compliance Analysis
    await executeComplianceAnalysis(sessionId);
    
    // Complete demo
    session.status = 'completed';
    addDemoEvent(sessionId, {
      timestamp: Date.now(),
      agent: 'DemoOrchestrator',
      action: 'Demo Completed',
      status: 'success',
      reasoning: 'A2A Event Bus demo completed successfully - multi-agent coordination demonstrated',
      data: {
        totalAgents: 2,
        totalEvents: session.events.length,
        duration: Date.now() - session.createdAt
      }
    });
    
    logger.info('A2A demo scenario completed', { sessionId });
    
  } catch (error) {
    logger.error('Demo scenario execution failed', { sessionId, error: error instanceof Error ? error.message : 'Unknown error' });
    session.status = 'error';
    addDemoEvent(sessionId, {
      timestamp: Date.now(),
      agent: 'DemoOrchestrator',
      action: 'Demo Failed',
      status: 'error',
      reasoning: `Demo execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

/**
 * Execute Business Discovery Phase
 */
async function executeBusinessDiscovery(sessionId: string) {
  const session = demoSessions.get(sessionId);
  if (!session) return;
  
  // Update agent status
  const discoveryAgent = session.agents.find(a => a.type === 'BusinessDiscoveryAgent');
  if (discoveryAgent) {
    discoveryAgent.status = 'running';
    discoveryAgent.startedAt = Date.now();
  }
  
  addDemoEvent(sessionId, {
    timestamp: Date.now(),
    agent: 'BusinessDiscoveryAgent',
    action: 'Starting Business Discovery',
    status: 'running',
    reasoning: 'Initiating business information discovery for compliance analysis'
  });
  
  // Simulate agent processing time
  await wait(2000);
  
  addDemoEvent(sessionId, {
    timestamp: Date.now(),
    agent: 'BusinessDiscoveryAgent',
    action: 'Discovered Business Information',
    status: 'success',
    reasoning: 'Successfully discovered business profile: Demo Business LLC, Delaware entity, Technology Services industry',
    data: {
      businessName: 'Demo Business LLC',
      entityType: 'LLC',
      state: 'CA',
      industry: 'Technology Services',
      ein: '12-3456789',
      foundationDate: '2020-01-15',
      confidence: 0.92
    }
  });
  
  // Complete discovery agent
  if (discoveryAgent) {
    discoveryAgent.status = 'completed';
    discoveryAgent.completedAt = Date.now();
  }
}

/**
 * Execute Compliance Analysis Phase
 */
async function executeComplianceAnalysis(sessionId: string) {
  const session = demoSessions.get(sessionId);
  if (!session) return;
  
  // Update agent status
  const complianceAgent = session.agents.find(a => a.type === 'ComplianceAnalyzer');
  if (complianceAgent) {
    complianceAgent.status = 'running';
    complianceAgent.startedAt = Date.now();
  }
  
  addDemoEvent(sessionId, {
    timestamp: Date.now(),
    agent: 'ComplianceAnalyzer',
    action: 'Starting Compliance Analysis',
    status: 'running',
    reasoning: 'Analyzing compliance requirements based on discovered business information'
  });
  
  // Simulate compliance analysis time
  await wait(3000);
  
  addDemoEvent(sessionId, {
    timestamp: Date.now(),
    agent: 'ComplianceAnalyzer',
    action: 'Compliance Analysis Complete',
    status: 'success',
    reasoning: 'Identified 2 compliance issues and 3 recommendations. Business has moderate compliance risk.',
    data: {
      complianceScore: 75,
      riskLevel: 'medium',
      issues: [
        {
          type: 'filing_overdue',
          severity: 'high',
          title: 'Statement of Information Past Due'
        },
        {
          type: 'license_renewal',
          severity: 'medium',
          title: 'Business License Renewal Due'
        }
      ],
      recommendations: [
        'File Statement of Information within 30 days',
        'Renew business license before March 15',
        'Update registered agent information'
      ],
      confidence: 0.89
    }
  });
  
  // Complete compliance agent
  if (complianceAgent) {
    complianceAgent.status = 'completed';
    complianceAgent.completedAt = Date.now();
  }
}

/**
 * Add event to demo session
 */
function addDemoEvent(sessionId: string, event: Omit<A2ADemoSession['events'][0], 'timestamp'> & { timestamp: number }) {
  const session = demoSessions.get(sessionId);
  if (session) {
    session.events.push(event);
  }
}

/**
 * Utility: Wait for specified milliseconds
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean up old demo sessions (run periodically)
 */
setInterval(() => {
  const cutoff = Date.now() - (30 * 60 * 1000); // 30 minutes
  for (const [sessionId, session] of demoSessions.entries()) {
    if (session.createdAt < cutoff) {
      demoSessions.delete(sessionId);
      logger.info('Cleaned up old demo session', { sessionId });
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes

export default router;