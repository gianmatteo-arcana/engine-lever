# 📋 CLAUDE CODE SESSION CHECKLIST
**MANDATORY**: Complete this checklist at the START of EVERY session

---

## 🚀 SESSION START PROTOCOL

### Phase 1: Orientation (First 5 Minutes)
```bash
# 1. Check what repository you're in:
pwd

# 2. Check recent commits to understand context:
git log --oneline -10

# 3. Check for uncommitted changes:
git status

# 4. Run the assessment protocol:
find src -name "*.ts" -type f | grep -E "(orchestrat|agent|service)" | head -20
ls -la src/agents/
ls -la src/services/
```

### Phase 2: Read Mandatory Documents
- [ ] Read `ARCHITECTURE_GUIDELINES.md` - Core principles
- [ ] Read `EXISTING_IMPLEMENTATIONS.md` - What already exists
- [ ] Read `CLAUDE.md` - Session guidelines
- [ ] Read recent test results: `npm test 2>&1 | grep -E "(Test Suites:|Tests:)"`

### Phase 3: Understand Current State
- [ ] Check existing orchestrators (should be ONE):
  ```bash
  find src -name "*rchestrat*.ts" -type f
  ```
- [ ] Check existing services:
  ```bash
  ls -la src/services/*.ts
  ```
- [ ] Check existing agents:
  ```bash
  ls -la src/agents/*.ts
  ```
- [ ] Check for forbidden patterns:
  ```bash
  grep -r "getSession" src/ --include="*.ts"
  grep -r "if.*taskType.*===" src/ --include="*.ts"
  ```

---

## 🤔 BEFORE IMPLEMENTING ANYTHING

### The 5 Questions You MUST Answer:

1. **Does this already exist?**
   - Check EXISTING_IMPLEMENTATIONS.md
   - Search the codebase
   - If yes → EXTEND, don't duplicate

2. **Is this universal or task-specific?**
   - Must work for ANY task type
   - No special cases allowed
   - If task-specific → STOP and redesign

3. **Am I following the naming conventions?**
   - Services: kebab-case
   - Agents: PascalCase
   - No document references (PRD, RFC, etc.)

4. **Am I using the right architecture?**
   - Backend → Supabase (service role)
   - No direct frontend database access
   - No getSession() calls

5. **Can this be done with configuration?**
   - Check if YAML template can handle it
   - Prefer configuration over code
   - Hot-reloadable is the goal

---

## 🔨 DURING IMPLEMENTATION

### Every 30 Minutes:
- [ ] Run tests: `npm test`
- [ ] Check for duplicates: `find src -name "*YourNewFile*"`
- [ ] Verify no forbidden patterns
- [ ] Ensure following universal pattern

### Before Creating a New File:
- [ ] Can this be added to existing file?
- [ ] Is there a similar file that does this?
- [ ] Have I checked EXISTING_IMPLEMENTATIONS.md?
- [ ] Am I creating a duplicate orchestrator? (FORBIDDEN)

### Red Flags (STOP if you see these):
- Creating second orchestrator
- Adding `if (taskType === 'specific')`
- Creating `/api/[task-type]/` endpoint
- Using `supabase.auth.getSession()`
- Creating task-specific service/agent

---

## ✅ BEFORE COMMITTING

### Pre-Commit Checklist:
- [ ] All tests pass: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No forbidden patterns exist
- [ ] Updated EXISTING_IMPLEMENTATIONS.md if added new component
- [ ] Followed universal patterns
- [ ] No duplicate implementations

### Commit Message Format:
```
type(scope): description

- Detail 1
- Detail 2
- Follows universal pattern
- No task-specific code

Tests: X passing, Y skipped
```

---

## 🚨 ANTI-PATTERNS TO AVOID

### The "Just Build It" Trap:
❌ "Let me quickly create a new orchestrator for this"
✅ "Let me check if OrchestratorAgent can handle this"

### The "Special Case" Trap:
❌ "Onboarding needs special handling"
✅ "Everything uses the same universal pattern"

### The "Direct Access" Trap:
❌ "I'll just query Supabase directly"
✅ "All database access goes through backend API"

### The "Parallel Implementation" Trap:
❌ "I'll create A2AOrchestrator alongside OrchestratorAgent"
✅ "There is ONE orchestrator that handles everything"

---

## 📊 Success Metrics

Your session is successful if:
- ✅ Zero duplicate implementations created
- ✅ All tests still pass
- ✅ No forbidden patterns introduced
- ✅ Extended existing code vs. creating new
- ✅ Followed universal patterns
- ✅ Updated documentation

Your session failed if:
- ❌ Created duplicate orchestrator/service
- ❌ Added task-specific logic
- ❌ Broke existing tests
- ❌ Introduced forbidden patterns
- ❌ Created parallel implementation

---

## 🔄 End of Session Protocol

Before ending your session:
1. Run full test suite: `npm test`
2. Check for uncommitted changes: `git status`
3. Update EXISTING_IMPLEMENTATIONS.md if needed
4. Document any architectural decisions made
5. Ensure all forbidden patterns are absent

---

## 📚 Quick Reference

### Forbidden Patterns:
```typescript
// NEVER write:
await supabase.auth.getSession()
if (taskType === 'onboarding')
class OnboardingOrchestrator
POST /api/soi/file
```

### Correct Patterns:
```typescript
// ALWAYS write:
await taskService.create({ templateId: 'any_type' })
// Universal handling for all task types
class OrchestratorAgent  // ONE orchestrator
POST /api/tasks/create  // Universal endpoint
```

---

**Remember**: When in doubt, CHECK EXISTING CODE FIRST. Extend, don't duplicate!