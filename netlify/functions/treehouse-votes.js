// netlify/functions/treehouse-votes.js
// Handle votes on trends with run-specific isolation
const { neon } = require('@netlify/neon');

const sql = neon();

const ALLOWED_REASONS = new Set([
  // 👍 reasons
  'insightful',
  'useful',
  'hot',
  // 👎 reasons
  'boring',
  'duplicate',
  'clickbait',
]);

async function ensureTables() {
  // Check if old schema exists (without run_id) and migrate
  try {
    const oldTable = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'treehouse_trend_votes' AND column_name = 'upvotes'`;
    if (oldTable.length > 0) {
      // Check if run_id column exists
      const hasRunId = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'treehouse_trend_votes' AND column_name = 'run_id'`;
      if (hasRunId.length === 0) {
        // Old schema - drop and recreate
        console.log('Migrating votes table to new schema...');
        await sql`DROP TABLE IF EXISTS treehouse_user_votes`;
        await sql`DROP TABLE IF EXISTS treehouse_trend_votes`;
      }
    }
  } catch (e) {
    console.log('Migration check:', e.message);
  }
  
  // Create tables if they don't exist - now using run_id + URL as key
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_trend_votes (run_id INTEGER NOT NULL, trend_url TEXT NOT NULL, upvotes INTEGER DEFAULT 0, downvotes INTEGER DEFAULT 0, PRIMARY KEY(run_id, trend_url))`;
  } catch (e) { /* ignore */ }
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_user_votes (id SERIAL PRIMARY KEY, user_token TEXT NOT NULL, run_id INTEGER NOT NULL, trend_url TEXT NOT NULL, vote TEXT NOT NULL, reason TEXT, reason_set_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_token, run_id, trend_url))`;
  } catch (e) { /* ignore */ }

  // Best-effort additive migration for existing tables.
  try { await sql`ALTER TABLE treehouse_user_votes ADD COLUMN IF NOT EXISTS reason TEXT`; } catch (e) { /* ignore */ }
  try { await sql`ALTER TABLE treehouse_user_votes ADD COLUMN IF NOT EXISTS reason_set_at TIMESTAMP`; } catch (e) { /* ignore */ }
}

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Ensure tables exist
    await ensureTables();
    
    // GET: return vote counts + user's votes for a specific run
    if (event.httpMethod === 'GET') {
      const url = new URL(event.rawUrl, 'https://localhost');
      const userToken = url.searchParams.get('user');
      const runId = url.searchParams.get('run_id'); // NEW: required run_id
      const trendUrl = url.searchParams.get('url');
      
      if (!runId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing run_id parameter' }) };
      }
      
      const runIdInt = parseInt(runId, 10);
      
      // If querying by specific URL, return that vote
      if (trendUrl) {
        const rows = await sql`SELECT * FROM treehouse_trend_votes WHERE run_id = ${runIdInt} AND trend_url = ${trendUrl}`;
        const vote = rows.length > 0 ? { up: rows[0].upvotes, down: rows[0].downvotes } : { up: 0, down: 0 };
        
        let userVote = null;
        if (userToken) {
          const userRow = await sql`SELECT vote FROM treehouse_user_votes WHERE user_token = ${userToken} AND run_id = ${runIdInt} AND trend_url = ${trendUrl}`;
          if (userRow.length > 0) userVote = userRow[0].vote;
        }
        return { statusCode: 200, headers, body: JSON.stringify({ votes: vote, userVote }) };
      }
      
      // Otherwise return all votes for this run
      const rows = await sql`SELECT * FROM treehouse_trend_votes WHERE run_id = ${runIdInt}`;
      const votes = {};
      rows.forEach(r => { votes[r.trend_url] = { up: r.upvotes, down: r.downvotes }; });
      
      let userVotes = {};
      if (userToken) {
        const userRows = await sql`SELECT trend_url, vote FROM treehouse_user_votes WHERE user_token = ${userToken} AND run_id = ${runIdInt}`;
        userRows.forEach(r => { userVotes[r.trend_url] = r.vote; });
      }
      
      return { statusCode: 200, headers, body: JSON.stringify({ votes, userVotes }) };
    }

    // PUT: set a reason for an existing user vote (does NOT change counts)
    if (event.httpMethod === 'PUT') {
      let body = event.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }

      const { user_token, trend_url, run_id, reason } = body;
      const targetUrl = trend_url;
      const runId = run_id;

      if (!user_token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing user_token' }) };
      }

      if (!runId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing run_id' }) };
      }

      if (!targetUrl) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trend_url' }) };
      }

      const runIdInt = parseInt(runId, 10);
      if (Number.isNaN(runIdInt)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid run_id' }) };
      }

      const normalizedReason = (typeof reason === 'string' ? reason.trim() : '');
      if (!ALLOWED_REASONS.has(normalizedReason)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid reason', allowed: Array.from(ALLOWED_REASONS) })
        };
      }

      const updated = await sql`
        UPDATE treehouse_user_votes
        SET reason = ${normalizedReason}, reason_set_at = NOW()
        WHERE user_token = ${user_token} AND run_id = ${runIdInt} AND trend_url = ${targetUrl}
        RETURNING vote, reason, reason_set_at
      `;

      if (!updated || updated.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Vote not found' }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...updated[0] }) };
    }
    
    // POST: vote on a trend
    if (event.httpMethod === 'POST') {
      let body = event.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
      }
      
      const { trend_id, vote, user_token, trend_url, run_id } = body;
      const targetUrl = trend_url || `trend_${trend_id}`;
      const runId = run_id; // Required: which batch this vote belongs to
      
      if (!targetUrl || !vote) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trend_url or vote' }) };
      }
      
      if (!user_token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing user_token' }) };
      }
      
      if (!runId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing run_id - which batch is this vote for?' }) };
      }
      
      const runIdInt = parseInt(runId, 10);
      
      // Check if user already voted on this run+url combo
      const existing = await sql`SELECT vote FROM treehouse_user_votes WHERE user_token = ${user_token} AND run_id = ${runIdInt} AND trend_url = ${targetUrl}`;
      if (existing.length > 0) {
        const prevVote = existing[0].vote;
        if (prevVote === vote) {
          // Toggle off: second click on the same vote clears it.
          await sql`DELETE FROM treehouse_user_votes WHERE user_token = ${user_token} AND run_id = ${runIdInt} AND trend_url = ${targetUrl}`;
          if (vote === 'up') {
            await sql`UPDATE treehouse_trend_votes SET upvotes = GREATEST(upvotes - 1, 0) WHERE run_id = ${runIdInt} AND trend_url = ${targetUrl}`;
          } else if (vote === 'down') {
            await sql`UPDATE treehouse_trend_votes SET downvotes = GREATEST(downvotes - 1, 0) WHERE run_id = ${runIdInt} AND trend_url = ${targetUrl}`;
          }
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cleared: true, from: prevVote }) };
        }
        // Switch vote
        const change = vote === 'up' ? 1 : -1;
        await sql`UPDATE treehouse_trend_votes SET upvotes = upvotes + ${change}, downvotes = downvotes - ${change} WHERE run_id = ${runIdInt} AND trend_url = ${targetUrl}`;
        await sql`UPDATE treehouse_user_votes SET vote = ${vote} WHERE user_token = ${user_token} AND run_id = ${runIdInt} AND trend_url = ${targetUrl}`;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, changed: true, from: prevVote, to: vote }) };
      }
      
      // Insert vote
      await sql`INSERT INTO treehouse_trend_votes (run_id, trend_url, upvotes, downvotes) VALUES (${runIdInt}, ${targetUrl}, ${vote === 'up' ? 1 : 0}, ${vote === 'down' ? 1 : 0}) ON CONFLICT (run_id, trend_url) DO UPDATE SET upvotes = treehouse_trend_votes.upvotes + ${vote === 'up' ? 1 : 0}, downvotes = treehouse_trend_votes.downvotes + ${vote === 'down' ? 1 : 0}`;
      
      // Record user vote
      await sql`INSERT INTO treehouse_user_votes (user_token, run_id, trend_url, vote, created_at) VALUES (${user_token}, ${runIdInt}, ${targetUrl}, ${vote}, NOW())`;
      
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, run_id: runIdInt, trend_url: targetUrl, vote }) };
    }
    
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    
  } catch (e) {
    console.error('Vote error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
