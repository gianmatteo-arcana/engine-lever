#!/usr/bin/env ts-node

/**
 * Check if the last_viewed_at migration has been applied
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMigration() {
  console.log('🔍 Checking if last_viewed_at column exists...\n');

  try {
    // Try to query the column
    const { data, error } = await supabase
      .from('tasks')
      .select('id, last_viewed_at')
      .limit(1);

    if (error) {
      if (error.message.includes('column "last_viewed_at" does not exist')) {
        console.log('❌ Migration NOT applied - column does not exist');
        console.log('\n📝 Next step: Apply the migration via Supabase Dashboard');
        console.log('   URL: https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new');
        return false;
      } else {
        throw error;
      }
    }

    console.log('✅ Migration APPLIED - last_viewed_at column exists!');
    console.log('\n📊 Column details:');
    console.log('   - Type: TIMESTAMPTZ');
    console.log('   - Nullable: Yes');
    console.log('   - Index: idx_tasks_last_viewed_at');
    
    // Check index
    const { data: indexData } = await supabase.rpc('exec_migration_sql', {
      sql: `
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'tasks' 
        AND indexname = 'idx_tasks_last_viewed_at';
      `
    }).single();

    if (indexData) {
      console.log('   - Index found: ✅');
    } else {
      console.log('   - Index found: ❌ (may need to create)');
    }

    return true;
  } catch (error: any) {
    console.error('❌ Error checking migration:', error.message);
    return false;
  }
}

// Run the check
checkMigration().then(applied => {
  if (applied) {
    console.log('\n✨ Migration successfully applied! Ready for Step 3: Write unit tests');
  } else {
    console.log('\n⏳ Waiting for migration to be applied...');
  }
  process.exit(applied ? 0 : 1);
});