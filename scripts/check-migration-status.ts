import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function checkMigrationStatus() {
  console.log('🔍 Checking migration status...\n');
  
  // Check last_viewed_at column
  const { error: err1 } = await supabase
    .from('tasks')
    .select('last_viewed_at')
    .limit(1);
  
  // Check notes column
  const { error: err2 } = await supabase
    .from('tasks')
    .select('notes')
    .limit(1);
  
  // Check migration history
  const { data: history } = await supabase
    .from('migration_history')
    .select('migration_name, applied_at, success')
    .order('applied_at', { ascending: false })
    .limit(10);
    
  console.log('📊 Column Status:');
  console.log('  last_viewed_at:', err1?.message?.includes('does not exist') ? '❌ NOT EXISTS' : '✅ EXISTS');
  console.log('  notes:', err2?.message?.includes('does not exist') ? '❌ NOT EXISTS' : '✅ EXISTS');
  
  console.log('\n📋 Migration History (last 10):');
  if (history && history.length > 0) {
    history.forEach(m => {
      const status = m.success ? '✅' : '❌';
      console.log(`  ${status} ${m.migration_name?.substring(0, 30)}... - ${new Date(m.applied_at).toLocaleString()}`);
    });
  } else {
    console.log('  No migrations in history');
  }
  
  console.log('\n📝 Pending Migrations:');
  console.log('  - 20250803162656_90c6d612-036c-4bef-9c70-33edf2353288.sql (last_viewed_at)');
  console.log('  - 20250803172320_4844ebf4-0ab8-4d1d-a9a7-6226a87d079e.sql (notes field)');
  console.log('\n✨ These are ready to be applied via Lovable Migration Runner UI');
}

checkMigrationStatus().catch(console.error);