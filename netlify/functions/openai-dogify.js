// netlify/functions/openai-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'OpenAI API key not configured' })
      };
    }

    const { userImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or prompt' })
      };
    }

    console.log('API Key present:', !!process.env.OPENAI_API_KEY);
    console.log('Starting OpenAI process...');

    // Step 1: Simple text-only call first to test the API
    const testResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user",
          content: "Describe a person in a photo for artistic purposes in 50 words."
        }],
        max_tokens: 100
      })
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('OpenAI API test error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `OpenAI API test failed: ${testResponse.status}`,
          details: errorText.substring(0, 300)
        })
      };
    }

    const testResult = await testResponse.json();
    console.log('OpenAI test successful');

    // For now, just return a success message with the test
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "OpenAI API connection successful! Image generation coming next...",
        test: testResult.choices[0].message.content
      })
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      })
    };
  }
};
