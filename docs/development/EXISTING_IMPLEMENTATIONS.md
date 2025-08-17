# 📦 EXISTING IMPLEMENTATIONS INVENTORY
**Last Updated**: 2024-01-13  
**Purpose**: Prevent parallel implementations by documenting what already exists

---

## ⚠️ CRITICAL: DO NOT CREATE DUPLICATES OF THESE

### 🎯 Core Services (ONLY ONE OF EACH)

| Service | File | Purpose | Status |
|---------|------|---------|--------|
| **TaskService** | `src/services/task-service.ts` | Universal task creation for ALL types | ✅ Complete |
| **DatabaseService** | `src/services/database.ts` | All database operations | ✅ Complete |
| **StateComputer** | `src/services/state-computer.ts` | Event sourcing state computation | ✅ Complete |
| **ConfigurationManager** | `src/services/configuration-manager.ts` | YAML template loading | ✅ Complete |
| **CredentialVault** | `src/services/credential-vault.ts` | Secure credential storage | ✅ Complete |

### 🤖 Agents (NO DUPLICATES ALLOWED)

| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **OrchestratorAgent** | `src/agents/OrchestratorAgent.ts` | THE ONLY orchestrator - coordinates ALL agents | ✅ Complete |
| **ComplianceAnalyzer** | `src/agents/ComplianceAnalyzer.ts` | Entity compliance analysis | ✅ Complete |
| **ProfileCollector** | `src/agents/ProfileCollector.ts` | Business profile collection | ✅ Complete |
| **BusinessDiscovery** | `src/agents/BusinessDiscovery.ts` | Business information discovery | ✅ Complete |
| **AchievementTracker** | `src/agents/AchievementTracker.ts` | Progress tracking | ✅ Complete |
| **FormOptimizer** | `src/agents/FormOptimizer.ts` | Form optimization | ✅ Complete |

### ❌ REMOVED/CONSOLIDATED (DO NOT RECREATE)

| Removed Class | Why Removed | Replaced By |
|---------------|-------------|-------------|
| **A2AOrchestrator** | Duplicate orchestration | OrchestratorAgent |
| **PRDOrchestrator** | Never create document-named classes | OrchestratorAgent |
| **OnboardingService** | Task-specific violation | TaskService |
| **SOIFilingService** | Task-specific violation | TaskService |

### 📍 API Endpoints (UNIVERSAL ONLY)

| Endpoint | Purpose | Handles |
|----------|---------|---------|
| `POST /api/tasks/create` | Universal task creation | ALL task types via templateId |
| `GET /api/tasks/:id` | Get any task | ALL task types |
| `PUT /api/tasks/:id` | Update any task | ALL task types |
| `POST /api/tasks/:id/ui-response` | Handle UI responses | ALL task types |

### ❌ FORBIDDEN ENDPOINTS (NEVER CREATE)

- `/api/onboarding/*` - Use `/api/tasks` with templateId
- `/api/soi/*` - Use `/api/tasks` with templateId
- `/api/compliance/*` - Use `/api/tasks` with templateId
- `/api/[any-task-type]/*` - Use `/api/tasks` with templateId

---

## 🔍 BEFORE CREATING ANYTHING NEW

### 1. Check if it exists:
```bash
# For agents:
ls -la src/agents/*.ts | grep -i "yourproposedname"

# For services:
ls -la src/services/*.ts | grep -i "yourproposedname"

# For orchestrators (THERE SHOULD ONLY BE ONE):
find src -name "*rchestrat*.ts" -type f

# For API endpoints:
grep -r "router\." src/api/ --include="*.ts" | grep "yourproposedroute"
```

### 2. Check if similar functionality exists:
```bash
# Search for similar concepts:
grep -r "your_concept" src/ --include="*.ts"

# Check for similar patterns:
grep -r "similar_pattern" src/ --include="*.ts"
```

### 3. If it exists, EXTEND don't DUPLICATE:
- Add methods to existing classes
- Add cases to existing switches
- Add configurations to YAML
- DO NOT create parallel implementations

---

## 📊 Architecture Overview

```
TaskService (ONE)
    ↓
OrchestratorAgent (ONE)
    ↓
Specialist Agents (MANY, but ONE of each type)
    ↓
MCP Tools / External Services
```

### Key Principles:
1. **ONE orchestrator** coordinates everything
2. **ONE task service** handles all task types
3. **Templates (YAML)** define behavior, not code
4. **Universal patterns** only, no special cases

---

## 🚨 WARNING SIGNS OF VIOLATION

If you find yourself:
- Creating a class with "Orchestrator" in the name → STOP! Use OrchestratorAgent
- Creating a class with task type in name (OnboardingX, SOIX) → STOP! Use universal pattern
- Creating a new service that does what existing service does → STOP! Extend existing
- Creating task-specific API endpoint → STOP! Use /api/tasks with templateId

---

## 📝 Update Protocol

When you ADD something new:
1. Update this document
2. Document why it couldn't be done with existing code
3. Ensure it follows universal patterns
4. Verify no duplicates exist

When you REMOVE something:
1. Add to "Removed/Consolidated" section
2. Document what replaces it
3. Ensure no references remain

---

**Remember**: The goal is ONE engine that handles EVERYTHING through configuration, not multiple implementations for different cases.