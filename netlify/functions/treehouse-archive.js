// netlify/functions/treehouse-archive.js
// Serves single archive entry from Neon DB
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  try {
    // Get ID from query param
    const params = new URLSearchParams(event.queryStringParameters);
    const id = params.get('id');
    
    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing id parameter' })
      };
    }
    
    // Get specific entry
    const rows = await sql`
      SELECT scout_title, scout_desc, scout_signature, topics, created_at
      FROM treehouse_trends
      WHERE id = ${id}
    `;
    
    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, error: 'Archive not found' })
      };
    }
    
    const row = rows[0];
    
    // Convert UTC to CST for display
    const date = new Date(row.created_at);
    date.setHours(date.getHours() - 6);
    const timestamp = date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const response = {
      _meta: { generatedAt: timestamp, runId: row.id },
      trends: [
        {
          title: row.scout_title,
          desc: row.scout_desc,
          signature: row.scout_signature
        },
        ...row.topics
      ]
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };
    
  } catch (e) {
    console.error('Database error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};