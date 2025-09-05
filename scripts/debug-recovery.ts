import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

async function debugRecovery() {
  console.log('\n🔍 Debug Recovery Service\n');
  console.log('─'.repeat(50));
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // 1. Check what the recovery service is actually querying
  console.log('1️⃣ Checking tasks with status = "in_progress":');
  const { data: inProgressTasks, error: error1 } = await supabase
    .from('tasks')
    .select('id, status, user_id, updated_at')
    .eq('status', 'in_progress');
  
  if (inProgressTasks && inProgressTasks.length > 0) {
    console.log(`   Found ${inProgressTasks.length} task(s):`);
    inProgressTasks.forEach(task => {
      console.log(`   - ${task.id}`);
      console.log(`     Status: ${task.status} | Updated: ${new Date(task.updated_at).toLocaleString()}`);
    });
  } else {
    console.log('   ❌ No tasks found with status "in_progress"');
  }
  
  // 2. Check our specific task
  console.log('\n2️⃣ Checking specific task a1d49daa-f734-42a6-afdc-625205fee67a:');
  const { data: ourTask, error: error2 } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', 'a1d49daa-f734-42a6-afdc-625205fee67a')
    .single();
  
  if (ourTask) {
    console.log('   Status:', ourTask.status);
    console.log('   User ID:', ourTask.user_id);
    console.log('   Updated:', new Date(ourTask.updated_at).toLocaleString());
    
    if (ourTask.status !== 'in_progress') {
      console.log(`   ⚠️ Task is NOT "in_progress", it's "${ourTask.status}"`);
    }
  } else {
    console.log('   ❌ Task not found');
  }
  
  // 3. Check all statuses to see what values are in use
  console.log('\n3️⃣ All unique status values in database:');
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('status')
    .limit(100);
  
  if (allTasks) {
    const statusCounts: Record<string, number> = {};
    allTasks.forEach(task => {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    });
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   "${status}": ${count} task(s)`);
    });
  }
  
  // 4. Check if there's a case sensitivity issue
  console.log('\n4️⃣ Checking case variations:');
  const variations = ['in_progress', 'IN_PROGRESS', 'In_Progress'];
  for (const variant of variations) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('status', variant);
    
    console.log(`   status = "${variant}": ${data?.length || 0} task(s)`);
  }
  
  process.exit(0);
}

debugRecovery().catch(console.error);