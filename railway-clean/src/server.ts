import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client (optional)
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Railway backend is working!',
    timestamp: new Date().toISOString()
  });
});

// Background job endpoint (placeholder)
app.post('/api/jobs', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    // Simulate job processing
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Processing job ${jobId} of type: ${type}`);
    
    res.json({
      success: true,
      jobId,
      message: `Job ${type} queued successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Job creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Railway backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
});

export default app;