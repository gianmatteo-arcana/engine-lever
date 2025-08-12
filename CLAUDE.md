# SmallBizAlly Backend - Claude Code Workflow Guide

## ⚡ Quick Start: Schema Change Workflow
**MUST READ**: [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - The 5-step cycle for any schema changes

## 🎯 Product Vision
SmallBizAlly is an agentic AI platform that automates business compliance through specialized AI agents, task templates, and MCP (Model Context Protocol) tool orchestration.

## 🏗️ Architecture Overview

### Core Architecture Flow
```
User Request → Master Orchestrator Agent → Specialist Agents → MCP Tools → Government Portals
                     ↓                           ↓                ↓              ↓
               Task Templates              A2A Protocol      Tool Registry   API Integration
```

### System Components
1. **Agent Layer**: Specialized AI agents with distinct personas and competencies
2. **Task Template System**: YAML-defined workflows for compliance features
3. **MCP Server Layer**: Tool orchestration and context management
4. **A2A Protocol**: Inter-agent communication and task delegation

## 📋 Current Implementation Status

### ✅ E2E Connection Established
- Frontend (Lovable) ↔️ Backend (Railway) connection working
- CORS configured for production domains
- Health check endpoints operational

### 🚧 MVP Feature: CA Statement of Information (P0)
**Status**: In Development
- **Workflow**: User → Legal Compliance Agent → Data Collection → Payment → Submission
- **Required MCP Tools**: CA_SOS_Portal, QuickBooks, Plaid, Document Generation
- **Implementation Priority**: FIRST

### 📝 Other MVP Features (To Be Implemented)
```yaml
# TODO: These features are stubbed but not yet implemented
- SF Business Registration Renewal (P0)
- Form 571-L Property Tax Statement (P0)  
- General Liability Insurance Renewal (P0)
- Form 1099-NEC Preparation (P0)
```

## 🤖 Agent Personas & Responsibilities

### 1. Master Orchestrator Agent
**Persona**: Executive Assistant with Strategic Planning
**Competence**: Task decomposition, delegation, workflow coordination
**Implementation**: `src/agents/orchestrator.ts`

### 2. Legal Compliance Agent  
**Persona**: Paralegal with Regulatory Expertise
**Competence**: Document interpretation, form completion, deadline tracking
**Implementation**: `src/agents/legal-compliance.ts`

### 3. Data Collection Agent
**Persona**: Business Analyst with Integration Expertise  
**Competence**: Multi-source data gathering, validation, transformation
**Implementation**: `src/agents/data-collection.ts`

### 4. Payment Agent
**Persona**: Financial Operations Specialist
**Competence**: Payment processing, fund verification, transaction management
**Implementation**: `src/agents/payment.ts`

### 5. Agency Interaction Agent
**Persona**: Government Liaison Specialist
**Competence**: Portal navigation, form submission, status monitoring
**Implementation**: `src/agents/agency-interaction.ts`

### 6. Monitoring & Verification Agent
**Persona**: Quality Assurance Specialist
**Competence**: Task verification, audit trails, deadline tracking
**Implementation**: `src/agents/monitoring.ts`

### 7. Customer Communication Agent
**Persona**: Customer Service Representative
**Competence**: User notifications, approval workflows, status updates
**Implementation**: `src/agents/communication.ts`

## 🚨 CRITICAL ARCHITECTURE RULES 🚨

### 1. Schema Changes MUST Follow The Sacred 6-Step Cycle:

1. **Create migration files** in FRONTEND repo (`biz-buddy-ally-now/supabase/migrations/`)
2. **Update migration registry** in `biz-buddy-ally-now/src/data/migration-registry.json`
3. **IMMEDIATELY commit & push** frontend repo changes to make migrations visible in Lovable UI
4. **Apply via Lovable Migration Runner UI** (DEV mode only - NEVER manually!)
5. **Write unit tests** in BACKEND repo with proper mocking
6. **Test locally** (both mocked and real DB), then commit backend changes

**🚨 CRITICAL FAILURE POINT**: Migration files MUST be created in the frontend repo and pushed to GitHub BEFORE backend implementation. If migrations aren't visible in Lovable UI, they weren't created in the right place!

**✅ VERIFICATION CHECKLIST**:
- [ ] Migration files exist in `biz-buddy-ally-now/supabase/migrations/`
- [ ] Migration registry updated in frontend repo
- [ ] Frontend repo changes committed & pushed to GitHub
- [ ] Migrations visible in Lovable Migration Runner UI
- [ ] Backend tests written with proper database mocking
- [ ] All tests passing before final commit

**See [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) for the complete process!**

### 2. Database Schema Ownership:

**ALL DATABASE SCHEMA CHANGES GO IN THE FRONTEND REPO!**

Never create migration files in this backend repo. All schema changes (CREATE TABLE, ALTER TABLE, etc.) must be created as migration files in the frontend repository at:
```
biz-buddy-ally-now/supabase/migrations/
```

See [SCHEMA_ARCHITECTURE.md](./SCHEMA_ARCHITECTURE.md) for full details.

## 📂 Project Structure
```
src/
├── agents/               # Agent implementations
│   ├── base/           # Base agent classes and interfaces
│   ├── orchestrator.ts # Master orchestrator agent
│   ├── legal-compliance.ts
│   ├── data-collection.ts
│   ├── payment.ts
│   ├── agency-interaction.ts
│   ├── monitoring.ts
│   └── communication.ts
├── templates/           # Task template system
│   ├── parser.ts       # YAML template parser
│   ├── executor.ts     # Template execution engine
│   └── tasks/          # Task template definitions
│       ├── soi-filing.yaml
│       └── [other-tasks].yaml
├── mcp-tools/          # MCP tool implementations
│   ├── ca-sos/        # CA Secretary of State tools
│   ├── quickbooks/    # QuickBooks integration
│   ├── plaid/         # Banking integration
│   └── document/      # Document generation
├── protocols/          # Communication protocols
│   ├── a2a.ts         # Agent-to-agent protocol
│   └── mcp.ts         # MCP server protocol
└── workflows/          # Business workflows
    ├── soi/           # Statement of Information workflow
    └── [others]/      # Other compliance workflows
```

## 🔧 Development Workflow

### Before Making ANY Code Changes
1. **Read this CLAUDE.md** to understand the architecture
2. **Check test coverage**: `npm test`
3. **Review the PRD** for feature requirements

## 📏 Naming Conventions (MANDATORY)

### File Naming Standards
**All files MUST follow kebab-case naming convention:**

```
✅ CORRECT:
- state-computer.ts
- llm-provider-interface.ts
- configuration-manager.ts
- credential-vault.ts
- tool-chain.ts

❌ INCORRECT:
- StateComputer.ts (PascalCase)
- LLMProvider.ts (PascalCase)
- ConfigurationManager.ts (PascalCase)
```

### Service File Organization
```
services/
├── database.ts                    # Core database service
├── state-computer.ts             # Event sourcing state computation
├── llm-provider-interface.ts     # LLM abstraction interface
├── real-llm-provider.ts          # Production LLM implementation
├── configuration-manager.ts      # YAML config management
├── credential-vault.ts           # Secure credential storage
├── tool-chain.ts                 # External tool integrations
└── task-events.ts                # Event handling service
```

### Class & Interface Naming
- **Classes**: PascalCase (e.g., `StateComputer`, `DatabaseService`)
- **Interfaces**: PascalCase (e.g., `LLMProvider`, `TaskContext`)
- **Types**: PascalCase (e.g., `ComputedState`, `AgentRequest`)
- **Variables/Functions**: camelCase (e.g., `computeState`, `processRequest`)

### Import Path Standards
```typescript
// ✅ CORRECT - kebab-case file paths
import { StateComputer } from '../services/state-computer';
import { LLMProvider } from '../services/llm-provider-interface';
import { ToolChain } from '../services/tool-chain';

// ❌ INCORRECT - mixed case
import { StateComputer } from '../services/StateComputer';
import { LLMProvider } from '../services/LLMProvider';
```

### Agent Naming Conventions
```
agents/
├── AchievementTracker.ts         # Domain-specific PascalCase
├── BusinessDiscovery.ts          # Domain-specific PascalCase
├── ComplianceAnalyzer.ts         # Domain-specific PascalCase
├── ProfileCollector.ts           # Domain-specific PascalCase
└── base/
    ├── Agent.ts                   # Base classes in PascalCase
    └── BaseA2AAgent.ts           # Base classes in PascalCase
```

**RULE**: Services use kebab-case files, Agents use PascalCase files

### Test File Naming
```
✅ CORRECT:
- state-computer.test.ts          # Matches service file name
- AchievementTracker.test.ts      # Matches agent file name
- __tests__/integration.test.ts   # Test directory structure

✅ Jest Mock Paths:
jest.mock('../services/state-computer');
jest.mock('../services/real-llm-provider');
```

### Why These Conventions?
1. **kebab-case for services**: Follows Node.js ecosystem standards
2. **PascalCase for agents**: Reflects class-based domain entities
3. **Consistency**: Reduces cognitive load and import errors
4. **Tooling**: Better IDE autocomplete and file navigation

### Standard Development Cycle
```bash
# 1. Create feature branch
git checkout -b feature/agent-name

# 2. Implement with TDD
npm test -- --watch agents/your-agent.test.ts

# 3. Run full test suite
npm test

# 4. Commit with conventional commits
git commit -m "feat(agents): implement legal compliance agent"

# 5. Push and deploy
git push origin main
```

### Testing Strategy
- **Unit Tests**: Each agent tested in isolation
- **Integration Tests**: Agent communication and MCP tool integration
- **E2E Tests**: Complete workflow testing (SOI filing end-to-end)
- **Coverage Target**: Maintain >90% coverage

## 🚀 Implementation Roadmap

### Phase 1: SOI Feature (Current)
1. ✅ E2E infrastructure setup
2. 🚧 Agent framework implementation
3. 🚧 Task template system
4. 🚧 CA SOS MCP tools
5. 🚧 SOI workflow implementation
6. 🚧 Frontend UI for SOI

### Phase 2: Additional MVP Features
- [ ] SF Business Registration
- [ ] Form 571-L Property Tax
- [ ] GL Insurance Renewal
- [ ] Form 1099-NEC

### Phase 3: Advanced Features
- [ ] Multi-agent orchestration
- [ ] Advanced MCP tool registry
- [ ] Audit trail system
- [ ] Compliance analytics

## 🔐 Security Considerations
- API authentication via JWT tokens (TODO)
- Rate limiting on all endpoints (TODO)
- Input validation with Zod schemas
- Audit logging for compliance
- Encrypted credential storage for government portals

**📋 Security Documentation:**
- [SECURITY.md](./SECURITY.md) - General security guidelines and architecture
- [SECURITY_SCHEMA_MIGRATIONS.md](./SECURITY_SCHEMA_MIGRATIONS.md) - Migration security protocols
- [Frontend Security Implementation](../biz-buddy-ally-now/SECURITY_IMPLEMENTATION.md) - Latest security fixes and enhancements

## 📊 Performance Targets
- Task creation: < 500ms
- Status updates: < 200ms  
- Document processing: < 10s
- Government portal interaction: < 30s

## 🛠️ Key Dependencies
- **a2a-js**: Agent-to-agent protocol (v0.2.0)
- **Bull**: Task queue management
- **Express**: HTTP server
- **Zod**: Schema validation
- **YAML**: Task template parsing

## 📝 TODO Items for Product Designer Iteration

### Statement of Information Workflow
```typescript
// TODO: Product Designer - Define exact field mappings for SOI form
// TODO: Product Designer - Specify approval workflow requirements
// TODO: Product Designer - Define error handling for failed submissions
```

### Payment Processing
```typescript
// TODO: Product Designer - Specify payment method priority order
// TODO: Product Designer - Define payment failure recovery workflow
```

### User Communications
```typescript
// TODO: Product Designer - Define notification templates
// TODO: Product Designer - Specify escalation thresholds
```

## 📁 Test Output Directory (MANDATORY)

**ALL test results, screenshots, and logs MUST be stored in:**
```
/Users/gianmatteo/Documents/Arcana-Prototype/tests/
```

**NEVER store test files in repository directories!**

## 🚦 Quick Commands

```bash
# Start development server
npm run dev

# Run tests (output goes to central test directory)
TEST_OUTPUT_DIR=/Users/gianmatteo/Documents/Arcana-Prototype/tests npm test

# Run specific agent tests
npm test -- agents/legal-compliance.test.ts

# Check test coverage
npm run test:coverage

# Lint code
npm run lint

# Build for production
npm run build

# Deploy to Railway
git push origin main  # Auto-deploys
```

## 🔄 Deployment Pipeline
1. **Local Development**: `npm run dev`
2. **Testing**: `npm test` (must pass all tests)
3. **Linting**: `npm run lint`
4. **Build**: `npm run build`
5. **Deploy**: Railway auto-deploys on push to main

## 📚 Resources
- [PRD Document]: Complete product requirements
- [A2A Protocol Spec]: Inter-agent communication
- [MCP Documentation]: Tool protocol documentation
- [Task Template Schema]: YAML template specification

## ⚠️ Critical Reminders
1. **SOI Feature First**: Only implement SOI workflow initially
2. **Use TODOs**: Mark unclear requirements for designer iteration
3. **Maintain Tests**: Never commit without passing tests
4. **Document Decisions**: Update this file with architectural changes

Last Updated: 2025-08-03
Current Focus: CA Statement of Information (SOI) Feature Implementation