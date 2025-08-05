# Onboarding Feature: Detailed Execution Plan

## 🎯 Mission Statement
Implement a two-phase onboarding experience with Google OAuth authentication followed by an agent-orchestrated business profile setup using A2A protocol and multi-tenant security.

## 🚨 Development Principles (From CLAUDE.md)
1. **We are NOT SKIPPING ANY TESTS!!**
2. **Build must succeed locally before deployment**
3. **Sacred workflow**: `npm run lint && npm run build && npm run test`
4. **Schema changes go in FRONTEND repo only**
5. **Never break existing functionality**
6. **Use TodoWrite to track all tasks**

## 📋 Execution Phases

### Phase 0: Foundation & Planning (Current)
- [x] Review PRD and Schema recommendations
- [x] Create execution plan
- [ ] Get Product Owner approval on plan
- [ ] Confirm integration points

### Phase 1: Database Schema (Frontend Repo)
**Location**: `biz-buddy-ally-now/supabase/migrations/`

#### 1.1 Create Migration Files
```sql
-- Migration 1: Enhance tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS task_context JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS task_goals JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS required_inputs JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS entry_mode TEXT DEFAULT 'user_initiated',
ADD COLUMN IF NOT EXISTS orchestrator_config JSONB DEFAULT '{}';

-- Migration 2: Create task_ui_augmentations table
CREATE TABLE IF NOT EXISTS task_ui_augmentations (...);

-- Migration 3: Create task_agent_contexts table
CREATE TABLE IF NOT EXISTS task_agent_contexts (...);

-- Migration 4: Enhance task_pause_points
ALTER TABLE task_pause_points ADD COLUMN IF NOT EXISTS ui_augmentation_id UUID;
```

#### 1.2 Apply Migrations
- [ ] Create migration files in frontend repo
- [ ] Add to migration registry
- [ ] Apply via Lovable Migration Runner
- [ ] Verify schema in Supabase dashboard

### Phase 2: Backend Core Infrastructure

#### 2.1 A2A Protocol Setup
```typescript
// src/protocols/a2a.ts
- [ ] Install @a2a-js/sdk dependency
- [ ] Create A2AService base class with tenant isolation
- [ ] Implement agent discovery mechanism
- [ ] Add multi-tenant validation layer
- [ ] Write unit tests for A2A communication

// src/agents/base/BaseA2AAgent.ts
- [ ] Create base class extending A2AAgent
- [ ] Add tenant validation methods
- [ ] Implement audit logging
- [ ] Add error handling
- [ ] Write comprehensive unit tests
```

#### 2.2 Update Database Service
```typescript
// src/services/database.ts
- [ ] Add new table interfaces (TaskUIAugmentation, TaskAgentContext)
- [ ] Create methods for UI augmentation CRUD
- [ ] Add tenant-scoped query methods
- [ ] Implement audit trail logging
- [ ] Write unit tests for all new methods
```

#### 2.3 Task Context Enhancement
```typescript
// src/types/task-context.ts
- [ ] Add TenantContext interface
- [ ] Update TaskContext with new fields
- [ ] Add UIAugmentationRequest types
- [ ] Add UIAugmentationResponse types
- [ ] Ensure backward compatibility
```

### Phase 3: Orchestrator Agent Implementation

#### 3.1 A2A Orchestrator Service (Monolithic but Separable)
```typescript
// src/agents/orchestrator/index.ts
- [ ] Create A2AOrchestrator extending BaseA2AAgent
- [ ] Set up as internal service (future: separate port 3000)
- [ ] Implement Claude integration via LLMProvider
- [ ] Add dynamic agent discovery (internal for now)
- [ ] Implement task planning logic
- [ ] Add UI request coordination
- [ ] Design for future extraction to separate service
- [ ] Write integration tests
```

#### 3.2 Orchestrator Endpoints
- [ ] POST /a2a/tasks - Create new tasks
- [ ] GET /a2a/tasks/:id - Get task status
- [ ] POST /a2a/tasks/:id/respond - Handle UI responses
- [ ] GET /a2a/discover - Agent discovery
- [ ] WebSocket endpoint for streaming

### Phase 4: Data Collection Agent

#### 4.1 A2A Data Collection Service
```typescript
// src/agents/data-collection/index.ts
- [ ] Create A2ADataCollectionAgent
- [ ] Set up as A2A server on port 3001
- [ ] Implement CBC API integration
- [ ] Add business data validation
- [ ] Create UI request generation
- [ ] Add tenant isolation checks
- [ ] Write unit tests
```

#### 4.2 CBC API Integration
- [ ] ~~Get CBC API credentials~~ → Implement with TODO placeholders
- [ ] Implement CBC search functionality with env vars:
  - `CBC_API_KEY_SANDBOX` (TODO: Add when received)
  - `CBC_API_KEY_PROD` (TODO: Add when received)
  - `CBC_API_URL_SANDBOX`
  - `CBC_API_URL_PROD`
- [ ] Add response parsing
- [ ] Handle API errors gracefully (return null to trigger manual entry)
- [ ] Cache responses appropriately

### Phase 5: API Endpoints

#### 5.1 Task Creation Endpoint
```typescript
// src/api/v2/tasks.ts
- [ ] POST /api/v2/tasks endpoint
- [ ] Google profile to TaskContext mapping
- [ ] Multi-tenant context creation
- [ ] Trigger orchestrator agent
- [ ] Return taskId to frontend
- [ ] Add comprehensive error handling
- [ ] Write API tests
```

