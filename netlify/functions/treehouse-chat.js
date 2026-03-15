const { Client } = require('pg');

const NEON_CONN = process.env.NEON_CONN;
const DISCORD_CHANNEL_ID = "1300111966144041014"; // #general
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

exports.handler = async (event, context) => {
    if (event.httpMethod === 'GET') {
        // Poll for bot response
        return handlePoll(event, context);
    }
    
    if (event.httpMethod === 'POST') {
        // Send new message
        return handleSend(event, context);
    }
    
    return { statusCode: 405, body: 'Method not allowed' };
};

async function handleSend(event, context) {
    let body = event.body || '{}';
    let message, userToken;
    try {
        ({ message, userToken } = JSON.parse(body));
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON: ' + e.message }) };
    }
    
    if (!message || !userToken) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing message or userToken', received: { message, userToken } }) };
    }
    
    const client = new Client(NEON_CONN);
    try {
        await client.connect();
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'DB connect failed: ' + e.message }) };
    }
    
    try {
        // Check if busy
        const stateResult = await client.query('SELECT * FROM treehouse_chat_state WHERE id = 1');
        const state = stateResult.rows[0];
        
        if (state && state.is_busy) {
            // Check if same user
            if (state."current_user" === userToken) {
                // Same user, allow continue
            } else {
                // Different user, busy
                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        status: 'busy',
                        message: "I'm talking to someone right now. Hang on!"
                    })
                };
            }
        }
        
        // Set busy state
        await client.query(`
            UPDATE treehouse_chat_state 
            SET is_busy = TRUE, 
                conversation_start = NOW(), 
                "current_user" = $1,
                updated_at = NOW()
            WHERE id = 1
        `, [userToken]);
        
        // Save message
        const msgResult = await client.query(`
            INSERT INTO treehouse_chat_messages (user_message, user_token)
            VALUES ($1, $2)
            RETURNING id
        `, [message, userToken]);
        
        const messageId = msgResult.rows[0].id;
        
        // Send to Discord
        if (DISCORD_BOT_TOKEN) {
            try {
                await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: `💬 Chat from web: "${message}" (user: ${userToken.slice(0,8)}...)`
                    })
                });
            } catch (discordErr) {
                console.error('Discord send error:', discordErr);
            }
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                status: 'sent',
                messageId,
                conversationStarted: true
            })
        };
        
    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    } finally {
        await client.end();
    }
}

async function handlePoll(event, context) {
    const urlParams = new URLSearchParams(event.queryStringParameters);
    const userToken = urlParams.get('userToken');
    
    if (!userToken) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing userToken' }) };
    }
    
    const client = new Client(NEON_CONN);
    await client.connect();
    
    try {
        // Get latest bot response for this user
        const result = await client.query(`
            SELECT * FROM treehouse_chat_messages 
            WHERE user_token = $1 AND bot_response IS NOT NULL
            ORDER BY created_at DESC 
            LIMIT 1
        `, [userToken]);
        
        // Get state
        const stateResult = await client.query('SELECT * FROM treehouse_chat_state WHERE id = 1');
        const state = stateResult.rows[0];
        
        // Check timeout (5 minutes)
        const timeoutMs = 5 * 60 * 1000;
        const isTimedOut = state && state.conversation_start && 
            (Date.now() - new Date(state.conversation_start).getTime()) > timeoutMs;
        
        // If timed out or different user, clear busy
        if (isTimedOut || (state && state."current_user" !== userToken)) {
            await client.query(`
                UPDATE treehouse_chat_state 
                SET is_busy = FALSE, "current_user" = NULL, updated_at = NOW()
                WHERE id = 1
            `);
        }
        
        if (result.rows.length > 0) {
            const botMsg = result.rows[0];
            return {
                statusCode: 200,
                body: JSON.stringify({
                    hasResponse: true,
                    response: botMsg.bot_response,
                    respondedAt: botMsg.replied_at
                })
            };
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                hasResponse: false,
                isBusy: state ? state.is_busy : false,
                isMyConversation: state && state."current_user" === userToken,
                timedOut: isTimedOut
            })
        };
        
    } catch (err) {
        console.error('Poll error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    } finally {
        await client.end();
    }
}