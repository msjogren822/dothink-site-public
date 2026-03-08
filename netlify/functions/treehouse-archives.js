// netlify/functions/treehouse-archives.js
// Serves archive list from Neon DB
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  try {
    const params = new URLSearchParams(event.queryStringParameters);
    const limit = parseInt(params.get('limit')) || null;
    const date = params.get('date'); // YYYY-MM-DD format
    
    let rows;
    
    if (date) {
      // Get all runs from a specific date (CST)
      // Parse the date and convert to UTC range
      const [year, month, day] = date.split('-').map(Number);
      // CST is UTC-6, so start of day CST = start of UTC day + 6 hours
      const startCST = new Date(year, month - 1, day, 0, 0, 0);
      const endCST = new Date(year, month - 1, day, 23, 59, 59);
      
      // Convert to UTC for DB query
      const startUTC = new Date(startCST.getTime() + 6 * 60 * 60 * 1000);
      const endUTC = new Date(endCST.getTime() + 6 * 60 * 60 * 1000);
      
      rows = await sql`
        SELECT id, scout_title, created_at
        FROM treehouse_trends
        WHERE created_at >= ${startUTC.toISOString()} AND created_at <= ${endUTC.toISOString()}
        ORDER BY created_at DESC
      `;
    } else {
      // Get recent runs (limited)
      if (limit) {
        rows = await sql`
          SELECT id, scout_title, created_at
          FROM treehouse_trends
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } else {
        rows = await sql`
          SELECT id, scout_title, created_at
          FROM treehouse_trends
          ORDER BY created_at DESC
        `;
      }
    }
    
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