#!/usr/bin/env node
/**
 * Test script for SSE endpoint
 * Tests the /api/tasks/:taskId/events endpoint with a real token
 */

const EventSource = require('eventsource');
const fetch = require('node-fetch');

// Get token from environment or use test token
const AUTH_TOKEN = process.env.AUTH_TOKEN || process.argv[2];
const TASK_ID = process.env.TASK_ID || process.argv[3];
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

if (!AUTH_TOKEN || !TASK_ID) {
  console.error('Usage: node test-sse-endpoint.cjs <auth-token> <task-id>');
  console.error('Or set AUTH_TOKEN and TASK_ID environment variables');
  process.exit(1);
}

console.log('Testing SSE endpoint...');
console.log('Backend URL:', BACKEND_URL);
console.log('Task ID:', TASK_ID);
console.log('Token (first 20 chars):', AUTH_TOKEN.substring(0, 20) + '...');

// First, verify the task exists
async function verifyTask() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/tasks`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch tasks:', response.status, response.statusText);
      const body = await response.text();
      console.error('Response:', body);
      return false;
    }
    
    const data = await response.json();
    const tasks = data.tasks || data;
    const task = tasks.find(t => t.id === TASK_ID);
    
    if (!task) {
      console.error('Task not found in user tasks');
      console.log('Available task IDs:', tasks.map(t => t.id));
      return false;
    }
    
    console.log('✓ Task found:', task.id, '-', task.template_id || task.task_type);
    return true;
  } catch (error) {
    console.error('Error verifying task:', error);
    return false;
  }
}

// Test SSE connection
async function testSSE() {
  const verified = await verifyTask();
  if (!verified) {
    console.error('Cannot test SSE - task verification failed');
    return;
  }
  
  console.log('\nConnecting to SSE endpoint...');
  const url = `${BACKEND_URL}/api/tasks/${TASK_ID}/events?auth=${encodeURIComponent(AUTH_TOKEN)}`;
  console.log('SSE URL:', url.substring(0, 100) + '...');
  
  const eventSource = new EventSource(url);
  
  eventSource.onopen = () => {
    console.log('✓ SSE connection opened');
  };
  
  eventSource.onmessage = (event) => {
    console.log('Default message:', event.data);
  };
  
  eventSource.addEventListener('CONTEXT_INITIALIZED', (event) => {
    console.log('✓ CONTEXT_INITIALIZED event received:');
    try {
      const data = JSON.parse(event.data);
      console.log('  - Task ID:', data.taskId);
      console.log('  - Status:', data.status);
      console.log('  - Created:', data.createdAt);
    } catch (error) {
      console.error('Error parsing CONTEXT_INITIALIZED:', error);
    }
  });
  
  eventSource.addEventListener('TASK_EVENT', (event) => {
    console.log('✓ TASK_EVENT received:', event.data);
  });
  
  eventSource.addEventListener('heartbeat', (event) => {
    console.log('♥ Heartbeat received');
  });
  
  eventSource.onerror = (error) => {
    console.error('✗ SSE error:', error);
    if (error.status) {
      console.error('  Status:', error.status);
    }
    if (error.message) {
      console.error('  Message:', error.message);
    }
    
    // EventSource will auto-reconnect, but we'll exit after first error
    console.log('\nClosing connection...');
    eventSource.close();
    process.exit(1);
  };
  
  // Run for 30 seconds then close
  console.log('\nListening for events (30 seconds)...');
  setTimeout(() => {
    console.log('\nTest complete - closing connection');
    eventSource.close();
    process.exit(0);
  }, 30000);
}

// Run the test
testSSE().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});