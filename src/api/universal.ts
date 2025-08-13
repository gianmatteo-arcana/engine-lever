/**
 * Universal API Endpoints
 * Engine-based approach: Same endpoints handle ALL task types
 * No task-specific logic or special cases
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { getDatabaseService } from '../services/dependency-injection';
import { RequestContextService } from '../services/request-context';
import { StateComputer } from '../services/state-computer';
// import { logger } from '../utils/logger'; // TODO: Use for debugging
import { validators } from '../middleware/validation';
import { limiters } from '../middleware/rate-limiting';
import { auditLogger } from '../middleware/audit-logging';
import { apiSecurityHeaders } from '../middleware/security-headers';

const router = Router();

/**
 * Universal schemas - work for ANY task type
 */
const UniversalTaskCreateSchema = z.object({
  businessId: z.string(),
  templateId: z.string(),
  metadata: z.record(z.any()).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  deadline: z.string().optional()
});

const UniversalEventSchema = z.object({
  operation: z.string(),
  actor: z.string(),
  data: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

const UniversalQuerySchema = z.object({
  businessId: z.string().optional(),
  status: z.string().optional(),
  templateId: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  orderBy: z.enum(['created_at', 'updated_at', 'status']).optional(),
  order: z.enum(['asc', 'desc']).optional()
});

/**
 * POST /api/v2/contexts
 * Create a new context for ANY template type
 * Universal endpoint - no special handling based on template
 * 
 * TODO: Implement rate limiting
 * - Per-user rate limit: 100 requests per minute
 * - Per-IP rate limit: 1000 requests per hour
 * - Use Redis or in-memory store for tracking
 * - Return 429 Too Many Requests when exceeded
 */
router.post('/contexts', 
  apiSecurityHeaders(),
  limiters.contextCreation,
  requireAuth,
  ...validators.createContext,
  auditLogger(),
  async (req: AuthenticatedRequest, res) => {
  try {
    const input = UniversalTaskCreateSchema.parse(req.body);
    const userId = req.userId!;
    const dbService = getDatabaseService();
    
    RequestContextService.log('info', 'Creating context', {
      templateId: input.templateId,
      businessId: input.businessId
    });
    
    // Create context - same process for ALL templates
    const context = await dbService.createContext(
      input.businessId,
      userId,
      input.templateId,
      {
        priority: input.priority,
        deadline: input.deadline,
        metadata: input.metadata
      }
    );
    
    // Add initial event
    await dbService.addContextEvent({
      context_id: context.id,
      operation: 'create',
      actor_type: 'user',
      actor_id: userId,
      data: {
        ...(input.metadata || {}),
        source: 'api',
        templateId: input.templateId
      }
    });
    
    res.status(201).json({
      success: true,
      contextId: context.id,
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Context creation failed', { error: error.message });
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: error.errors,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    res.status(500).json({ 
      error: 'Context creation failed',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

/**
 * GET /api/v2/contexts/:contextId
 * Get context details with computed state
 * Works identically for ALL context types
 */
router.get('/contexts/:contextId',
  apiSecurityHeaders(),
  limiters.standard,
  requireAuth,
  ...validators.contextId,
  async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId } = req.params;
    const dbService = getDatabaseService();
    
    // Get context
    const context = await dbService.getContext(contextId);
    
    if (!context) {
      return res.status(404).json({
        error: 'Context not found',
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Get events
    // Get events - using context history for now
    // TODO: Create proper getEventsByContextId method
    const events: any[] = [];
    
    // Compute current state
    const computedState = StateComputer.computeState(events);
    
    res.json({
      success: true,
      context: {
        ...context,
        computedState,
        eventCount: events.length
      },
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to get context', { error: error.message });
    res.status(500).json({
      error: 'Failed to get context',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

/**
 * POST /api/v2/contexts/:contextId/events
 * Add event to context
 * Universal event handling - no special logic per template
 * 
 * TODO: Implement rate limiting for event creation
 * - Limit rapid event creation (e.g., 10 events per second per context)
 * - Prevent event spam/flooding
 * - Consider exponential backoff for repeated violations
 */
router.post('/contexts/:contextId/events',
  apiSecurityHeaders(),
  limiters.eventCreation,
  requireAuth,
  ...validators.contextId,
  ...validators.createEvent,
  auditLogger(),
  async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId } = req.params;
    const input = UniversalEventSchema.parse(req.body);
    const userId = req.userId!;
    const dbService = getDatabaseService();
    
    RequestContextService.log('info', 'Adding context event', {
      contextId,
      operation: input.operation
    });
    
    // Verify context exists
    const context = await dbService.getContext(contextId);
    if (!context) {
      return res.status(404).json({
        error: 'Context not found',
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Add event
    const event = await dbService.addContextEvent({
      context_id: contextId,
      operation: input.operation,
      actor_type: 'user',
      actor_id: input.actor || userId,
      data: {
        ...(input.data || {}),
        metadata: input.metadata
      }
    });
    
    res.status(201).json({
      success: true,
      eventId: event.id,
      sequenceNumber: event.sequence_number,
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to add event', { error: error.message });
    
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid event data',
        details: error.errors,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    res.status(500).json({
      error: 'Failed to add event',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

/**
 * GET /api/v2/contexts/:contextId/events
 * Get context event history
 * Returns same structure for ALL context types
 */
router.get('/contexts/:contextId/events',
  apiSecurityHeaders(),
  limiters.relaxed,
  requireAuth,
  ...validators.contextId,
  async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId: _contextId } = req.params;
    const _dbService = getDatabaseService();
    
    // Get events - using context history for now
    // TODO: Create proper getEventsByContextId method
    const events: any[] = [];
    
    res.json({
      success: true,
      events,
      count: events.length,
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to get events', { error: error.message });
    res.status(500).json({
      error: 'Failed to get events',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

/**
 * GET /api/v2/contexts
 * Query contexts with universal filters
 * Same query interface for ALL context types
 */
router.get('/contexts',
  apiSecurityHeaders(),
  limiters.standard,
  requireAuth,
  ...validators.queryContexts,
  async (req: AuthenticatedRequest, res) => {
  try {
    const query = UniversalQuerySchema.parse(req.query);
    const userId = req.userId!;
    const dbService = getDatabaseService();
    
    RequestContextService.log('info', 'Querying contexts', query);
    
    // Get user's businesses
    const businesses = await dbService.getUserBusinesses(userId);
    
    // Filter by businessId if provided
    const targetBusinesses = query.businessId 
      ? businesses.filter(b => b.id === query.businessId)
      : businesses;
    
    if (targetBusinesses.length === 0) {
      return res.json({
        success: true,
        contexts: [],
        count: 0,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Get contexts for businesses
    const allContexts = [];
    for (const business of targetBusinesses) {
      const contexts = await dbService.getBusinessContexts(business.id, {
        status: query.status,
        templateId: query.templateId,
        limit: query.limit
      });
      allContexts.push(...contexts);
    }
    
    // Sort if requested
    if (query.orderBy) {
      allContexts.sort((a, b) => {
        const aVal = a[query.orderBy as keyof typeof a];
        const bVal = b[query.orderBy as keyof typeof b];
        if (aVal === undefined || bVal === undefined) return 0;
        const comparison = aVal > bVal ? 1 : -1;
        return query.order === 'desc' ? -comparison : comparison;
      });
    }
    
    // Apply offset and limit
    const start = query.offset || 0;
    const end = query.limit ? start + query.limit : undefined;
    const paginatedContexts = allContexts.slice(start, end);
    
    res.json({
      success: true,
      contexts: paginatedContexts,
      count: paginatedContexts.length,
      total: allContexts.length,
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to query contexts', { error: error.message });
    
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors,
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    res.status(500).json({
      error: 'Failed to query contexts',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

/**
 * DELETE /api/v2/contexts/:contextId
 * Soft delete a context (adds a 'delete' event)
 * Universal deletion - same for ALL context types
 */
router.delete('/contexts/:contextId',
  apiSecurityHeaders(),
  limiters.strict,
  requireAuth,
  ...validators.contextId,
  auditLogger(),
  async (req: AuthenticatedRequest, res) => {
  try {
    const { contextId } = req.params;
    const userId = req.userId!;
    const dbService = getDatabaseService();
    
    RequestContextService.log('info', 'Deleting context', { contextId });
    
    // Verify context exists
    const context = await dbService.getContext(contextId);
    if (!context) {
      return res.status(404).json({
        error: 'Context not found',
        requestId: RequestContextService.getContext()?.requestId
      });
    }
    
    // Add delete event (soft delete via event sourcing)
    await dbService.addContextEvent({
      context_id: contextId,
      operation: 'delete',
      actor_type: 'user',
      actor_id: userId,
      data: {
        reason: req.body.reason || 'User requested deletion',
        timestamp: new Date().toISOString()
      }
    });
    
    res.json({
      success: true,
      message: 'Context marked as deleted',
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to delete context', { error: error.message });
    res.status(500).json({
      error: 'Failed to delete context',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

/**
 * GET /api/v2/businesses/:businessId/contexts
 * Get all contexts for a business
 * Universal business view - same for ALL businesses
 */
router.get('/businesses/:businessId/contexts',
  apiSecurityHeaders(),
  limiters.standard,
  requireAuth,
  ...validators.businessId,
  async (req: AuthenticatedRequest, res) => {
  try {
    const { businessId } = req.params;
    const dbService = getDatabaseService();
    
    const contexts = await dbService.getBusinessContexts(businessId);
    
    res.json({
      success: true,
      businessId,
      contexts,
      count: contexts.length,
      requestId: RequestContextService.getContext()?.requestId
    });
  } catch (error: any) {
    RequestContextService.log('error', 'Failed to get business contexts', { error: error.message });
    res.status(500).json({
      error: 'Failed to get business contexts',
      message: error.message,
      requestId: RequestContextService.getContext()?.requestId
    });
  }
});

export { router as universalRoutes };