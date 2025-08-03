# 🤖 Automating Schema Migrations Through Lovable

## Current Situation
Migrations must be manually applied via Supabase Dashboard. Can we automate this through Lovable?

## Yes! Here Are 4 Ways to Automate:

### Option 1: Supabase Edge Function (Recommended) 🎯

Create an Edge Function that applies migrations programmatically:

```typescript
// File: biz-buddy-ally-now/supabase/functions/apply-migrations/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Verify admin secret
    const authHeader = req.headers.get('Authorization')
    const adminSecret = Deno.env.get('MIGRATION_SECRET')
    
    if (authHeader !== `Bearer ${adminSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Get migration SQL from request
    const { sql, migrationName } = await req.json()
    
    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Execute migration using PostgreSQL function
    const { error } = await supabaseAdmin.rpc('exec_migration', {
      migration_sql: sql,
      migration_name: migrationName
    })
    
    if (error) throw error
    
    return new Response(JSON.stringify({ 
      success: true, 
      migration: migrationName 
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

Then create a PostgreSQL function to execute SQL:
```sql
CREATE OR REPLACE FUNCTION exec_migration(
  migration_sql TEXT,
  migration_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log the migration
  INSERT INTO migration_history (name, applied_at)
  VALUES (migration_name, NOW());
  
  -- Execute the migration
  EXECUTE migration_sql;
END;
$$;
```

### Option 2: GitHub Actions on Push 🚀

Add to `.github/workflows/deploy.yml` in frontend repo:

```yaml
name: Deploy and Migrate
on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        
      - name: Apply migrations
        run: |
          supabase link --project-ref raenkewzlvrdqufwxjpl
          supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      
      - name: Notify Lovable
        run: |
          curl -X POST https://api.lovable.dev/webhook/migration-complete \
            -H "Authorization: Bearer ${{ secrets.LOVABLE_API_KEY }}" \
            -d '{"status": "migration_applied"}'
```

### Option 3: Lovable Build Hook 🏗️

Create a custom Vite plugin that runs during Lovable's build:

```typescript
// File: biz-buddy-ally-now/vite-plugin-migrations.ts
import { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'

export function supabaseMigrations(): Plugin {
  return {
    name: 'supabase-migrations',
    buildStart: async () => {
      if (process.env.NODE_ENV === 'production') {
        console.log('🔄 Checking for pending migrations...')
        
        const migrationsDir = path.join(__dirname, 'supabase/migrations')
        const migrations = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql'))
          .sort()
        
        // Check which migrations need to be applied
        const response = await fetch(
          `${process.env.VITE_SUPABASE_URL}/rest/v1/migration_history`,
          {
            headers: {
              'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
            }
          }
        )
        
        const applied = await response.json()
        const appliedNames = applied.map((m: any) => m.name)
        
        for (const migration of migrations) {
          if (!appliedNames.includes(migration)) {
            console.log(`📝 Applying migration: ${migration}`)
            // Trigger Edge Function to apply migration
            await applyMigration(migration)
          }
        }
      }
    }
  }
}

// Add to vite.config.ts
import { supabaseMigrations } from './vite-plugin-migrations'

export default defineConfig({
  plugins: [
    react(),
    supabaseMigrations()
  ]
})
```

### Option 4: Lovable Post-Deploy Webhook 🪝

Create a webhook that Lovable calls after deployment:

```typescript
// File: biz-buddy-ally-now/api/post-deploy.ts
export async function POST(request: Request) {
  const { deployment_id, environment } = await request.json()
  
  if (environment === 'production') {
    // Read pending migrations
    const migrations = await getPendingMigrations()
    
    for (const migration of migrations) {
      // Apply via Supabase Management API
      await applyMigrationViaAPI(migration)
    }
    
    return Response.json({ 
      success: true, 
      migrations_applied: migrations.length 
    })
  }
}
```

## 🎯 Recommended Approach: Edge Function + UI Button

### Step 1: Create Edge Function
```bash
# In frontend repo
mkdir -p supabase/functions/apply-migrations
```

### Step 2: Add Migration UI Component
```tsx
// File: biz-buddy-ally-now/src/components/admin/MigrationRunner.tsx
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function MigrationRunner() {
  const [applying, setApplying] = useState(false)
  
  const applyPendingMigrations = async () => {
    setApplying(true)
    
    try {
      // Get list of migration files
      const migrations = await fetchMigrationFiles()
      
      for (const migration of migrations) {
        const { data, error } = await supabase.functions.invoke(
          'apply-migrations',
          {
            body: {
              sql: migration.content,
              migrationName: migration.name
            }
          }
        )
        
        if (error) throw error
        console.log(`✅ Applied: ${migration.name}`)
      }
      
      toast.success('All migrations applied!')
    } catch (error) {
      toast.error(`Migration failed: ${error.message}`)
    } finally {
      setApplying(false)
    }
  }
  
  return (
    <Button 
      onClick={applyPendingMigrations}
      disabled={applying}
    >
      {applying ? 'Applying Migrations...' : 'Apply Pending Migrations'}
    </Button>
  )
}
```

### Step 3: Add to Admin Dashboard
```tsx
// In your admin page
import { MigrationRunner } from '@/components/admin/MigrationRunner'

export function AdminDashboard() {
  return (
    <div>
      <h2>Database Management</h2>
      <MigrationRunner />
    </div>
  )
}
```

## 🔐 Security Considerations

1. **Protect the endpoint**: Use authentication/authorization
2. **Validate SQL**: Check for dangerous operations
3. **Audit trail**: Log all migrations
4. **Rollback plan**: Keep rollback SQL ready
5. **Test first**: Always test in development

## 📋 Implementation Checklist

To implement automated migrations:

- [ ] Choose approach (Edge Function recommended)
- [ ] Create Edge Function in frontend repo
- [ ] Add exec_migration PostgreSQL function
- [ ] Create migration_history table
- [ ] Add UI component for triggering
- [ ] Test in development environment
- [ ] Add authentication/security
- [ ] Document the process

## 🎉 Benefits

- **One-click migrations** from Lovable UI
- **Audit trail** of all applied migrations
- **No manual SQL copy/paste**
- **Consistent deployment process**
- **Rollback capability**

## 🚀 Quick Start

1. Copy the Edge Function code above
2. Deploy it to Supabase
3. Add the UI component
4. Test with a simple migration
5. Celebrate automation! 🎊

---

**Note**: Lovable doesn't automatically run migrations for safety reasons, but with these approaches, you can trigger them with a single click or API call!