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

    console.log('Starting real OpenAI vision + image generation...');

    // Step 1: Analyze the actual user photo with GPT-4 Vision
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
              text: "Describe this person's exact appearance, clothing, pose, facial features, hair, and setting in detail. Be very specific about what you see for creating an artistic recreation." 
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
        max_tokens: 400
      })
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Vision analysis failed: ${visionResponse.status}`,
          details: errorText.substring(0, 200)
        })
      };
    }

    const visionResult = await visionResponse.json();
    const personDescription = visionResult.choices[0].message.content;
    console.log('Person description:', personDescription);

    // Step 2: Create MORE SPECIFIC prompts that emphasize recreating the exact person
    const promptMap = {
      cartoon: `Create a vibrant cartoon-style illustration that recreates this exact person: ${personDescription}. Keep their specific appearance, pose, and clothing but render in cartoon style. Add a friendly cartoon dog wearing red sunglasses sitting next to them or in their arms. Use bright, playful Disney-like animation colors.`,
      
      renaissance: `Paint a classical Renaissance oil portrait that recreates this exact person: ${personDescription}. Maintain their specific features, clothing, and pose but in Renaissance style. Add an elegant noble dog with a regal collar beside them. Use rich oils, warm lighting, and classical composition.`,
      
      superhero: `Create a dynamic comic book illustration recreating this exact person: ${personDescription}. Keep their appearance and pose but transform them into a superhero. Add a heroic dog sidekick with a cape. Use bold comic book colors and dramatic action lines.`,
      
      steampunk: `Create a steampunk artwork recreating this exact person: ${personDescription}. Maintain their features and pose but add Victorian steampunk clothing. Include a dog wearing brass goggles and steam-powered accessories. Use brass, copper, and sepia tones.`,
      
      space: `Create a sci-fi space scene recreating this exact person: ${personDescription}. Keep their appearance but put them in a space suit or futuristic outfit. Add a dog astronaut companion with a helmet. Set in space with stars, nebulae, and planets.`,
      
      fairy: `Create a magical fairy tale illustration recreating this exact person: ${personDescription}. Maintain their features and pose but add magical fairy tale elements. Include an enchanted dog with subtle magical features. Use soft, dreamy colors and sparkles.`,
      
      pixel: `Create a 16-bit pixel art version recreating this exact person: ${personDescription}. Maintain their pose and general appearance but in retro pixel style. Add a pixelated dog companion. Use bright retro gaming colors and blocky 8-bit aesthetics.`
    };

    const dallePrompt = promptMap[prompt] || `Create an artistic image recreating this exact person: ${personDescription}. Add a friendly dog companion in a ${prompt} style.`;
    console.log('DALL-E prompt:', dallePrompt);

    // Step 3: Generate the image with DALL-E 3 (reduced resolution for speed)
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: dallePrompt,
        n: 1,
        size: "1024x1024", // DALL-E 3 doesn't support 720p, but 1024x1024 is faster than 1792x1024
        quality: "standard", // Using standard instead of hd for speed
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
        body: JSON.stringify({ ok: false, error: 'No image generated', debug: imageResult })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageResult.data[0].url,
        prompt: dallePrompt,
        personDescription: personDescription
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
