// netlify/functions/serve-dogify-image.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function handler(event, context) {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const imageId = event.queryStringParameters?.id;
    
    if (!imageId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing image ID' })
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(imageId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid image ID format' })
      };
    }

    // Get image from Supabase
    console.log(`Fetching image with ID: ${imageId}`);
    const { data, error } = await supabase
      .from('dogify_images')
      .select('image_data, image_format, created_at, image_size')
      .eq('id', imageId)
      .single();

    console.log('Supabase query result:', {
      hasData: !!data,
      error: error?.message,
      dataSize: data?.image_data?.length,
      format: data?.image_format
    });

    if (error || !data) {
      console.error('Image not found:', error);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Image not found',
          details: error?.message,
          imageId: imageId
        })
      };
    }

    if (!data.image_data) {
      console.error('Image data is null or empty');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Image data is corrupted or missing' })
      };
    }

    // Update share count (fire and forget)
    supabase
      .from('dogify_images')
      .update({ 
        share_count: supabase.sql`share_count + 1`,
        last_shared_at: new Date().toISOString()
      })
      .eq('id', imageId)
      .then(() => {})
      .catch(err => console.log('Share count update failed:', err));

    // Determine content type
    const contentType = data.image_format === 'png' ? 'image/png' : 'image/jpeg';
    
    console.log(`Serving image: ${data.image_data.length} bytes, type: ${contentType}`);

    // Return the image
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Length': data.image_data.length.toString(),
        'Last-Modified': new Date(data.created_at).toUTCString(),
        'ETag': `"${imageId}"`,
      },
      body: data.image_data.toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('Serve image error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
