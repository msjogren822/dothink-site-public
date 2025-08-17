// netlify/functions/openai-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    const { userImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or prompt' })
      };
    }

    // Step 1: Use GPT-4 Vision to analyze the user's photo
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4-vision-preview",
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Describe this person's appearance, clothing, pose, and setting in detail for creating an artistic image. Be specific about visual details." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage } 
            }
          ]
        }],
        max_tokens: 300
      })
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: `Vision analysis failed: ${visionResponse.status}` })
      };
    }

    const visionResult = await visionResponse.json();
    const personDescription = visionResult.choices[0].message.content;

    // Step 2: Create detailed prompts for DALL-E based on the style
    const promptMap = {
      cartoon: `Create a vibrant cartoon-style illustration featuring: ${personDescription}. Add a friendly cartoon dog wearing red sunglasses as a companion. Use bright, playful colors and a whimsical Disney-like animation style. Make it look like a fun animated movie scene.`,
      
      renaissance: `Create a classical Renaissance oil painting featuring: ${personDescription}. Include an elegant dog with a noble expression beside them. Use rich, warm colors, dramatic chiaroscuro lighting, and ornate Renaissance details. Style it like a formal portrait from the 1500s.`,
      
      superhero: `Create a dynamic comic book style illustration featuring: ${personDescription} as a superhero. Include a heroic dog sidekick with a small cape. Use bold colors, dramatic lighting, action lines, and a classic comic book aesthetic with strong outlines.`,
      
      steampunk: `Create a steampunk artwork featuring: ${personDescription} in Victorian-era clothing with brass accessories. Include a dog wearing brass goggles. Add intricate gears, copper pipes, steam, and mechanical elements. Use a sepia and bronze color palette.`,
      
      space: `Create a sci-fi space scene featuring: ${personDescription} as an astronaut or space explorer. Include a dog in a space suit with a helmet. Set it in outer space with nebulae, planets, stars, and futuristic spacecraft. Use cosmic colors and dramatic lighting.`,
      
      fairy: `Create a magical fairy tale illustration featuring: ${personDescription} in an enchanted setting. Include a mystical dog with subtle magical elements. Add sparkles, soft glowing light, fantasy creatures, and an enchanted forest background. Use soft, dreamy colors.`,
      
      pixel: `Create a 16-bit pixel art scene featuring: ${personDescription} and a pixelated dog companion. Use classic video game aesthetics with blocky details, bright retro colors, and a nostalgic 1990s gaming style.`
    };

    const dallePrompt = promptMap[prompt] || `Create an artistic image featuring: ${personDescription} with a friendly dog companion in a ${prompt} style.`;

    // Step 3: Generate the image with DALL-E 3
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
        body: JSON.stringify({ ok: false, error: `Image generation failed: ${imageResponse.status}` })
      };
    }

    const imageResult = await imageResponse.json();
    
    if (!imageResult.data || !imageResult.data[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'No image generated', debug: imageResult })
      };
    }

    // Step 4: Fetch the generated image and convert to base64
    const generatedImageUrl = imageResult.data[0].url;
    const imageBlob = await fetch(generatedImageUrl);
    const imageBuffer = await imageBlob.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImage: `data:image/png;base64,${base64Image}`,
        generatedImageUrl: generatedImageUrl,
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
