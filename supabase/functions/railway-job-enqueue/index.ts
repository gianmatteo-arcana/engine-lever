import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JobRequest {
  userId: string;
  jobType: 'llm_processing' | 'data_sync' | 'notifications' | 'maintenance';
  priority?: number;
  payload?: Record<string, any>;
  scheduledAt?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, jobType, priority = 5, payload, scheduledAt }: JobRequest = await req.json();

    // Validate that user can only enqueue jobs for themselves
    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot enqueue jobs for other users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create background job record in Supabase first
    const { data: jobRecord, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: userId,
        job_type: jobType,
        priority,
        payload,
        scheduled_at: scheduledAt || new Date().toISOString(),
        status: 'pending'
      })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create job record:', jobError);
      return new Response(
        JSON.stringify({ error: 'Failed to create job record', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Railway service URL from environment
    const railwayUrl = Deno.env.get('RAILWAY_SERVICE_URL');
    if (!railwayUrl) {
      return new Response(
        JSON.stringify({ error: 'Railway service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enqueue job in Railway service
    const railwayResponse = await fetch(`${railwayUrl}/api/jobs/enqueue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('RAILWAY_AUTH_TOKEN') || ''}`
      },
      body: JSON.stringify({
        userId,
        jobType,
        priority,
        payload: {
          ...payload,
          jobId: jobRecord.id // Include Supabase job ID
        },
        scheduledAt
      })
    });

    if (!railwayResponse.ok) {
      const railwayError = await railwayResponse.text();
      console.error('Railway enqueue failed:', railwayError);
      
      // Update job status to failed
      await supabase
        .from('background_jobs')
        .update({ 
          status: 'failed', 
          error_message: `Railway enqueue failed: ${railwayError}`,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobRecord.id);

      return new Response(
        JSON.stringify({ error: 'Failed to enqueue job in Railway service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const railwayData = await railwayResponse.json();

    // Update job record with Railway job ID
    await supabase
      .from('background_jobs')
      .update({ 
        data: { railway_job_id: railwayData.jobId }
      })
      .eq('id', jobRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: jobRecord.id,
        railwayJobId: railwayData.jobId,
        queueName: jobType,
        estimatedDelay: railwayData.estimatedDelay || 0
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in railway-job-enqueue:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});