#### 5.2 WebSocket/SSE Streaming
```typescript
// src/api/v2/tasks/:id/stream
- [ ] Implement SSE endpoint
- [ ] Add WebSocket alternative
- [ ] Stream UI augmentation requests
- [ ] Handle connection management
- [ ] Add reconnection logic
- [ ] Test with multiple concurrent connections
```

### Phase 6: Frontend Integration Points

#### 6.1 Post-Auth Navigation
```typescript
// Frontend tasks (coordinate with frontend team)
- [ ] Update auth success handler
- [ ] Add navigation to /dashboard
- [ ] Pass onboarding flag
- [ ] Create task via API
```

#### 6.2 Onboarding Card Component
```typescript
// Frontend component requirements (Lovable AI tasks)
- [ ] Replace "Business Profile Setup" stub
- [ ] Full-screen overlay design
- [ ] Dynamic form rendering from UIAugmentationRequest
- [ ] WebSocket connection management
- [ ] Loading states
- [ ] Error handling
- [ ] Completion animation
- [ ] Coordinate with Lovable AI for implementation
```

### Phase 7: Testing & Integration

#### 7.1 Unit Tests
- [ ] BaseA2AAgent tests
- [ ] Orchestrator agent tests
- [ ] Data collection agent tests
- [ ] Database service tests
- [ ] API endpoint tests
- [ ] Maintain >90% coverage

#### 7.2 Integration Tests
- [ ] Full onboarding flow E2E
- [ ] Multi-tenant isolation verification
- [ ] A2A agent communication
- [ ] Error escalation paths
- [ ] Resume capability

#### 7.3 Security Audit
- [ ] Verify tenant isolation
- [ ] Test RLS policies
- [ ] Audit trail completeness
- [ ] Session validation
- [ ] Error message sanitization

### Phase 8: Deployment

#### 8.1 Backend Deployment
- [ ] Deploy orchestrator agent
- [ ] Deploy data collection agent
- [ ] Update environment variables
- [ ] Configure A2A discovery
- [ ] Verify Railway deployment

#### 8.2 Monitoring Setup
- [ ] Add agent health checks
- [ ] Set up error alerting
- [ ] Configure audit log retention
- [ ] Add performance metrics

## 🤔 Questions for Product Owner

### Immediate Blockers ✅ RESOLVED
1. **CBC API Access**: ⏳ Pending API keys from State. Will implement with TODO placeholders for PROD/SANDBOX keys.
2. **LLM Selection**: ✅ Use Claude via existing LLMProvider (preferred over GPT-4).
3. **Deployment**: ✅ Single deployment for now, but architect for future separation.

### Design Decisions
1. **Error Escalation**: How should Allyn.ai support be notified? Slack? Email? Ticket system?
2. **Session Timeout**: How long should onboarding sessions remain active?
3. **Data Retention**: How long to keep incomplete onboarding data?

### Frontend Coordination ✅ RESOLVED
1. **Frontend Team**: ✅ Lovable AI will handle UI updates. Replace existing "Business Profile Setup" stub.
2. **Design Assets**: ✅ Use existing UI, refine later.
3. **Mobile Responsive**: ✅ Standard mobile-first approach.

### Business Logic
1. **Required Fields**: Minimum required fields to complete onboarding?
2. **Skip Logic**: Can users skip onboarding and return later?
3. **Multiple Businesses**: ✅ No, one business per user account (MVP)

## 📊 Success Metrics

### Technical Metrics
- [ ] All tests passing (100%)
- [ ] Build succeeds locally
- [ ] No regression in existing features
- [ ] <500ms API response times
- [ ] Zero tenant data leakage

### User Experience Metrics
- [ ] Onboarding completion in <3 minutes
- [ ] <10% abandonment rate
- [ ] Successful CBC API hit rate >50%
- [ ] Zero critical errors in production

## 🚦 Risk Mitigation

### High Risks
1. **CBC API Unavailable**: Fallback to manual entry
2. **LLM API Failures**: Cache common flows, fallback rules
3. **WebSocket Disconnects**: Implement robust reconnection
4. **Tenant Data Leakage**: Multiple validation layers

### Medium Risks
1. **Slow LLM Response**: Add timeouts and loading states
2. **Complex Form Logic**: Start simple, iterate
3. **Browser Compatibility**: Test major browsers
4. **Mobile Experience**: Progressive enhancement

## 📅 Timeline Estimate

### Week 1: Foundation
- Schema migrations
- A2A setup
- Base agent classes

### Week 2: Agents
- Orchestrator implementation
- Data collection agent
- API endpoints

### Week 3: Integration
- Frontend coordination
- E2E testing
- Security audit

### Week 4: Polish
- Error handling
- Performance optimization
- Deployment

## 🎯 Definition of Done

### Each Component
- [x] Code implemented
- [x] Unit tests written
- [x] Integration tests passing
- [x] Documentation updated
- [x] Code reviewed
- [x] Deployed to staging

### Overall Feature
- [x] E2E flow working
- [x] Multi-tenant isolation verified
- [x] Performance targets met
- [x] Security audit passed
- [x] Product Owner approval
- [x] Deployed to production

---

**Next Steps**: 
1. Review this plan with Product Owner
2. Get approval on approach
3. Answer blocking questions
4. Begin Phase 1 implementation

**Remember**: We are NOT SKIPPING ANY TESTS!!