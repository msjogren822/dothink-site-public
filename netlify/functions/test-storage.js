// netlify/functions/test-storage.js
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
    console.log('Testing Supabase Storage...');
    
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

    // Test 1: List buckets
    console.log('Step 1: Listing buckets...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Failed to list buckets',
          details: bucketsError.message
        })
      };
    }

    // Test 2: Check if dogify-bucket exists
    console.log('Step 2: Checking dogify-bucket...');
    const dogifyBucket = buckets.find(b => b.name === 'dogify-bucket');
    
    if (!dogifyBucket) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'dogify-bucket not found',
          availableBuckets: buckets.map(b => b.name)
        })
      };
    }

    // Test 3: Try to upload a small test file
    console.log('Step 3: Testing upload...');
    const testData = Buffer.from('test image data');
    const testFilename = `test-${Date.now()}.txt`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('dogify-bucket')
      .upload(testFilename, testData, {
        contentType: 'text/plain',
        cacheControl: '3600'
      });

    if (uploadError) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Upload test failed',
          details: uploadError.message,
          bucketInfo: dogifyBucket
        })
      };
    }

    // Test 4: Get public URL
    console.log('Step 4: Getting public URL...');
    const { data: urlData } = supabase.storage
      .from('dogify-bucket')
      .getPublicUrl(testFilename);

    // Test 5: Clean up test file
    console.log('Step 5: Cleaning up...');
    await supabase.storage
      .from('dogify-bucket')
      .remove([testFilename]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true,
        message: 'Storage tests passed',
        results: {
          bucketsFound: buckets.length,
          dogifyBucketExists: true,
          uploadSuccessful: true,
          testPublicUrl: urlData.publicUrl,
          bucketInfo: dogifyBucket
        }
      })
    };

  } catch (error) {
    console.error('Storage test error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Storage test failed',
        details: error.message,
        stack: error.stack
      })
    };
  }
}
