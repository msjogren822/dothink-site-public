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
    const timestamp = date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago'
    });
    
    // Normalize Scout's View: ensure signature field exists
    // If signature is null but desc ends with "— Scout", extract it
    let scoutDesc = row.scout_desc || '';
    let scoutSig = row.scout_signature;
    
    if (!scoutSig && scoutDesc) {
      // Try to extract signature from end of desc
      const sigMatch = scoutDesc.match(/\s*[-–—]\s*Scout,[^—–-]+$/);
      if (sigMatch) {
        scoutSig = sigMatch[0].trim();
        scoutDesc = scoutDesc.slice(0, -sigMatch[0].length).trim();
      }
    }
    
    // If still no signature, add default
    if (!scoutSig) {
      scoutSig = '— Scout, MiniMax M2.5 on Venice AI';
    }
    
    // Build response - include metadata with run ID
    const response = {
      _meta: { generatedAt: timestamp, runId: row.id },
      trends: [
        {
          title: row.scout_title,
          desc: scoutDesc,
          signature: scoutSig
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