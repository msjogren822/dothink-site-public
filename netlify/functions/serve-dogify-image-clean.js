// netlify/functions/serve-dogify-image-clean.js
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get and clean image ID
    const imageId = event.queryStringParameters?.id;
    let cleanImageId = imageId;
    
    // Handle comma-separated UUID corruption
    if (imageId && imageId.includes(',')) {
      cleanImageId = imageId.split(',')[0].trim();
    }
    
    if (!cleanImageId) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing image ID' })
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanImageId)) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid image ID format' })
      };
    }

    // Connect to Supabase
    const supabase = createClient(
      process.env.SUPABASE_DATABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get image data
    const { data, error } = await supabase
      .from('dogify_images')
      .select('image_data, image_format, created_at')
      .eq('id', cleanImageId)
      .single();

    if (error || !data) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image not found' })
      };
    }

    if (!data.image_data) {
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image data is missing' })
      };
    }

    // Handle the two main formats we care about
    let imageBuffer;
    
    if (typeof data.image_data === 'string') {
      if (data.image_data.startsWith('\\x')) {
        // Old hex format (working entries)
        try {
          const hexString = data.image_data.slice(2); // Remove \\x prefix
          imageBuffer = Buffer.from(hexString, 'hex');
        } catch (error) {
          return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to decode hex image data' })
          };
        }
      } else {
        // New base64 format (standardized entries)
        try {
          imageBuffer = Buffer.from(data.image_data, 'base64');
        } catch (error) {
          return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to decode base64 image data' })
          };
        }
      }
    } else {
      // Fallback for any other format - skip it
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unsupported image data format',
          details: 'This image was created during development and uses an unsupported format'
        })
      };
    }

    // Validate we got a proper image
    if (!imageBuffer || imageBuffer.length === 0) {
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid image buffer' })
      };
    }

    // Determine content type
    let contentType = 'image/jpeg'; // Default
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      contentType = 'image/png';
    } else if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
      contentType = 'image/jpeg';
    }

    // Return the image
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
        'Content-Length': imageBuffer.length.toString()
      },
      body: imageBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
}
