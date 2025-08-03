# Biz Buddy Backend - Claude Code Workflow Guide

## Architecture Overview
This is a Node.js backend service with A2A (Agent-to-Agent) and MCP (Model Context Protocol) support, designed for:
- UI (React) → Supabase Edge Functions → Railway (Agents/MCP) → External APIs

## Development Workflow - MANDATORY PROCESS

### Before Making ANY Code Changes
1. **Always read this CLAUDE.md file first** to understand the established patterns
2. **Measure test execution time** if you suspect it has grown: `time npm test`
3. **Current test suite takes ~1.7 seconds** - this is acceptable for development workflow

### Standard Development Cycle
```bash
# 1. Suggest patch (discuss with user first)
# 2. Implement changes locally
# 3. Run targeted tests during development
npm test -- --testPathPattern=<module>.test.ts

# 4. Run full test suite before commit
npm test

# 5. If all tests pass, commit and push
git add .
git commit -m "description"
git push origin main

# 6. Railway auto-deploys from main branch
```

### Test Strategy
- **Pre-commit Hook**: Runs lint + full test suite + build (via Husky)
- **Development**: Use targeted tests for specific modules during iteration
- **Deployment Gate**: All 97 tests must pass before push to main
- **Railway Deployment**: Automatic on successful push to main

### Code Quality Standards
- **ESLint**: Must pass before commit
- **Test Coverage**: 97 tests across 5 modules (agents, mcp-server, queues, api, tools)
- **TypeScript**: Strict compilation required
- **No Regressions**: Pre-commit hooks prevent broken deployments

## Module Structure
```
src/
├── agents/        # A2A agent implementations (AgentManager)
├── mcp-server/    # MCP toolchain server (MCPServer)
├── queues/        # Background job processing (QueueManager)
├── api/           # HTTP endpoints for Supabase integration
├── tools/         # Custom MCP tools (business, document, compliance)
├── utils/         # Shared utilities (logger, etc.)
└── __tests__/     # Comprehensive test suite
```

## Key Dependencies
- **a2a-js**: v0.2.0 (Agent-to-Agent protocol)
- **Bull**: Redis-backed job queues
- **Express**: HTTP server
- **Jest**: Testing framework
- **Winston**: Logging
- **Husky**: Pre-commit hooks

## Testing Philosophy
- **Unit Tests**: Test individual modules in isolation
- **Integration Tests**: Test API endpoints with supertest  
- **State Isolation**: Each test starts with clean state
- **Error Scenarios**: Test both success and failure paths
- **Performance**: Keep test suite under 3 seconds for developer productivity

## Deployment Pipeline
1. **Local Development**: `npm run dev`
2. **Testing**: `npm test` (must pass 97/97 tests)
3. **Linting**: `npm run lint` (ESLint validation)
4. **Build**: `npm run build` (TypeScript compilation)
5. **Commit**: Husky pre-commit hook runs steps 2-4
6. **Push**: `git push origin main`
7. **Deploy**: Railway auto-deploys on successful push

## Critical Reminders for Claude Code Instances
1. **NEVER commit code without running tests first**
2. **ALWAYS maintain the 97-test coverage standard**
3. **READ this CLAUDE.md file at the start of every session**
4. **Ask user for approval before major architectural changes**
5. **Keep test execution time under 3 seconds for productivity**
6. **Use TodoWrite tool for multi-step tasks to track progress**

## Performance Benchmarks
- **Full Test Suite**: ~1.7 seconds (97 tests)
- **Targeted Module Tests**: ~0.3-0.5 seconds per module
- **Build Time**: ~2-3 seconds
- **Pre-commit Hook**: ~5-7 seconds total

Last Updated: 2025-08-03
Test Suite Status: ✅ 97/97 tests passing