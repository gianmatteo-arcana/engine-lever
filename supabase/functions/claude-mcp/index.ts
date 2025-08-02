import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleToken(): Promise<string> {
  // For now, we'll use the MCP_AUTH_TOKEN directly
  // In production, you might want to implement proper service account impersonation
  const token = Deno.env.get('MCP_AUTH_TOKEN');
  if (!token) {
    throw new Error('MCP_AUTH_TOKEN not configured');
  }
  return token;
}

serve(async (req) => {
  console.log('=== CLAUDE MCP PROXY FUNCTION ===');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const mcpApiKey = Deno.env.get('MCP_API_KEY');
    const mcpUrl = Deno.env.get('MCP_URL') || 'https://claude-mcp-sba-ydzieksc5q-uc.a.run.app';
    
    console.log('🔧 Environment check:');
    console.log('  - MCP_API_KEY present:', !!mcpApiKey);
    console.log('  - MCP_URL:', mcpUrl);
    console.log('  - MCP_AUTH_TOKEN present:', !!Deno.env.get('MCP_AUTH_TOKEN'));
    
    if (!mcpApiKey) {
      console.error('❌ MCP_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'MCP_API_KEY not configured in Supabase secrets',
          hint: 'Please add MCP_API_KEY to your Supabase function secrets'
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let mcpRequest;
    try {
      mcpRequest = await req.json();
    } catch (parseError) {
      console.error('❌ Invalid JSON in request:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log('📨 MCP Request:', JSON.stringify(mcpRequest, null, 2));

    // Get Google token for authorization
    let googleToken;
    try {
      googleToken = await getGoogleToken();
      console.log('🔐 Google Token present:', !!googleToken);
    } catch (tokenError) {
      console.error('❌ Failed to get Google token:', tokenError);
      return new Response(
        JSON.stringify({ 
          error: 'Authentication failed: ' + tokenError.message,
          hint: 'Please ensure MCP_AUTH_TOKEN is configured in Supabase secrets'
        }), 
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const response = await fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleToken}`,
        'x-mcp-key': mcpApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mcpRequest)
    });

    console.log('📡 MCP Server Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ MCP Server Error:', errorText);
      throw new Error(`MCP Server error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.text();
    console.log('✅ MCP Server Response received');
    
    return new Response(responseData, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    });

  } catch (error) {
    console.error('❌ MCP Proxy Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check function logs for more details'
      }), 
      {
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
});