# 🏛️ SmallBizAlly Architecture Guidelines - MANDATORY REFERENCE

**⚠️ THIS DOCUMENT IS MANDATORY READING FOR ALL CLAUDE CODE SESSIONS**
**⚠️ VIOLATION OF THESE GUIDELINES WILL RESULT IN REJECTED CODE**

---

## 🛑 MANDATORY ASSESSMENT PROTOCOL (START HERE)

### Before ANY Implementation:

1. **STOP AND ASSESS** (Minimum 5 minutes)
   ```bash
   # Run these commands FIRST in EVERY session:
   find src -name "*.ts" -type f | grep -E "(orchestrat|agent|service)" | head -20
   grep -r "class.*Agent" src/ --include="*.ts" | head -20
   ls -la src/agents/
   ls -la src/services/
   ```

2. **CHECK FOR EXISTING IMPLEMENTATIONS**
   - Does this functionality already exist?
   - Is there a similar pattern already implemented?
   - Can existing code be extended instead of creating new?

3. **DOCUMENT YOUR ASSESSMENT**
   ```markdown
   ## Assessment Results:
   - [ ] Checked for existing orchestrators: [list found]
   - [ ] Checked for existing agents: [list found]
   - [ ] Checked for existing services: [list found]
   - [ ] Confirmed no parallel implementation exists
   - [ ] Confirmed following universal pattern
   ```

4. **IF DUPLICATE FOUND**: STOP! Consolidate, don't create parallel.

---

## 🎯 CORE PRODUCT PRINCIPLES

### 1. Universal Engine Architecture
```typescript
// ✅ CORRECT: Everything is a task
const context = await taskService.create({
  templateId: 'any_task_type',  // SOI, onboarding, anything
  tenantId,
  initialData
});

// ❌ FORBIDDEN: Task-specific implementations
if (taskType === 'onboarding') { ... }  // NEVER!
class OnboardingService { ... }         // NEVER!
POST /api/soi/file                      // NEVER!
```

### 2. Single Source of Truth
- **ONE** TaskService for ALL tasks
- **ONE** OrchestratorAgent for ALL coordination
- **YAML** templates define behavior, not code
- **ZERO** task-specific implementations

### 3. Event Sourcing Only
```typescript
// ✅ CORRECT: Append-only history
await appendEntry(context, { operation, data, reasoning });

// ❌ FORBIDDEN: Direct state mutation
context.status = 'completed';  // NEVER!
```

### 4. Configuration-Driven Everything
- Hot-reloadable YAML files control ALL behavior
- NO hardcoded business logic in code
- Template changes require NO code changes

### 5. FluidUI Dynamic Generation
- **ZERO** hardcoded screens anywhere
- Agents provide semantic data only
- FluidUI renders based on data structure

---

## 🏗️ ARCHITECTURAL PRINCIPLES

### 1. Backend-Centric Database Architecture

```typescript
// ✅ CORRECT: Backend uses service role
const dbService = DatabaseService.getInstance();
const result = await dbService.query(sql, params);

// ❌ FORBIDDEN: User token clients
const userClient = createClient(userToken);  // NEVER!
const data = await supabase.from('tasks');   // NEVER!
```

### 2. JWT Authentication ONLY

```typescript
// ✅ CORRECT: Simple header auth
const token = req.headers.authorization;
const userId = validateToken(token);

// ❌ FORBIDDEN: Supabase auth (causes hanging)
await supabase.auth.getSession();     // HANGS THE APP!
await supabase.auth.getUser();        // HANGS THE APP!
```

### 3. No Fallback Patterns

```typescript
// ❌ FORBIDDEN: Fallback patterns
try {
  await backendAPI.call();
} catch {
  await supabase.direct();  // NEVER! No fallbacks!
}
```

### 4. Single Orchestration Path

- **ONE** OrchestratorAgent.ts (no duplicates!)
- **ONE** coordination pattern for everything
- **NO** A2AOrchestrator, PRDOrchestrator, etc.

---

## 💻 DEVELOPMENT GUIDELINES

### 1. Naming Conventions (MANDATORY)

```typescript
// ✅ CORRECT:
services/task-service.ts         // kebab-case for services
agents/OrchestratorAgent.ts      // PascalCase for agents
agents/ComplianceAnalyzer.ts     // Business role names

// ❌ FORBIDDEN:
services/TaskService.ts          // Wrong case for service
agents/PRDOrchestrator.ts        // Document reference in name
agents/orchestrator-agent.ts     // Wrong case for agent
```

