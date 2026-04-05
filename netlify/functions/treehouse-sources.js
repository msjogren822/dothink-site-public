// netlify/functions/treehouse-sources.js
// Admin API for managing scrape sources
const { neon } = require('@netlify/neon');

const sql = neon();

const ADMIN_PASSWORD = process.env.TREEHOUSE_ADMIN;

const VALID_CATEGORIES = ['GENERAL TECH', 'CRYPTO/ALT', 'STUFF THAT LOOKS GOOD'];

async function ensureTable() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_sources (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      category TEXT DEFAULT 'GENERAL TECH',
      created_at TIMESTAMP DEFAULT NOW()
    )`;
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  await ensureTable();

  // GET: list all sources (no auth required)
  if (event.httpMethod === 'GET') {
    const rows = await sql`SELECT id, name, url, enabled, category, created_at FROM treehouse_sources ORDER BY category, name`;
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

    const { name, url, enabled, category } = body;
    if (!name || !url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name or url' }) };
    }

    const cat = VALID_CATEGORIES.includes(category) ? category : 'GENERAL TECH';
    const result = await sql`INSERT INTO treehouse_sources (name, url, enabled, category) VALUES (${name}, ${url}, ${enabled !== false}, ${cat}) RETURNING id, name, url, enabled, category`;

    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, source: result[0] }) };
  }

  // PUT: update source (requires auth)
  if (event.httpMethod === 'PUT') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let body = event.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }

    const { id, name, url, enabled, category } = body;
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }

    const updates = [];
    if (name !== undefined) updates.push(sql`name = ${name}`);
    if (url !== undefined) updates.push(sql`url = ${url}`);
    if (enabled !== undefined) updates.push(sql`enabled = ${enabled}`);
    if (category !== undefined) {
      const cat = VALID_CATEGORIES.includes(category) ? category : 'GENERAL TECH';
      updates.push(sql`category = ${cat}`);
    }

    if (updates.length > 0) {
      await sql`UPDATE treehouse_sources SET ${updates} WHERE id = ${parseInt(id)}`;
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
