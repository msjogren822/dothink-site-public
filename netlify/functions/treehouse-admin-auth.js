const ADMIN_PASSWORD = process.env.TREEHOUSE_ADMIN;

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }
    
    const { password } = JSON.parse(event.body || '{}');
    
    if (password === ADMIN_PASSWORD) {
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }
    
    return { statusCode: 401, body: JSON.stringify({ success: false, error: 'Invalid password' }) };
};
