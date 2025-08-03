# Schema Change Checklist

Copy this template for each schema change and check off items as you complete them.

---

## Schema Change: [FEATURE_NAME_HERE]

**Date**: [YYYY-MM-DD]
**Developer**: [Your Name]
**Related Issue/Task**: #[Issue Number]

### 📝 Step 1: Create Migration (FRONTEND)
- [ ] Created migration file: `biz-buddy-ally-now/supabase/migrations/[TIMESTAMP]_[UUID].sql`
- [ ] Migration includes:
  - [ ] CREATE TABLE statements (if new tables)
  - [ ] ALTER TABLE statements (if modifying)
  - [ ] CREATE INDEX statements (if needed)
  - [ ] RLS policies (if needed)
- [ ] Tested SQL syntax locally
- [ ] Committed to frontend repo
- [ ] Pushed to GitHub

**Migration filename**: `________________________.sql`

### 🚀 Step 2: Apply Migration
- [ ] Opened Supabase SQL Editor
- [ ] Copied migration content
- [ ] Pasted and clicked "Run"
- [ ] Checked for errors
- [ ] Confirmed success message

**Applied at**: [HH:MM on YYYY-MM-DD]

### ✅ Step 3: Verify Migration
- [ ] Ran `npm run db:check` in backend
- [ ] All expected tables show as existing
- [ ] All expected columns present
- [ ] No error messages

**Tables created/modified**:
- [ ] `_________________`
- [ ] `_________________`
- [ ] `_________________`

### 🧪 Step 4: Write Unit Tests (BACKEND)
- [ ] Created/updated test file: `src/__tests__/[feature].test.ts`
- [ ] Tests cover:
  - [ ] Create operations
  - [ ] Read operations
  - [ ] Update operations
  - [ ] Delete operations (if applicable)
  - [ ] Error scenarios
  - [ ] Edge cases
- [ ] All tests use mocked Supabase client
- [ ] Tests are independent and isolated

**Test file(s)**: `________________________.test.ts`

### 🔬 Step 5: Test Locally
- [ ] `npm test` - all passing
- [ ] `npm test -- [specific-test-file]` - passing
- [ ] `npm run test:db` - connection successful
- [ ] `npm run lint` - no errors
- [ ] `npm run test:coverage` - adequate coverage

**Test results**:
```
Tests: ___ passed, ___ total
Coverage: ____%
```

### 💾 Step 6: Commit Tests
- [ ] Staged all test files
- [ ] Staged any service updates
- [ ] Commit message follows convention
- [ ] Pushed to backend repo
- [ ] CI/CD checks passing (if applicable)

**Commit hash**: `________________________`

### 📋 Final Verification
- [ ] Backend can create records in new tables
- [ ] Backend can read/update records
- [ ] No runtime errors
- [ ] Performance acceptable
- [ ] Documentation updated (if needed)

### 📝 Notes
```
[Any additional notes, issues encountered, or decisions made]
```

---

## Sign-off
- **Developer**: _________________ Date: _________
- **Reviewer**: _________________ Date: _________

---

## Rollback Plan (if needed)
1. Revert backend code commits
2. Run rollback migration (if created)
3. Verify system stability

**Rollback SQL** (if applicable):
```sql
-- Paste rollback SQL here if needed
```