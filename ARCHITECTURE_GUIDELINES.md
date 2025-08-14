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

### 5. Universal Agent Architecture (CRITICAL)

#### Context Threading Pattern (MANDATORY)
```typescript
// ✅ CORRECT: All agent methods must receive TaskContext
private extractBusinessProfile(context: TaskContext): BusinessProfile {
  // Access Task Template metadata
  const defaultLocation = context.metadata?.defaultLocation;
  const entityRules = context.metadata?.entityRules;
  const locationMapping = context.metadata?.locationMapping;
}

// ❌ FORBIDDEN: Methods without context parameter
private extractBusinessProfile(): BusinessProfile {
  // Cannot access Task Template configuration - ARCHITECTURAL VIOLATION!
}
```

#### Generic Type Mapping (MANDATORY)
```typescript
// ✅ CORRECT: Generic types + Task Template mapping
const mapDiscoveredEntityType = (discoveredType: string, context: TaskContext) => {
  const entityTypeMap = context.metadata?.entityTypeMapping || {};
  
  // Task Template defines: LLC → registered_entity, Corp → registered_entity
  if (entityTypeMap[discoveredType]) {
    return entityTypeMap[discoveredType];
  }
  
  // Fallback generic mapping
  if (discoveredType.includes('llc') || discoveredType.includes('corp')) {
    return 'registered_entity';
  }
  return 'individual_entity';
};

// ❌ FORBIDDEN: Hardcoded specific types
type EntityType = 'LLC' | 'Corporation' | 'Partnership'; // NOT universal!
if (entityType === 'LLC') { /* hardcoded logic */ }     // NEVER!
```

#### Task Template Metadata Architecture (MANDATORY)
```typescript
// ✅ CORRECT: Universal metadata structure
interface TaskTemplateMetadata {
  // Entity-specific rules from Task Template
  entityRules?: {
    [entityType: string]: {
      governanceRequirements?: any[];
      nameRegistrationRules?: any;
      taxRequirements?: any;
    }
  };
  
  // Jurisdiction-specific rules  
  jurisdictionRules?: {
    [location: string]: {
      annualReporting?: boolean;
      fees?: Record<string, number>;
      deadlineRules?: any;
    }
  };
  
  // Normalization mappings
  locationMapping?: Record<string, string>; // 'austin' → 'TX'
  entityTypeMapping?: Record<string, string>; // 'LLC' → 'registered_entity'
  
  // Default configurations
  defaultEntityTypes?: {
    businessEmail?: string;
    personalEmail?: string;
  };
  defaultLocation?: string;
}

// ❌ FORBIDDEN: Hardcoded business logic in agents
if (location === 'California') {
  // Task Template should define this via jurisdictionRules!
}
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

#### Test-Driven Architecture Evolution (CRITICAL)
```typescript
// ✅ MANDATORY: Let tests guide architecture discovery
// When major refactoring breaks tests:
// 1. Update test expectations to match new universal patterns
// 2. Let test requirements reveal optimal architecture
// 3. Architecture emerges from test constraints

describe('ProfileCollectorAgent', () => {
  test('should use generic entity types from Task Template', () => {
    // Test reveals need for generic mapping
    expect(result.entityType).toBe('registered_entity'); // not 'LLC'
  });
  
  test('should access location mapping from context metadata', () => {
    // Test reveals need for context threading
    mockContext.metadata = {
      locationMapping: { 'austin': 'TX', 'texas': 'TX' }
    };
    expect(agent.processRequest(request, mockContext)).toWork();
  });
});

// ❌ FORBIDDEN: Ignoring test architectural guidance
// Tests are failing after refactoring → Fix tests, discover architecture
```

#### Comprehensive Test Metadata (MANDATORY)
```typescript
// ✅ CORRECT: Mock complete Task Template metadata
const mockContext: TaskContext = {
  metadata: {
    entityRules: {
      'registered_entity': {
        governanceRequirements: [{
          id: 'operating_agreement',
          priority: 'high',
          daysToComplete: 90
        }]
      }
    },
    jurisdictionRules: {
      'CA': { annualReporting: true, fees: { annualReport: 50 } }
    },
    locationMapping: { 'austin': 'TX', 'san francisco': 'CA' },
    defaultEntityTypes: {
      businessEmail: 'registered_entity',
      personalEmail: 'individual_entity'
    }
  }
  // ... rest of context
};

// ❌ FORBIDDEN: Minimal test metadata
const mockContext = { metadata: {} }; // Inadequate for universal agents
```

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

## 🛡️ DATABASE RESILIENCE PATTERNS (CRITICAL)

### Graceful Failure Handling (MANDATORY)
```typescript
// ✅ CORRECT: Database operations must not block agent execution
private async recordContextEntry(context: TaskContext, entry: Partial<ContextEntry>): Promise<void> {
  const contextEntry: ContextEntry = {
    entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    // ... construct entry
  };

  // Always add to in-memory context first
  if (!context.history) {
    context.history = [];
  }
  context.history.push(contextEntry);

  // Database persistence is best-effort, not blocking
  if (context.contextId) {
    try {
      const db = DatabaseService.getInstance();
      await db.createContextHistoryEntry(context.contextId, contextEntry);
    } catch (error) {
      console.error('Failed to persist context entry to database:', error);
      // CRITICAL: Continue execution - agent flow must not break
      // In-memory state maintains system operation
    }
  }
}

