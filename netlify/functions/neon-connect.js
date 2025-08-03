// netlify/functions/neon-connect.js
const { neon } = require('@netlify/neon');

const sql = neon(); // reads NETLIFY_DATABASE_URL automatically

exports.handler = async function (event, context) {
  try {
    console.log('Starting database query...');
    
    const result = await sql`
      SELECT *
      FROM public.wispyt3
      ORDER BY id DESC
      LIMIT 3
    `;
    
    console.log('Query result:', JSON.stringify(result, null, 2));
    
    // Add defensive checking
    if (!result) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'No result returned from database',
          debug: { result }
        })
      };
    }

    // Handle array result directly
    if (Array.isArray(result)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          ok: true, 
          row: result[0] || null,
          debug: { 
            rowCount: result.length,
            resultType: 'array'
          }
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Unexpected result format',
        debug: { result }
      })
    };
  } catch (e) {
    console.error('Database error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: e.message,
        stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
        debug: { errorName: e.name }
      })
    };
  }
};
