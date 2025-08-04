// netlify/functions/ping.js
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler() {
  try {
    console.log('Starting Supabase query...');
    
    const { data, error } = await sb
      .from('pings')
      .select('*')  // Get all columns instead of just id
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Supabase query error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: error.message,
          details: process.env.NODE_ENV === 'development' ? error : undefined
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        data,
        debug: { rowCount: data?.length }
      })
    };
  } catch (e) {
    console.error('Function error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        message: e.message
      })
    };
  }
}
