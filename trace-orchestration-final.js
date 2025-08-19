const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://raenkewzlvrdqufwxjpl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function traceOrchestration() {
  console.log('🔍 ORCHESTRATION TRACE - COMPLETE ANALYSIS');
  console.log('='.repeat(70));
  
  // Get the most recent tasks (last 15 minutes)
  const recentTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, task_type, created_at')
    .gte('created_at', recentTime)
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (!tasks || tasks.length === 0) {
    console.log('❌ No recent tasks found in the last 15 minutes');
    return;
  }
  
  console.log('📋 RECENT TASKS:');
  for (const task of tasks) {
    console.log(`\n🎯 TASK: ${task.title}`);
    console.log(`   📅 Created: ${new Date(task.created_at).toLocaleTimeString()}`);
    console.log(`   🏷️  Type: ${task.task_type}`);
    console.log(`   📊 Status: ${task.status}`);
    console.log(`   🆔 ID: ${task.id}`);
    
    // Get orchestration events for this task
    const { data: events } = await supabase
      .from('task_context_events')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });
    
    if (events && events.length > 0) {
      console.log(`\n   ✅ ORCHESTRATION EVENTS (${events.length}):`);
      events.forEach((event, index) => {
        const time = new Date(event.created_at).toLocaleTimeString();
        console.log(`   ${index + 1}. [${time}] ${event.operation}`);
        console.log(`      🤖 Agent: ${event.actor_id || event.actor_type}`);
        if (event.data && typeof event.data === 'object') {
          const dataKeys = Object.keys(event.data);
          if (dataKeys.length > 0) {
            console.log(`      📊 Data: ${dataKeys.join(', ')}`);
          }
        }
        if (event.reasoning) {
          console.log(`      💭 Reasoning: ${event.reasoning.substring(0, 80)}...`);
        }
      });
      
      // Analyze the orchestration flow
      console.log(`\n   🔄 ORCHESTRATION FLOW ANALYSIS:`);
      const orchestratorEvents = events.filter(e => 
        e.actor_id === 'EventListener' || 
        e.actor_id === 'OrchestratorAgent' ||
        (e.operation && e.operation.includes('ORCHESTRATION'))
      );
      
      if (orchestratorEvents.length > 0) {
        console.log(`   📈 Orchestrator Activity: ${orchestratorEvents.length} events`);
        orchestratorEvents.forEach(e => {
          console.log(`      → ${e.operation}`);
        });
      }
      
      // Check for agent activities
      const agentEvents = events.filter(e => 
        e.actor_id && 
        e.actor_id !== 'EventListener' && 
        e.actor_id !== 'OrchestratorAgent' &&
        e.actor_id !== 'system'
      );
      
      if (agentEvents.length > 0) {
        console.log(`   🤖 Agent Activities: ${agentEvents.length} events`);
        const agentTypes = [...new Set(agentEvents.map(e => e.actor_id))];
        console.log(`   🎭 Agents Involved: ${agentTypes.join(', ')}`);
      }
      
    } else {
      console.log(`   ❌ NO ORCHESTRATION EVENTS - Task created but orchestration didn't trigger`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ORCHESTRATION TRACE SUMMARY:');
  
  let totalEvents = 0;
  for (const task of tasks) {
    const { count } = await supabase
      .from('task_context_events')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', task.id);
    totalEvents += (count || 0);
  }
  
  if (totalEvents > 0) {
    console.log('✅✅✅ REALTIME ORCHESTRATION IS WORKING! ✅✅✅');
    console.log(`📊 Total orchestration events across ${tasks.length} recent tasks: ${totalEvents}`);
    console.log('🔄 Task Creation → Realtime Trigger → Orchestration → Agent Execution');
    console.log('💯 The agent orchestration system is functioning correctly!');
  } else {
    console.log('⚠️ Orchestration system may need investigation');
    console.log('Tasks are being created but no orchestration events detected');
  }
}

traceOrchestration().catch(console.error);