### 2. Universal Patterns ONLY

```typescript
// ✅ CORRECT: Universal endpoint
POST /api/tasks/create
{
  "templateId": "soi_filing",  // or "onboarding" or anything
  "initialData": { ... }
}

// ❌ FORBIDDEN: Task-specific endpoints
POST /api/onboarding/create     // NEVER!
POST /api/soi/file              // NEVER!
POST /api/compliance/submit     // NEVER!
```

### 3. Testing Requirements

- **95%+ unit test coverage** (enforced)
- **E2E tests with real engine** (no simulations)
- **TDD practices** - write test first
- **Mocked unit tests** - no real DB/API calls

### 4. Pre-Push Enforcement

```bash
# Pre-commit hook checks:
- No getSession() calls
- No task-specific endpoints
- No direct Supabase access
- Proper naming conventions
- Test coverage > 95%
```

---

## 🚫 FORBIDDEN PATTERNS (AUTO-REJECT)

### Never Create These:

```typescript
// ❌ Authentication Anti-Patterns
await supabase.auth.getSession();           // Causes hanging
await supabase.auth.signIn();              // Use backend auth
await supabase.auth.getUser();             // Causes hanging

// ❌ Database Anti-Patterns
await supabase.from('tasks').select();     // Direct DB access
const userClient = createClient(userToken); // User token clients
await getUserClient(token);                 // User-scoped clients

// ❌ Task-Specific Anti-Patterns
if (taskType === 'onboarding') { ... }     // Task-specific logic
class OnboardingOrchestrator { ... }       // Task-specific classes
router.post('/api/soi/file', ...);         // Task-specific endpoints

// ❌ Naming Anti-Patterns
class PRDOrchestrator { ... }              // Document references
services/TaskService.ts                     // Wrong case
agents/compliance-analyzer.ts               // Wrong case
```

---

## 📋 MANDATORY CHECKLISTS

### Before Writing ANY Code:

- [ ] **Ran assessment protocol** (see top of document)
- [ ] **Checked for existing implementations**
- [ ] **Confirmed using backend API** (not direct Supabase)
- [ ] **Confirmed universal pattern** (not task-specific)
- [ ] **Confirmed no getSession() calls**
- [ ] **Confirmed proper naming conventions**

### Before Committing:

- [ ] **All tests pass** (npm test)
- [ ] **Lint passes** (npm run lint)
- [ ] **Build succeeds** (npm run build)
- [ ] **No forbidden patterns** (grep checks)
- [ ] **No parallel implementations**

### Success Criteria:

- [ ] **Single engine handles all tasks** ✅
- [ ] **Zero hanging issues** ✅
- [ ] **Complete agent coordination** ✅
- [ ] **Dynamic UI generation** ✅
- [ ] **95%+ test coverage** ✅
- [ ] **No duplicate implementations** ✅

---

## 🔍 VERIFICATION COMMANDS

Run these BEFORE implementing anything:

```bash
# Check for forbidden patterns:
grep -r "getSession" src/ --include="*.ts"
grep -r "supabase.auth" src/ --include="*.ts"
grep -r "getUserClient" src/ --include="*.ts"
grep -r "if.*taskType.*===" src/ --include="*.ts"

# Check for existing implementations:
find src -name "*[Oo]rchestrat*.ts" -type f
find src -name "*[Aa]gent*.ts" -type f
ls -la src/api/*.ts | grep -E "(onboarding|soi|compliance)"

# Check naming conventions:
find src/services -name "*[A-Z]*.ts" -type f  # Should be empty
find src/agents -name "*-*.ts" -type f         # Should be empty
```

---

## 📚 REFERENCE DOCUMENTS

1. **Engine PRD** - The source of truth for all architecture
2. **CLAUDE.md** - Session-specific guidelines
3. **DEVELOPMENT_WORKFLOW.md** - Schema change process
4. **This Document** - Architectural enforcement

---

## ⚠️ ENFORCEMENT

This document is:
- **MANDATORY** for all development
- **ENFORCED** through pre-push hooks
- **VERIFIED** in code reviews
- **REFERENCED** in all architectural decisions

**Violations = Automatic Rejection**

Last Updated: 2024-01-13
Version: 2.0.0