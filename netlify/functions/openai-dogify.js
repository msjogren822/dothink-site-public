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

    const { userImage, dogImage } = JSON.parse(event.body);
    
    if (!userImage || !dogImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or dogImage' })
      };
    }

    console.log('Analyzing scene and placing dog...');

    // Step 1: Get AI to describe the captured scene
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
              text: "Describe this scene in detail for recreating it with an additional dog present. Include lighting, setting, furniture, colors, and atmosphere." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage, detail: "low" } 
            }
          ]
        }],
        max_tokens: 200
      })
    });

    // Step 2: Get AI to describe the specific dog
    const dogVisionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              text: "Describe this dog in detail - breed, size, colors, pose, any accessories or distinctive features." 
            },
            { 
              type: "image_url", 
              image_url: { url: dogImage, detail: "low" } 
            }
          ]
        }],
        max_tokens: 150
      })
    });

    let sceneDescription = "indoor setting with natural lighting";
    let dogDescription = "a small dog";
    
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      sceneDescription = visionResult.choices[0].message.content;
      console.log('Scene:', sceneDescription);
    }
    
    if (dogVisionResponse.ok) {
      const dogResult = await dogVisionResponse.json();
      dogDescription = dogResult.choices[0].message.content;
      console.log('Dog:', dogDescription);
    }

    // Step 3: Simple, direct prompt to place the dog in the scene
    const placementPrompt = `Recreate this scene: ${sceneDescription}. Add this dog to the scene: ${dogDescription}. Place the dog naturally in the environment so it looks like it belongs there.`;
    
    console.log('Placement prompt:', placementPrompt);

    // Step 4: Generate the image
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: placementPrompt,
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
        sceneDescription: sceneDescription,
        dogDescription: dogDescription,
        placementPrompt: placementPrompt
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
