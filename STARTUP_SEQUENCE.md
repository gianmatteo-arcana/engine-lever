# 🚀 Biz Buddy Backend - Startup Sequence Documentation

## Overview
This document explains the complete initialization sequence of the Biz Buddy Backend service, from entry point to fully operational state.

## Startup Flow Diagram
```
index.ts (startServer)
    ├── 1. Environment Validation
    │   └── Check for required env vars (SUPABASE_*, API keys)
    │
    ├── 2. Core Services Initialization
    │   ├── initializeServices() - Dependency Injection
    │   ├── initializeTaskEvents() - Event System
    │   ├── QueueManager.initialize() - Task Queues
    │   └── MCPServer.initialize() - MCP Tools
    │
    ├── 3. Pure A2A Agent System Initialization ⚠️ CRITICAL PATH
    │   └── OrchestratorAgent.initializeAgentSystem()
    │       └── OrchestratorAgent.getInstance() [SINGLETON]
    │           └── new OrchestratorAgent()
    │               └── super() → BaseAgent('orchestrator.yaml')
    │                   ├── Load YAML configs
    │                   ├── Validate inheritance
    │                   └── Initialize Services
    │                       ├── LLMProvider.getInstance()
    │                       └── new ToolChain() ⚠️ REQUIRES SUPABASE
    │                           └── new CredentialVault()
    │                               └── createClient(url, key) 💥 FAILS WITHOUT ENV VARS
    │
    └── 4. HTTP Server Start
        └── server.listen(PORT)
```

## Critical Dependencies

### 1. Environment Variables (REQUIRED)
```bash
# Database & Auth
SUPABASE_URL=https://raenkewzlvrdqufwxjpl.supabase.co
SUPABASE_SERVICE_KEY=[service_role key from Supabase dashboard]

# AI Services  
ANTHROPIC_API_KEY=[from Anthropic console]
OPENAI_API_KEY=[from OpenAI platform]

# Server Config
PORT=3001
NODE_ENV=production
```

### 2. Service Initialization Order
The order is **CRITICAL** and cannot be changed:

1. **Dependency Injection** - Sets up service container
2. **Task Events** - Initializes event bus
3. **Queue Manager** - Sets up Bull queues
4. **MCP Server** - Initializes tool registry
5. **Pure A2A Agent System** - Initializes OrchestratorAgent for A2A protocol (REQUIRES all above)

### 3. Agent System Architecture

#### OrchestratorAgent (Singleton)
- **Role**: Central coordinator for pure A2A protocol system
- **Initialization**: Created once during OrchestratorAgent.initializeAgentSystem()
- **Dependencies**: 
  - BaseAgent (parent class)
  - ToolChain (requires Supabase)
  - LLMProvider (requires API keys)

#### BaseAgent
- **Role**: Foundation for all agents
- **Responsibilities**:
  - Load YAML configurations
  - Validate agent inheritance
  - Initialize core services (LLM, ToolChain)
  - Provide standard agent interface

## Failure Points & Recovery

### Common Startup Failures

1. **Missing Supabase Config**
   - **Error**: `supabaseKey is required`
   - **Location**: CredentialVault initialization
   - **Fix**: Add SUPABASE_URL and SUPABASE_SERVICE_KEY to environment

2. **Missing API Keys**
   - **Error**: `LLM Provider initialized without API key`
   - **Location**: LLMProvider initialization
   - **Fix**: Add ANTHROPIC_API_KEY or OPENAI_API_KEY

3. **Config File Not Found**
   - **Error**: `Could not find orchestrator.yaml`
   - **Location**: BaseAgent.loadSpecializedConfig()
   - **Fix**: Ensure config/agents/ directory exists with YAML files

## Local Development

### Quick Start
```bash
# Set environment variables
export SUPABASE_URL=https://raenkewzlvrdqufwxjpl.supabase.co
export SUPABASE_SERVICE_KEY=your_key_here
export OPENAI_API_KEY=your_key_here

# Start the service
npm run dev
```

### Testing Startup
```bash
# Run integration test for startup sequence
npm test -- test/integration/railway-deployment.test.ts

# Test with production environment
NODE_ENV=production npm start
```

## Railway Deployment

### Pre-Deployment Checklist
- [ ] All environment variables set in Railway dashboard
- [ ] Supabase project is accessible
- [ ] API keys are valid
- [ ] Config files are in repository

### Deployment Verification
1. Check Railway logs for startup sequence
2. Look for: `🌟 Biz Buddy Backend running on port`
3. Verify health check: `https://[your-app].railway.app/health`

## Debugging Startup Issues

### Enable Debug Logging
```bash
DEBUG=* npm start  # Show all debug output
```

### Check Initialization Order
Look for these log messages in sequence:
1. `✅ Dependency injection container initialized`
2. `✅ Task Events service initialized`
3. `✅ Queue Manager initialized`
4. `✅ MCP Server initialized`
5. `🤖 Starting Agent Manager initialization...`
6. `✅ Agent Manager initialized successfully`

### Common Stack Traces

#### Supabase Missing
```
at new CredentialVault (/app/dist/services/credential-vault.js:74:56)
at new ToolChain (/app/dist/services/tool-chain.js:28:28)
at new BaseAgent (/app/dist/agents/base/BaseAgent.js:162:30)
```
**Solution**: Add Supabase environment variables

#### Agent Load Failure
```
at OrchestratorAgent.getInstance (/app/dist/agents/OrchestratorAgent.js:100:42)
at OrchestratorAgent.initializeAgentSystem (/app/dist/agents/OrchestratorAgent.js:48:72)
```
**Solution**: Check agent YAML configs exist

## Maintenance Notes

### Adding New Agents
1. Create YAML config in `config/agents/`
2. Agents are discovered automatically via A2A protocol
3. Update this document with dependencies

### Changing Initialization Order
⚠️ **WARNING**: The initialization order is carefully designed. Changes may cause:
- Circular dependencies
- Missing service errors
- Startup failures

Always test thoroughly with:
```bash
npm test -- test/integration/railway-deployment.test.ts
```

## Contact & Support
- **Repository**: [GitHub Link]
- **Deployment**: Railway Dashboard
- **Monitoring**: Check /health endpoint

---
Last Updated: 2025-08-17
Version: 1.0.0