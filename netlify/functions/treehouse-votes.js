// netlify/functions/treehouse-votes.js
// Handle votes on trends
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // GET: return all vote counts
    if (event.httpMethod === 'GET') {
      const rows = await sql`SELECT * FROM treehouse_trend_votes`;
      const votes = {};
      rows.forEach(r => { votes[r.trend_id] = { up: r.upvotes, down: r.downvotes }; });
      return { statusCode: 200, headers, body: JSON.stringify(votes) };
    }
    
    // POST: vote on a trend
    if (event.httpMethod === 'POST') {
      const { trend_id, vote } = JSON.parse(event.body); // vote = 'up' or 'down'
      if (!trend_id || !vote) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trend_id or vote' }) };
      }
      
      const col = vote === 'up' ? 'upvotes' : 'downvotes';
      
      // Upsert: add vote, create row if not exists
      await sql`
        INSERT INTO treehouse_trend_votes (trend_id, ${sql(col)}, 0)
        VALUES (${trend_id}, 1, 0)
        ON CONFLICT (trend_id) DO UPDATE SET 
          ${sql(col)} = treehouse_trend_votes.${sql(col)} + 1
      `;
      
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    
  } catch (e) {
    console.error('Vote error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};