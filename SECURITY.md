# SmallBizAlly Backend Security Guidelines

## 🔐 Security Overview

The SmallBizAlly backend implements a multi-layered security architecture designed for handling sensitive business compliance data and financial information.

## 🏗️ Security Architecture

### Core Security Principles
1. **Defense in Depth**: Multiple security layers at application, database, and network levels
2. **Least Privilege**: Minimal access rights for all components and users
3. **Zero Trust**: All requests authenticated and authorized
4. **Audit Everything**: Comprehensive logging for compliance and monitoring

### Security Boundaries
```
Internet → HTTPS/TLS → Railway Edge → Backend Service → Supabase (Service Key)
              ↓                           ↓                    ↓
        Rate Limiting              JWT Validation      Database RLS
```

## 🛡️ Authentication & Authorization

### Service-to-Service Authentication
- **Supabase Service Key**: Backend uses service role key for database admin operations
- **JWT Validation**: All user requests validated against Supabase JWT tokens
- **API Key Management**: Secure rotation and storage of service credentials

### User Authentication (via Frontend)
- **Supabase Auth**: All user authentication handled by frontend
- **Session Management**: Backend validates sessions, never stores passwords
- **Role-Based Access**: User permissions enforced through RLS policies

## 🗄️ Database Security

### Row Level Security (RLS)
```sql
-- Users can only access their own tasks
CREATE POLICY "Users can view their own tasks" ON tasks
  FOR SELECT USING (auth.uid() = user_id);

-- Backend tables accessible via service key only
-- (Service key bypasses RLS for admin operations)
```

### Schema Migration Security
**🚨 CRITICAL**: All schema changes follow the [Schema Migration Security Protocol](./SECURITY_SCHEMA_MIGRATIONS.md)

- **Frontend Ownership**: All migrations created in `biz-buddy-ally-now/supabase/migrations/`
- **Migration Registry**: Pre-registered migrations prevent unauthorized SQL execution
- **Manual Approval**: No automatic migrations - human review required
- **Development Only**: Migration UI disabled in production
- **Dual Audit Trail**: Migration history + security audit log with comprehensive tracking
- **Edge Function Security**: Dedicated migration-manager with CORS controls
- **Pending Migration Detection**: Automated checking via check-pending-migrations function

### Data Encryption
- **At Rest**: Supabase handles database encryption
- **In Transit**: All connections use TLS 1.3
- **Service Keys**: Stored as environment variables, never in code

## 🔒 API Security

### Input Validation
```typescript
// All inputs validated with Zod schemas
const TaskRequestSchema = z.object({
  userId: z.string().uuid(),
  businessId: z.string().min(1),
  templateId: z.string().min(1),
  // ... additional validation
});
```

### Rate Limiting
- **Request Throttling**: Per-IP and per-user rate limits
- **Circuit Breakers**: Automatic failure protection
- **DDoS Protection**: Railway edge protection + application-level limits

### CORS Configuration
```typescript
// Restrictive CORS for production
app.use(cors({
  origin: [
    'https://your-production-domain.com',
    'https://your-staging-domain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
```

## 🔍 Security Monitoring & Logging

### Enhanced Audit Trail System
All security-relevant events logged across multiple systems:
- **User Authentication**: Login attempts, session validation
- **Database Operations**: CRUD operations with user context
- **Schema Changes**: Migration applications and results
- **API Access**: Request patterns and authorization failures
- **Security Audit Log**: Dedicated table with detailed event tracking
- **Profile Changes**: Automatic auditing of all profile modifications with triggers
- **Edge Function Activity**: Comprehensive logging for migration-manager and backend-proxy

### Log Security
```typescript
// Secure logging without sensitive data
logger.info('User action', {
  userId: user.id,
  action: 'task_created',
  // Never log: passwords, tokens, personal data
});
```

### Monitoring Alerts
- **Failed Authentication**: Multiple failed login attempts
- **Suspicious Patterns**: Unusual API usage or data access
- **Schema Changes**: Unauthorized migration attempts
- **Service Errors**: Database connection failures or service disruptions

## 🚨 Vulnerability Management

### Known Security Considerations

#### 1. Service Key Security
- **Risk**: Service role key has admin database access
- **Mitigation**: Key stored as environment variable, never in code
- **Monitoring**: Key usage logged and monitored

#### 2. Database Injection
- **Risk**: SQL injection through parameterized queries
- **Mitigation**: Supabase client handles parameterization
- **Validation**: All inputs validated before database operations

#### 3. Cross-Site Attacks
- **Risk**: CSRF/XSS through API endpoints
- **Mitigation**: Proper CORS, input sanitization, CSP headers
- **Validation**: Frontend authentication required for all operations

### Security Testing
- **Unit Tests**: Input validation and error handling
- **Integration Tests**: Database security with real data
- **Penetration Testing**: Regular security assessments (quarterly)

## 🔧 Secure Development Practices

### Code Security
```typescript
// ✅ SECURE: Environment variables for secrets
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// ❌ INSECURE: Never hardcode secrets
const supabaseKey = "eyJhbGciOiJIUzI1NiIs..."; // Don't do this!
```

### Dependency Management
- **npm audit**: Regular vulnerability scanning
- **Dependency Updates**: Monthly security updates
- **License Compliance**: All dependencies vetted for security

### Environment Security
- **Development**: Isolated with test data only
- **Staging**: Production-like security with sanitized data
- **Production**: Full security measures, monitoring, and backups

## 📋 Security Compliance

### Regulatory Requirements
- **Data Privacy**: GDPR/CCPA compliance for user data
- **Financial Data**: SOX compliance for business records
- **Audit Trails**: Complete activity logging for compliance

### Security Standards
- **OWASP Top 10**: Regular assessment against web vulnerabilities
- **SOC 2**: Security controls and monitoring
- **ISO 27001**: Information security management practices

## 🚫 Security Restrictions

### Development Guidelines
- **No Secrets in Code**: All credentials via environment variables
- **No Production Data**: Development uses sanitized test data only
- **Secure Defaults**: Fail-secure, not fail-open
- **Regular Reviews**: Code security reviews before deployment

### Access Controls
- **Principle of Least Privilege**: Minimal required permissions
- **Time-Limited Access**: Temporary credentials where possible
- **Multi-Factor Authentication**: Required for admin access
- **Access Logging**: All admin operations logged

## 🔗 Related Security Documents

- **[Schema Migration Security](./SECURITY_SCHEMA_MIGRATIONS.md)**: Detailed migration security procedures
- **[Development Workflow](./DEVELOPMENT_WORKFLOW.md)**: Secure development practices
- **[Schema Architecture](./SCHEMA_ARCHITECTURE.md)**: Database security model

## 📞 Security Incident Response

### Emergency Procedures
1. **Identify**: Detect and classify security incident
2. **Contain**: Isolate affected systems immediately
3. **Eradicate**: Remove threat and close vulnerability
4. **Recover**: Restore systems and verify security
5. **Lessons Learned**: Document and improve security measures

### Contact Information
- **Security Team**: security@yourcompany.com
- **On-Call Engineer**: Via PagerDuty/Slack
- **Compliance Officer**: For regulatory incidents

---

**Security Review**: Monthly  
**Last Updated**: 2025-08-03  
**Next Audit**: 2025-09-03