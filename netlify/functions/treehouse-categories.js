// netlify/functions/treehouse-categories.js
// Admin API for managing source categories
const { neon } = require('@netlify/neon');

const sql = neon();

const ADMIN_PASSWORD = process.env.TREEHOUSE_ADMIN;
const DEFAULT_CATEGORIES = ['GENERAL TECH', 'CRYPTO/ALT', 'STUFF THAT LOOKS GOOD'];

async function ensureTable() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    )`;
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

  // GET: list categories
  if (event.httpMethod === 'GET') {
    const rows = await sql`SELECT id, name, sort_order FROM treehouse_categories ORDER BY sort_order, name`;
    return { statusCode: 200, headers, body: JSON.stringify(rows) };
  }

  // POST: add category
  if (event.httpMethod === 'POST') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }
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
  if (event.httpMethod === 'DELETE') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const params = new URLSearchParams(event.queryStringParameters);
    const id = params.get('id');
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
    }
    // Check if any sources use this category
    const catRow = await sql`SELECT name FROM treehouse_categories WHERE id = ${parseInt(id)}`;
    if (catRow.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Category not found' }) };
    }
    const used = await sql`SELECT COUNT(*) FROM treehouse_sources WHERE category = ${catRow[0].name}`;
    if (used[0].count > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: `Category is used by ${used[0].count} source(s). Reassign them first.` }) };
    }
    await sql`DELETE FROM treehouse_categories WHERE id = ${parseInt(id)}`;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
