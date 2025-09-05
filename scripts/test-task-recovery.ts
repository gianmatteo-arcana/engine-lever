import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TASK_STATUS } from '../src/constants/task-status';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testTaskRecovery() {
  console.log('\n🧪 Testing Task Recovery Mechanism\n');
  console.log('─'.repeat(50));
  
  // 0. First create a test user or get an existing one
  const testUserId = uuidv4();
  const testEmail = `test-${Date.now()}@example.com`;
  
  console.log('0️⃣ Creating test user...');
  const { data: newUser, error: userError } = await supabase
    .from('users')
    .insert({
      id: testUserId,
      email: testEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (userError) {
    console.error('❌ Failed to create test user:', userError);
    // Try to use an existing user
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (!existingUsers || existingUsers.length === 0) {
      console.error('❌ No users exist in database and cannot create one');
      return;
    }
    
    const actualUserId = existingUsers[0].id;
    console.log('   Using existing user:', actualUserId);
  } else {
    console.log('✅ Test user created:', testUserId);
  }
  
  const actualUserId = newUser?.id || testUserId;
  
  // 1. Create a test task that's "in_progress"
  const testTaskId = uuidv4();
  
  console.log('\n1️⃣ Creating test task with status:', TASK_STATUS.IN_PROGRESS);
  console.log('   Task ID:', testTaskId);
  console.log('   User ID:', actualUserId);
  
  const { data: newTask, error: createError } = await supabase
    .from('tasks')
    .insert({
      id: testTaskId,
      user_id: actualUserId,
      task_type: 'soi_check',
      title: 'Test Recovery Task',
      description: 'Testing task recovery mechanism',
      status: TASK_STATUS.IN_PROGRESS,
      priority: 'medium',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (createError) {
    console.error('❌ Failed to create test task:', createError);
    return;
  }
  
  console.log('✅ Test task created successfully');
  
  // 2. Check if task recovery would find this task
  console.log('\n2️⃣ Checking if TaskRecoveryService would find this task...');
  
  const { data: orphanedTasks, error: queryError } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', TASK_STATUS.IN_PROGRESS);
  
  if (queryError) {
    console.error('❌ Failed to query tasks:', queryError);
  } else {
    console.log(`✅ Found ${orphanedTasks?.length || 0} task(s) with status '${TASK_STATUS.IN_PROGRESS}'`);
    
    if (orphanedTasks && orphanedTasks.length > 0) {
      console.log('\n   Tasks that would be recovered:');
      orphanedTasks.forEach(task => {
        console.log(`   - ${task.id} | ${task.task_type} | Created: ${new Date(task.created_at).toLocaleString()}`);
      });
    }
  }
  
  // 3. Test different status values to see what's in the DB
  console.log('\n3️⃣ Checking all unique statuses in database...');
  
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('status')
    .limit(1000);
  
  if (allTasks) {
    const uniqueStatuses = [...new Set(allTasks.map(t => t.status))];
    console.log('   Unique statuses found:', uniqueStatuses);
  }
  
  // 4. Clean up test task and user
  console.log('\n4️⃣ Cleaning up test data...');
  const { error: deleteTaskError } = await supabase
    .from('tasks')
    .delete()
    .eq('id', testTaskId);
  
  if (deleteTaskError) {
    console.error('❌ Failed to delete test task:', deleteTaskError);
  } else {
    console.log('✅ Test task cleaned up');
  }
  
  // Clean up test user if we created one
  if (newUser) {
    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('id', actualUserId);
    
    if (deleteUserError) {
      console.error('❌ Failed to delete test user:', deleteUserError);
    } else {
      console.log('✅ Test user cleaned up');
    }
  }
  
  // 5. Check what the actual constant values are
  console.log('\n5️⃣ Verifying TASK_STATUS constants:');
  console.log('   TASK_STATUS.IN_PROGRESS =', TASK_STATUS.IN_PROGRESS);
  console.log('   TASK_STATUS.WAITING_FOR_INPUT =', TASK_STATUS.WAITING_FOR_INPUT);
  console.log('   TASK_STATUS.COMPLETED =', TASK_STATUS.COMPLETED);
  console.log('   TASK_STATUS.FAILED =', TASK_STATUS.FAILED);
  
  console.log('\n' + '─'.repeat(50));
  console.log('Test complete!\n');
  
  process.exit(0);
}

testTaskRecovery().catch(console.error);