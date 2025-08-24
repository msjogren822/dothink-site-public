// netlify/functions/inspect-image-data.js
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const imageId = event.queryStringParameters?.id;
    if (!imageId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing image ID' })
      };
    }

    const supabase = createClient(
      process.env.SUPABASE_DATABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('dogify_images')
      .select('image_data, image_format, image_size')
      .eq('id', imageId)
      .single();

    if (error || !data) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Image not found' })
      };
    }

    // Analyze the actual data
    const imageData = data.image_data;
    let analysis = {
      dataType: typeof imageData,
      dataLength: imageData?.length || 0,
      isBuffer: Buffer.isBuffer(imageData),
      format: data.image_format,
      storedSize: data.image_size
    };

    if (typeof imageData === 'string') {
      analysis.stringDetails = {
        firstChars: imageData.substring(0, 50),
        lastChars: imageData.substring(imageData.length - 50),
        startsWithDataUrl: imageData.startsWith('data:'),
        startsWithSlash: imageData.startsWith('/'),
        includesBase64: imageData.includes('base64'),
        charCodes: imageData.substring(0, 20).split('').map(c => c.charCodeAt(0))
      };

      // Try to detect what kind of string this is
      if (imageData.startsWith('data:image/')) {
        analysis.detectedType = 'data_url';
        const base64Part = imageData.split(',')[1];
        if (base64Part) {
          analysis.base64Length = base64Part.length;
          try {
            const buffer = Buffer.from(base64Part, 'base64');
            analysis.decodedLength = buffer.length;
            analysis.jpegHeader = buffer.slice(0, 4).toString('hex') === 'ffd8ffe0' || buffer.slice(0, 2).toString('hex') === 'ffd8';
            analysis.pngHeader = buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
          } catch (e) {
            analysis.decodeError = e.message;
          }
        }
      } else {
        analysis.detectedType = 'unknown_string';
        // Try to decode as base64 directly
        try {
          const buffer = Buffer.from(imageData, 'base64');
          analysis.directBase64 = {
            decodedLength: buffer.length,
            jpegHeader: buffer.slice(0, 4).toString('hex') === 'ffd8ffe0' || buffer.slice(0, 2).toString('hex') === 'ffd8',
            pngHeader: buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a',
            firstBytesHex: buffer.slice(0, 10).toString('hex')
          };
        } catch (e) {
          analysis.directBase64Error = e.message;
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(analysis, null, 2)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Inspection failed',
        message: err.message
      })
    };
  }
}
