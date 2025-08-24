// netlify/functions/test-supabase.js
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Check environment variables
    const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlStart: supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : 'missing',
      keyStart: supabaseKey ? supabaseKey.substring(0, 10) + '...' : 'missing'
    });

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Missing environment variables',
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey,
          availableEnvVars: Object.keys(process.env).filter(key => key.includes('SUPABASE'))
        })
      };
    }

    // Test Supabase connection
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('Testing Supabase connection...');
    
    // Try to list tables or get basic info
    const { data, error } = await supabase
      .from('dogify_images')
      .select('count', { count: 'exact', head: true });

    console.log('Supabase test result:', { data, error });

    if (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Supabase connection failed',
          details: error.message,
          code: error.code,
          hint: error.hint
        })
      };
    }

    // Test with a specific image ID if provided
    const testId = event.queryStringParameters?.id;
    let imageTest = null;
    
    if (testId) {
      const { data: imageData, error: imageError } = await supabase
        .from('dogify_images')
        .select('id, image_format, image_size, created_at')
        .eq('id', testId)
        .single();
        
      imageTest = {
        found: !!imageData,
        error: imageError?.message,
        metadata: imageData ? {
          id: imageData.id,
          format: imageData.image_format,
          size: imageData.image_size,
          created: imageData.created_at
        } : null
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Supabase connection working',
        tableExists: true,
        recordCount: data,
        imageTest: imageTest,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('Test function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Unexpected error',
        message: err.message,
        stack: err.stack
      })
    };
  }
}
