#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function runMigrations() {
  console.log('🚀 Running database migrations...\n');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials!');
    process.exit(1);
  }
  
  const supabase = createClient(url, key);
  
  // Migration files in order
  const migrations = [
    '000_create_enums.sql',
    '001_create_task_tables.sql'
  ];
  
  const migrationsDir = path.join(__dirname, '../supabase/migrations');
  
  for (const migrationFile of migrations) {
    const migrationPath = path.join(migrationsDir, migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.log(`⏭️  Skipping ${migrationFile} (not found)`);
      continue;
    }
    
    console.log(`📄 Running migration: ${migrationFile}`);
    
    try {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      // Execute the migration
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();
      
      if (error) {
        // Try direct execution as fallback
        console.log('   Using alternative execution method...');
        // Note: Supabase JS client doesn't directly support raw SQL execution
        // You'll need to run these in the Supabase SQL Editor
        console.log(`   ⚠️  Please run this migration manually in Supabase SQL Editor`);
        console.log(`   Migration file: ${migrationPath}`);
      } else {
        console.log(`   ✅ ${migrationFile} completed successfully`);
      }
    } catch (error) {
      console.error(`   ❌ Error running ${migrationFile}:`, error);
      console.log(`   ⚠️  Please run this migration manually in Supabase SQL Editor`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Migration Instructions:\n');
  console.log('Since Supabase JS client doesn\'t support direct SQL execution,');
  console.log('please run the migrations manually:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new');
  console.log('2. Run these migrations in order:');
  console.log('   a. First run: 000_create_enums.sql (creates the enum types)');
  console.log('   b. Then run: 001_create_task_tables.sql (creates all tables)');
  console.log('\n3. After running, test with: npm run test:db');
  console.log('\n' + '='.repeat(60));
}

// Run the migrations
runMigrations().catch(console.error);