// ❌ FORBIDDEN: Blocking on database operations
await db.createContextHistoryEntry(context.contextId, contextEntry); // Can break agent flow!
```

### Context State Management (MANDATORY)
```typescript
// ✅ CORRECT: In-memory context as primary, database as persistence
const context: TaskContext = {
  contextId: 'ctx_123',
  history: [], // In-memory state - always available
  // ... other context data
};

// Database writes are for persistence, not state management
// Agent continues working even if database is unavailable

// ❌ FORBIDDEN: Database as primary state source during execution
const history = await db.getContextHistory(contextId); // Don't depend on this during agent execution
```

---

## 🤖 AGENT ARCHITECTURE PATTERNS (CRITICAL)

### Agent Capability vs Workflow Separation (MANDATORY)
```typescript
// ✅ CORRECT: Agents provide CAPABILITIES
class ProfileCollectorAgent extends BaseAgent {
  // Capability: Collect profile data using any configuration
  // Task Template defines: which fields, validation rules, default mappings
  
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    // Generic profile collection capability
    const formFields = this.createFormFields(context.metadata?.formConfiguration);
    const validation = this.applyValidation(context.metadata?.validationRules);
    // Configuration drives behavior, not hardcoded logic
  }
}

// ❌ FORBIDDEN: Agents define WORKFLOWS
class CaliforniaLLCProfileCollector extends BaseAgent {
  // Too specific - limits reusability across jurisdictions
  // Hardcodes California + LLC logic in agent code
}
```

### Configuration-First Development (MANDATORY)
```typescript
// ✅ CORRECT: Start with Task Template metadata schema
// 1. Define comprehensive metadata interface first
// 2. Write agent to consume any metadata configuration
// 3. Agent behavior emerges from Task Template configuration
// 4. Same agent works for any jurisdiction/entity type

interface TaskTemplateMetadata {
  entityRules: Record<string, EntityRuleSet>;
  jurisdictionRules: Record<string, JurisdictionRuleSet>;
  // Define complete schema first
}

class UniversalComplianceAgent {
  processRequest(request: AgentRequest, context: TaskContext) {
    // Behavior driven by context.metadata configuration
    const rules = context.metadata?.entityRules?.[entityType];
    const jurisdictionRules = context.metadata?.jurisdictionRules?.[location];
    // Same code, different behavior via configuration
  }
}

// ❌ FORBIDDEN: Code-first, configure-later approach
class ComplianceAgent {
  processRequest() {
    if (entityType === 'LLC' && location === 'CA') {
      // Hardcoded logic limits universality
    }
  }
}
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

// ❌ Universal Agent Architecture Violations
private extractProfile(): ProfileData { ... }              // Missing context parameter
if (entityType === 'LLC') { /* logic */ }                  // Hardcoded entity logic
type EntityType = 'LLC' | 'Corporation';                   // Non-generic types
await db.createContextHistoryEntry(contextId, entry);      // Blocking database operation
const mockContext = { metadata: {} };                      // Inadequate test metadata
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
- [ ] **Confirmed context threading pattern** (TaskContext parameter in all agent methods)
- [ ] **Confirmed generic type mapping** (no hardcoded entity types)
- [ ] **Confirmed graceful database failure** (try/catch with continue execution)

### Before Committing:

- [ ] **All tests pass** (npm test)
- [ ] **Lint passes** (npm run lint)
- [ ] **Build succeeds** (npm run build)
- [ ] **No forbidden patterns** (grep checks)
- [ ] **No parallel implementations**
- [ ] **Context threading implemented** (all agent methods receive TaskContext)
- [ ] **Generic types used** (registered_entity, not LLC)
- [ ] **Database operations graceful** (try/catch with continue)
- [ ] **Comprehensive test metadata** (entityRules, jurisdictionRules, etc.)

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

# Check for Universal Agent Architecture violations:
grep -r "if.*entityType.*===.*LLC" src/ --include="*.ts"      # Hardcoded entity types
grep -r "if.*location.*===.*California" src/ --include="*.ts" # Hardcoded locations
grep -rn "private.*(): " src/agents/ --include="*.ts"         # Methods missing context param
grep -r "await.*createContextHistoryEntry" src/ --include="*.ts" | grep -v "try"  # Blocking DB ops

# Check for existing implementations:
find src -name "*[Oo]rchestrat*.ts" -type f
find src -name "*[Aa]gent*.ts" -type f
ls -la src/api/*.ts | grep -E "(onboarding|soi|compliance)"

# Check naming conventions:
find src/services -name "*[A-Z]*.ts" -type f  # Should be empty
find src/agents -name "*-*.ts" -type f         # Should be empty

# Check test metadata completeness:
grep -r "metadata: {}" src/__tests__/ --include="*.ts"       # Should be empty - needs comprehensive metadata
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

Last Updated: 2025-08-14
Version: 2.1.0 - Universal Agent Architecture Guidelines