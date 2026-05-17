// netlify/functions/treehouse-settings.js
// Get/set key-value settings for the treehouse admin panel
const { neon } = require('@netlify/neon');

const sql = neon();

const ADMIN_PASSWORD = process.env.TREEHOUSE_ADMIN;

async function ensureSettingsTable() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS treehouse_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`;
    const existing = await sql`SELECT COUNT(*) FROM treehouse_settings`;
    if (existing[0].count === 0) {
      await sql`INSERT INTO treehouse_settings (key, value) VALUES ('wp_publishing_enabled', 'true')`;
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  await ensureSettingsTable();

  if (event.httpMethod === 'GET') {
    const rows = await sql`SELECT key, value FROM treehouse_settings ORDER BY key`;
    const settings = {};
    for (const row of rows) { settings[row.key] = row.value; }
    return { statusCode: 200, headers, body: JSON.stringify(settings) };
  }

  if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
    if (!authenticate(event.headers)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    let body = event.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    const { key, value } = body;
    if (!key) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing key' }) };
    }
    await sql`INSERT INTO treehouse_settings (key, value, updated_at)
      VALUES (${key}, ${String(value)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${String(value)}, updated_at = NOW()`;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};