// netlify/functions/treehouse-sources.js
// Admin API for managing scrape sources
const { neon } = require('@netlify/neon');

const sql = neon();

// Admin password from environment variable
const ADMIN_PASSWORD = process.env.TREEHOUSE_ADMIN;

async function ensureTable() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_sources (id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, enabled BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())`;
  } catch (e) { /* ignore */ }
}

function authenticate(headers) {
  const auth = headers['authorization'] || headers['x-admin-password'];
  return auth === ADMIN_PASSWORD;
}

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  await ensureTable();

  // GET: list all sources (no auth required for viewing)
  if (event.httpMethod === 'GET') {
    const rows = await sql`SELECT id, name, url, enabled, created_at FROM treehouse_sources ORDER BY name`;
    return { statusCode: 200, headers, body: JSON.stringify(rows) };
  }

  // POST: add source (requires auth)
  if (event.httpMethod === 'POST') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    let body = event.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }
    
    const { name, url, enabled } = body;
    if (!name || !url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name or url' }) };
    }
    
    const result = await sql`INSERT INTO treehouse_sources (name, url, enabled) VALUES (${name}, ${url}, ${enabled !== false}) RETURNING id, name, url, enabled`;
    
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, source: result[0] }) };
  }

  // PUT: toggle//update source (requires auth)
  if (event.httpMethod === 'PUT') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    let body = event.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }
    
    const { id, name, url, enabled } = body;
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }
    
    if (name !== undefined || url !== undefined || enabled !== undefined) {
      // Build dynamic update
      const updates = [];
      if (name !== undefined) updates.push(sql`name = ${name}`);
      if (url !== undefined) updates.push(sql`url = ${url}`);
      if (enabled !== undefined) updates.push(sql`enabled = ${enabled}`);
      
      if (updates.length > 0) {
        await sql`UPDATE treehouse_sources SET ${updates} WHERE id = ${parseInt(id)}`;
      }
    }
    
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // DELETE: remove source (requires auth)
  if (event.httpMethod === 'DELETE') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    const params = new URLSearchParams(event.queryStringParameters);
    const id = params.get('id');
    
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }
    
    await sql`DELETE FROM treehouse_sources WHERE id = ${parseInt(id)}`;
    
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};