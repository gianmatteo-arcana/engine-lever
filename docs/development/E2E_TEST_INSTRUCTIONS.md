# E2E Complete Onboarding Test - Instructions

## 🎯 What This Test Does

This is a **complete end-to-end test** that executes the entire onboarding user story:

1. **Deletes** existing test user account (cleanup)
2. **Creates** fresh test user account  
3. **Authenticates** the user with Supabase
4. **Creates** an onboarding task with real orchestration
5. **Monitors** orchestration progress in real-time
6. **Traces** all events until completion or timeout
7. **Reports** complete timeline and results

## 🚀 Quick Start

### Option 1: One-Line Command (Recommended)
```bash
cd /Users/gianmatteo/Documents/Arcana-Prototype/biz-buddy-backend
./run-e2e-onboarding.sh
```

### Option 2: Manual Execution
```bash
cd /Users/gianmatteo/Documents/Arcana-Prototype/biz-buddy-backend

# Start backend (if not running)
npm run dev &

# Wait a few seconds for backend to start
sleep 5

# Run the test
node e2e-complete-onboarding-story.js
```

### Option 3: With Custom Email
```bash
# Use a custom test email
./run-e2e-onboarding.sh "my-test@example.com"

# Or manually:
TEST_EMAIL="my-test@example.com" node e2e-complete-onboarding-story.js
```

## 📋 Prerequisites

### Required Services
- ✅ Node.js installed
- ✅ Backend dependencies installed (`npm install`)
- ✅ Supabase project accessible
- ✅ Port 3001 available for backend

### Optional (for full deletion capability)
- Supabase service role key (set as `SUPABASE_SERVICE_KEY` env var)

## 🎬 What You'll See

### Successful Run Output:
```
[02:15:23.456] 🔄 Phase: Delete Existing User - STARTING
[02:15:24.123] Deleted existing user: e2e-onboarding-test@example.com
[02:15:24.124] ✅ Phase: Delete Existing User - COMPLETE

[02:15:25.234] 🔄 Phase: Create New User - STARTING
[02:15:26.345] Created new user: e2e-onboarding-test@example.com
[02:15:26.346] User ID: abc123-def456-789012
[02:15:26.347] ✅ Phase: Create New User - COMPLETE

[02:15:27.456] 🔄 Phase: Create Onboarding Task - STARTING
[02:15:28.567] Task created: task_123456789
[02:15:28.568] Business ID: biz_987654321
[02:15:28.569] ✅ Phase: Create Onboarding Task - COMPLETE

[02:15:29.678] 🔄 Phase: Monitor Orchestration Progress - STARTING
[02:15:30.789] 📊 3 new event(s) detected!

Event #1
  Type: plan-created
  Actor: agent (orchestrator)
  Operation: plan-created
  Phase: planning
  Reasoning: Created execution plan with 4 phases
  Time: 2025-08-11T02:15:30.123Z

Event #2
  Type: phase-started
  Actor: agent (orchestrator)
  Operation: phase-started
  Phase: Initial Data Collection
  Time: 2025-08-11T02:15:30.456Z

... (more events) ...

Current Status:
  Progress: 25%
  Phase: Initial Data Collection
  Status: in_progress
  Goals:
    ✅ collect_business_name
    ⬜ collect_business_type
    ⬜ collect_ein
    ⬜ collect_formation_date

... (monitoring continues) ...

[02:17:45.890] 🎉 Onboarding completed!
[02:17:45.891] ✅ Phase: Monitor Orchestration Progress - COMPLETE

============================================================
FINAL REPORT
============================================================

Task Summary:
  Task ID: task_123456789
  Total Events: 42
  Final Status: completed
  Progress: 100%
  Result: ✅ SUCCESS (completed)

Goal Completion:
  4/4 goals completed (100%)
  ✅ collect_business_info
  ✅ verify_ownership  
  ✅ setup_profile
  ✅ cbc_registration

Event Timeline:
  initialization (5 events)
    [02:15:30] task_created
    [02:15:30] plan-created
    ...
  
  Initial Data Collection (8 events)
    [02:15:31] phase-started
    [02:15:32] data_collection_started
    ...

Execution Plan:
  1. Initial Data Collection (2 minutes)
     Agents: data_collection_agent
  2. Data Validation (1 minute)
     Agents: data_collection_agent
  3. Compliance Requirements (3 minutes)
     Agents: compliance_agent
  4. Onboarding Completion (1 minute)
     Agents: communication_agent
  Total Duration: 7 minutes

============================================================
✅ E2E TEST PASSED
============================================================

The complete onboarding flow was successfully executed!

What this proves:
  • Real user account creation and authentication
  • Real task creation with orchestration
  • Real event sourcing to database
  • Real agent coordination and decision-making
  • Real progress tracking until completion

The system is working end-to-end with REAL data!
```

