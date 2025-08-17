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

    const { userImage, dogImage, prompt } = JSON.parse(event.body); // NOW EXPECTING BOTH IMAGES
    
    if (!userImage || !dogImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage, dogImage, or prompt' })
      };
    }

    console.log('Starting OpenAI image combination...');

    // Analyze BOTH images - the user photo and the special dog
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
              text: "Analyze these two images for artistic combination:\n\nFIRST IMAGE (scene): Describe the setting, background, lighting, colors, and environment. This could be indoor, outdoor, any location.\n\nSECOND IMAGE (dog): Describe this specific dog's breed, pose, accessories, colors, and distinctive features.\n\nFormat your response as:\nSCENE: [description]\nDOG: [description]" 
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
        max_tokens: 400
      })
    });

    let sceneDescription = "outdoor or indoor setting with natural lighting";
    let dogDescription = "the specific dog with its unique characteristics";
    
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      const fullDescription = visionResult.choices[0].message.content;
      console.log('Vision analysis:', fullDescription);
      
      // Parse the structured response
      const sceneMatch = fullDescription.match(/SCENE:\s*(.+?)(?=DOG:|$)/is);
      const dogMatch = fullDescription.match(/DOG:\s*(.+?)$/is);
      
      sceneDescription = sceneMatch?.[1]?.trim() || "outdoor or indoor setting with natural lighting";
      dogDescription = dogMatch?.[1]?.trim() || "the specific dog with its unique characteristics";
      
      console.log('Parsed scene:', sceneDescription);
      console.log('Parsed dog:', dogDescription);
    }

    // Create prompts that specifically combine these two specific images
    const promptMap = {
      cartoon: `Create a vibrant cartoon-style illustration that combines these two specific images: Take the person from the first photo and place them in this setting: ${sceneDescription}. Add this exact dog: ${dogDescription}. Make everything look like a colorful Disney animation while keeping both subjects recognizable.`,
      
      renaissance: `Create a classical Renaissance painting that combines these two specific images: Take the person from the first photo in this setting: ${sceneDescription}. Add this exact dog: ${dogDescription}. Paint in Renaissance oil painting style with rich colors and classical composition.`,
      
      superhero: `Create a dynamic comic book scene that combines these two specific images: Take the person from the first photo in this setting: ${sceneDescription}. Add this exact dog: ${dogDescription} as a superhero sidekick. Use bold comic book colors and dramatic action style.`,
      
      steampunk: `Create a steampunk artwork that combines these two specific images: Take the person from the first photo in this setting: ${sceneDescription}. Add this exact dog: ${dogDescription} with added steampunk accessories. Include Victorian elements, gears, and brass tones.`,
      
      space: `Create a sci-fi space scene that combines these two specific images: Take the person from the first photo and transform the setting: ${sceneDescription} into a space environment. Add this exact dog: ${dogDescription} as a space companion with futuristic elements.`,
      
      fairy: `Create a magical fairy tale illustration that combines these two specific images: Take the person from the first photo in this setting: ${sceneDescription} but make it enchanted. Add this exact dog: ${dogDescription} with magical fairy tale elements and soft, dreamy lighting.`,
      
      pixel: `Create 16-bit pixel art that combines these two specific images: Take the person from the first photo in this setting: ${sceneDescription}. Add this exact dog: ${dogDescription}. Transform everything into retro gaming pixel art style.`
    };

    const editPrompt = promptMap[prompt] || `Combine these two specific images: the person from the first photo in the setting: ${sceneDescription}, with this exact dog: ${dogDescription}. Create in ${prompt} artistic style.`;

    console.log('Combined prompt:', editPrompt);

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
        sceneDescription: sceneDescription,
        dogDescription: dogDescription
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
