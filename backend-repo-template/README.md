# Biz Buddy Backend

Background job processing and API service for Biz Buddy AI.

## 🚀 Quick Deploy to Railway

1. **Create GitHub Repository**: `github.com/gianmatteo-arcana/biz-buddy-backend`
2. **Push this code** to the new repository
3. **Connect Railway** to the new repository  
4. **Add Environment Variables** in Railway dashboard:
   ```
   SUPABASE_URL=https://raenkewzlvrdqufwxjpl.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   FRONTEND_URL=https://your-app.lovable.app
   ```
5. **Add Redis** service from Railway catalog
6. **Deploy** automatically!

## 🏗️ Architecture

- **Express.js** - REST API server
- **TypeScript** - Type safety
- **Bull Queue** - Redis-based job processing  
- **Supabase** - Database integration
- **Winston** - Structured logging

## 📡 API Endpoints

- `GET /health` - Health check with service status
- `GET /api/jobs/test` - Test endpoint
- `POST /api/jobs/create` - Create background job
- `GET /api/jobs/:id/status` - Get job status

## 💼 Background Jobs

- **Business Analysis** - Market research, competitor analysis
- **AI Tasks** - Heavy AI processing, report generation
- **Notifications** - Email, SMS alerts

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🌐 Integration with Frontend

Your Lovable frontend can call this backend:

```javascript
// Create a background job
const response = await fetch('https://your-railway-app.railway.app/api/jobs/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'business-analysis',
    userId: 'user-id',
    data: { /* job parameters */ }
  })
});
```

## 🔒 Security

- CORS configured for your frontend domain
- Service role authentication for Supabase
- Input validation with Zod schemas
- Rate limiting and error handling

## 📊 Monitoring

- Health checks: `/health`
- Structured logging with Winston
- Queue statistics and job tracking
- Error reporting and alerting

## 🎯 No Deno Confusion!

This repository contains **only Node.js/TypeScript** code. No Deno imports, no Supabase Edge Functions - just clean backend services ready for Railway deployment!