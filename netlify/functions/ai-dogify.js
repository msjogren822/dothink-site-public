// netlify/functions/ai-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { 
        statusCode: 405, 
        body: JSON.stringify({ ok: false, error: 'Method not allowed' }) 
      };
    }

    const { userImage, dogImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !dogImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Missing required fields: userImage, dogImage, or prompt' 
        })
      };
    }

    // Map prompt values to full descriptions
    const promptMap = {
      cartoon: "Transform this photo into a playful cartoon dog adventure scene with bright colors and whimsical style",
      renaissance: "Create a Renaissance-style pet portrait with classical painting techniques, rich colors, and ornate details",
      superhero: "Turn this into a superhero sidekick scene with dramatic lighting, action poses, and comic book style",
      steampunk: "Create a steampunk masterpiece with brass gears, Victorian elements, and mechanical details",
      space: "Send this dog on a space exploration with cosmic backgrounds, planets, and futuristic elements",
      fairy: "Transform into a magical fairy tale scene with enchanted forests, sparkles, and mystical creatures",
      pixel: "Convert to pixel art style with 8-bit aesthetics, blocky details, and retro gaming vibes"
    };

    const fullPrompt = promptMap[prompt] || prompt;

    const payload = {
      contents: [{
        parts: [{
          text: `Please analyze these two images and create a creative description for: ${fullPrompt}. Describe how you would combine or transform these images to match this style.`
        }, {
          inline_data: {
            mime_type: "image/png",
            data: userImage.split(',')[1] // Remove data:image/png;base64, prefix
          }
        }, {
          inline_data: {
            mime_type: "image/png", 
            data: dogImage.split(',')[1] // Remove data:image/png;base64, prefix
          }
        }]
      }]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google AI API error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Google AI API error: ${response.status}`,
          details: errorText
        })
      };
    }

    const result = await response.json();
    
    if (!result.candidates || !result.candidates[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'No response from Google AI',
          debug: result
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        aiResponse: result.candidates[0].content.parts[0].text,
        prompt: fullPrompt,
        debug: {
          userImageSize: userImage.length,
          dogImageSize: dogImage.length
        }
      })
    };

  } catch (err) {
    console.error('AI function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message 
      })
    };
  }
};
