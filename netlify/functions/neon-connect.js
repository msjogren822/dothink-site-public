// netlify/functions/neon-connect.js
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function (event, context) {
  try {
    console.log('Starting database query...');
    
    const result = await sql`
      SELECT *
      FROM public.wispyt3
      ORDER BY id DESC
    `; // Removed LIMIT 3
    
    console.log('Query result:', JSON.stringify(result, null, 2));
    
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

    if (Array.isArray(result)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          ok: true, 
          rows: result, // Changed to return all rows
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
