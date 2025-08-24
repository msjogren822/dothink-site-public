// netlify/functions/minimal-serve.js
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_DATABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // If no ID provided, list recent images
    if (!event.queryStringParameters?.id) {
      const { data, error } = await supabase
        .from('dogify_images')
        .select('id, image_format, created_at, image_size')
        .order('created_at', { ascending: false })
        .limit(10);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          recentImages: data,
          count: data?.length || 0
        }, null, 2)
      };
    }
    
    const imageId = event.queryStringParameters.id;
    
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
