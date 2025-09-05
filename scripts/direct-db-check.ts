import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

async function checkDatabase() {
  const taskId = 'a1d49daa-f734-42a6-afdc-625205fee67a';
  
  console.log('\n🔍 Direct Database Check\n');
  console.log('Using URL:', process.env.SUPABASE_URL);
  console.log('Task ID:', taskId);
  console.log('─'.repeat(50));
  
  // Try with service role key (bypasses RLS)
  const serviceClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  console.log('\n1️⃣ Checking with SERVICE ROLE key (bypasses RLS):');
  const { data: serviceData, error: serviceError } = await serviceClient
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  
  if (serviceError) {
    console.error('   Error:', serviceError);
  } else if (serviceData) {
    console.log('   ✅ TASK FOUND!');
    console.log('   Status:', serviceData.status);
    console.log('   User ID:', serviceData.user_id);
    console.log('   Created:', new Date(serviceData.created_at).toLocaleString());
    console.log('   Updated:', new Date(serviceData.updated_at).toLocaleString());
  } else {
    console.log('   ❌ Task not found');
  }
  
  // Try with anon key (respects RLS)
  const anonClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
  
  console.log('\n2️⃣ Checking with ANON key (respects RLS):');
  const { data: anonData, error: anonError } = await anonClient
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  
  if (anonError) {
    console.error('   Error:', anonError);
  } else if (anonData) {
    console.log('   ✅ Task found');
    console.log('   Status:', anonData.status);
  } else {
    console.log('   ❌ Task not found (might be RLS blocking)');
  }
  
  // Check ALL tasks to see what's there
  console.log('\n3️⃣ Listing ALL tasks in database:');
  const { data: allTasks } = await serviceClient
    .from('tasks')
    .select('id, status, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (allTasks && allTasks.length > 0) {
    console.log(`   Found ${allTasks.length} task(s):`);
    allTasks.forEach(task => {
      const isTarget = task.id === taskId ? ' ⬅️ TARGET' : '';
      console.log(`   - ${task.id}${isTarget}`);
      console.log(`     Status: ${task.status} | Created: ${new Date(task.created_at).toLocaleString()}`);
    });
  } else {
    console.log('   No tasks found');
  }
  
  process.exit(0);
}

checkDatabase().catch(console.error);