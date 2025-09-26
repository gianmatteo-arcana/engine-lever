# Engine Lever

AI Agent Orchestration and MCP Service for Levr AI

## Overview

Engine Lever is a flexible backend service that orchestrates multiple AI agents to handle complex workflows. It provides:

- **Agent Orchestration**: Coordinates multiple specialized AI agents
- **Task Management**: Persistent task execution and state management
- **MCP Integration**: Model Context Protocol for tool orchestration
- **Event-Driven Architecture**: Event sourcing and state computation
- **Background Processing**: Queue-based job processing with Redis

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express
- **Database**: Supabase (PostgreSQL)
- **Queue**: Bull (Redis)
- **AI**: Anthropic Claude, OpenAI
- **Protocols**: A2A (Agent-to-Agent), MCP

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

## Environment Variables

Required in `.env`:
```
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PORT=3001
```

## Architecture

```
Client → API → Orchestrator Agent → Specialized Agents → MCP Tools
           ↓                ↓                  ↓              ↓
      Express         State Machine      Task Execution   External APIs
           ↓                ↓                  ↓
      Database         Event Store        Queue System
```

### Core Components

- **OrchestratorAgent**: Master coordinator for task execution
- **Task Service**: Manages task lifecycle and persistence
- **Event System**: Event sourcing for state management
- **LLM Provider**: Abstraction layer for AI model integration
- **Tool Chain**: External tool integrations

## API Endpoints

### Health Check
- `GET /health` - Service status

### Task Management
- `POST /api/v2/tasks` - Create new task
- `GET /api/v2/tasks/:id` - Get task status
- `POST /api/v2/tasks/:id/pause` - Pause task
- `POST /api/v2/tasks/resume/:token` - Resume paused task

## Development

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Linting
```bash
npm run lint      # Check for issues
npm run lint:fix  # Auto-fix issues
```

### Build
```bash
npm run build     # Compile TypeScript
```

## Project Structure

```
src/
├── agents/           # AI agent implementations
├── api/             # Express routes and controllers
├── services/        # Business logic services
├── tools/           # MCP tool implementations
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Application entry point
```

## Adding New Agents

Agents should extend the base agent class and define their specific capabilities:

```typescript
import { BaseA2AAgent } from './base/BaseA2AAgent';

class MyCustomAgent extends BaseA2AAgent {
  // Implement agent-specific logic
}
```

## Contributing

1. Create feature branch: `git checkout -b feat/your-feature`
2. Make changes with tests
3. Run tests: `npm test`
4. Run linting: `npm run lint`
5. Build: `npm run build`
6. Push and create PR

## License

MIT