# 🚨 CRITICAL: Database Schema Architecture 🚨

## ⚠️ IMPORTANT: ALL SCHEMA CHANGES GO IN THE FRONTEND REPO ⚠️

**DO NOT CREATE MIGRATION FILES IN THIS BACKEND REPO!**

All database schema changes (tables, columns, indexes, etc.) MUST be created as migration files in the **frontend repository** (biz-buddy-ally-now), NOT here in the backend.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND REPO                           │
│              (biz-buddy-ally-now - Lovable)                │
│                                                             │
│  📁 supabase/migrations/                                   │
│     └── ALL SCHEMA CHANGES GO HERE                         │
│         - CREATE TABLE statements                          │
│         - ALTER TABLE statements                           │
│         - CREATE INDEX statements                          │
│         - CREATE TYPE (enums)                              │
│                                                             │
│  Deployment: Lovable platform auto-applies migrations      │
│  Access: Uses Supabase anon key                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    Shared Supabase Instance
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND REPO                            │
│             (biz-buddy-backend - Railway)                   │
│                                                             │
│  📁 src/                                                    │
│     └── Business logic and API endpoints                   │
│         - NO migration files                               │
│         - NO schema changes                                │
│         - ONLY uses existing tables                        │
│                                                             │
│  Deployment: Railway                                       │
│  Access: Uses Supabase service key (admin)                 │
└─────────────────────────────────────────────────────────────┘
```

## Why This Architecture?

1. **Single Source of Truth**: All schema definitions in one place (frontend repo)
2. **Automatic Deployment**: Lovable platform handles migrations automatically
3. **Version Control**: All schema changes tracked in Git with proper history
4. **Security**: Schema changes require deliberate commits, not runtime modifications
5. **Reproducibility**: Can rebuild entire database from migration history

## For Claude Code and Future Development

### ✅ When You Need a New Table or Column:

1. **Create migration in FRONTEND repo**:
   ```bash
   cd /path/to/biz-buddy-ally-now
   # Create file: supabase/migrations/YYYYMMDDHHMMSS_description.sql
   ```

2. **Write the migration SQL**:
   ```sql
   -- Example: Add a new table
   CREATE TABLE IF NOT EXISTS new_table_name (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     -- ... columns
   );
   ```

3. **The migration will be applied** when:
   - Lovable deploys the frontend
   - Or manually via Supabase SQL Editor

### ❌ NEVER Do This in Backend:

- Don't create `supabase/migrations/` folder here
- Don't write CREATE TABLE statements in backend code
- Don't try to modify schema at runtime
- Don't use service key to alter database structure

### Backend's Role:

The backend should:
- **READ** from existing tables
- **WRITE** to existing tables  
- **Use** the service key for admin operations
- **Bypass** RLS policies when needed
- **Execute** business logic

But NEVER:
- Create new tables
- Alter table structure
- Add indexes
- Create enums

## Current Schema Tables (Managed by Frontend)

All these tables are defined in frontend migrations:

### User-Facing Tables:
- `profiles` - User profiles
- `tasks` - Main task records

### Backend-Specific Tables:
- `task_executions` - Task execution state
- `agent_messages` - Inter-agent communication
- `workflow_states` - Workflow snapshots
- `task_pause_points` - Pause/resume points
- `task_audit_trail` - Audit logging
- `task_documents` - Document attachments
- `agent_metrics` - Agent performance metrics

### Enum Types:
- `task_status` - Task statuses
- `task_priority` - Priority levels
- `agent_role` - Agent roles
- `message_type` - Message types
- `agent_status` - Agent statuses

## How to Check Current Schema

```bash
# Check what tables exist
npm run db:check

# View schema in Supabase Dashboard
# https://supabase.com/dashboard/project/raenkewzlvrdqufwxjpl/editor
```

## Migration File Naming Convention

In the frontend repo, migrations follow this pattern:
```
YYYYMMDDHHMMSS_uuid.sql
```

Example:
```
20250803135359_a2d91f3f-ea83-4e9d-8ae0-5a58dea1166a.sql
```

## For Emergency Schema Changes

If you absolutely need to make a schema change quickly:

1. **Preferred**: Create migration in frontend repo
2. **Emergency**: Use Supabase SQL Editor directly
3. **Then**: Backport the change to a frontend migration file

## Remember

🎯 **Frontend owns the schema**
🎯 **Backend uses the schema**
🎯 **All migrations in frontend repo**
🎯 **Never create tables from backend code**

This separation ensures clean architecture, proper version control, and reproducible deployments!