## 🔍 What Gets Tested

### Authentication Flow
- Supabase JWT token generation
- Bearer token authorization
- User context extraction

### Orchestration Components
- A2AOrchestrator task planning
- RealLLMProvider deterministic logic
- Event emission to database
- Context history persistence

### Database Operations
- Task creation in `tasks` table
- Event sourcing to `context_history`
- Agent context updates
- Progress tracking

### Real-Time Monitoring
- Polling for new events
- Status updates
- Goal completion tracking
- Phase transitions

## 🛠️ Troubleshooting

### Backend won't start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill any existing process
kill -9 <PID>

# Try again
./run-e2e-onboarding.sh
```

### Authentication fails
```bash
# Check Supabase is accessible
curl https://raenkewzlvrdqufwxjpl.supabase.co/rest/v1/

# Verify backend .env has correct Supabase URL
cat .env | grep SUPABASE
```

### No events appearing
```bash
# Check backend logs
tail -f backend.log | grep -E "Orchestrator|emitTaskEvent|context_history"

# Verify database connection
npm run test -- database.test.ts
```

### Test times out
- Increase `MAX_WAIT_TIME` in the script (default: 2 minutes)
- Check if backend is processing requests
- Look for errors in `backend.log`

## 📊 Understanding the Results

### Success Indicators
- ✅ All 4 onboarding goals completed
- ✅ Events persisted to database
- ✅ Progress reaches 100%
- ✅ Status changes to "completed"

### Event Types You'll See
- `plan-created` - Orchestration plan generated
- `phase-started` - New phase beginning
- `progress` - Progress updates
- `data_collected` - Agent collected data
- `validation_complete` - Data validated
- `task_completed` - Onboarding finished

### What This Proves
1. **No Mock Data** - All events are real database operations
2. **Real Orchestration** - A2AOrchestrator creates actual execution plans
3. **Event Sourcing Works** - Every action is recorded in context_history
4. **End-to-End Flow** - From user creation to task completion

## 🎯 Advanced Usage

### Run with Debug Output
```bash
DEBUG=* node e2e-complete-onboarding-story.js
```

### Use Service Role for Full Admin
```bash
SUPABASE_SERVICE_KEY="your-service-key" ./run-e2e-onboarding.sh
```

### Custom Backend URL
```bash
BACKEND_URL="https://your-backend.com" node e2e-complete-onboarding-story.js
```

## 📝 Notes

- Test user is automatically created with email `e2e-onboarding-test@example.com`
- Password is set to `E2ETest123!@#` 
- Business name is "E2E Test Company LLC"
- The test will timeout after 2 minutes if onboarding doesn't complete
- All events are logged with timestamps for debugging

## ✅ Verification

After running the test, you can verify the data in Supabase:

1. Check `tasks` table for the created task
2. Check `context_history` for all events
3. Check `task_agent_contexts` for agent states
4. Check `auth.users` for the test user

---

**This test provides complete proof that the orchestration system works end-to-end with REAL data, REAL events, and REAL agent logic - NO MOCKS!**