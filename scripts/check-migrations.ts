import { dbService } from '../src/services/database';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkMigrations() {
  try {
    // Initialize database service
    dbService.initialize();
    const supabase = dbService.getClient();

    console.log('🔍 Checking migration history...');
    const { data: migrations, error } = await supabase
      .from('migration_history')
      .select('*')
      .order('applied_at', { ascending: false });

    if (error) {
      console.error('❌ Error checking migrations:', error);
    } else {
      console.log('📋 Migration History:');
      if (migrations.length === 0) {
        console.log('⚠️  No migrations applied yet');
      } else {
        migrations.forEach(m => {
          console.log(`  - ${m.migration_name} (${m.success ? '✅' : '❌'}) - ${m.applied_at}`);
        });
      }
    }

    console.log('\n🔍 Checking backend tables...');
    const backendTables = ['task_executions', 'agent_messages', 'workflow_states', 'task_pause_points'];
    
    for (const tableName of backendTables) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(0); // Just check if table exists

      if (error && error.code === '42P01') {
        console.log(`❌ Table ${tableName}: Not found`);
      } else if (error) {
        console.log(`⚠️  Table ${tableName}: Error - ${error.message}`);
      } else {
        console.log(`✅ Table ${tableName}: Exists`);
      }
    }

    console.log('\n🔍 Checking tasks table structure...');
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .limit(0);

    if (tasksError && tasksError.code === '42P01') {
      console.log('❌ Tasks table: Not found');
    } else if (tasksError) {
      console.log(`⚠️  Tasks table: Error - ${tasksError.message}`);
    } else {
      console.log('✅ Tasks table: Exists');
      
      // Try to check if business_id column exists
      const { data: testData, error: testError } = await supabase
        .from('tasks')
        .select('business_id')
        .limit(0);
        
      if (testError && testError.code === 'PGRST204') {
        console.log('❌ Tasks table: Missing business_id column (migration not applied)');
      } else if (testError) {
        console.log(`⚠️  Tasks table business_id check: ${testError.message}`);
      } else {
        console.log('✅ Tasks table: Has business_id column (migration applied)');
      }
    }
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkMigrations();