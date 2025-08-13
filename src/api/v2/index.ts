/**
 * API v2 - Clean Architecture
 * Universal endpoints with proper versioning
 * No frontend business logic, pure backend API
 */

import { Router } from 'express';
import { universalRoutes } from '../universal';
import { RequestContextService } from '../../services/request-context';

const router = Router();

// API v2 info
router.get('/', (req, res) => {
  res.json({
    version: '2.0.0',
    description: 'SmallBizAlly API v2 - Universal Engine Architecture',
    endpoints: {
      contexts: {
        create: 'POST /api/v2/contexts',
        get: 'GET /api/v2/contexts/:contextId',
        list: 'GET /api/v2/contexts',
        delete: 'DELETE /api/v2/contexts/:contextId',
        events: {
          add: 'POST /api/v2/contexts/:contextId/events',
          list: 'GET /api/v2/contexts/:contextId/events'
        }
      },
      businesses: {
        contexts: 'GET /api/v2/businesses/:businessId/contexts'
      },
      health: 'GET /api/v2/health'
    },
    principles: [
      'Universal endpoints - same for all task types',
      'Event sourcing - append-only architecture',
      'Request-scoped services - multi-tenant isolation',
      'Clean architecture - no frontend logic in backend'
    ],
    requestId: RequestContextService.getContext()?.requestId
  });
});

// Health check
router.get('/health', (req, res) => {
  const context = RequestContextService.getContext();
  
  res.json({
    status: 'healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requestId: context?.requestId,
    tenant: context?.tenantId,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mount universal routes
router.use('/', universalRoutes);

export { router as apiV2Routes };