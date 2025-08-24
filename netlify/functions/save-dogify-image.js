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
        console.log('Processing data URL, length:', imageData.length);
        const base64Data = imageData.split(',')[1];
        if (!base64Data) {
          throw new Error('Invalid data URL - no base64 data found');
        }
        imageBuffer = Buffer.from(base64Data, 'base64');
        contentType = imageData.substring(5, imageData.indexOf(';'));
        console.log('Extracted from data URL:', {
          base64Length: base64Data.length,
          bufferLength: imageBuffer.length,
          contentType: contentType,
          validJPEG: imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8,
          validPNG: imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50,
          firstBytesHex: imageBuffer.slice(0, 4).toString('hex')
        });
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
      console.log('Image buffer type:', typeof imageBuffer, 'Is Buffer:', Buffer.isBuffer(imageBuffer));

      // Frontend should compress images, but add a backstop here
      let thumbnailBuffer = imageBuffer;
      
      // Ensure we have a proper Buffer (not a base64 string)
      if (!Buffer.isBuffer(thumbnailBuffer)) {
        console.log('Converting to Buffer...');
        if (typeof thumbnailBuffer === 'string') {
          // If it's a string, assume it's base64
          thumbnailBuffer = Buffer.from(thumbnailBuffer, 'base64');
        } else {
          console.error('Unknown image data type:', typeof thumbnailBuffer);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              ok: false, 
              error: 'Invalid image data format',
              details: 'Expected Buffer or base64 string'
            })
          };
        }
      }
      
      // If still too large, reject (frontend compression should handle this)
      const maxSize = 1.5 * 1024 * 1024; // 1.5MB max (generous limit)
      if (thumbnailBuffer.length > maxSize) {
        return {
          statusCode: 413,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Image too large after compression', 
            details: `Image size ${Math.round(thumbnailBuffer.length / 1024)}KB exceeds 1.5MB limit. Please try again - the app will compress images automatically.` 
          })
        };
      }
      
      console.log(`Final buffer: ${Math.round(thumbnailBuffer.length / 1024)}KB, isBuffer: ${Buffer.isBuffer(thumbnailBuffer)}`);

      // Validate that we have proper image data before saving
      if (thumbnailBuffer.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Empty image data',
            details: 'Image buffer is empty after processing'
          })
        };
      }

      // Check for valid image headers
      const firstBytes = thumbnailBuffer.slice(0, 4);
      const isJPEG = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8;
      const isPNG = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47;
      
      console.log('Image validation:', {
        firstBytesHex: firstBytes.toString('hex'),
        isJPEG,
        isPNG,
        isValid: isJPEG || isPNG
      });

      if (!isJPEG && !isPNG) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Invalid image data',
            details: `Image data does not have valid JPEG or PNG headers. First bytes: ${firstBytes.toString('hex')}`
          })
        };
      }

      // Save to Supabase with timeout protection
      console.log('About to save to Supabase:', {
        bufferSize: thumbnailBuffer.length,
        isBuffer: Buffer.isBuffer(thumbnailBuffer),
        firstBytes: Array.from(thumbnailBuffer.slice(0, 10))
      });
      
      // Convert Buffer to base64 string for reliable storage in Supabase
      // Supabase doesn't handle raw Buffer objects well - they get JSON serialized
      const base64ImageData = thumbnailBuffer.toString('base64');
      console.log('Converted to base64:', base64ImageData.length, 'chars');
      
      const savePromise = supabase
        .from('dogify_images')
        .insert({
          image_data: base64ImageData, // Store as base64 string, not Buffer
          image_format: 'jpeg', // Always JPEG for consistency
          image_size: thumbnailBuffer.length, // Original binary size
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
