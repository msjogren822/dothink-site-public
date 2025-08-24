// netlify/functions/debug-supabase.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  try {
    console.log('Testing Supabase connection...');
    
    const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlPreview: supabaseUrl?.substring(0, 30) + '...',
      keyPreview: supabaseKey?.substring(0, 10) + '...'
    });

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing environment variables',
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey
        })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client created');

    // Test basic connection
    const { count, error } = await supabase
      .from('dogify_images')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Supabase connection failed',
          details: error.message,
          code: error.code
        })
      };
    }

    console.log('Connection successful, total images:', count);

    // Get recent entries
    const { data: recent, error: recentError } = await supabase
      .from('dogify_images')
      .select('id, created_at, image_format, image_size')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      console.error('Recent query error:', recentError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Recent query failed',
          details: recentError.message
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true,
        totalImages: count,
        recentImages: recent
      }, null, 2)
    };

  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Handler exception',
        message: error.message,
        stack: error.stack
      })
    };
  }
}
