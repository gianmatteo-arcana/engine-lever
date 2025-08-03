#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config();

interface MigrationFile {
  name: string;
  path: string;
  order: number;
}

async function executeSQLViaAPI(sql: string): Promise<{ success: boolean; error?: string }> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }

  // Extract project ref from URL
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error('Could not extract project ref from SUPABASE_URL');
  }

  try {
    // Use Supabase Management API to execute SQL
    // Note: This requires using the service role key to authenticate
    const response = await axios.post(
      `${url}/rest/v1/rpc/exec_sql`,
      { query: sql },
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    );

    return { success: true };
  } catch (error: any) {
    // If the RPC function doesn't exist, we need to create it first
    if (error.response?.status === 404 || error.response?.data?.message?.includes('not found')) {
      console.log('⚠️  Direct SQL execution not available via API');
      return { 
        success: false, 
        error: 'Direct SQL execution requires Supabase CLI or manual execution' 
      };
    }
    return { 
      success: false, 
      error: error.response?.data?.message || error.message 
    };
  }
}

async function applyMigrationsViaSupabaseJS() {
  console.log('🚀 Applying database migrations automatically...\n');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials!');
    console.log('Please ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env');
    process.exit(1);
  }

  // Since Supabase JS client doesn't support raw SQL execution,
  // we'll create a PostgreSQL function that can execute dynamic SQL
  const createExecFunction = `
-- Create a function to execute dynamic SQL (if it doesn't exist)
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;
`;

  // Get migration files
  const migrationsDir = path.join(__dirname, '../supabase/migrations');
  const migrationFiles: MigrationFile[] = [
    { name: '000_create_enums.sql', path: path.join(migrationsDir, '000_create_enums.sql'), order: 0 },
    { name: '001_create_task_tables.sql', path: path.join(migrationsDir, '001_create_task_tables.sql'), order: 1 }
  ];

  // Read migration contents
  const migrations = migrationFiles
    .filter(m => fs.existsSync(m.path))
    .map(m => ({
      ...m,
      content: fs.readFileSync(m.path, 'utf8')
    }))
    .sort((a, b) => a.order - b.order);

  if (migrations.length === 0) {
    console.error('❌ No migration files found!');
    process.exit(1);
  }

  console.log(`Found ${migrations.length} migration files to apply:\n`);
  migrations.forEach(m => console.log(`  📄 ${m.name}`));
  console.log();

  // Try to apply migrations
  console.log('Attempting to apply migrations...\n');
  
  // Since we can't execute raw SQL directly via the JS client,
  // we'll generate a combined script for manual execution
  const combinedSQL = migrations.map(m => `
-- ============================================
-- Migration: ${m.name}
-- ============================================
${m.content}
`).join('\n\n');

  // Save combined migration to a file
  const outputPath = path.join(__dirname, 'combined-migration.sql');
  fs.writeFileSync(outputPath, combinedSQL);

  console.log('✅ Combined migration file created: scripts/combined-migration.sql\n');
  
  // Try using Supabase CLI if available
  const { execSync } = require('child_process');
  try {
    console.log('🔍 Checking for Supabase CLI...');
    execSync('npx supabase --version', { stdio: 'pipe' });
    
    console.log('✅ Supabase CLI found! Attempting to apply migrations...\n');
    
    // Write migrations to temp file and execute via CLI
    for (const migration of migrations) {
      console.log(`📝 Applying ${migration.name}...`);
      const tempFile = path.join(__dirname, `temp-${migration.name}`);
      fs.writeFileSync(tempFile, migration.content);
      
      try {
        // Use supabase db push to apply the migration
        const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
        const command = `SUPABASE_ACCESS_TOKEN="${key}" npx supabase db push --file "${tempFile}" --project-ref "${projectRef}"`;
        
        execSync(command, { stdio: 'inherit' });
        console.log(`  ✅ ${migration.name} applied successfully!\n`);
      } catch (error) {
        console.error(`  ❌ Failed to apply ${migration.name}`);
        console.error('  Continuing with next migration...\n');
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    }
    
    console.log('✅ Migration process complete!');
    console.log('Run "npm run db:check" to verify the database state.\n');
    
  } catch (cliError) {
    console.log('⚠️  Supabase CLI not found or not configured.\n');
    console.log('='.repeat(60));
    console.log('\n📋 AUTOMATED MIGRATION OPTIONS:\n');
    console.log('OPTION 1: Install and configure Supabase CLI');
    console.log('----------------------------------------');
    console.log('1. Install Supabase CLI:');
    console.log('   npm install -g supabase\n');
    console.log('2. Get your access token from:');
    console.log('   https://supabase.com/dashboard/account/tokens\n');
    console.log('3. Link your project:');
    console.log('   supabase link --project-ref raenkewzlvrdqufwxjpl\n');
    console.log('4. Run this script again:');
    console.log('   npm run db:migrate\n');
    
    console.log('OPTION 2: Use the combined migration file');
    console.log('----------------------------------------');
    console.log('A combined migration file has been created at:');
    console.log(`  ${outputPath}\n`);
    console.log('You can either:');
    console.log('a) Copy its contents and run in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new\n');
    console.log('b) Use psql command line:');
    console.log('   psql $DATABASE_URL < scripts/combined-migration.sql\n');
    
    console.log('='.repeat(60));
  }
}

// Alternative: Direct PostgreSQL connection approach
async function applyMigrationsViaDirectConnection() {
  console.log('\n📡 Alternative: Direct PostgreSQL Connection\n');
  console.log('If you have the database connection string, you can use:');
  console.log('1. Get connection string from Supabase Dashboard > Settings > Database');
  console.log('2. Run: psql "postgresql://..." < scripts/combined-migration.sql\n');
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('  AUTOMATIC DATABASE MIGRATION SCRIPT');
  console.log('='.repeat(60) + '\n');

  await applyMigrationsViaSupabaseJS();
  
  // Show alternative methods
  await applyMigrationsViaDirectConnection();
  
  console.log('='.repeat(60));
  console.log('\n💡 TIP: After migrations are applied, run:');
  console.log('   npm run db:check');
  console.log('\nTo verify all tables were created successfully.');
  console.log('='.repeat(60) + '\n');
}

// Run the script
main().catch(console.error);