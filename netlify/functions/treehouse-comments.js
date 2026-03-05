// netlify/functions/treehouse-comments.js
// Handle visitor comments with moderation
const { neon } = require('@netlify/neon');

const sql = neon();

exports.handler = async function(event, context) {
  // Handle CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // GET: only show APPROVED comments
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT id, name, message, created_at
        FROM treehouse_comments
        WHERE approved = true
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
    
    // POST: add comment (starts as pending/approved=false)
    if (event.httpMethod === 'POST') {
      const { name, message } = JSON.parse(event.body);
      
      if (!message) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Message required' })
        };
      }
      
      // Always save as approved=false initially (pending moderation)
      const result = await sql`
        INSERT INTO treehouse_comments (name, message, approved)
        VALUES (${name || null}, ${message}, false)
        RETURNING id, created_at
      `;
      
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ ok: true, id: result[0].id, pending: true })
      };
    }
    
    // DELETE: moderate (approve/remove) - for admin use
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body);
      
      // Actually delete the comment
      await sql`DELETE FROM treehouse_comments WHERE id = ${id}`;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true })
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