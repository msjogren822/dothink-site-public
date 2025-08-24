const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Missing Supabase credentials',
        supabaseUrl: !!supabaseUrl,
        supabaseKey: !!supabaseKey
      })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get recent entries with data format info
    const { data, error } = await supabase
      .from('dogify_images')
      .select('id, created_at, image_format, image_size, image_data')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }

    // Analyze the data format
    const analysis = data.map(entry => {
      const imageData = entry.image_data;
      let format = 'unknown';
      let preview = '';
      
      if (typeof imageData === 'string') {
        if (imageData.startsWith('data:')) {
          format = 'data-url';
          preview = imageData.substring(0, 50);
        } else if (imageData.startsWith('/9j/') || imageData.startsWith('iVBOR')) {
          format = 'base64';
          preview = imageData.substring(0, 50);
        } else if (imageData.startsWith('\\x')) {
          format = 'hex-buffer';
          preview = imageData.substring(0, 50);
        } else {
          format = 'string-other';
          preview = imageData.substring(0, 50);
        }
      } else if (typeof imageData === 'object' && imageData.type === 'Buffer') {
        format = 'buffer-object';
        preview = `Buffer with ${imageData.data?.length || 0} bytes`;
      } else {
        format = typeof imageData;
        preview = String(imageData).substring(0, 50);
      }

      return {
        id: entry.id,
        created_at: entry.created_at,
        image_format: entry.image_format,
        image_size: entry.image_size,
        data_format: format,
        data_preview: preview,
        data_length: typeof imageData === 'string' ? imageData.length : 'N/A'
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entries: analysis }, null, 2)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
