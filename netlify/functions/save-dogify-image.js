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
        // Handle URL - fetch and convert with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        try {
          const response = await fetch(imageData, { 
            signal: controller.signal,
            timeout: 10000 
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          imageBuffer = Buffer.from(await response.arrayBuffer());
          contentType = response.headers.get('content-type') || 'image/jpeg';
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('Image fetch timed out');
          }
          throw fetchError;
        }
      } else {
        throw new Error('Unsupported image format');
      }

      console.log(`Original image: ${Math.round(imageBuffer.length / 1024)}KB, type: ${contentType}`);

      // Don't truncate images as it corrupts them! 
      // Instead, reject if too large or use the original
      let thumbnailBuffer;
      
      // Check size first - if over 1MB, reject immediately
      const maxSize = 1 * 1024 * 1024; // 1MB max
      if (imageBuffer.length > maxSize) {
        return {
          statusCode: 413,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Image too large for storage', 
            details: `Image size ${Math.round(imageBuffer.length / 1024)}KB exceeds 1MB limit. Please try with a smaller image.` 
          })
        };
      }
      
      // Use the original image buffer (don't corrupt by truncating)
      thumbnailBuffer = imageBuffer;
      
      console.log(`Using image: ${Math.round(thumbnailBuffer.length / 1024)}KB`);

      // Save to Supabase with timeout protection
      const savePromise = supabase
        .from('dogify_images')
        .insert({
          image_data: thumbnailBuffer, // Use the original image data (not corrupted)
          image_format: 'jpeg', // Always JPEG for consistency
          image_size: thumbnailBuffer.length,
          width: 600, // Estimated size for images
          height: 600,
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

      // Add timeout to Supabase operation (reduced to 15 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database operation timed out')), 15000) // 15 seconds
      );

      const { data, error } = await Promise.race([savePromise, timeoutPromise]);

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          table: 'dogify_images'
        });
        
        // Provide more specific error messages
        let errorMessage = 'Failed to save image';
        let statusCode = 500;
        
        if (error.code === '42P01') {
          errorMessage = 'Database table not found. Please run the table creation script.';
          statusCode = 503;
        } else if (error.code === '23505') {
          errorMessage = 'Duplicate image detected';
          statusCode = 409;
        } else if (error.message?.includes('timeout')) {
          errorMessage = 'Database operation timed out. Please try again.';
          statusCode = 504;
        }
        
        return {
          statusCode: statusCode,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: errorMessage, 
            details: error.message,
            code: error.code
          })
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
