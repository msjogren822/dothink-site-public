// netlify/functions/migrate-db.js
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
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Adding new columns to dogify_images table...');

    // Add new columns for Supabase Storage URLs
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE dogify_images 
        ADD COLUMN IF NOT EXISTS image_url TEXT,
        ADD COLUMN IF NOT EXISTS storage_path TEXT;
      `
    });

    if (alterError) {
      console.error('Error adding columns:', alterError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Failed to add columns',
          details: alterError.message 
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        message: 'Database migration completed successfully',
        changes: [
          'Added image_url column to store Supabase Storage public URLs',
          'Added storage_path column to store filenames for cleanup'
        ]
      })
    };

  } catch (error) {
    console.error('Migration error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'Migration failed',
        details: error.message 
      })
    };
  }
}
