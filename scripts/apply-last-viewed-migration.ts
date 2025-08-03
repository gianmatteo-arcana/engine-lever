#\!/usr/bin/env ts-node

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (\!supabaseUrl || \!supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Applying last_viewed_at migration...\n');

  const migrationSQL = `
    -- Add last_viewed_at column to track when a task was last viewed by the user
    -- This helps with sorting and analytics

    ALTER TABLE tasks 
    ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

    -- Create an index for efficient queries on recently viewed tasks
    CREATE INDEX IF NOT EXISTS idx_tasks_last_viewed_at 
    ON tasks(last_viewed_at DESC NULLS LAST);

    -- Add a comment describing the column's purpose
    COMMENT ON COLUMN tasks.last_viewed_at IS 'Timestamp when the task was last viewed by the user';
  `;

  try {
    // Execute the migration
    const { error } = await supabase.rpc('exec_migration_sql', {
      sql: migrationSQL
    });

    if (error) {
      throw error;
    }

    console.log('✅ Migration applied successfully\!');

    // Log to migration history
    const { error: logError } = await supabase
      .from('migration_history')
      .insert({
        migration_name: '20250803162656_90c6d612-036c-4bef-9c70-33edf2353288.sql',
        migration_content: migrationSQL,
        success: true,
        tables_created: []
      });

    if (logError) {
      console.warn('⚠️  Could not log to migration history:', logError.message);
    } else {
      console.log('📝 Migration logged to history');
    }

    return true;
  } catch (error: any) {
    console.error('❌ Error applying migration:', error.message);
    return false;
  }
}

applyMigration().then(success => {
  if (success) {
    console.log('\n✨ Migration complete\! Ready for Step 3: Write unit tests');
  }
  process.exit(success ? 0 : 1);
});
