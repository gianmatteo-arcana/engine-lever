import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function checkTaskStatus() {
  const taskId = 'a1d49daa-f734-42a6-afdc-625205fee67a';
  
  console.log(`\n📋 Checking status for task: ${taskId}\n`);
  
  // Get the task
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  
  if (error) {
    console.error('Error fetching task:', error);
    return;
  }
  
  if (!task) {
    console.log('❌ Task not found');
    return;
  }
  
  console.log('Task Details:');
  console.log('  ID:', task.id);
  console.log('  Status:', task.status);
  console.log('  Type:', task.task_type);
  console.log('  Created:', new Date(task.created_at).toLocaleString());
  console.log('  Updated:', new Date(task.updated_at).toLocaleString());
  console.log('  User ID:', task.user_id);
  
  // Check recent context entries
  const { data: contexts } = await supabase
    .from('context_entries')
    .select('entry_type, entry_data, created_at')
    .eq('context_id', taskId)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (contexts && contexts.length > 0) {
    console.log('\n📝 Recent Context Entries:');
    contexts.forEach(ctx => {
      const time = new Date(ctx.created_at).toLocaleTimeString();
      console.log(`  [${time}] ${ctx.entry_type}:`, 
        ctx.entry_data?.operation || ctx.entry_data?.reasoning || 'No details');
    });
  }
  
  // Check all tasks with in_progress status
  const { data: inProgressTasks } = await supabase
    .from('tasks')
    .select('id, status, task_type, updated_at')
    .eq('status', 'in_progress');
  
  console.log('\n🔄 Tasks with status "in_progress":');
  if (inProgressTasks && inProgressTasks.length > 0) {
    inProgressTasks.forEach(t => {
      console.log(`  - ${t.id.substring(0, 8)}... | ${t.task_type} | Updated: ${new Date(t.updated_at).toLocaleString()}`);
    });
  } else {
    console.log('  None found');
  }
  
  process.exit(0);
}

checkTaskStatus().catch(console.error);