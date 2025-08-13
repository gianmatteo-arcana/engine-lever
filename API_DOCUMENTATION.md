# SmallBizAlly API Documentation

## Overview

SmallBizAlly provides a RESTful API for managing business compliance tasks through an event-sourced, universal engine architecture.

## API Versions

### API v2 (Recommended)
- **Base URL**: `/api/v2`
- **Architecture**: Universal engine, event sourcing
- **Security**: Request-scoped services, multi-tenant isolation
- **Status**: Production ready

### API v1 (Legacy)
- **Base URL**: `/api`
- **Architecture**: Task-specific endpoints
- **Security**: Singleton services (being deprecated)
- **Status**: Deprecated, maintained for backward compatibility

## Authentication

All endpoints (except health checks) require JWT authentication.

### Headers
```http
Authorization: Bearer <jwt_token>
X-Tenant-Id: <tenant_id> (optional)
X-Business-Id: <business_id> (optional)
X-Correlation-Id: <correlation_id> (optional for tracing)
```

## Core Concepts

### Contexts
A context represents a unit of work (task, workflow, process) in the system. All contexts are treated identically regardless of their template type.

### Events
Events are immutable records of changes to a context. The current state is computed by replaying all events.

### Templates
Templates define the structure and workflow for different types of tasks (onboarding, SOI filing, etc.).

## API v2 Endpoints

### Context Management

#### Create Context
```http
POST /api/v2/contexts
Content-Type: application/json
Authorization: Bearer <token>

{
  "businessId": "biz_123",
  "templateId": "soi-filing",
  "metadata": {
    "key": "value"
  },
  "priority": "high",
  "deadline": "2024-12-31T23:59:59Z"
}
```

**Response**
```json
{
  "success": true,
  "contextId": "ctx_456",
  "requestId": "req_789"
}
```

#### Get Context
```http
GET /api/v2/contexts/:contextId
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "context": {
    "id": "ctx_456",
    "business_id": "biz_123",
    "template_id": "soi-filing",
    "current_state": {
      "status": "in_progress",
      "phase": "data_collection",
      "completeness": 45,
      "data": {}
    },
    "computedState": {
      "status": "in_progress",
      "phase": "data_collection",
      "completeness": 45,
      "data": {}
    },
    "eventCount": 5,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T12:00:00Z"
  },
  "requestId": "req_789"
}
```

#### List Contexts
```http
GET /api/v2/contexts?businessId=biz_123&status=active&limit=10&offset=0
Authorization: Bearer <token>
```

**Query Parameters**
- `businessId` (optional): Filter by business
- `status` (optional): Filter by status
- `templateId` (optional): Filter by template
- `limit` (optional): Max results (1-100, default: 50)
- `offset` (optional): Skip results (default: 0)
- `orderBy` (optional): Sort field (created_at, updated_at, status)
- `order` (optional): Sort direction (asc, desc)

**Response**
```json
{
  "success": true,
  "contexts": [...],
  "count": 10,
  "total": 45,
  "requestId": "req_789"
}
```

#### Delete Context (Soft Delete)
```http
DELETE /api/v2/contexts/:contextId
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "No longer needed"
}
```

**Response**
```json
{
  "success": true,
  "message": "Context marked as deleted",
  "requestId": "req_789"
}
```

### Event Management

#### Add Event
```http
POST /api/v2/contexts/:contextId/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "operation": "update_status",
  "actor": "system",
  "data": {
    "newStatus": "completed"
  },
  "metadata": {
    "source": "automation"
  }
}
```

**Response**
```json
{
  "success": true,
  "eventId": "evt_123",
  "sequenceNumber": 6,
  "requestId": "req_789"
}
```

#### List Events
```http
GET /api/v2/contexts/:contextId/events
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "events": [
    {
      "id": "evt_123",
      "context_id": "ctx_456",
      "sequence_number": 1,
      "operation": "create",
      "actor": "user_123",
      "data": {},
      "metadata": {},
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 5,
  "requestId": "req_789"
}
```

### Business Operations

#### Get Business Contexts
```http
GET /api/v2/businesses/:businessId/contexts
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "businessId": "biz_123",
  "contexts": [...],
  "count": 15,
  "requestId": "req_789"
}
```

### System Endpoints

#### Health Check
```http
GET /api/v2/health
```

**Response**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600,
  "requestId": "req_789",
  "environment": "production"
}
```

#### API Info
```http
GET /api/v2/
```

**Response**
```json
{
  "version": "2.0.0",
  "description": "SmallBizAlly API v2 - Universal Engine Architecture",
  "endpoints": {...},
  "principles": [...],
  "requestId": "req_789"
}
```

## Error Responses

### Standard Error Format
```json
{
  "error": "Error message",
  "message": "Detailed error description",
  "requestId": "req_789",
  "details": [] // For validation errors
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error
- `503` - Service Unavailable

## Rate Limiting

API v2 implements rate limiting per tenant:
- **Default**: 100 requests per minute
- **Authenticated**: 1000 requests per minute
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Request Tracing

Every response includes a `requestId` for tracing. Include `X-Correlation-Id` in requests to track across services.

## Migration from v1 to v2

### Key Differences
1. **Universal endpoints**: No more task-specific routes
2. **Event sourcing**: State computed from events
3. **Request scoping**: Multi-tenant isolation built-in
4. **Clean responses**: Consistent format across all endpoints

### Migration Steps
1. Update base URL from `/api` to `/api/v2`
2. Replace task-specific endpoints with universal context endpoints
3. Use events instead of direct updates
4. Leverage computed state instead of stored state

### Mapping v1 to v2

| v1 Endpoint | v2 Endpoint |
|------------|------------|
| POST /api/tasks | POST /api/v2/contexts |
| GET /api/tasks/:id | GET /api/v2/contexts/:id |
| PUT /api/tasks/:id | POST /api/v2/contexts/:id/events |
| GET /api/onboarding/status | GET /api/v2/contexts?templateId=onboarding |
| POST /api/soi/file | POST /api/v2/contexts (with templateId=soi-filing) |

## SDK Support

### JavaScript/TypeScript
```typescript
import { SmallBizAllyClient } from '@smallbizally/sdk';

const client = new SmallBizAllyClient({
  apiKey: 'your-api-key',
  version: 'v2'
});

// Create context
const context = await client.contexts.create({
  businessId: 'biz_123',
  templateId: 'soi-filing'
});

// Add event
await client.events.add(context.id, {
  operation: 'update',
  data: { status: 'completed' }
});
```

## Support

- **Documentation**: https://docs.smallbizally.com
- **API Status**: https://status.smallbizally.com
- **Support**: api-support@smallbizally.com

## Changelog

### v2.0.0 (2024-01-13)
- Universal engine architecture
- Event sourcing implementation
- Request-scoped services
- Multi-tenant isolation
- Clean API design

### v1.0.0 (2023-12-01)
- Initial release
- Task-specific endpoints
- Basic CRUD operations