// netlify/functions/ping.js
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,             // set in Netlify UI
  process.env.SUPABASE_SERVICE_ROLE_KEY // also set (secret)
);

export async function handler() {
  // Query the pings table (or any simple read)
  const { data, error } = await sb.from('pings').select('id').limit(1);
  return {
    statusCode: error ? 500 : 200,
    body: JSON.stringify({ data, error })
  };
}
