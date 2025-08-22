#!/usr/bin/env node
/**
 * Get test credentials for SSE testing
 * Retrieves a valid auth token and task ID from the test environment
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getTestCredentials() {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('No active session. Please log in first.');
      console.log('\nTo get test credentials:');
      console.log('1. Run the frontend: cd ../biz-buddy-ally-now && npm run dev');
      console.log('2. Log in through the UI');
      console.log('3. Open DevTools Console and run:');
      console.log('   const token = localStorage.getItem("sb-access-token");');
      console.log('   console.log(token);');
      console.log('4. Use that token with the test script');
      return;
    }
    
    const token = session.access_token;
    console.log('Auth Token:', token);
    
    // Get user's tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, template_id, status, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return;
    }
    
    if (!tasks || tasks.length === 0) {
      console.log('\nNo tasks found for user. Create a task first.');
      return;
    }
    
    console.log('\nAvailable tasks:');
    tasks.forEach(task => {
      console.log(`  - ${task.id} (${task.template_id}) - ${task.status}`);
    });
    
    const latestTask = tasks[0];
    console.log('\nTest command:');
    console.log(`node scripts/test-sse-endpoint.cjs "${token}" "${latestTask.id}"`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

getTestCredentials();