// netlify/functions/neon-connect.js
const { neon } = require('@netlify/neon');

const sql = neon(); // reads NETLIFY_DATABASE_URL automatically

exports.handler = async function (event, context) {
  try {
    const result = await sql`
      SELECT id, datetime
      FROM public.wispyt3
      ORDER BY id DESC
      LIMIT 1
    `;
    
    // Add defensive checking
    if (!result || !result.rows) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'No result or rows returned from database' 
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        row: result.rows[0] || null,
        debug: { rowCount: result.rows.length }
      })
    };
  } catch (e) {
    console.error('Database error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: e.message,
        stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
      })
    };
  }
};
