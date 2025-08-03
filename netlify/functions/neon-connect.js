// netlify/functions/neon-connect.js
const { neon } = require('@netlify/neon');

const sql = neon(); // reads NETLIFY_DATABASE_URL automatically

exports.handler = async function (event, context) {
  try {
    const { rows } = await sql`
      SELECT id, datetime
      FROM wispyt3
      ORDER BY id DESC
      LIMIT 1
    `;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, row: rows[0] || null }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
