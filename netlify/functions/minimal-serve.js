// netlify/functions/minimal-serve.js
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  try {
    const imageId = event.queryStringParameters?.id || '178c6015-49fa-4d9c-97ad-78ecb185c2c7';
    
    const supabase = createClient(
      process.env.SUPABASE_DATABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('dogify_images')
      .select('id, image_format, created_at')
      .eq('id', imageId)
      .single();

    if (error || !data) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found', imageId, dbError: error?.message })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true,
        imageId,
        found: data
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
}
