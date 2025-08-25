// netlify/functions/add-storage-columns.js
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

    console.log('Adding storage columns to dogify_images table...');

    // First, let's check the current table structure
    const { data: tableInfo, error: infoError } = await supabase
      .from('dogify_images')
      .select('*')
      .limit(1);

    if (infoError) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Could not access table',
          details: infoError.message
        })
      };
    }

    // Try using a raw SQL approach with rpc
    console.log('Attempting to add columns using SQL...');
    
    // Method 1: Try using supabase.rpc with a custom function
    // This won't work unless we create the function first, but let's try anyway
    const { data: rpcData, error: rpcError } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE dogify_images 
        ADD COLUMN IF NOT EXISTS image_url TEXT,
        ADD COLUMN IF NOT EXISTS storage_path TEXT;
      `
    });

    if (!rpcError) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true,
          message: 'Columns added successfully via RPC',
          method: 'rpc'
        })
      };
    }

    console.log('RPC method failed:', rpcError.message);

    // Method 2: Try direct PostgreSQL client approach
    // This requires a different library, but let's try with raw fetch to Supabase's REST API
    const authHeader = `Bearer ${supabaseKey}`;
    const supabaseProjectUrl = supabaseUrl.replace('/rest/v1', '');
    
    const sqlEndpoint = `${supabaseProjectUrl}/rest/v1/rpc/exec`;
    
    const sqlResponse = await fetch(sqlEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sql: `
          ALTER TABLE dogify_images 
          ADD COLUMN IF NOT EXISTS image_url TEXT,
          ADD COLUMN IF NOT EXISTS storage_path TEXT;
        `
      })
    });

    if (sqlResponse.ok) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true,
          message: 'Columns added successfully via direct SQL',
          method: 'direct-sql'
        })
      };
    }

    const sqlError = await sqlResponse.text();
    console.log('Direct SQL failed:', sqlError);

    // If both methods fail, return helpful instructions
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false,
        message: 'Automatic column addition failed - manual setup required',
        instructions: {
          step1: 'Go to your Supabase dashboard',
          step2: 'Navigate to Database → Tables',
          step3: 'Find the dogify_images table',
          step4: 'Click + Add Column and add these two columns:',
          columns: [
            { name: 'image_url', type: 'text', nullable: true },
            { name: 'storage_path', type: 'text', nullable: true }
          ]
        },
        sql: 'ALTER TABLE dogify_images ADD COLUMN IF NOT EXISTS image_url TEXT, ADD COLUMN IF NOT EXISTS storage_path TEXT;',
        errors: {
          rpc: rpcError?.message,
          directSql: sqlError
        }
      })
    };

  } catch (error) {
    console.error('Column addition error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to add columns',
        details: error.message
      })
    };
  }
}
