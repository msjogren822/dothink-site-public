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
    const debug = event.queryStringParameters?.debug === 'true';
    
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

    // Debug mode: return JSON with metadata instead of image
    if (debug) {
      return {
        statusCode: 200,
        headers: { 
          ...headers, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          imageId: imageId,
          dataType: typeof data.image_data,
          dataLength: data.image_data?.length || 0,
          isBuffer: Buffer.isBuffer(data.image_data),
          format: data.image_format,
          created: data.created_at,
          firstBytes: data.image_data ? Array.from(data.image_data.slice(0, 10)) : [],
          hasBase64Header: data.image_data ? data.image_data.toString().startsWith('data:') : false
        })
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

    // Determine content type - always JPEG for consistency
    const contentType = 'image/jpeg';
    
    console.log(`Serving image: ${data.image_data.length} bytes, type: ${contentType}`);
    console.log('Image data type:', typeof data.image_data, 'isBuffer:', Buffer.isBuffer(data.image_data));

    // Handle the case where Supabase returns string instead of Buffer
    let imageBuffer;
    if (Buffer.isBuffer(data.image_data)) {
      // Already a buffer - use directly
      imageBuffer = data.image_data;
      console.log('Using Buffer directly');
    } else if (typeof data.image_data === 'string') {
      // Check if it's the old JSON-serialized Buffer format
      if (data.image_data.startsWith('\\x7b') || data.image_data.includes('"type":"Buffer"')) {
        console.log('Detected old JSON-serialized Buffer format');
        try {
          // Try to parse the JSON-serialized Buffer
          let parsedData;
          if (data.image_data.startsWith('\\x')) {
            // It's hex-encoded, need to decode first
            const hexString = data.image_data.replace(/\\x/g, '');
            const jsonString = Buffer.from(hexString, 'hex').toString();
            parsedData = JSON.parse(jsonString);
          } else {
            parsedData = JSON.parse(data.image_data);
          }
          
          if (parsedData.type === 'Buffer' && Array.isArray(parsedData.data)) {
            imageBuffer = Buffer.from(parsedData.data);
            console.log('Successfully parsed old Buffer format, length:', imageBuffer.length);
          } else {
            throw new Error('Not a valid Buffer JSON');
          }
        } catch (parseError) {
          console.log('Failed to parse old format:', parseError.message);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Cannot parse stored image data' })
          };
        }
      } else {
        // Assume it's base64
        imageBuffer = Buffer.from(data.image_data, 'base64');
        console.log('Converted base64 string to buffer, length:', imageBuffer.length);
      }
    } else {
      console.error('Unknown image data type:', typeof data.image_data);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Unknown image data format' })
      };
    }

    // Return the image
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length.toString(),
        'Last-Modified': new Date(data.created_at).toUTCString(),
        'ETag': `"${imageId}"`,
      },
      body: imageBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('Serve image error:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: err.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
