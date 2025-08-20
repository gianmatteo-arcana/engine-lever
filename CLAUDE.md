# SmallBizAlly Backend - Development Guide

## 🚨 PRE-COMMIT HOOKS ARE SACRED
**NEVER use `--no-verify`** - Fix all failures before committing:
- Tests must pass 100%
- TypeScript must compile (`npx tsc --noEmit`)
- Lint must pass
- Build must succeed

## 🎯 Session Start Protocol
```bash
pwd                            # Verify location
git status                     # Check changes
find src -name "*orchestrat*"  # Should find ONE orchestrator
ls -la src/agents/            # Review agents
ls -la src/services/          # Review services
```

## 📋 Core Architecture Rules

### ✅ MANDATORY Patterns
1. **ONE Orchestrator** - `OrchestratorAgent` handles everything
2. **Universal APIs** - `/api/tasks` for ALL task types (no `/api/onboarding/*`)
3. **Service Role Only** - Backend uses service credentials, validates JWTs
4. **No Mock Data** - Real LLM calls, real data (mocks in tests only)
5. **Dependency Injection** - No singletons
6. **Database is Truth** - Objects are facades, state lives in DB

### ❌ FORBIDDEN Patterns
```typescript
// NEVER:
getUserClient(userToken)           // User token DB clients
router.post('/api/soi/create')    // Task-specific endpoints
class OnboardingOrchestrator       // Duplicate orchestrators
if (taskType === 'onboarding')    // Task-specific logic
simulateAgentExecution()           // Mock operations
OrchestratorService.getInstance()  // Singletons
```

### ✅ CORRECT Patterns
```typescript
// ALWAYS:
DatabaseService.getInstance()      // Service role DB access
router.post('/api/tasks')         // Universal endpoints
await validateToken(headers.auth)  // JWT validation
class OrchestratorAgent            // Single orchestrator
createService(userToken)           // Dependency injection
```

## 📂 Naming Conventions
- **Services**: `kebab-case.ts` (e.g., `state-computer.ts`)
- **Agents**: `PascalCase.ts` (e.g., `OrchestratorAgent.ts`)
- **Tests**: Match source naming

## 🔧 Development Workflow

### Schema Changes (Frontend-Driven)
1. Create migration in `biz-buddy-ally-now/supabase/migrations/`
2. Update registry in frontend
3. Push frontend changes
4. Apply via Lovable UI
5. Implement backend code
6. Test with 100% pass rate

### Daily Commands
```bash
npm run dev        # Start server
npm test          # Must pass 100%
npx tsc --noEmit  # Must compile
npm run lint      # Must be clean
npm run build     # Must succeed
```

## 📚 Key Documents
- `ARCHITECTURE_GUIDELINES.md` - Detailed patterns
- `EXISTING_IMPLEMENTATIONS.md` - What exists
- `DEVELOPMENT_WORKFLOW.md` - Schema workflow
- `CLAUDE_SESSION_CHECKLIST.md` - Session guide

## 🎯 Current Focus
- CA Statement of Information (SOI) workflow
- Real agent implementation (no mocks)
- Universal task orchestration

## 📊 Quality Gates
Before ANY commit:
- [ ] 100% test pass rate
- [ ] TypeScript compiles
- [ ] No forbidden patterns
- [ ] Universal patterns followed
- [ ] No duplicate implementations

## 🚀 Quick Reference

### Database Access
```typescript
// Backend validates JWT, uses service role
const userId = await validateToken(req.headers.authorization);
const result = await dbService.query(sql, [userId]);
```

### Universal Task Handling
```typescript
router.post('/api/tasks', async (req, res) => {
  const { taskType, metadata } = req.body;
  // ONE endpoint handles ALL task types
});
```

### Test Output
All test artifacts → `/Users/gianmatteo/Documents/Arcana-Prototype/tests/`

---
**Remember**: One orchestrator, universal patterns, real data, 100% quality.