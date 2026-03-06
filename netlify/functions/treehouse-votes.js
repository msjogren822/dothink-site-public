// netlify/functions/treehouse-votes.js
// Handle votes on trends with duplicate prevention
const { neon } = require('@netlify/neon');

const sql = neon();

async function ensureTables() {
  // Create tables if they don't exist - now using URL as key
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_trend_votes (trend_url TEXT PRIMARY KEY, upvotes INTEGER DEFAULT 0, downvotes INTEGER DEFAULT 0)`;
  } catch (e) { /* ignore */ }
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_user_votes (id SERIAL PRIMARY KEY, user_token TEXT NOT NULL, trend_url TEXT NOT NULL, vote TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_token, trend_url))`;
  } catch (e) { /* ignore */ }
}

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
    // Ensure tables exist
    await ensureTables();
    
    // GET: return vote counts + user's votes
    if (event.httpMethod === 'GET') {
      // Accept trend_url param instead of index
      const url = new URL(event.rawUrl, 'https://localhost');
      const userToken = url.searchParams.get('user');
      const trendUrl = url.searchParams.get('url'); // NEW: lookup by URL
      
      // If querying by URL, return that specific vote
      if (trendUrl) {
        const rows = await sql`SELECT * FROM treehouse_trend_votes WHERE trend_url = ${trendUrl}`;
        const vote = rows.length > 0 ? { up: rows[0].upvotes, down: rows[0].downvotes } : { up: 0, down: 0 };
        
        let userVote = null;
        if (userToken) {
          const userRow = await sql`SELECT vote FROM treehouse_user_votes WHERE user_token = ${userToken} AND trend_url = ${trendUrl}`;
          if (userRow.length > 0) userVote = userRow[0].vote;
        }
        return { statusCode: 200, headers, body: JSON.stringify({ votes: vote, userVote }) };
      }
      
      // Otherwise return all votes keyed by URL
      const rows = await sql`SELECT * FROM treehouse_trend_votes`;
      const votes = {};
      rows.forEach(r => { votes[r.trend_url] = { up: r.upvotes, down: r.downvotes }; });
      
      let userVotes = {};
      if (userToken) {
        const userRows = await sql`SELECT trend_url, vote FROM treehouse_user_votes WHERE user_token = ${userToken}`;
        userRows.forEach(r => { userVotes[r.trend_url] = r.vote; });
      }
      
      return { statusCode: 200, headers, body: JSON.stringify({ votes, userVotes }) };
    }
    
    // POST: vote on a trend
    if (event.httpMethod === 'POST') {
      let body = event.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      
      // Accept either trend_id (legacy) or trend_url
      const { trend_id, vote, user_token, trend_url } = body;
      const targetUrl = trend_url || `trend_${trend_id}`; // fallback for old clients
      
      if (!targetUrl || !vote) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trend_url or vote' }) };
      }
      
      if (!user_token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing user_token' }) };
      }
      
      // Check if user already voted
      const existing = await sql`SELECT vote FROM treehouse_user_votes WHERE user_token = ${user_token} AND trend_url = ${targetUrl}`;
      if (existing.length > 0) {
        const prevVote = existing[0].vote;
        if (prevVote === vote) {
          return { statusCode: 409, headers, body: JSON.stringify({ error: 'Already voted', existingVote: prevVote }) };
        }
        // Switch vote
        const change = vote === 'up' ? 1 : -1;
        await sql`UPDATE treehouse_trend_votes SET upvotes = upvotes + ${change}, downvotes = downvotes - ${change} WHERE trend_url = ${targetUrl}`;
        await sql`UPDATE treehouse_user_votes SET vote = ${vote} WHERE user_token = ${user_token} AND trend_url = ${targetUrl}`;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, changed: true, from: prevVote, to: vote }) };
      }
      
      // Insert vote
      await sql`INSERT INTO treehouse_trend_votes (trend_url, upvotes, downvotes) VALUES (${targetUrl}, ${vote === 'up' ? 1 : 0}, ${vote === 'down' ? 1 : 0}) ON CONFLICT (trend_url) DO UPDATE SET upvotes = treehouse_trend_votes.upvotes + ${vote === 'up' ? 1 : 0}, downvotes = treehouse_trend_votes.downvotes + ${vote === 'down' ? 1 : 0}`;
      
      // Record user vote
      await sql`INSERT INTO treehouse_user_votes (user_token, trend_url, vote, created_at) VALUES (${user_token}, ${targetUrl}, ${vote}, NOW())`;
      
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, trend_url: targetUrl, vote }) };
    }
    
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    
  } catch (e) {
    console.error('Vote error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};