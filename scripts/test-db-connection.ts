#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import { dbService } from '../src/services/database';

// Load environment variables
dotenv.config();

async function testConnection() {
  console.log('🔍 Testing Supabase connection...\n');
  
  // Check environment variables
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials!');
    console.log('SUPABASE_URL:', url ? '✅ Set' : '❌ Not set');
    console.log('SUPABASE_SERVICE_KEY:', key ? '✅ Set' : '❌ Not set');
    process.exit(1);
  }
  
  console.log('✅ Environment variables found');
  console.log('URL:', url);
  console.log('Key:', key.substring(0, 20) + '...\n');
  
  try {
    // Initialize database service
    dbService.initialize();
    console.log('✅ Database service initialized\n');
    
    // Test 1: Create a test task
    console.log('📝 Creating test task...');
    const testTask = await dbService.createTask({
      user_id: '550e8400-e29b-41d4-a716-446655440000', // Test UUID
      business_id: 'test-business-' + Date.now(),
      template_id: 'test-template',
      status: 'pending',
      priority: 'medium',
      metadata: { test: true, timestamp: new Date().toISOString() }
    });
    console.log('✅ Task created:', testTask.id);
    
    // Test 2: Read the task back
    console.log('\n📖 Reading task back...');
    const retrievedTask = await dbService.getTask(testTask.id);
    console.log('✅ Task retrieved:', retrievedTask?.id === testTask.id ? 'Success' : 'Failed');
    
    // Test 3: Update task status
    console.log('\n🔄 Updating task status...');
    const updatedTask = await dbService.updateTask(testTask.id, {
      status: 'active'
    });
    console.log('✅ Task updated:', updatedTask.status);
    
    // Test 4: Add audit entry
    console.log('\n📋 Adding audit entry...');
    await dbService.addAuditEntry(
      testTask.id,
      'test_connection',
      { message: 'Database connection test successful' }
    );
    console.log('✅ Audit entry added');
    
    // Test 5: Get audit trail
    console.log('\n📜 Retrieving audit trail...');
    const auditTrail = await dbService.getTaskAuditTrail(testTask.id);
    console.log('✅ Audit entries found:', auditTrail.length);
    
    // Cleanup: Mark task as completed
    console.log('\n🧹 Cleaning up test task...');
    await dbService.updateTask(testTask.id, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });
    console.log('✅ Test task marked as completed');
    
    console.log('\n🎉 All tests passed! Database connection is working.');
    console.log('\n📊 Summary:');
    console.log('- Created task:', testTask.id);
    console.log('- Updated status: pending → active → completed');
    console.log('- Added audit trail');
    console.log('- All operations successful');
    
  } catch (error) {
    console.error('\n❌ Database connection test failed!');
    console.error('Error:', error);
    
    if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.log('\n💡 It looks like the database tables don\'t exist yet.');
      console.log('You need to run the migration in Supabase:');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log('2. Copy and run the migration from: supabase/migrations/001_create_task_tables.sql');
    } else if (error.message?.includes('JWT')) {
      console.log('\n💡 It looks like there\'s an issue with your Supabase key.');
      console.log('Make sure you\'re using the service_role key, not the anon key.');
    }
    
    process.exit(1);
  }
}

// Run the test
testConnection().catch(console.error);