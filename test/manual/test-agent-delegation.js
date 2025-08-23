/**
 * Test script to verify agent delegation and event broadcasting
 */

const { createClient } = require('@supabase/supabase-js');

// Use environment variables from the backend
const supabaseUrl = process.env.SUPABASE_URL || 'https://raenkewzlvrdqufwxjpl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzA0NzM4MywiZXhwIjoyMDY4NjIzMzgzfQ.tPBuIjB_JF4aW0NEmYwzVfbg1zcFUo1r1eOTeZVWuyw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAgentDelegation() {
  console.log('\n🔍 Checking Agent Delegation and Event Broadcasting\n');
  
  try {
    // Get a recent task that should have agent delegation
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (taskError) {
      console.error('Error fetching tasks:', taskError);
      return;
    }
    
    console.log(`Found ${tasks.length} recent tasks\n`);
    
    for (const task of tasks) {
      console.log(`\n📋 Task: ${task.title}`);
      console.log(`   ID: ${task.id}`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Created: ${task.created_at}`);
      
      // Get all events for this task
      const { data: events, error: eventError } = await supabase
        .from('task_context_events')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });
      
      if (eventError) {
        console.error('   Error fetching events:', eventError);
        continue;
      }
      
      console.log(`\n   📊 Events (${events.length} total):`);
      
      // Group events by operation
      const eventGroups = {};
      events.forEach(event => {
        if (!eventGroups[event.operation]) {
          eventGroups[event.operation] = [];
        }
        eventGroups[event.operation].push(event);
      });
      
      // Show summary of events
      Object.keys(eventGroups).forEach(operation => {
        const count = eventGroups[operation].length;
        const actors = [...new Set(eventGroups[operation].map(e => e.actor_id))];
        console.log(`      ${operation}: ${count} event(s) by ${actors.join(', ')}`);
      });
      
      // Look for agent delegation events specifically
      const delegationEvents = events.filter(e => 
        e.operation === 'subtask_delegated' || 
        e.operation === 'AGENT_EXECUTION_STARTED' ||
        e.operation === 'AGENT_EXECUTION_COMPLETED'
      );
      
      if (delegationEvents.length > 0) {
        console.log(`\n   🤖 Agent Delegation Events:`);
        delegationEvents.forEach(event => {
          console.log(`      - ${event.operation} by ${event.actor_id} at ${event.created_at}`);
          if (event.data?.agent_id) {
            console.log(`        Target Agent: ${event.data.agent_id}`);
          }
          if (event.data?.subtask_name) {
            console.log(`        Subtask: ${event.data.subtask_name}`);
          }
        });
      } else {
        console.log(`\n   ⚠️  No agent delegation events found`);
      }
      
      // Check for orchestration events
      const orchestrationEvents = events.filter(e => 
        e.operation === 'execution_plan_created' || 
        e.operation === 'orchestration_completed'
      );
      
      if (orchestrationEvents.length > 0) {
        console.log(`\n   📋 Orchestration Events:`);
        orchestrationEvents.forEach(event => {
          console.log(`      - ${event.operation} at ${event.created_at}`);
          if (event.data?.plan?.subtasks) {
            const subtasks = event.data.plan.subtasks;
            console.log(`        Planned Subtasks: ${subtasks.length}`);
            subtasks.forEach((st, idx) => {
              console.log(`          ${idx + 1}. ${st.name} → ${st.assigned_agent}`);
            });
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
checkAgentDelegation().then(() => {
  console.log('\n✅ Test complete\n');
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});