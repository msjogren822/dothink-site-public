// netlify/functions/treehouse-wikichunk.js
// Serves a pre-computed random Wikipedia article (updated every 4h via cron)
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  try {
    const latest = await sql`
      SELECT title, extract, content_urls, created_at
      FROM treehouse_wikichunk
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!latest || latest.length === 0) {
      // Fallback: fetch directly from Wikipedia
      const url = 'https://en.wikipedia.org/api/rest_v1/page/random/summary';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Wikipedia API unavailable');
      const data = await res.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          title: data.title,
          extract: data.extract,
          url: data.content_urls.desktop.page,
          refreshedAt: null,
          source: 'live'
        })
      };
    }

    const row = latest[0];
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        title: row.title,
        extract: row.extract,
        url: row.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title)}`,
        refreshedAt: row.created_at,
        source: 'cached'
      })
    };
  } catch (e) {
    console.error('Wikichunk error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};
