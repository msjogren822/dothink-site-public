// netlify/functions/neon-connect.js
import { neon } from '@netlify/neon';

// no need to import or configure URLs—neon() reads from NETLIFY_DATABASE_URL
const sql = neon();

export async function handler() {
  try {
    // run a simple test query; replace `wispyt3` with your table
    const { rows } = await sql`SELECT id, datetime FROM wispyt3 ORDER BY id DESC LIMIT 1`;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, row: rows[0] || null }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
}
// netlify/functions/neon-connect.js
import { neon } from '@netlify/neon';

// no need to import or configure URLs—neon() reads from NETLIFY_DATABASE_URL
const sql = neon();

export async function handler() {
  try {
    // run a simple test query; replace `wispyt3` with your table
    const { rows } = await sql`SELECT id, datetime FROM wispyt3 ORDER BY id DESC LIMIT 1`;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, row: rows[0] || null }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
}
