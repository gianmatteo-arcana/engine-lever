/**
 * Supabase client for direct database access
 * Used by agents that need direct database operations
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('Supabase configuration missing', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseServiceKey
  });
  throw new Error('Supabase configuration is required');
}

// Create a service role client for backend operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Export types for convenience
// Database type is not exported from database-aligned-types, so we don't export it here