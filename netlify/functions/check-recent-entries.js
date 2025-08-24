const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  console.log('Environment check:', {
    supabaseUrl: !!supabaseUrl,
    supabaseKey: !!supabaseKey
  });

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
    console.log('Querying recent entries...');
    
    // Get recent entries without image_data first
    const { data, error } = await supabase
      .from('dogify_images')
      .select('id, created_at, image_format, image_size')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Query error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }

    console.log('Found entries:', data?.length || 0);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entries: data }, null, 2)
    };

  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};
