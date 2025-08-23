# Event Persistence Architecture - Separation of Concerns

## Core Principle
**"The creator of an event is responsible for its persistence"**

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Components                        │
├───────────────┬────────────────┬────────────────────┤
│    Agents     │  A2A Event Bus │     Database       │
├───────────────┼────────────────┼────────────────────┤
│ Create Events │   Broadcast    │  Store Events      │
│ Persist Data  │   Messages     │  (Single Source)   │
│ Record State  │   (No Storage) │                    │
└───────────────┴────────────────┴────────────────────┘
```

## Key Responsibilities

### 1. Agents (DefaultAgent, OrchestratorAgent, etc.)
- **CREATE** events based on their actions
- **PERSIST** events to database via `recordContextEntry()`
- **BROADCAST** events via A2A Event Bus for real-time updates
- **OWN** their execution lifecycle events

### 2. A2A Event Bus
- **BROADCAST ONLY** - No persistence logic
- **ROUTE** messages between agents
- **ENABLE** real-time SSE updates
- **NO DATABASE** operations

### 3. Database
- **SINGLE SOURCE OF TRUTH** for all events
- **STORES** events in `task_context_events` table
- **PROVIDES** audit trail and event history

## How to Fire Event Updates Correctly

### ✅ CORRECT Pattern - Agent Records Its Own Events

```typescript
// In DefaultAgent or any agent extending BaseAgent
public async recordExecutionEvent(context: TaskContext, event: any): Promise<void> {
  // Agent records its own event using inherited method
  await this.recordContextEntry(context, {
    operation: event.type,
    data: event,
    reasoning: `Agent ${this.getAgentId()} execution: ${event.type}`,
    trigger: {
      type: 'system_event',  // Not orchestrator_request - agent is executing
      source: 'agent-executor',
      details: { requestId: event.requestId }
    }
  });
  // recordContextEntry handles both persistence AND broadcasting
}
```

### ❌ INCORRECT Pattern - External Service Persisting for Agent

```typescript
// WRONG - AgentExecutor should NOT persist on behalf of agents
private static async broadcastAgentEvent(context: TaskContext, event: any) {
  // DON'T DO THIS - violates separation of concerns
  const dbService = DatabaseService.getInstance();
  await dbService.createTaskContextEvent(...);  // ❌ External persistence
  
  await a2aEventBus.broadcast(...);  // Broadcasting is OK
}
```

## Event Flow Example

1. **OrchestratorAgent** delegates work to **DefaultAgent**
2. **AgentExecutor** calls `agent.recordExecutionEvent()` 
3. **DefaultAgent** uses `recordContextEntry()` to:
   - Persist event to database
   - Broadcast via A2A Event Bus
4. **SSE endpoints** receive broadcast and update frontend
5. **Database** maintains complete audit trail

## Common Event Types and Ownership

| Event Type | Owner | Persistence Method |
|------------|-------|-------------------|
| `AGENT_EXECUTION_STARTED` | DefaultAgent | `recordExecutionEvent()` |
| `AGENT_EXECUTION_COMPLETED` | DefaultAgent | `recordExecutionEvent()` |
| `AGENT_EXECUTION_FAILED` | DefaultAgent | `recordExecutionEvent()` |
| `subtask_delegated` | OrchestratorAgent | `recordOrchestratorEvent()` |
| `execution_plan_created` | OrchestratorAgent | `recordOrchestratorEvent()` |
| `task_execution` | BaseAgent | `recordContextEntry()` |

## Implementation Guidelines

### For New Agents
1. Extend `BaseAgent` to inherit `recordContextEntry()`
2. Use `recordContextEntry()` for ALL event persistence
3. Never directly call database or A2A Event Bus
4. Let BaseAgent handle the persistence + broadcast pattern

### For Service Classes (AgentExecutor, etc.)
1. Call methods on agents to record events
2. Don't persist events on behalf of agents
3. Can broadcast notifications (but not persist)
4. Respect agent autonomy over their own events

### For A2A Event Bus
1. Keep it simple - broadcasting only
2. No database connections
3. No event persistence logic
4. Pure message passing

## Benefits of This Architecture

1. **Clear Ownership** - Each component knows its responsibilities
2. **No Duplication** - Events recorded once at the source
3. **Maintainable** - Changes to persistence don't affect broadcasting
4. **Testable** - Each component can be tested independently
5. **Scalable** - A2A can be replaced with message queue without affecting persistence

## Migration Notes

As of PR #48 and #50:
- A2A Event Bus has ALL persistence logic removed
- Agents are responsible for their own persistence
- This is a BREAKING CHANGE from earlier implementations
- All new code must follow this pattern