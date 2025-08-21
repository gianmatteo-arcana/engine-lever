#!/usr/bin/env node

/**
 * Task Creation Trace Test
 * 
 * This script creates a task and traces all system interactions
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';

// Create proper test JWT token
const TEST_USER_ID = '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934';

function createTestToken() {
  const payload = {
    sub: TEST_USER_ID,
    user_id: TEST_USER_ID,
    email: 'test@example.com',
    aud: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };
  
  // For testing, create a base64 token (not signed, but enough for trace testing)
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function traceTaskCreation() {
  console.log('🚀 Starting Task Creation Trace Test');
  console.log('=====================================');
  
  try {
    // Test 1: Create a task
    console.log('\n📋 Step 1: Creating a new task...');
    
    const taskPayload = {
      task_type: 'onboarding',
      title: 'Test Business Onboarding',
      description: 'Trace test for business onboarding workflow',
      template_id: 'onboarding',
      metadata: {
        source: 'trace_test',
        priority: 'high'
      }
    };
    
    const testToken = createTestToken();
    
    const response = await axios.post(`${BASE_URL}/api/tasks`, taskPayload, {
      headers: {
        'Authorization': `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Task created successfully:');
    console.log('   Task ID:', response.data.taskId);
    console.log('   Status:', response.data.message);
    
    const taskId = response.data.taskId;
    
    // Test 2: Get task status
    console.log('\n📊 Step 2: Checking task status...');
    
    const statusResponse = await axios.get(`${BASE_URL}/api/tasks/${taskId}/status`, {
      headers: {
        'Authorization': `Bearer ${testToken}`
      }
    });
    
    console.log('✅ Task status retrieved:');
    console.log('   Status:', statusResponse.data.status);
    console.log('   Progress:', statusResponse.data.progress);
    console.log('   Agent Statuses:', statusResponse.data.agentStatuses?.length || 0, 'agents');
    
    // Test 3: Check for orchestration activity
    console.log('\n🤖 Step 3: Checking for orchestration logs...');
    
    // Wait a moment for orchestration to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check logs for orchestration activity
    if (fs.existsSync('/Users/gianmatteo/Documents/Arcana-Prototype/biz-buddy-backend/logs/combined.log')) {
      const logs = fs.readFileSync('/Users/gianmatteo/Documents/Arcana-Prototype/biz-buddy-backend/logs/combined.log', 'utf8');
      const recentLogs = logs.split('\n').slice(-50).join('\n');
      
      if (recentLogs.includes(taskId)) {
        console.log('✅ Found orchestration activity in logs');
      } else {
        console.log('⚠️  No orchestration activity found in recent logs');
      }
      
      // Look for specific orchestration events
      const orchestrationEvents = recentLogs.match(/🤖|🚀|📋|✅.*orchestrat/gi) || [];
      console.log('   Orchestration events found:', orchestrationEvents.length);
    }
    
    console.log('\n✅ Task creation trace completed successfully!');
    console.log('=====================================');
    
  } catch (error) {
    console.error('❌ Task creation trace failed:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
      console.error('   Headers:', JSON.stringify(error.response.headers, null, 2));
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
    console.error('   Full error:', error);
  }
}

// Run the trace test
traceTaskCreation();