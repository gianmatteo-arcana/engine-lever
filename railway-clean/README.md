# Railway Backend Service

Clean Node.js backend service for Railway deployment.

## Quick Deploy to Railway

1. **Connect Repository**: Point Railway to this repository
2. **Set Root Directory**: `/railway-clean` 
3. **Environment Variables**:
   ```
   SUPABASE_URL=https://raenkewzlvrdqufwxjpl.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   FRONTEND_URL=your-lovable-app-url
   ```

## Local Development

```bash
cd railway-clean
npm install
npm run dev
```

## Endpoints

- `GET /health` - Health check
- `GET /api/test` - Test endpoint  
- `POST /api/jobs` - Create background job

## Build Process

Railway will automatically:
1. `npm install` - Install dependencies
2. `npm run build` - Compile TypeScript
3. `npm start` - Start the server

No Deno, no confusion, just clean Node.js! 🚀