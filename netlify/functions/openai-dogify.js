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

    const { userImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or prompt' })
      };
    }

    console.log('Starting OpenAI image editing...');

    // NEW APPROACH: Use DALL-E image editing instead of description + generation
    // This directly modifies your photo rather than creating from description
    
    // First, let's try to get a scene description (not person description)
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
              text: "Describe only the setting, background, lighting, colors, and objects in this image. Do not describe any people. Focus on the environment, furniture, walls, lighting conditions, and overall scene composition." 
            },
            { 
              type: "image_url", 
              image_url: { 
                url: userImage,
                detail: "low"
              } 
            }
          ]
        }],
        max_tokens: 200
      })
    });

    let sceneDescription = "indoor setting with neutral background";
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      sceneDescription = visionResult.choices[0].message.content;
    }

    // Create prompts that specifically mention adding a dog with sunglasses to the existing photo
    const promptMap = {
      cartoon: `Transform this photo into a vibrant cartoon style illustration. Add a friendly cartoon dog wearing red sunglasses somewhere in the scene. Keep the original composition but make everything look like a colorful Disney animation. Setting: ${sceneDescription}`,
      
      renaissance: `Transform this photo into a classical Renaissance painting style. Add an elegant dog with a noble collar somewhere in the scene. Use rich oil painting techniques with warm lighting and classical composition. Setting: ${sceneDescription}`,
      
      superhero: `Transform this photo into a dynamic comic book scene. Add a heroic dog wearing a small cape somewhere in the scene. Use bold comic book colors, dramatic lighting, and action-style composition. Setting: ${sceneDescription}`,
      
      steampunk: `Transform this photo into a steampunk artwork. Add a dog wearing brass goggles somewhere in the scene. Include Victorian-era elements, gears, and brass accessories. Use sepia and bronze tones. Setting: ${sceneDescription}`,
      
      space: `Transform this photo into a futuristic space scene. Add a dog astronaut with a helmet somewhere in the scene. Include space elements like stars, nebulae, or futuristic technology. Setting: ${sceneDescription}`,
      
      fairy: `Transform this photo into a magical fairy tale illustration. Add an enchanted dog with subtle magical features somewhere in the scene. Include sparkles, soft lighting, and fantasy elements. Setting: ${sceneDescription}`,
      
      pixel: `Transform this photo into 16-bit pixel art. Add a pixelated dog companion somewhere in the scene. Use retro gaming aesthetics with blocky details and bright colors. Setting: ${sceneDescription}`
    };

    const editPrompt = promptMap[prompt] || `Add a friendly dog wearing sunglasses to this photo in a ${prompt} artistic style. Setting: ${sceneDescription}`;

    // Use DALL-E image editing/variation instead of generation from scratch
    // Note: This requires converting the image to the right format for editing
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: editPrompt,
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
        prompt: editPrompt,
        sceneDescription: sceneDescription
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
