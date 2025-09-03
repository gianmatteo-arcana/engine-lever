#!/usr/bin/env npx ts-node
/**
 * Integration test for OrchestratorAgent failure handling
 * Tests rate limit recovery and non-critical agent failures
 */

import { OrchestratorAgent } from '../../src/agents/OrchestratorAgent';
import { A2AEventBus } from '../../src/services/a2a-event-bus';
import { TaskService } from '../../src/services/task-service';
import { DatabaseService } from '../../src/services/database';
import { TASK_STATUS } from '../../src/constants/task-status';
import { logger } from '../../src/utils/logger';

async function simulateRateLimitFailure() {
  logger.info('🧪 Testing Rate Limit Failure Handling...');
  
  const orchestrator = OrchestratorAgent.getInstance();
  const a2aEventBus = A2AEventBus.getInstance();
  const taskService = TaskService.getInstance();
  
  // Create a test task
  const testTask = await taskService.createTask({
    type: 'soi_submission',
    status: TASK_STATUS.IN_PROGRESS,
    metadata: {
      businessName: 'TEST RATE LIMIT CORP',
      subtasks: [
        { agentId: 'data_collection_agent', status: TASK_STATUS.COMPLETED },
        { agentId: 'entity_compliance_agent', status: TASK_STATUS.IN_PROGRESS },
        { agentId: 'celebration_agent', status: TASK_STATUS.PENDING }
      ]
    }
  } as any);
  
  logger.info(`Created test task: ${testTask.id}`);
  
  // Simulate a rate limit failure from entity_compliance_agent
  logger.info('Simulating rate limit failure from entity_compliance_agent...');
  await a2aEventBus.emit('AGENT_EXECUTION_FAILED', {
    agentId: 'entity_compliance_agent',
    taskId: testTask.id,
    error: 'Rate limit exceeded. Please wait before retrying.',
    timestamp: Date.now()
  });
  
  // Wait for retry mechanism to kick in
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Check task status - should still be IN_PROGRESS with retry metadata
  const updatedTask = await taskService.getTask(testTask.id);
  logger.info('Task after rate limit failure:', {
    status: updatedTask.status,
    metadata: updatedTask.metadata
  });
  
  if (updatedTask.status === TASK_STATUS.IN_PROGRESS) {
    logger.success('✅ Rate limit handling works - task remains in progress with retry scheduled');
  } else {
    logger.error('❌ Rate limit handling failed - unexpected status:', updatedTask.status);
  }
  
  return testTask.id;
}

async function simulateNonCriticalFailure() {
  logger.info('🧪 Testing Non-Critical Agent Failure...');
  
  const a2aEventBus = A2AEventBus.getInstance();
  const taskService = TaskService.getInstance();
  
  // Create a test task
  const testTask = await taskService.createTask({
    type: 'soi_submission',
    status: TASK_STATUS.IN_PROGRESS,
    metadata: {
      businessName: 'TEST NON-CRITICAL FAILURE CORP',
      subtasks: [
        { agentId: 'data_collection_agent', status: TASK_STATUS.COMPLETED },
        { agentId: 'entity_compliance_agent', status: TASK_STATUS.COMPLETED },
        { agentId: 'celebration_agent', status: TASK_STATUS.IN_PROGRESS }
      ]
    }
  } as any);
  
  logger.info(`Created test task: ${testTask.id}`);
  
  // Simulate a permanent failure from celebration_agent (non-critical)
  logger.info('Simulating permanent failure from celebration_agent (non-critical)...');
  await a2aEventBus.emit('AGENT_EXECUTION_FAILED', {
    agentId: 'celebration_agent',
    taskId: testTask.id,
    error: 'Rate limit exceeded for celebration messages',
    timestamp: Date.now()
  });
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check task status - should be COMPLETED with partial success
  const updatedTask = await taskService.getTask(testTask.id);
  logger.info('Task after non-critical failure:', {
    status: updatedTask.status,
    metadata: updatedTask.metadata
  });
  
  if (updatedTask.status === TASK_STATUS.COMPLETED && updatedTask.metadata?.partialSuccess) {
    logger.success('✅ Non-critical failure handling works - task completed with partial success');
  } else {
    logger.error('❌ Non-critical failure handling failed - unexpected status:', updatedTask.status);
  }
  
  return testTask.id;
}

async function simulateCriticalFailure() {
  logger.info('🧪 Testing Critical Agent Failure...');
  
  const a2aEventBus = A2AEventBus.getInstance();
  const taskService = TaskService.getInstance();
  
  // Create a test task
  const testTask = await taskService.createTask({
    type: 'soi_submission',
    status: TASK_STATUS.IN_PROGRESS,
    metadata: {
      businessName: 'TEST CRITICAL FAILURE CORP',
      subtasks: [
        { agentId: 'data_collection_agent', status: TASK_STATUS.IN_PROGRESS },
        { agentId: 'entity_compliance_agent', status: TASK_STATUS.PENDING },
        { agentId: 'celebration_agent', status: TASK_STATUS.PENDING }
      ]
    }
  } as any);
  
  logger.info(`Created test task: ${testTask.id}`);
  
  // Simulate a permanent failure from data_collection_agent (critical)
  logger.info('Simulating permanent failure from data_collection_agent (critical)...');
  await a2aEventBus.emit('AGENT_EXECUTION_FAILED', {
    agentId: 'data_collection_agent',
    taskId: testTask.id,
    error: 'Invalid API credentials - authentication failed',
    timestamp: Date.now()
  });
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check task status - should be FAILED
  const updatedTask = await taskService.getTask(testTask.id);
  logger.info('Task after critical failure:', {
    status: updatedTask.status,
    metadata: updatedTask.metadata
  });
  
  if (updatedTask.status === TASK_STATUS.FAILED) {
    logger.success('✅ Critical failure handling works - task marked as failed');
  } else {
    logger.error('❌ Critical failure handling failed - unexpected status:', updatedTask.status);
  }
  
  return testTask.id;
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('OrchestratorAgent Failure Handling Integration Test');
  logger.info('='.repeat(60));
  
  try {
    // Initialize services
    await DatabaseService.getInstance().init();
    
    // Run test scenarios
    const results = {
      rateLimitTest: await simulateRateLimitFailure(),
      nonCriticalTest: await simulateNonCriticalFailure(),
      criticalTest: await simulateCriticalFailure()
    };
    
    logger.info('='.repeat(60));
    logger.info('Test Summary:');
    logger.info('Rate Limit Test Task:', results.rateLimitTest);
    logger.info('Non-Critical Failure Test Task:', results.nonCriticalTest);
    logger.info('Critical Failure Test Task:', results.criticalTest);
    logger.info('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { simulateRateLimitFailure, simulateNonCriticalFailure, simulateCriticalFailure };