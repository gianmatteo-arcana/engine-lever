# Biz Buddy Railway Backend

Background job processing service for Biz Buddy AI using Redis queues.

## Architecture

- **Express.js** - Web server and API endpoints
- **Bull Queue** - Redis-based job processing
- **Supabase** - Database integration
- **Winston** - Logging

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start Redis (Docker):
```bash
docker run -d -p 6379:6379 redis:latest
```

4. Run in development mode:
```bash
npm run dev
```

### Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Yes |
| `REDIS_URL` | Redis connection URL | Auto-provided by Railway |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |

## API Endpoints

- `GET /health` - Health check and queue status
- `POST /api/jobs/create` - Create new background job
- `GET /api/jobs/:id/status` - Get job status

## Job Types

- **Business Analysis** - Market research, competitor analysis
- **Document Processing** - Financial documents, business info extraction
- **AI Tasks** - Business plan generation, strategy creation
- **Reports** - Financial reports, business insights
- **Notifications** - Email alerts and updates

## Integration with Frontend

Frontend creates jobs by calling the Railway backend API:

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

## Monitoring

- Health endpoint: `/health`
- Queue statistics included in health check
- Winston logs for debugging
- Job progress tracking