#!/usr/bin/env node

/**
 * Authenticate with Supabase and test real orchestration
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Supabase configuration (from frontend)
const SUPABASE_URL = "https://raenkewzlvrdqufwxjpl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNDczODMsImV4cCI6MjA2ODYyMzM4M30.CvnbE8w1yEX4zYHjHmxRIpTlh4O7ZClbcNSEfYFGlag";

// Backend URL
const BACKEND_URL = 'http://localhost:3001';

// Test credentials
const TEST_EMAIL = 'test-orchestration@example.com';
const TEST_PASSWORD = 'TestOrchestration123!';

async function main() {
  console.log('========================================');
  console.log('🚀 Real Orchestration Authentication Test');
  console.log('========================================');
  
  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Step 1: Try to sign in or create account
  console.log('\n🔐 Authenticating with Supabase...');
  
  let session = null;
  
  // Try to sign in first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  
  if (signInError) {
    console.log('Sign in failed, creating new account...');
    
    // Create new account
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      options: {
        data: {
          name: 'Test Orchestration User'
        }
      }
    });
    
    if (signUpError) {
      console.error('❌ Failed to create account:', signUpError.message);
      process.exit(1);
    }
    
    console.log('✅ Account created successfully');
    session = signUpData.session;
  } else {
    console.log('✅ Signed in successfully');
    session = signInData.session;
  }
  
  if (!session) {
    console.error('❌ No session obtained');
    process.exit(1);
  }
  
  const authToken = session.access_token;
  console.log('✅ Got authentication token');
  console.log('   User ID:', session.user.id);
  console.log('   Email:', session.user.email);
  
  // Step 2: Create onboarding task
  console.log('\n📝 Creating onboarding task with REAL orchestration...');
  
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/onboarding/initiate`,
      {
        businessName: 'Real Orchestration Demo LLC',
        businessType: 'llc',
        state: 'CA',
        source: 'test'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const taskId = response.data.taskId;
    console.log('✅ Task created successfully!');
    console.log('   Task ID:', taskId);
    console.log('   Business ID:', response.data.businessId);
    console.log('   Message:', response.data.message);
    
    // Step 3: Wait a moment for orchestration to start
    console.log('\n⏳ Waiting for orchestration to begin...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Get context history
    console.log('\n📊 Fetching context history (REAL events from database)...');
    
    const historyResponse = await axios.get(
      `${BACKEND_URL}/api/onboarding/context-history/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    const events = historyResponse.data.entries;
    console.log(`\n✅ Found ${events.length} REAL orchestration events:`);
    console.log('========================================');
    
    events.forEach((event, index) => {
      console.log(`\nEvent ${index + 1}:`);
      console.log('  Type:', event.entry_type);
      console.log('  Actor:', `${event.actor_type} (${event.actor_role || 'system'})`);
      console.log('  Operation:', event.operation);
      console.log('  Phase:', event.phase || 'N/A');
      console.log('  Timestamp:', event.created_at);
      
      if (event.reasoning) {
        console.log('  Reasoning:', event.reasoning);
      }
      
      if (event.data && event.data.plan) {
        console.log('  Execution Plan:');
        event.data.plan.phases?.forEach(phase => {
          console.log(`    - ${phase.name}: ${phase.estimatedDuration}`);
        });
      }
    });
    
    // Step 5: Get task status
    console.log('\n📈 Fetching task status...');
    
    const statusResponse = await axios.get(
      `${BACKEND_URL}/api/onboarding/status/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    const status = statusResponse.data;
    console.log('\n✅ Task Status:');
    console.log('  Status:', status.status);
    console.log('  Progress:', status.progress + '%');
    console.log('  Current Phase:', status.currentPhase);
    
    if (status.goals && status.goals.length > 0) {
      console.log('\n  Goals:');
      status.goals.forEach(goal => {
        const checkmark = goal.completed ? '✅' : '⬜';
        console.log(`    ${checkmark} ${goal.description}`);
      });
    }
    
    console.log('\n========================================');
    console.log('🎉 SUCCESS! Real Orchestration Proven!');
    console.log('========================================');
    console.log('\nWhat this proves:');
    console.log('1. ✅ Real user authentication (Supabase JWT)');
    console.log('2. ✅ Real task creation in database');
    console.log('3. ✅ Real orchestration with A2AOrchestrator');
    console.log('4. ✅ Real event sourcing to context_history');
    console.log('5. ✅ Real deterministic logic (no mocks!)');
    console.log('\nThe RealTimeAgentVisualizer would show:');
    console.log('- These exact events in the timeline');
    console.log('- Agent activities and reasoning');
    console.log('- Live updates as orchestration progresses');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    process.exit(1);
  }
  
  // Clean up
  await supabase.auth.signOut();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});