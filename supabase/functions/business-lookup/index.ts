import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CaliforniaBusinessEntity {
  entity_name: string;
  entity_number: string;
  entity_type: string;
  entity_status: string;
  agent_name?: string;
  agent_address?: string;
  principal_address?: string;
  mailing_address?: string;
  file_date?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Query must be at least 2 characters long' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Searching for business entities with query:', query);

    // California Secretary of State Business Search API
    // Note: This is a simplified example. The actual CA SOS API may require authentication
    // and has different endpoints. For production, you'd use their official API.
    const searchUrl = `https://businesssearch.sos.ca.gov/api/Records/businesssearch/BusinessSearch`;
    
    const searchParams = new URLSearchParams({
      SearchValue: query.trim(),
      SearchType: 'ENTITY_NAME',
      Status: 'ACTIVE',
      IsActive: 'true'
    });

    // For this demo, we'll simulate the API response since the actual CA SOS API
    // requires specific credentials and may have rate limits
    const mockResults: CaliforniaBusinessEntity[] = generateMockResults(query);

    console.log('Found entities:', mockResults.length);

    return new Response(
      JSON.stringify({ 
        results: mockResults,
        query: query,
        total: mockResults.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in business lookup:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Mock function to simulate California business search results
function generateMockResults(query: string): CaliforniaBusinessEntity[] {
  const queryLower = query.toLowerCase();
  
  // Simulate realistic business entity search results
  const mockEntities: CaliforniaBusinessEntity[] = [
    {
      entity_name: `${query} Inc.`,
      entity_number: `C${Math.floor(Math.random() * 9000000) + 1000000}`,
      entity_type: 'CORPORATION',
      entity_status: 'ACTIVE',
      principal_address: '123 Main St, San Francisco, CA 94105',
      agent_name: 'Corporate Services Inc.',
      file_date: '2020-03-15'
    },
    {
      entity_name: `${query} LLC`,
      entity_number: `${Math.floor(Math.random() * 900000000) + 100000000}`,
      entity_type: 'LIMITED LIABILITY COMPANY',
      entity_status: 'ACTIVE', 
      principal_address: '456 Business Ave, Los Angeles, CA 90210',
      agent_name: 'Legal Services Corp.',
      file_date: '2019-08-22'
    }
  ];

  // Filter based on query similarity
  if (queryLower.includes('tech') || queryLower.includes('software')) {
    mockEntities.push({
      entity_name: `${query} Technologies Corp.`,
      entity_number: `C${Math.floor(Math.random() * 9000000) + 1000000}`,
      entity_type: 'CORPORATION',
      entity_status: 'ACTIVE',
      principal_address: '789 Tech Blvd, Palo Alto, CA 94301',
      agent_name: 'Tech Services LLC',
      file_date: '2021-01-10'
    });
  }

  // Return 0-3 results based on query to simulate real search behavior
  const numResults = Math.floor(Math.random() * 4);
  return mockEntities.slice(0, numResults);
}