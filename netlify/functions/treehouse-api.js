// netlify/functions/treehouse-api.js
// Serves treehouse trends from Neon DB
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  try {
    // Get the latest entry
    const latest = await sql`
      SELECT scout_title, scout_desc, scout_signature, topics, created_at
      FROM treehouse_trends
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    if (!latest || latest.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, error: 'No trends found' })
      };
    }
    
    const row = latest[0];
    
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
    
    // Build response - include metadata with run ID
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