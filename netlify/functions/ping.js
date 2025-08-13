// netlify/functions/ping.js
import { createClient } from '@supabase/supabase-js';

// Validate environment variables using the actual names from your Netlify config
if (!process.env.SUPABASE_DATABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

const sb = createClient(
  process.env.SUPABASE_DATABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to get a random word
const randomWords = ['apple', 'banana', 'cherry', 'dragonfruit', 'elderberry', 'fig', 'grape'];
function getRandomWord() {
  return randomWords[Math.floor(Math.random() * randomWords.length)];
}

export async function handler() {
  try {
    const pingage = getRandomWord();

    // Insert a new row into the pings table
    const { data, error } = await sb
      .from('pings')
      .insert([{ pingage }])
      .select('*'); // Return the inserted row

    if (error) {
      console.error('Supabase insert error:', error);
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
        data: data // return inserted row(s) in data array as expected by frontend
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