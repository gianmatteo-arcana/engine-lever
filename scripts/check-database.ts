#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function checkDatabase() {
  console.log('🔍 Checking Supabase database setup...\n');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials!');
    process.exit(1);
  }
  
  console.log('✅ Credentials found\n');
  
  const supabase = createClient(url, key);
  
  // Check if tables exist
  const tables = [
    'tasks',
    'task_executions',
    'agent_messages',
    'workflow_states',
    'task_pause_points',
    'task_audit_trail',
    'task_documents',
    'agent_metrics'
  ];
  
  console.log('📊 Checking tables:');
  let missingTables = [];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      
      if (error && error.message.includes('does not exist')) {
        console.log(`  ❌ ${table} - Not found`);
        missingTables.push(table);
      } else if (error && error.code === 'PGRST204') {
        console.log(`  ✅ ${table} - Exists (empty)`);
      } else if (error) {
        console.log(`  ⚠️  ${table} - Error: ${error.message}`);
      } else {
        console.log(`  ✅ ${table} - Exists`);
      }
    } catch (e) {
      console.log(`  ❌ ${table} - Not found`);
      missingTables.push(table);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (missingTables.length > 0) {
    console.log('\n⚠️  Database tables are missing!\n');
    console.log('To fix this, you need to run the migration:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new');
    console.log('2. Copy the migration file from the FRONTEND repo:');
    console.log('   biz-buddy-ally-now/supabase/migrations/20250803135359_*.sql');
    console.log('3. Paste it in the SQL editor and click "Run"\n');
    console.log('⚠️  Remember: All schema changes are managed in the frontend repo!');
    console.log('   See SCHEMA_ARCHITECTURE.md for details.\n')
    
    console.log('Missing tables:', missingTables.join(', '));
  } else {
    console.log('\n✅ All tables exist! Your database is ready.\n');
    console.log('You can now:');
    console.log('1. Run the server: npm run dev');
    console.log('2. Test the connection: npm run test:db');
    console.log('3. Use the persistent API at /api/v2/*');
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run the check
checkDatabase().catch(console.error);