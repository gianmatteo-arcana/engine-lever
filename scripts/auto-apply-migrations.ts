#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Load environment variables
dotenv.config();

async function setupSupabaseMigrations() {
  console.log('🚀 Setting up Supabase migrations automatically...\n');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials!');
    process.exit(1);
  }

  // Extract project ref from URL
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    console.error('❌ Could not extract project ref from SUPABASE_URL');
    process.exit(1);
  }

  console.log(`📦 Project: ${projectRef}\n`);

  // Check if Supabase CLI is available
  try {
    execSync('npx supabase --version', { stdio: 'pipe' });
    console.log('✅ Supabase CLI is available\n');
  } catch {
    console.log('📥 Installing Supabase CLI...');
    execSync('npm install --save-dev supabase', { stdio: 'inherit' });
    console.log('✅ Supabase CLI installed\n');
  }

  // Move our custom migrations to Supabase's expected location
  const customMigrationsDir = path.join(__dirname, '../supabase/migrations');
  const supabaseMigrationsDir = path.join(__dirname, '../supabase/migrations');
  
  // Ensure migrations are in the right format (timestamp_name.sql)
  const migrations = [
    { old: '000_create_enums.sql', new: '20250103000000_create_enums.sql' },
    { old: '001_create_task_tables.sql', new: '20250103000001_create_task_tables.sql' }
  ];

  console.log('📄 Preparing migrations...');
  for (const migration of migrations) {
    const oldPath = path.join(customMigrationsDir, migration.old);
    const newPath = path.join(supabaseMigrationsDir, migration.new);
    
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      fs.copyFileSync(oldPath, newPath);
      console.log(`  ✅ Created ${migration.new}`);
    }
  }
  console.log();

  // Create a .env file for Supabase CLI if needed
  const supabaseEnvPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(supabaseEnvPath)) {
    const envContent = `SUPABASE_ACCESS_TOKEN=${key}
SUPABASE_DB_PASSWORD=${key}
SUPABASE_PROJECT_ID=${projectRef}
`;
    fs.writeFileSync(supabaseEnvPath, envContent);
    console.log('✅ Created .env.local for Supabase CLI\n');
  }

  // Try to link the project (might already be linked)
  console.log('🔗 Linking Supabase project...');
  try {
    execSync(`npx supabase link --project-ref ${projectRef}`, { 
      stdio: 'pipe',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: key }
    });
    console.log('✅ Project linked successfully\n');
  } catch (error: any) {
    if (error.toString().includes('already linked')) {
      console.log('✅ Project already linked\n');
    } else {
      console.log('⚠️  Could not link project automatically');
      console.log('   You may need to run: supabase link --project-ref ' + projectRef);
      console.log('   And provide your access token from: https://supabase.com/dashboard/account/tokens\n');
    }
  }

  // Apply migrations using db push
  console.log('📝 Applying migrations to remote database...');
  try {
    const result = execSync('npx supabase db push --linked', { 
      stdio: 'pipe',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: key }
    });
    
    console.log('✅ Migrations applied successfully!\n');
    console.log(result.toString());
  } catch (error: any) {
    const errorStr = error.toString();
    
    if (errorStr.includes('No migrations to apply')) {
      console.log('✅ Database is already up to date!\n');
    } else if (errorStr.includes('auth token')) {
      console.log('\n⚠️  Authentication required\n');
      console.log('Please run the following commands manually:\n');
      console.log('1. Get your access token from:');
      console.log('   https://supabase.com/dashboard/account/tokens\n');
      console.log('2. Link your project:');
      console.log(`   npx supabase link --project-ref ${projectRef}\n`);
      console.log('3. Apply migrations:');
      console.log('   npx supabase db push\n');
    } else {
      console.log('⚠️  Could not apply migrations automatically\n');
      console.log('Error:', errorStr);
    }
  }

  console.log('='.repeat(60));
  console.log('\n🔍 Next step: Verify database state');
  console.log('   Run: npm run db:check\n');
  console.log('='.repeat(60));
}

// Alternative approach using psql directly
async function applyViaPostgreSQL() {
  console.log('\n📡 Alternative: Direct PostgreSQL Approach\n');
  console.log('If the above didn\'t work, you can also:\n');
  console.log('1. Get your database URL from Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/settings/database\n');
  console.log('2. Use psql to apply migrations:');
  console.log('   psql $DATABASE_URL < scripts/combined-migration.sql\n');
  console.log('Or use the combined migration file at:');
  console.log('   scripts/combined-migration.sql\n');
  console.log('Copy its contents to Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new\n');
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('  AUTOMATED SUPABASE MIGRATION');
  console.log('='.repeat(60) + '\n');

  await setupSupabaseMigrations();
  await applyViaPostgreSQL();
}

main().catch(console.error);