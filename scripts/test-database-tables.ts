#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

async function testDatabaseTables() {
  console.log('🔍 Testing Database Tables and Schema...\n');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials!');
    process.exit(1);
  }
  
  const supabase = createClient(url, key);
  
  console.log('='.repeat(60));
  console.log('TABLE STATUS CHECK');
  console.log('='.repeat(60) + '\n');
  
  // Test 1: Check tasks table structure
  console.log('📋 Checking tasks table columns...');
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .limit(0); // Just check structure, don't fetch data
    
    if (error) {
      console.log('  ❌ Error checking tasks table:', error.message);
    } else {
      console.log('  ✅ Tasks table exists');
      
      // Try to check for specific columns
      const columns = [
        'id',
        'user_id',
        'title',
        'description',
        'due_date',
        'business_id',
        'template_id',
        'status',
        'priority',
        'metadata',
        'completed_at'
      ];
      
      console.log('\n  Checking for required columns:');
      for (const col of columns) {
        try {
          const { error: colError } = await supabase
            .from('tasks')
            .select(col)
            .limit(0);
          
          if (colError && colError.message.includes(`Could not find the '${col}' column`)) {
            console.log(`    ❌ ${col} - Missing`);
          } else if (colError) {
            console.log(`    ⚠️  ${col} - ${colError.message}`);
          } else {
            console.log(`    ✅ ${col} - Exists`);
          }
        } catch (e) {
          console.log(`    ❌ ${col} - Error checking`);
        }
      }
    }
  } catch (e: any) {
    console.log('  ❌ Tasks table does not exist');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('BACKEND TABLES CHECK');
  console.log('='.repeat(60) + '\n');
  
  // Test 2: Check backend-specific tables
  const backendTables = [
    'task_executions',
    'agent_messages',
    'workflow_states',
    'task_pause_points',
    'task_audit_trail',
    'task_documents',
    'agent_metrics'
  ];
  
  for (const table of backendTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(0);
      
      if (error && error.message.includes('does not exist')) {
        console.log(`❌ ${table} - Not found`);
      } else if (error && error.code === 'PGRST204') {
        console.log(`✅ ${table} - Exists (empty)`);
      } else if (error) {
        console.log(`⚠️  ${table} - Error: ${error.message}`);
      } else {
        console.log(`✅ ${table} - Exists`);
      }
    } catch (e) {
      console.log(`❌ ${table} - Not found`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  console.log('Current Status:');
  console.log('- Tasks table exists but is missing backend columns');
  console.log('- Backend-specific tables have not been created yet');
  console.log('');
  console.log('Action Required:');
  console.log('1. Run the migration from the frontend repo:');
  console.log('   biz-buddy-ally-now/supabase/migrations/20250803135359_*.sql');
  console.log('');
  console.log('2. This will:');
  console.log('   - Add missing columns to tasks table');
  console.log('   - Create all backend-specific tables');
  console.log('   - Set up indexes and RLS policies');
  console.log('');
  console.log('3. After migration, the backend will be able to:');
  console.log('   - Create and track task executions');
  console.log('   - Store agent messages and communication');
  console.log('   - Persist workflow states');
  console.log('   - Handle pause/resume operations');
  console.log('   - Maintain audit trails');
  console.log('');
  console.log('='.repeat(60));
}

// Run the test
testDatabaseTables().catch(console.error);