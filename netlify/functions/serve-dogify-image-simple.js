// netlify/functions/serve-dogify-image-simple.js
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
    // Step 1: Basic parameter validation
    const imageId = event.queryStringParameters?.id;
    console.log('Step 1: Image ID:', imageId);
    
    if (!imageId) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing image ID' })
      };
    }

    // Step 2: Environment variables
    const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('Step 2: Environment vars:', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing Supabase configuration',
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey
        })
      };
    }

    // Step 3: Create Supabase client
    console.log('Step 3: Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 4: Query database
    console.log('Step 4: Querying database for ID:', imageId);
    const { data, error } = await supabase
      .from('dogify_images')
      .select('image_data, image_format, created_at')
      .eq('id', imageId)
      .single();

    console.log('Step 4 result:', { 
      hasData: !!data, 
      errorMessage: error?.message,
      errorCode: error?.code
    });

    if (error) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Database error',
          details: error.message,
          code: error.code
        })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image not found' })
      };
    }

    // Step 5: Analyze image data
    console.log('Step 5: Image data analysis:', {
      dataType: typeof data.image_data,
      dataLength: data.image_data?.length || 0,
      isBuffer: Buffer.isBuffer(data.image_data),
      format: data.image_format
    });

    if (!data.image_data) {
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Image data is missing' })
      };
    }

    // Step 6: Convert to proper format
    let imageBuffer;
    try {
      if (Buffer.isBuffer(data.image_data)) {
        imageBuffer = data.image_data;
        console.log('Step 6a: Using Buffer directly');
      } else if (typeof data.image_data === 'string') {
        // Try to convert string to buffer
        imageBuffer = Buffer.from(data.image_data, 'base64');
        console.log('Step 6b: Converted string to buffer, length:', imageBuffer.length);
      } else {
        throw new Error(`Unknown data type: ${typeof data.image_data}`);
      }
    } catch (conversionError) {
      console.error('Step 6 conversion error:', conversionError);
      return {
        statusCode: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Image data conversion failed',
          details: conversionError.message
        })
      };
    }

    // Step 7: Return image
    const contentType = data.image_format === 'png' ? 'image/png' : 'image/jpeg';
    console.log('Step 7: Returning image, type:', contentType, 'size:', imageBuffer.length);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
      body: imageBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('Unexpected error:', err);
    console.error('Error stack:', err.stack);
    
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        step: 'Unknown - check logs'
      })
    };
  }
}
