// netlify/functions/save-dogify-image.js
import { createClient } from '@supabase/supabase-js';

// Check if Supabase is configured using the correct environment variable names
const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function handler(event, context) {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      allEnvVars: Object.keys(process.env).filter(key => key.includes('SUPABASE'))
    });
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Image saving service not configured',
        details: 'Supabase environment variables missing'
      })
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (event.httpMethod === 'POST') {
      // Save a new dogified image
      const { 
        imageData, 
        sceneAnalysis, 
        generationPrompt, 
        modelUsed, 
        generationTimeSeconds,
        userSession 
      } = JSON.parse(event.body);

      if (!imageData) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'Missing imageData' })
        };
      }

      let imageBuffer;
      let contentType = 'image/jpeg';

      if (imageData.startsWith('data:image/')) {
        // Handle data URL
        const base64Data = imageData.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
        contentType = imageData.substring(5, imageData.indexOf(';'));
      } else if (imageData.startsWith('http')) {
        // Handle URL - fetch and convert
        const response = await fetch(imageData);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
        contentType = response.headers.get('content-type') || 'image/jpeg';
      } else {
        throw new Error('Unsupported image format');
      }

      // For now, store the original image without resizing to avoid Sharp dependency issues
      // TODO: Add Sharp processing later when dependencies are properly configured

      // Save to Supabase
      const { data, error } = await supabase
        .from('dogify_images')
        .insert({
          image_data: imageBuffer,
          image_format: contentType.includes('png') ? 'png' : 'jpeg',
          image_size: imageBuffer.length,
          width: 1024, // Default, will be updated when Sharp is available
          height: 1024,
          scene_analysis: sceneAnalysis,
          generation_prompt: generationPrompt,
          model_used: modelUsed,
          generation_time_seconds: generationTimeSeconds,
          user_session: userSession,
          user_agent: event.headers['user-agent'],
          ip_address: event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip']
        })
        .select('id')
        .single();

      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ ok: false, error: 'Failed to save image', details: error.message })
        };
      }

      // Return the image ID and URL
      const imageUrl = `${event.headers.host ? `https://${event.headers.host}` : 'https://www.dothink.in'}/.netlify/functions/serve-dogify-image?id=${data.id}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          imageId: data.id,
          imageUrl: imageUrl,
          size: imageBuffer.length,
          dimensions: { width: 1024, height: 1024 } // Default dimensions
        })
      };

    } else if (event.httpMethod === 'GET') {
      // List recent images (for admin/debugging)
      const { data, error } = await supabase
        .from('dogify_image_metadata')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ ok: false, error: error.message })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, images: data })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
