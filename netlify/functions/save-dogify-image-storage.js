// netlify/functions/save-dogify-image-storage.js
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
    console.error('Missing Supabase environment variables');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Image saving service not configured'
      })
    };
  }

  try {
    console.log('Storage function called with method:', event.httpMethod);
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (event.httpMethod === 'POST') {
      console.log('Processing POST request...');
      
      // Save a new dogified image
      const { 
        imageData, 
        sceneAnalysis, 
        generationPrompt, 
        modelUsed, 
        generationTimeSeconds,
        userSession 
      } = JSON.parse(event.body);

      console.log('Parsed request data:', {
        hasImageData: !!imageData,
        imageDataType: typeof imageData,
        imageDataLength: imageData?.length || 0,
        hasSceneAnalysis: !!sceneAnalysis,
        modelUsed
      });

      if (!imageData) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'Missing imageData' })
        };
      }

      let imageBuffer;

      if (imageData.startsWith('data:image/')) {
        // Handle data URL
        console.log('Processing data URL, length:', imageData.length);
        const base64Data = imageData.split(',')[1];
        if (!base64Data) {
          throw new Error('Invalid data URL - no base64 data found');
        }
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (imageData.startsWith('http')) {
        // Handle URL - fetch and convert
        console.log('Fetching image from URL:', imageData);
        const response = await fetch(imageData);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      } else {
        throw new Error('imageData must be a data URL or HTTP URL');
      }

      // Validate image size
      const maxSize = 1.5 * 1024 * 1024; // 1.5MB max
      if (imageBuffer.length > maxSize) {
        return {
          statusCode: 413,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Image too large', 
            details: `Image size ${Math.round(imageBuffer.length / 1024)}KB exceeds 1.5MB limit.` 
          })
        };
      }

      // Validate image headers 
      const firstBytes = imageBuffer.slice(0, 4);
      const isJPEG = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8;
      const isPNG = firstBytes[0] === 0x89 && firstBytes[1] === 0x50;
      
      if (!isJPEG && !isPNG) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Invalid image format',
            details: 'Only JPEG and PNG images are supported'
          })
        };
      }

      // Generate unique filename
      const imageId = crypto.randomUUID();
      const filename = `${imageId}.jpg`;

      console.log('Uploading to Supabase Storage:', {
        bucket: 'dogify-bucket',
        filename: filename,
        bufferSize: imageBuffer.length
      });

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('dogify-bucket')
        .upload(filename, imageBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Failed to upload image',
            details: uploadError.message
          })
        };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('dogify-bucket')
        .getPublicUrl(filename);

      const publicUrl = urlData.publicUrl;
      console.log('Image uploaded, public URL:', publicUrl);

      // Save metadata to database (with fallback for missing columns)
      console.log('Saving metadata to database...');
      
      // First, try to insert with new columns
      let dbData, dbError;
      try {
        const result = await supabase
          .from('dogify_images')
          .insert({
            id: imageId,
            image_url: publicUrl, // Store the public URL instead of binary data
            storage_path: filename, // Store filename for cleanup
            image_format: 'jpeg',
            image_size: imageBuffer.length,
            width: 600,
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
        
        dbData = result.data;
        dbError = result.error;
      } catch (insertError) {
        console.log('Insert with new columns failed, trying fallback...', insertError.message);
        
        // Fallback: insert without the new columns (for backwards compatibility)
        const fallbackResult = await supabase
          .from('dogify_images')
          .insert({
            id: imageId,
            image_data: null, // Don't store binary data anymore
            image_format: 'jpeg',
            image_size: imageBuffer.length,
            width: 600,
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
        
        dbData = fallbackResult.data;
        dbError = fallbackResult.error;
      }

      if (dbError) {
        console.error('Database insert error:', dbError);
        // Try to clean up the uploaded file
        await supabase.storage
          .from('dogify-bucket')
          .remove([filename]);
        
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'Failed to save image metadata',
            details: dbError.message
          })
        };
      }

      console.log('Image saved successfully:', {
        id: imageId,
        url: publicUrl,
        size: `${Math.round(imageBuffer.length / 1024)}KB`
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true, 
          id: imageId,
          url: publicUrl,
          size: imageBuffer.length,
          message: 'Image saved successfully' 
        })
      };

    } else {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ ok: false, error: 'Method not allowed' })
      };
    }

  } catch (error) {
    console.error('Save function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
}
