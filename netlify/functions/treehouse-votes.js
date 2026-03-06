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
      try {
        const rows = await sql`SELECT * FROM treehouse_trend_votes`;
        const votes = {};
        rows.forEach(r => { votes[r.trend_id] = { up: r.upvotes, down: r.downvotes }; });
        return { statusCode: 200, headers, body: JSON.stringify(votes) };
      } catch (e) {
        // Table might not exist yet - return empty
        console.log('Votes table not ready:', e.message);
        return { statusCode: 200, headers, body: JSON.stringify({}) };
      }
    }
    
    // POST: vote on a trend
    if (event.httpMethod === 'POST') {
      let body = event.body;
      // Handle JSON string or already-parsed
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      
      const { trend_id, vote } = body;
      console.log('Vote request:', { trend_id, vote, body: event.body });
      
      if (!trend_id || !vote) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trend_id or vote' }) };
      }
      
      const col = vote === 'up' ? 'upvotes' : 'downvotes';
      
      // Try to insert, create table if not exists
      try {
        await sql`
          INSERT INTO treehouse_trend_votes (trend_id, upvotes, downvotes)
          VALUES (${trend_id}, ${vote === 'up' ? 1 : 0}, ${vote === 'down' ? 1 : 0})
          ON CONFLICT (trend_id) DO UPDATE SET 
            upvotes = treehouse_trend_votes.upvotes + ${vote === 'up' ? 1 : 0},
            downvotes = treehouse_trend_votes.downvotes + ${vote === 'down' ? 1 : 0}
        `;
      } catch (e) {
        // Table might not exist - create it and retry
        console.log('Creating votes table:', e.message);
        await sql`
          CREATE TABLE IF NOT EXISTS treehouse_trend_votes (
            trend_id INTEGER PRIMARY KEY,
            upvotes INTEGER DEFAULT 0,
            downvotes INTEGER DEFAULT 0
          )
        `;
        // Retry the insert
        await sql`
          INSERT INTO treehouse_trend_votes (trend_id, upvotes, downvotes)
          VALUES (${trend_id}, ${vote === 'up' ? 1 : 0}, ${vote === 'down' ? 1 : 0})
          ON CONFLICT (trend_id) DO UPDATE SET 
            upvotes = treehouse_trend_votes.upvotes + ${vote === 'up' ? 1 : 0},
            downvotes = treehouse_trend_votes.downvotes + ${vote === 'down' ? 1 : 0}
        `;
      }
      
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, trend_id, vote }) };
    }
    
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    
  } catch (e) {
    console.error('Vote error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message, stack: e.stack }) };
  }
};