import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

async function fixTaskStatus() {
  const taskId = 'a1d49daa-f734-42a6-afdc-625205fee67a';
  
  console.log('\n🔧 Fixing task status for recovery\n');
  console.log('Task ID:', taskId);
  console.log('─'.repeat(50));
  
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Get current status
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  
  if (fetchError || !task) {
    console.error('❌ Failed to fetch task:', fetchError);
    return;
  }
  
  console.log('Current Status:', task.status);
  console.log('User ID:', task.user_id);
  
  if (task.status === 'pending') {
    console.log('\n📝 Updating status from "pending" to "in_progress"...');
    
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);
    
    if (updateError) {
      console.error('❌ Failed to update:', updateError);
    } else {
      console.log('✅ Status updated to "in_progress"');
      console.log('🔄 Task will now be picked up by recovery service on next restart');
    }
  } else if (task.status === 'in_progress') {
    console.log('✅ Task is already "in_progress" - recovery should find it');
  } else {
    console.log(`ℹ️ Task has status "${task.status}" - not changing`);
  }
  
  process.exit(0);
}

fixTaskStatus().catch(console.error);