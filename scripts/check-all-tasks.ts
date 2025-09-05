import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function checkAllTasks() {
  console.log('\n📋 Fetching all recent tasks...\n');
  
  // Get all tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('Error fetching tasks:', error);
    return;
  }
  
  if (!tasks || tasks.length === 0) {
    console.log('❌ No tasks found in database');
    return;
  }
  
  console.log(`Found ${tasks.length} task(s):\n`);
  
  // Group by status
  const byStatus: Record<string, any[]> = {};
  tasks.forEach(task => {
    if (!byStatus[task.status]) {
      byStatus[task.status] = [];
    }
    byStatus[task.status].push(task);
  });
  
  // Display by status
  Object.entries(byStatus).forEach(([status, statusTasks]) => {
    console.log(`\n📊 Status: ${status} (${statusTasks.length} tasks)`);
    console.log('─'.repeat(50));
    
    statusTasks.forEach(task => {
      const age = Date.now() - new Date(task.created_at).getTime();
      const ageStr = age < 60000 ? `${Math.floor(age/1000)}s` : 
                     age < 3600000 ? `${Math.floor(age/60000)}m` : 
                     `${Math.floor(age/3600000)}h`;
      
      console.log(`  ID: ${task.id}`);
      console.log(`     Type: ${task.task_type}`);
      console.log(`     Created: ${new Date(task.created_at).toLocaleString()} (${ageStr} ago)`);
      console.log(`     Updated: ${new Date(task.updated_at).toLocaleString()}`);
      if (task.user_id) {
        console.log(`     User: ${task.user_id.substring(0, 8)}...`);
      }
      console.log('');
    });
  });
  
  // Check for the specific task ID from the logs
  const targetId = 'a1d49daa-f734-42a6-afdc-625205fee67a';
  const targetTask = tasks.find(t => t.id === targetId);
  
  if (targetTask) {
    console.log(`\n✅ Found target task ${targetId}:`);
    console.log('  Status:', targetTask.status);
  } else {
    console.log(`\n⚠️  Target task ${targetId} not found in recent tasks`);
    
    // Try to fetch it directly
    const { data: directTask } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();
    
    if (directTask) {
      console.log('  But found it with direct query:');
      console.log('    Status:', directTask.status);
      console.log('    Created:', new Date(directTask.created_at).toLocaleString());
    } else {
      console.log('  Task does not exist in database at all');
    }
  }
  
  process.exit(0);
}

checkAllTasks().catch(console.error);