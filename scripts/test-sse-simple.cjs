#!/usr/bin/env node
/**
 * Simple SSE endpoint test to prove it's working
 */

const { EventSource } = require('eventsource');

// Create a mock JWT token for testing
function createMockJWT() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'test-user-id',
    user_id: 'test-user-id',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'mock-signature';
  
  return `${base64Header}.${base64Payload}.${signature}`;
}

const token = createMockJWT();
const taskId = 'test-task-id';
const url = `http://localhost:3001/api/tasks/${taskId}/events?auth=${encodeURIComponent(token)}`;

console.log('Testing SSE endpoint...');
console.log('URL:', url);
console.log('Mock JWT payload:', JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()));

const eventSource = new EventSource(url);

eventSource.onopen = () => {
  console.log('✅ CONNECTION OPENED - SSE endpoint is reachable');
};

eventSource.onmessage = (event) => {
  console.log('📨 Default message:', event.data);
};

eventSource.addEventListener('CONTEXT_INITIALIZED', (event) => {
  console.log('✅ CONTEXT_INITIALIZED event received');
  console.log('   Data:', event.data);
});

eventSource.onerror = (error) => {
  console.log('❌ ERROR:', error.type);
  if (error.status) {
    console.log('   Status:', error.status);
  }
  if (error.message) {
    console.log('   Message:', error.message);
  }
  
  // Check what type of error
  if (eventSource.readyState === EventSource.CONNECTING) {
    console.log('   State: CONNECTING (will retry)');
  } else if (eventSource.readyState === EventSource.CLOSED) {
    console.log('   State: CLOSED (connection terminated)');
  }
  
  // Close after first error
  eventSource.close();
  process.exit(1);
};

// Timeout after 5 seconds
setTimeout(() => {
  console.log('⏱️ Test completed (5 second timeout)');
  eventSource.close();
  process.exit(0);
}, 5000);