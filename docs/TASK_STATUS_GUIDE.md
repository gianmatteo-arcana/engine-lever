# Task Status Guide

## Overview
Task statuses are critical for tracking the lifecycle of tasks in the SmallBizAlly system. Each status has specific semantics and usage rules that MUST be followed consistently.

## Task Statuses

### 1. `pending`
**When to use:** Task has been created but orchestration has not started yet.
- Set automatically when a task is created via API
- Task is in the queue waiting to be picked up
- No agents have been invoked yet
- **Transition to:** `in_progress` when orchestration begins

### 2. `in_progress`
**When to use:** Task is actively being processed by the orchestration system.
- Orchestrator is executing phases
- Agents are actively working on subtasks
- System is making progress without user intervention
- **Transition to:** 
  - `waiting_for_input` when user action needed
  - `completed` when all phases succeed
  - `failed` when unrecoverable error occurs

### 3. `waiting_for_input`
**When to use:** Task execution is paused and requires user input to continue.
- Agent returned `needs_input` status
- UI requests have been created and sent to frontend
- System CANNOT proceed without user response
- Task is NOT failed - it's just waiting
- **Key distinction:** This is NOT the same as `in_progress` - the system is not actively working
- **Transition to:** `in_progress` when user provides input

### 4. `completed`
**When to use:** Task has successfully finished all required work.
- All phases executed successfully
- All goals have been achieved
- No further action needed from system or user
- **Terminal state** - no further transitions

### 5. `failed`
**When to use:** Task encountered an unrecoverable error.
- Critical error that cannot be resolved
- System cannot continue even with user input
- Different from `waiting_for_input` - this is a terminal failure
- **Terminal state** - no further transitions

### 6. `cancelled`
**When to use:** Task was explicitly cancelled by user or system.
- User requested cancellation
- System cancelled due to timeout or policy
- Work was intentionally stopped before completion
- **Terminal state** - no further transitions

## Agent Response Status Mapping

Agents return different statuses that map to task statuses:

| Agent Status | Task Status | Description |
|-------------|-------------|-------------|
| `completed` | `in_progress` → `completed`* | Agent finished its work successfully |
| `needs_input` | `waiting_for_input` | Agent requires user input to proceed |
| `delegated` | `in_progress` | Agent passed work to another agent |
| `error` | `failed` | Agent encountered unrecoverable error |

*Task only becomes `completed` when ALL phases are done, not just one agent

## Code Patterns

### Orchestrator Setting Status

```typescript
// When starting orchestration
await this.updateTaskStatus(context, 'in_progress');

// When phase needs input
if (phaseResult.status === 'needs_input') {
  await this.updateTaskStatus(context, 'waiting_for_input');
  break; // Stop execution, wait for user
}

// When task completes successfully
if (allPhasesCompleted) {
  await this.updateTaskStatus(context, 'completed');
}

// When task fails
catch (error) {
  await this.updateTaskStatus(context, 'failed');
}
```

### Agent Returning Status

```typescript
// Agent needs user input
return {
  status: 'needs_input',
  contextUpdate: { ... },
  uiRequest: { 
    type: 'form',
    fields: [...] 
  }
};

// Agent completed work
return {
  status: 'completed',
  contextUpdate: { ... }
};

// Agent encountered error
return {
  status: 'error',
  contextUpdate: {
    reasoning: 'Failed because...'
  }
};
```

## Critical Rules

1. **NEVER mark task as `completed` if waiting for user input**
   - Use `waiting_for_input` instead

2. **NEVER use `in_progress` when system is idle**
   - If waiting for user, use `waiting_for_input`
   - `in_progress` means active processing

3. **ALWAYS pause execution on `needs_input`**
   - Don't continue to next phase
   - Set task status to `waiting_for_input`
   - Exit orchestration loop

4. **ALWAYS check agent response status**
   ```typescript
   const needsInput = results.some(r => r.status === 'needs_input');
   if (needsInput) {
     // Pause execution, set waiting_for_input
   }
   ```

5. **NEVER change terminal states**
   - `completed`, `failed`, `cancelled` are final
   - No transitions from these states

## UI Implications

| Status | UI Should Show | User Can |
|--------|---------------|-----------|
| `pending` | "Queued" or spinner | Wait |
| `in_progress` | Progress indicator, "Processing..." | Watch progress |
| `waiting_for_input` | Form/UI request, "Action required" | Provide input |
| `completed` | Success message, results | View results |
| `failed` | Error message, reason | Retry or contact support |
| `cancelled` | Cancellation message | Start new task |

## Database Constraint

The database enforces these statuses via CHECK constraint:
```sql
CHECK (status IN ('pending', 'in_progress', 'waiting_for_input', 'completed', 'failed', 'cancelled'))
```

Any attempt to use an invalid status will result in:
```
ERROR: new row for relation "tasks" violates check constraint "tasks_status_check"
```

## Type Safety

Always use the `TaskStatus` type from `engine-types.ts`:
```typescript
import { TaskStatus } from '../types/engine-types';

async updateTaskStatus(context: TaskContext, status: TaskStatus) {
  // Type-safe status update
}
```

## Testing Checklist

- [ ] Task starts as `pending`
- [ ] Becomes `in_progress` when orchestration begins
- [ ] Enters `waiting_for_input` when agent needs input
- [ ] Returns to `in_progress` after user provides input
- [ ] Ends as `completed` only when all work done
- [ ] Becomes `failed` on unrecoverable errors
- [ ] Can be `cancelled` by user request