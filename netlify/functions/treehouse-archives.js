// netlify/functions/treehouse-archives.js
// Serves archive list from Neon DB
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  try {
    // Get all archives, newest first
    const rows = await sql`
      SELECT id, scout_title, created_at
      FROM treehouse_trends
      ORDER BY created_at DESC
    `;
    
    // Build archive list - convert UTC to CST (UTC-6)
    const archives = rows.map(row => {
      const date = new Date(row.created_at);
      // Convert from UTC to CST (America/Chicago is UTC-6)
      date.setHours(date.getHours() - 6);
      const label = date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return {
        file: `trends-${row.id}.json`,
        label: label,
        dbId: row.id
      };
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(archives)
    };
    
  } catch (e) {
    console.error('Database error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};