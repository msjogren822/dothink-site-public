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
    
    if (!userImage || !dogImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or dogImage' })
      };
    }

    console.log('Creating artistic fusion...');

    // Analyze what's in both images
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
              text: "Describe exactly what you see in these two images. Be specific about the setting, lighting, people, and the dog's breed, size, colors, and distinctive features." 
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

    let imageAnalysis = "Could not analyze images";
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      imageAnalysis = visionResult.choices[0].message.content;
      console.log('What AI sees:', imageAnalysis);
    }

    // CREATIVE FUSION PROMPTS - randomize for variety
    const fusionPrompts = [
      `Creatively morph these two images together into a single artistic scene: ${imageAnalysis}. Blend the elements naturally while maintaining the essence of both subjects.`,
      
      `Fuse these two images together creatively: ${imageAnalysis}. Create an imaginative scene where both subjects coexist in a magical, artistic way.`,
      
      `Artistically blend these two images: ${imageAnalysis}. Transform them into a whimsical, creative composition where both elements complement each other beautifully.`,
      
      `Merge these images into a creative fusion: ${imageAnalysis}. Let your imagination create a unique artistic interpretation that celebrates both subjects.`,
      
      `Combine these two images in an unexpected, creative way: ${imageAnalysis}. Create something magical that brings both elements together in harmony.`,
      
      `Transform these images into a creative fusion piece: ${imageAnalysis}. Imagine them as part of the same enchanting story or scene.`
    ];

    // Pick a random fusion approach for variety
    const randomPrompt = fusionPrompts[Math.floor(Math.random() * fusionPrompts.length)];
    
    // If a style was selected, add it as a hint
    const finalPrompt = prompt && prompt !== 'creative' 
      ? `${randomPrompt} Style suggestion: ${prompt} elements.`
      : randomPrompt;

    console.log('Fusion prompt:', finalPrompt);

    // Generate the fused image
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
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
        prompt: finalPrompt,
        imageAnalysis: imageAnalysis,
        fusionType: "Creative artistic fusion"
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
