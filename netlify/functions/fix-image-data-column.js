// netlify/functions/fix-image-data-column.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Fixing image_data column constraint...');
    
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

    // Test database connection first
    const { data: testData, error: testError } = await supabase
      .from('dogify_images')
      .select('id')
      .limit(1);

    if (testError) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Database connection failed',
          details: testError.message
        })
      };
    }

    // Return instructions for fixing the constraint
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false,
        message: 'Manual database update required',
        problem: 'The image_data column has a NOT NULL constraint that prevents storing images in Supabase Storage',
        solution: 'You need to make the image_data column nullable since we\'re now storing images in Supabase Storage instead of the database',
        instructions: {
          method1: 'Supabase Dashboard',
          steps1: [
            'Go to your Supabase dashboard',
            'Navigate to Database → Tables',
            'Find the dogify_images table', 
            'Click on the image_data column',
            'Edit the column and change "Is Nullable" to YES/TRUE',
            'Save the changes'
          ],
          method2: 'SQL Editor',
          sql: 'ALTER TABLE dogify_images ALTER COLUMN image_data DROP NOT NULL;',
          steps2: [
            'Go to Database → SQL Editor',
            'Run the SQL command above',
            'This will allow image_data to be null while we store images in Supabase Storage'
          ]
        },
        explanation: 'We\'re transitioning from storing binary image data in the database to storing images in Supabase Storage with just the URL in the database. This is better for performance and enables proper social media sharing.'
      })
    };

  } catch (error) {
    console.error('Fix column error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Function error',
        details: error.message,
        stack: error.stack
      })
    };
  }
}
