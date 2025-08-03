# Railway Background Service

A 24/7 background service for processing AI tasks, data synchronization, notifications, and maintenance operations. Built to integrate seamlessly with your Supabase-powered Lovable app.

## Features

- **Job Queue System**: Bull/BullMQ with Redis for reliable job processing
- **Multiple Queue Types**: LLM processing, data sync, notifications, maintenance
- **Real-time Monitoring**: Built-in queue monitoring dashboard
- **Retry Logic**: Automatic retry with exponential backoff
- **Health Checks**: Comprehensive health monitoring endpoints
- **Webhook API**: RESTful API for job management
- **Auto-scaling**: Configurable concurrency and scaling

## Quick Start

### 1. Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Connect your GitHub repository
2. Add the following services:
   - **Redis**: Add from Railway's service catalog
   - **Your App**: Deploy from your repository

### 2. Environment Variables

Set these environment variables in Railway:

```bash
NODE_ENV=production
SUPABASE_URL=https://raenkewzlvrdqufwxjpl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_HOST=redis-hostname  # Railway provides this
REDIS_PORT=6379           # Railway provides this
REDIS_PASSWORD=redis-password  # Railway provides this
ALLOWED_ORIGINS=https://your-app.lovable.app
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 3. Build Configuration

Railway will automatically detect and build your TypeScript app. The build process:

1. Installs dependencies with `npm install`
2. Compiles TypeScript with `npm run build`
3. Starts the service with `npm start`

## API Endpoints

### Job Management

- **POST** `/api/jobs/enqueue` - Enqueue a new background job
- **GET** `/api/jobs/:jobId/status` - Get job status
- **DELETE** `/api/jobs/:jobId` - Cancel a job

### Monitoring

- **GET** `/health` - Basic health check
- **GET** `/health/detailed` - Detailed system health
- **GET** `/api/queues/stats` - Queue statistics
- **GET** `/admin/queues` - Queue monitoring dashboard

## Job Types

### LLM Processing (`llm_processing`)
Heavy AI processing tasks that need dedicated compute resources.

```json
{
  "userId": "user-uuid",
  "jobType": "llm_processing",
  "payload": {
    "provider": "openai",
    "prompt": "Your prompt here",
    "model": "gpt-4",
    "maxTokens": 1000
  }
}
```

### Data Sync (`data_sync`)
Batch processing and data synchronization operations.

```json
{
  "userId": "user-uuid",
  "jobType": "data_sync",
  "payload": {
    "syncType": "user_data",
    "filters": { "status": "pending" }
  }
}
```

### Notifications (`notifications`)
Email, SMS, and push notification delivery.

```json
{
  "userId": "user-uuid",
  "jobType": "notifications",
  "payload": {
    "type": "email",
    "recipient": "user@example.com",
    "subject": "Your report is ready",
    "message": "Hello! Your report has been generated."
  }
}
```

### Maintenance (`maintenance`)
Scheduled maintenance and cleanup operations.

```json
{
  "userId": "system",
  "jobType": "maintenance",
  "payload": {
    "action": "cleanup_completed_jobs",
    "parameters": { "retentionDays": 30 }
  }
}
```

## Integration with Supabase

### Database Schema

The service uses these Supabase tables:

- `background_jobs` - Job tracking and status
- `job_queues` - Queue configuration
- `job_results` - Detailed step results

### Row Level Security

All tables have RLS policies ensuring users can only access their own jobs:

```sql
CREATE POLICY "Users can view their own jobs" 
ON public.background_jobs 
FOR SELECT 
USING (auth.uid() = user_id);
```

## Development

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy environment file: `cp .env.example .env`
4. Fill in your environment variables
5. Start Redis locally or use Railway's development database
6. Run development server: `npm run dev`

### Testing

```bash
npm test
```

### Building

```bash
npm run build
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Supabase      │    │    Railway      │    │     Redis       │
│   Database      │◄──►│   Background    │◄──►│   Job Queue     │
│                 │    │   Service       │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │
                               ▼
                    ┌─────────────────┐
                    │   Your Lovable  │
                    │   Frontend App  │
                    └─────────────────┘
```

## Monitoring

### Queue Dashboard

Access the queue monitoring dashboard at `/admin/queues` to:

- View active, waiting, completed, and failed jobs
- Retry failed jobs
- Monitor queue performance
- View job details and logs

### Health Checks

- **Basic**: `/health` - Returns 200 if all services are healthy
- **Detailed**: `/health/detailed` - Returns comprehensive system information

### Logging

All operations are logged with structured logging:

```json
{
  "level": "info",
  "timestamp": "2024-08-03T04:36:14.778Z",
  "message": "Job job_123 completed in llm_processing queue",
  "jobId": "job_123",
  "duration": 2500
}
```

## Scaling

### Auto-scaling Configuration

Railway automatically scales based on:

- CPU usage
- Memory usage
- Queue length (custom metrics)

### Manual Scaling

Adjust concurrency per queue type in `src/queues/index.ts`:

```typescript
queues.llmProcessing.process(5, processLLMJob); // 5 concurrent jobs
```

## Cost Optimization

### Railway Pricing

- **Starter**: $5/month per service
- **Pro**: Usage-based pricing (CPU + Memory)
- **Redis**: ~$10/month for 1GB

### Optimization Tips

1. **Queue Priorities**: Use job priorities to process important tasks first
2. **Batch Processing**: Group similar tasks together
3. **Cleanup Jobs**: Regularly clean up completed jobs
4. **Resource Limits**: Set appropriate memory limits per queue

## Troubleshooting

### Common Issues

**Redis Connection Failed**
- Check Redis service is running in Railway
- Verify REDIS_* environment variables
- Check Railway service networking

**Supabase Connection Failed**
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- Check RLS policies allow service role access
- Verify database connectivity

**Jobs Stuck in Queue**
- Check queue processor is running
- Review error logs in Railway
- Verify job payload format

### Debug Mode

Enable debug logging:

```bash
NODE_ENV=development
LOG_LEVEL=debug
```

## Security

- Service role key for secure Supabase access
- Environment variable encryption in Railway
- CORS configuration for allowed origins
- Rate limiting on webhook endpoints
- Input validation with Zod schemas

## Support

- Railway Documentation: https://docs.railway.app
- Bull Queue Documentation: https://github.com/OptimalBits/bull
- Supabase Documentation: https://supabase.com/docs