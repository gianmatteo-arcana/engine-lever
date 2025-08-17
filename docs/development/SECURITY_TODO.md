# Security Improvements TODO

## Critical (Before Production)

### 1. Authentication & Authorization
- [ ] Implement API key authentication for backend endpoints
- [ ] Use Supabase JWT tokens for user authentication
- [ ] Add middleware to validate auth tokens on all protected routes
- [ ] Implement role-based access control (RBAC)

### 2. CORS Configuration
- [ ] Environment-specific CORS settings
- [ ] Restrict to exact production domain (not wildcards)
- [ ] Remove localhost from production builds

**Quick Fix for now:**
```typescript
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://c8eb2d86-d79d-470d-b29c-7a82d220346b.lovableproject.com']
  : ['http://localhost:5173', 'http://localhost:5174'];
```

### 3. Rate Limiting
- [ ] Add express-rate-limit middleware
- [ ] Configure limits per endpoint
- [ ] Implement Redis-based rate limiting for distributed deployments

### 4. Input Validation
- [ ] Add Zod schemas for all API endpoints
- [ ] Validate and sanitize all inputs
- [ ] Reject requests with unexpected fields

### 5. Security Headers
- [ ] Configure Helmet properly for production
- [ ] Add Content Security Policy (CSP)
- [ ] Enable HSTS for HTTPS-only

## Medium Priority

### 6. Error Handling
- [ ] Create custom error classes
- [ ] Sanitize error messages in production
- [ ] Never expose stack traces to clients
- [ ] Log detailed errors server-side only

### 7. API Versioning
- [ ] Implement /api/v1/ prefix
- [ ] Plan for backward compatibility

### 8. Monitoring & Logging
- [ ] Add request logging with correlation IDs
- [ ] Implement security event logging
- [ ] Set up alerts for suspicious activity
- [ ] Add metrics for rate limit violations

## Low Priority (Nice to Have)

### 9. Advanced Security
- [ ] Implement request signing for critical operations
- [ ] Add IP allowlisting for admin endpoints
- [ ] Set up Web Application Firewall (WAF)
- [ ] Implement audit logging

### 10. Documentation
- [ ] Document API authentication flow
- [ ] Create security best practices guide
- [ ] Add API usage examples with auth

## Immediate Quick Wins (Can Do Now)

1. **Add Basic API Key Check:**
```typescript
// middleware/auth.ts
export const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Apply to routes
app.use('/api', requireApiKey, apiRoutes);
```

2. **Add Rate Limiting:**
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);
```

3. **Environment-based CORS:**
```typescript
const getCorsOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return [process.env.FRONTEND_URL]; // Set in Railway
  }
  return ['http://localhost:5173', 'http://localhost:5174'];
};
```

## Security Checklist for Production

- [ ] All endpoints require authentication
- [ ] Rate limiting enabled
- [ ] CORS restricted to production domain only
- [ ] Input validation on all endpoints
- [ ] Error messages sanitized
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Logs don't contain sensitive data
- [ ] Dependencies updated and scanned
- [ ] Environment variables properly secured

## Notes

- Current setup is **acceptable for MVP development**
- **DO NOT deploy to production** without implementing Critical items
- Consider using Supabase Row Level Security (RLS) for data access
- Railway provides HTTPS by default ✅
- Keep API keys in Railway environment variables, never in code