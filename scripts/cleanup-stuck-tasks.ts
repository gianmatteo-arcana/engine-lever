import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

async function cleanupStuckTasks() {
  console.log('\n🧹 Cleaning up stuck tasks\n');
  console.log('─'.repeat(50));
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Find tasks stuck in in_progress from August
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  console.log('1️⃣ Finding tasks older than 24 hours with status "in_progress"...');
  const { data: oldTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, status, updated_at, task_type')
    .eq('status', 'in_progress')
    .lt('updated_at', oneDayAgo)
    .order('updated_at', { ascending: true });
  
  if (fetchError) {
    console.error('❌ Failed to fetch tasks:', fetchError);
    return;
  }
  
  if (!oldTasks || oldTasks.length === 0) {
    console.log('✅ No stuck tasks found');
    return;
  }
  
  console.log(`\n📊 Found ${oldTasks.length} stuck tasks:`);
  oldTasks.forEach(task => {
    const age = Date.now() - new Date(task.updated_at).getTime();
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    console.log(`   - ${task.id.substring(0, 8)}... | ${task.task_type} | ${days} days old`);
  });
  
  console.log('\n2️⃣ Marking them as FAILED...');
  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString()
    })
    .in('id', oldTasks.map(t => t.id));
  
  if (updateError) {
    console.error('❌ Failed to update:', updateError);
  } else {
    console.log(`✅ Marked ${oldTasks.length} tasks as failed`);
  }
  
  // Keep our target task
  const targetTaskId = 'a1d49daa-f734-42a6-afdc-625205fee67a';
  console.log(`\n3️⃣ Checking target task ${targetTaskId.substring(0, 8)}...`);
  
  const { data: targetTask } = await supabase
    .from('tasks')
    .select('status, updated_at')
    .eq('id', targetTaskId)
    .single();
  
  if (targetTask) {
    console.log(`   Status: ${targetTask.status}`);
    const age = Date.now() - new Date(targetTask.updated_at).getTime();
    const minutes = Math.floor(age / 60000);
    console.log(`   Last updated: ${minutes} minutes ago`);
    
    if (targetTask.status === 'in_progress' && minutes < 60) {
      console.log('   ✅ This task is recent and will be recovered on restart');
    }
  }
  
  process.exit(0);
}

cleanupStuckTasks().catch(console.error);