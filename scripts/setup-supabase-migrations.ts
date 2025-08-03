#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';

console.log(`
================================================================================
🚀 SUPABASE MIGRATION SETUP INSTRUCTIONS
================================================================================

Your database is missing the required enum types and tables. 
Here's how to fix it:

OPTION 1: Manual Migration (Immediate Fix)
------------------------------------------
1. Go to your Supabase SQL Editor:
   https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new

2. Run these migrations IN ORDER:

   Step 1: Create Enum Types (MUST RUN FIRST!)
   ============================================
`);

// Read and display the enum migration
const enumMigrationPath = path.join(__dirname, '../supabase/migrations/000_create_enums.sql');
if (fs.existsSync(enumMigrationPath)) {
  const enumSql = fs.readFileSync(enumMigrationPath, 'utf8');
  console.log(enumSql);
}

console.log(`
   Step 2: Create Tables (RUN AFTER ENUMS!)
   =========================================
   Copy and run the contents of: supabase/migrations/001_create_task_tables.sql

3. Verify by running: npm run db:check

OPTION 2: Supabase CLI (Recommended for Future)
-----------------------------------------------
1. Install Supabase CLI globally:
   npm install -g supabase

2. Link your project:
   npx supabase link --project-ref raenkewzlvrdqufwxjpl
   
   You'll need:
   - Supabase Access Token from: https://supabase.com/dashboard/account/tokens

3. Apply migrations:
   npx supabase db push

OPTION 3: GitHub Actions (For CI/CD)
------------------------------------
Add this workflow to .github/workflows/supabase.yml:

name: Deploy Migrations
on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: supabase/setup-cli@v1
      - run: |
          supabase link --project-ref \${{ secrets.SUPABASE_PROJECT_REF }}
          supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: \${{ secrets.SUPABASE_ACCESS_TOKEN }}

WHY THE ERROR OCCURRED
---------------------
The error "type 'agent_role' does not exist" happens because:
- Tables reference custom enum types (agent_role, task_status, etc.)
- PostgreSQL requires enums to exist BEFORE tables can use them
- The migrations must run in the correct order

CURRENT STATUS
-------------
✅ 'tasks' table exists (was created earlier)
❌ Enum types are missing
❌ Other tables are missing

================================================================================
`);

console.log('\n📋 Quick Fix Commands:\n');
console.log('1. Copy the enum creation SQL above');
console.log('2. Go to: https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/sql/new');
console.log('3. Paste and run it');
console.log('4. Then run the table creation migration');
console.log('5. Verify with: npm run db:check\n');