// netlify/functions/treehouse-votes.js
// Handle votes on trends with duplicate prevention
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
    // GET: return vote counts + user's votes
    if (event.httpMethod === 'GET') {
      // Check for user token in query string
      const url = new URL(event.rawUrl, 'https://localhost');
      const userToken = url.searchParams.get('user');
      
      try {
        // Get totals
        const rows = await sql`SELECT * FROM treehouse_trend_votes`;
        const votes = {};
        rows.forEach(r => { votes[r.trend_id] = { up: r.upvotes, down: r.downvotes }; });
        
        // Get user's votes if token provided
        let userVotes = {};
        if (userToken) {
          const userRows = await sql`SELECT trend_id, vote FROM treehouse_user_votes WHERE user_token = ${userToken}`;
          userRows.forEach(r => { userVotes[r.trend_id] = r.vote; });
        }
        
        return { statusCode: 200, headers, body: JSON.stringify({ votes, userVotes }) };
      } catch (e) {
        console.log('Votes table not ready:', e.message);
        return { statusCode: 200, headers, body: JSON.stringify({ votes: {}, userVotes: {} }) };
      }
    }
    
    // POST: vote on a trend
    if (event.httpMethod === 'POST') {
      let body = event.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      
      const { trend_id, vote, user_token } = body;
      
      if (trend_id === undefined || trend_id === null || !vote) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trend_id or vote' }) };
      }
      
      // Require user token to prevent spam
      if (!user_token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing user_token' }) };
      }
      
      // Check if user already voted on this trend
      const existing = await sql`SELECT vote FROM treehouse_user_votes WHERE user_token = ${user_token} AND trend_id = ${trend_id}`;
      if (existing.length > 0) {
        const prevVote = existing[0].vote;
        if (prevVote === vote) {
          return { statusCode: 409, headers, body: JSON.stringify({ error: 'Already voted', existingVote: prevVote }) };
        }
        // User switching vote: change from up to down or vice versa
        const change = vote === 'up' ? 1 : -1;
        await sql`
          UPDATE treehouse_trend_votes SET 
            upvotes = upvotes + ${change},
            downvotes = downvotes - ${change}
          WHERE trend_id = ${trend_id}
        `;
        await sql`UPDATE treehouse_user_votes SET vote = ${vote} WHERE user_token = ${user_token} AND trend_id = ${trend_id}`;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, changed: true, from: prevVote, to: vote }) };
      }
      
      // First time vote - create tables if needed and insert
      try {
        await sql`INSERT INTO treehouse_trend_votes (trend_id, upvotes, downvotes) VALUES (${trend_id}, ${vote === 'up' ? 1 : 0}, ${vote === 'down' ? 1 : 0}) ON CONFLICT (trend_id) DO UPDATE SET upvotes = treehouse_trend_votes.upvotes + ${vote === 'up' ? 1 : 0}, downvotes = treehouse_trend_votes.downvotes + ${vote === 'down' ? 1 : 0}`;
      } catch (e) {
        await sql`CREATE TABLE IF NOT EXISTS treehouse_trend_votes (trend_id INTEGER PRIMARY KEY, upvotes INTEGER DEFAULT 0, downvotes INTEGER DEFAULT 0)`;
        await sql`INSERT INTO treehouse_trend_votes (trend_id, upvotes, downvotes) VALUES (trend_id, 1, 0) ON CONFLICT (trend_id) DO UPDATE SET upvotes = treehouse_trend_votes.upvotes + 1`;
      }
      
      // Record user's vote
      try {
        await sql`INSERT INTO treehouse_user_votes (user_token, trend_id, vote, created_at) VALUES (${user_token}, ${trend_id}, ${vote}, NOW())`;
      } catch (e) {
        await sql`CREATE TABLE IF NOT EXISTS treehouse_user_votes (id SERIAL PRIMARY KEY, user_token TEXT NOT NULL, trend_id INTEGER NOT NULL, vote TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_token, trend_id))`;
        await sql`INSERT INTO treehouse_user_votes (user_token, trend_id, vote, created_at) VALUES (${user_token}, ${trend_id}, ${vote}, NOW())`;
      }
      
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, trend_id, vote }) };
    }
    
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    
  } catch (e) {
    console.error('Vote error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};