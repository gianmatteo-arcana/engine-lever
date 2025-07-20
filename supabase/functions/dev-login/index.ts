import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pin } = await req.json()
    
    // Verify the PIN
    if (pin !== "1234") {
      return new Response(
        JSON.stringify({ error: 'Invalid PIN' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if dev user exists, if not create them
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById('04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412')
    
    if (!existingUser.user) {
      // Create the dev user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        user_id: '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412',
        email: 'dev@smallbizally.com',
        password: 'dev123456',
        email_confirm: true,
        user_metadata: {
          full_name: 'Dev User',
          name: 'Dev User'
        }
      })
      
      if (createError) {
        console.error('Error creating dev user:', createError)
      }
    }

    // Generate access token for the dev user
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: 'dev@smallbizally.com'
    })

    if (error) {
      console.error('Error generating token:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to generate auth token' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract the access token from the magic link
    const url = new URL(data.properties?.action_link || '')
    const accessToken = url.searchParams.get('access_token')
    const refreshToken = url.searchParams.get('refresh_token')

    return new Response(
      JSON.stringify({ 
        success: true,
        access_token: accessToken,
        refresh_token: refreshToken
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})