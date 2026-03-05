// netlify/functions/treehouse-comments.js
// Handle visitor comments
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  // Handle CORS
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
    if (event.httpMethod === 'GET') {
      // Get all comments, newest first
      const rows = await sql`
        SELECT id, name, message, created_at
        FROM treehouse_comments
        ORDER BY created_at DESC
        LIMIT 20
      `;
      
      const comments = rows.map(row => ({
        id: row.id,
        name: row.name || 'Anonymous',
        message: row.message,
        created_at: row.created_at
      }));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(comments)
      };
    }
    
    if (event.httpMethod === 'POST') {
      const { name, message } = JSON.parse(event.body);
      
      if (!message) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Message required' })
        };
      }
      
      const result = await sql`
        INSERT INTO treehouse_comments (name, message)
        VALUES (${name || null}, ${message})
        RETURNING id, created_at
      `;
      
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ ok: true, id: result[0].id })
      };
    }
    
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
    
  } catch (e) {
    console.error('Error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};