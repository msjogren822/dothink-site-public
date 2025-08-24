// netlify/functions/save-dogify-image.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async function(event, context) {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
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

      // Convert data URL to buffer and resize to 600x600
      const sharp = require('sharp');
      
      let imageBuffer;
      if (imageData.startsWith('data:image/')) {
        // Handle data URL
        const base64Data = imageData.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (imageData.startsWith('http')) {
        // Handle URL - fetch and convert
        const response = await fetch(imageData);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error('Unsupported image format');
      }

      // Resize to 600x600 and optimize
      const processedImage = await sharp(imageBuffer)
        .resize(600, 600, {
          fit: 'inside',
          withoutEnlargement: false,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      const metadata = await sharp(processedImage).metadata();

      // Save to Supabase
      const { data, error } = await supabase
        .from('dogify_images')
        .insert({
          image_data: processedImage,
          image_format: 'jpeg',
          image_size: processedImage.length,
          width: metadata.width,
          height: metadata.height,
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
          size: processedImage.length,
          dimensions: { width: metadata.width, height: metadata.height }
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
