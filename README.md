# Biz Buddy Backend (Railway Service)

Agent-to-Agent orchestration and MCP service for SmallBizAlly platform.

## ⚠️ CRITICAL: Database Schema Management

**ALL database schema changes must be made in the FRONTEND repository**, not here!
- Schema migrations go in: `biz-buddy-ally-now/supabase/migrations/`
- This backend only consumes the schema, never modifies it
- See [SCHEMA_ARCHITECTURE.md](./SCHEMA_ARCHITECTURE.md) for full details

## Overview

This is the Railway-deployed backend service that:
- Orchestrates AI agents for business compliance tasks
- Manages task persistence and state
- Provides MCP tool integration
- Handles background job processing

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Check database connection
npm run db:check

# Start development server
npm run dev

# Run tests
npm test
```

## Environment Variables

Required in `.env`:
```
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # Service role key from Supabase
FRONTEND_URL=https://[lovable-project].lovableproject.com
PORT=3001
```

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Task Management (v2 API)
- `POST /api/v2/tasks` - Create new task
- `GET /api/v2/tasks/:id` - Get task status
- `POST /api/v2/tasks/:id/pause` - Pause task execution
- `POST /api/v2/tasks/resume/:token` - Resume paused task

### Legacy API (v1)
- `POST /api/enqueue` - Queue background job
- `GET /api/job/:id` - Get job status

## Architecture

```
Frontend (Lovable) → Backend (Railway) → Supabase
     ↓                    ↓                 ↓
 Owns Schema        Business Logic      Data Store
 Anon Key          Service Key         RLS Policies
```

### Key Components

- **Agents**: Specialized AI agents for different tasks
  - Orchestrator: Coordinates workflow
  - Legal Compliance: Handles regulatory tasks
  - Data Collection: Gathers business data
  - Payment: Processes payments
  - Agency Interaction: Interfaces with government
  - Monitoring: Tracks task progress
  - Communication: User notifications

- **Task Templates**: YAML-defined workflows
- **Persistent Storage**: Supabase database
- **MCP Tools**: External service integrations

## Database Tables

All tables are defined in frontend migrations but used by this backend:
- `tasks` - Main task records
- `task_executions` - Execution state
- `agent_messages` - Inter-agent communication
- `workflow_states` - Workflow snapshots
- `task_pause_points` - Pause/resume capability
- `task_audit_trail` - Compliance logging
- `task_documents` - File attachments
- `agent_metrics` - Performance tracking

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

### Database
```bash
npm run db:check  # Check table status
```

## Deployment

### Railway (Production)
- Automatically deploys from `main` branch
- Environment variables configured in Railway dashboard
- Uses Supabase service key for admin access

### Local Development
- Uses `.env` file for configuration
- Hot-reload with `tsx watch`
- Full access to Supabase via service key

## Important Files

- [CLAUDE.md](./CLAUDE.md) - Development guide for Claude Code
- [SCHEMA_ARCHITECTURE.md](./SCHEMA_ARCHITECTURE.md) - Database schema rules
- [SECURITY_TODO.md](./SECURITY_TODO.md) - Security checklist

## ⚠️ Remember

1. **Never create database migrations in this repo**
2. **All schema changes go in frontend repo**
3. **Backend only uses existing tables**
4. **Service key gives admin access - handle carefully**

## Support

For issues or questions:
- Check [CLAUDE.md](./CLAUDE.md) for architecture details
- Review [SCHEMA_ARCHITECTURE.md](./SCHEMA_ARCHITECTURE.md) for database rules
- Create GitHub issue for bugs/features