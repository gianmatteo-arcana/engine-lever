#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';

console.log('='.repeat(70));
console.log('  DATABASE MIGRATION SQL GENERATOR');
console.log('='.repeat(70) + '\n');

console.log('Since automated migration requires additional setup,');
console.log('here\'s the SQL you need to run manually:\n');

console.log('📋 INSTRUCTIONS:');
console.log('================\n');
console.log('1. Go to Supabase SQL Editor:');
console.log('   https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new\n');
console.log('2. Copy everything between the START and END markers below');
console.log('3. Paste it in the SQL editor');
console.log('4. Click "Run" button\n');

console.log('='.repeat(70));
console.log('========== COPY SQL STARTING FROM BELOW THIS LINE ==========');
console.log('='.repeat(70) + '\n');

// Read the enum migration
const enumPath = path.join(__dirname, '../supabase/migrations/000_create_enums.sql');
if (fs.existsSync(enumPath)) {
  const enumSql = fs.readFileSync(enumPath, 'utf8');
  console.log('-- Step 1: Create Enum Types');
  console.log('-- ===========================');
  console.log(enumSql);
  console.log('\n');
}

// Read the tables migration but remove the duplicate enum creation
const tablesPath = path.join(__dirname, '../supabase/migrations/001_create_task_tables.sql');
if (fs.existsSync(tablesPath)) {
  let tablesSql = fs.readFileSync(tablesPath, 'utf8');
  
  // Remove the enum creation part (lines 1-14) since we already have it
  const lines = tablesSql.split('\n');
  const withoutEnums = lines.slice(15).join('\n'); // Skip the enum creation lines
  
  console.log('-- Step 2: Create Tables');
  console.log('-- =====================');
  console.log(withoutEnums);
}

console.log('\n' + '='.repeat(70));
console.log('========== COPY SQL ENDING AT ABOVE THIS LINE ==========');
console.log('='.repeat(70) + '\n');

console.log('📌 AFTER RUNNING THE SQL:');
console.log('========================\n');
console.log('1. Check for any errors in the output');
console.log('2. Run: npm run db:check');
console.log('3. If all tables exist, you\'re ready to use the persistence layer!\n');

console.log('='.repeat(70));

// Also save to a file
const outputPath = path.join(__dirname, 'final-migration.sql');
const enumSql = fs.existsSync(enumPath) ? fs.readFileSync(enumPath, 'utf8') : '';
const tablesSql = fs.existsSync(tablesPath) ? fs.readFileSync(tablesPath, 'utf8') : '';

// Remove duplicate enum creation from tables SQL
const lines = tablesSql.split('\n');
const withoutEnums = lines.slice(15).join('\n');

const finalSql = `-- Complete Migration Script for Supabase
-- ========================================

-- Step 1: Create Enum Types
${enumSql}

-- Step 2: Create Tables
${withoutEnums}`;

fs.writeFileSync(outputPath, finalSql);
console.log(`\n💾 Complete SQL also saved to: ${outputPath}`);
console.log('   You can open this file and copy its contents if needed.\n');
console.log('='.repeat(70));