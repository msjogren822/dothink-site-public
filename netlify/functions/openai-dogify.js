// netlify/functions/openai-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'OpenAI API key not configured' })
      };
    }

    const { userImage, dogImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !dogImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage, dogImage, or prompt' })
      };
    }

    console.log('Testing minimal prompt approach...');

    // FIRST: Let's see what the AI actually sees in both images
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Describe exactly what you see in these two images. Be specific about the dog breed, size, colors, and any distinctive features." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage, detail: "low" } 
            },
            { 
              type: "image_url", 
              image_url: { url: dogImage, detail: "low" } 
            }
          ]
        }],
        max_tokens: 300
      })
    });

    let imageAnalysis = "Could not analyze images";
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      imageAnalysis = visionResult.choices[0].message.content;
      console.log('What AI actually sees:', imageAnalysis);
    }

    // MINIMAL PROMPT: Just ask to blend, no style requirements
    const minimalPrompt = `Blend these two images together naturally: ${imageAnalysis}`;

    console.log('Minimal prompt:', minimalPrompt);

    // Generate with minimal prompt
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: minimalPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url"
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('DALL-E API error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Image generation failed: ${imageResponse.status}`,
          details: errorText.substring(0, 200)
        })
      };
    }

    const imageResult = await imageResponse.json();
    
    if (!imageResult.data || !imageResult.data[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'No image generated' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageResult.data[0].url,
        prompt: minimalPrompt,
        sceneDescription: "Minimal prompt test",
        imageAnalysis: imageAnalysis, // Show what the AI actually saw
        processingTime: "Testing image recognition"
      })
    };

  } catch (err) {
    console.error('OpenAI function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message
      })
    };
  }
};
