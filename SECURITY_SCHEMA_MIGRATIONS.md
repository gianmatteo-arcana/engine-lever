# Security Guidelines for Schema Migrations

## 🚨 CRITICAL: Schema Migration Security Protocol

This document outlines the security procedures for managing database schema changes in the SmallBizAlly system, following the **Hybrid Architecture** where the frontend (Lovable) owns schema management and the backend (Railway) consumes it.

## 🏗️ Migration Architecture Overview

### Schema Ownership Model
- **Frontend (Lovable)**: Owns all schema definitions and migration files
- **Backend (Railway)**: Consumer of schema, never creates migrations
- **Migration Storage**: All `.sql` files in `biz-buddy-ally-now/supabase/migrations/`
- **Execution**: Service role key used for admin-level database operations

## 🔐 Security-First Migration Flow

### Phase 1: Discovery & Validation (Development Only)
```
1. Developer discovers pending migrations in Lovable dev UI
2. Migration Runner component scans /supabase/migrations/ directory
3. System cross-references against migration_history table
4. Status validation: Pending vs Applied vs Failed
```

**🛡️ Security Controls:**
- Migration UI **only appears in development mode** (`import.meta.env.DEV`)
- Production environments have **no migration UI access**
- All migrations **logged with user ID** for audit trails

### Phase 2: Manual Review & Approval
```
1. Developer reviews each migration's SQL content
2. Manual approval required for each migration
3. Batch or individual application supported
4. Pre-execution validation prevents re-application
```

**🛡️ Security Controls:**
- **No automatic migration execution** - all changes require human approval
- **SQL content visible** before execution for review
- **Migration history tracking** prevents accidental re-runs
- **User authentication required** to access migration tools

### Phase 3: Secure Execution
```
1. Migration executed via Edge Function with service role key
2. SQL executed through dedicated migration-manager function
3. Results logged to migration_history with full audit trail
4. Security events logged to security_audit_log table
5. Tables created tracked and reported
```

**🛡️ Security Controls:**
- **Service role key isolation** - migrations bypass RLS for admin operations
- **Edge Function security** - dedicated migration-manager function with CORS controls
- **Comprehensive audit logging** with timestamps and error details
- **Security event tracking** - all migration activities logged to security_audit_log
- **Rollback capability** through migration history tracking
- **Migration registry** - pre-registered migrations prevent unauthorized SQL execution

## 🚫 Security Restrictions

### Development Environment Only
- Migration Runner UI **disabled in production**
- Migration discovery **limited to development mode**
- Schema changes **cannot be applied directly in production**

### Access Control
- **Service role key required** for migration execution
- **Authenticated users only** can access migration tools
- **User ID tracking** for all migration activities
- **No anonymous migration execution**

### Data Protection
- **Foreign key constraints enforced** during migrations
- **RLS policies maintained** for user data isolation
- **Audit trail mandatory** for compliance requirements
- **Error logging without sensitive data exposure**

## ⚠️ Security Warnings

### 🔴 NEVER DO:
- Execute migrations directly in production database
- Share service role keys in client-side code
- Allow anonymous users to access migration tools
- Skip migration approval process
- Modify migration files after they've been applied

### 🟡 CAUTION:
- Always review SQL content before applying migrations
- Verify foreign key constraints won't break existing data
- Test migrations on development environment first
- Monitor migration execution for errors
- Keep migration history table backed up

### ✅ ALWAYS DO:
- Use the approved Lovable Migration Runner interface
- Apply migrations in development environment first
- Review migration SQL content manually
- Verify migration success through logs
- Document breaking changes in migration descriptions

## 🔍 Security Monitoring

### Audit Trail Requirements
All migrations must be logged with:
- **Migration name and timestamp**
- **User ID who applied the migration**
- **Success/failure status**
- **Error messages (if any)**
- **Tables created/modified**
- **SQL content executed**

### Security Logs Location
- **Migration History**: `migration_history` table in Supabase
- **Security Audit Log**: `security_audit_log` table with detailed event tracking
- **Application Logs**: Backend service logs (Railway)
- **Edge Function Logs**: Supabase Edge Function logs (migration-manager, check-pending-migrations)
- **Authentication Logs**: Supabase auth logs
- **Profile Changes**: Audit trail for all profile modifications with triggers

## 🚨 Incident Response

### If Unauthorized Migration Detected:
1. **Immediately review migration_history table**
2. **Check user_id for unauthorized access**
3. **Verify SQL content for malicious operations**
4. **Roll back if necessary using migration history**
5. **Rotate service role keys if compromised**

### If Migration Fails:
1. **Check error message in migration_history**
2. **Verify database state consistency**
3. **Fix migration file if needed**
4. **Re-apply corrected migration**
5. **Update migration documentation**

## 📋 Security Checklist

Before applying any migration:
- [ ] Migration reviewed in development environment
- [ ] SQL content manually inspected for security issues
- [ ] Foreign key constraints verified
- [ ] RLS policies impact assessed
- [ ] Backup strategy confirmed
- [ ] Rollback plan documented
- [ ] User has proper authentication
- [ ] Migration logged for audit compliance

## 🔗 Related Security Documents

- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - 5-step schema change cycle
- [SCHEMA_ARCHITECTURE.md](./SCHEMA_ARCHITECTURE.md) - Schema ownership model
- [SECURITY.md](./SECURITY.md) - General security guidelines

## 📞 Security Contacts

For security concerns regarding migrations:
- **Schema Security**: Review with senior developer
- **Database Security**: Check with DevOps team
- **Compliance**: Ensure audit requirements met

---

**Last Updated**: 2025-08-03  
**Review Frequency**: Monthly or after any security incident