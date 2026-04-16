// netlify/functions/treehouse-sources.js
// Admin API for managing scrape sources and categories
const { neon } = require('@netlify/neon');

const sql = neon();

const ADMIN_PASSWORD = process.env.TREEHOUSE_ADMIN;

const DEFAULT_CATEGORIES = ['GENERAL TECH', 'CRYPTO/ALT', 'STUFF THAT LOOKS GOOD'];

async function ensureTables() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_sources (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      category TEXT DEFAULT 'GENERAL TECH',
      is_rss BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS treehouse_categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`;
    // Seed default categories if empty
    const existing = await sql`SELECT COUNT(*) FROM treehouse_categories`;
    if (existing[0].count === 0) {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        await sql`INSERT INTO treehouse_categories (name, sort_order) VALUES (${DEFAULT_CATEGORIES[i]}, ${i})`;
      }
    }
  } catch (e) { /* ignore */ }
}

function authenticate(headers) {
  const auth = headers['authorization'] || headers['x-admin-password'];
  return auth === ADMIN_PASSWORD;
}

async function getValidCategory(category) {
  const cats = await sql`SELECT name FROM treehouse_categories ORDER BY sort_order`;
  const validCatNames = cats.map(r => r.name);
  return validCatNames.includes(category) ? category : validCatNames[0];
}

async function upsertSource(id, { name, url, enabled, category, is_rss }) {
  const updates = [];
  const vals = [];
  let paramIdx = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIdx++}`);
    vals.push(name);
  }
  if (url !== undefined) {
    updates.push(`url = $${paramIdx++}`);
    vals.push(url);
  }
  if (enabled !== undefined) {
    updates.push(`enabled = $${paramIdx++}`);
    vals.push(enabled);
  }
  if (category !== undefined) {
    const cat = await getValidCategory(category);
    updates.push(`category = $${paramIdx++}`);
    vals.push(cat);
  }
  if (is_rss !== undefined) {
    updates.push(`is_rss = $${paramIdx++}`);
    vals.push(is_rss === true);
  }

  if (updates.length > 0) {
    vals.push(parseInt(id));
    await sql.query(`UPDATE treehouse_sources SET ${updates.join(', ')} WHERE id = $${paramIdx}`, vals);
  }
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

  await ensureTables();

  // ---- CATEGORIES ----

  // GET: list categories
  if (event.httpMethod === 'GET' && event.resource === '/categories') {
    const rows = await sql`SELECT id, name, sort_order FROM treehouse_categories ORDER BY sort_order, name`;
    return { statusCode: 200, headers, body: JSON.stringify(rows) };
  }

  // POST: add category
  if (event.httpMethod === 'POST' && event.resource === '/categories') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { name } = body;
    if (!name || !name.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing category name' }) };
    }
    const catName = name.trim();
    const existing = await sql`SELECT id FROM treehouse_categories WHERE name = ${catName}`;
    if (existing.length > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Category already exists' }) };
    }
    const maxOrder = await sql`SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM treehouse_categories`;
    const result = await sql`INSERT INTO treehouse_categories (name, sort_order) VALUES (${catName}, ${maxOrder[0].next_order}) RETURNING id, name, sort_order`;
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, category: result[0] }) };
  }

  // DELETE: remove category
  if (event.httpMethod === 'DELETE' && event.resource === '/categories') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const params = new URLSearchParams(event.queryStringParameters);
    const id = params.get('id');
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }
    const used = await sql`SELECT COUNT(*) FROM treehouse_sources WHERE category = (SELECT name FROM treehouse_categories WHERE id = ${parseInt(id)})`;
    if (used[0].count > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: `Category is used by ${used[0].count} source(s). Reassign them first.` }) };
    }
    await sql`DELETE FROM treehouse_categories WHERE id = ${parseInt(id)}`;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // ---- SOURCES ----

  const SOURCE_COLS = 'id, name, url, enabled, category, is_rss, created_at';
  const SOURCE_RETURN = 'id, name, url, enabled, category, is_rss, created_at';

  // GET: list all sources (no auth required)
  if (event.httpMethod === 'GET' && event.resource === '/sources') {
    const rows = await sql`SELECT ${sql.unsafe(SOURCE_COLS)} FROM treehouse_sources ORDER BY category, name`;
    return { statusCode: 200, headers, body: JSON.stringify(rows) };
  }

  // POST: add source (requires auth)
  if (event.httpMethod === 'POST' && event.resource === '/sources') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { name, url, enabled, category, is_rss } = body;
    if (!name || !url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name or url' }) };
    }
    const cat = await getValidCategory(category);
    const result = await sql`INSERT INTO treehouse_sources (name, url, enabled, category, is_rss)
      VALUES (${name}, ${url}, ${enabled !== false}, ${cat}, ${is_rss === true})
      RETURNING ${sql.unsafe(SOURCE_RETURN)}`;
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, source: result[0] }) };
  }

  // PUT: update source (requires auth)
  if (event.httpMethod === 'PUT' && event.resource === '/sources') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { id } = body;
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }
    await upsertSource(id, body);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // DELETE: remove source (requires auth)
  if (event.httpMethod === 'DELETE' && event.resource === '/sources') {
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

  // Legacy fallback: old REST style without resource path
  // GET sources list
  if (event.httpMethod === 'GET' && !event.resource) {
    const rows = await sql`SELECT ${sql.unsafe(SOURCE_COLS)} FROM treehouse_sources ORDER BY category, name`;
    return { statusCode: 200, headers, body: JSON.stringify(rows) };
  }

  // Legacy POST /sources (no resource path)
  if (event.httpMethod === 'POST' && !event.resource) {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { name, url, enabled, category, is_rss } = body;
    if (!name || !url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name or url' }) };
    }
    const cat = await getValidCategory(category);
    const result = await sql`INSERT INTO treehouse_sources (name, url, enabled, category, is_rss)
      VALUES (${name}, ${url}, ${enabled !== false}, ${cat}, ${is_rss === true})
      RETURNING ${sql.unsafe(SOURCE_RETURN)}`;
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, source: result[0] }) };
  }

  // Legacy PUT /sources (no resource path)
  if (event.httpMethod === 'PUT' && !event.resource) {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { id } = body;
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }
    await upsertSource(id, body);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // Legacy DELETE /sources (no resource path)
  if (event.httpMethod === 'DELETE' && !event.resource) {
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
