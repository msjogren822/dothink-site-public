// netlify/functions/venice-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    if (!process.env.VENICE_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'Venice API key not configured' })
      };
    }

    const { userImage, dogImage } = JSON.parse(event.body);
    
    if (!userImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage' })
      };
    }

    console.log('Venice.ai: Fast vision analysis and image generation...');

    // Use just one vision model (the most reliable one) to avoid timeout
    const visionModel = "venice-uncensored"; // Start with this one
    
    console.log(`Using vision model: ${visionModel}`);
    
    const visionResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Describe this image concisely for reproduction: lighting, setting, main objects, colors. Keep under 800 characters." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage } 
            }
          ]
        }],
        max_tokens: 300 // Reduced for faster response
      })
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Venice vision error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Venice vision failed: ${visionResponse.status}`,
          details: errorText.substring(0, 200)
        })
      };
    }

    const visionResult = await visionResponse.json();
    const sceneAnalysis = visionResult.choices?.[0]?.message?.content || "indoor scene";
    
    console.log(`Scene analysis (${sceneAnalysis.length} chars):`, sceneAnalysis);

    // Create a concise prompt that's definitely under 1500 chars
    const reproductionPrompt = `Recreate this scene exactly: ${sceneAnalysis}. Photorealistic, accurate details.`;
    
    console.log(`Final prompt (${reproductionPrompt.length} chars):`, reproductionPrompt);

    if (reproductionPrompt.length > 1400) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Prompt still too long after truncation',
          details: `Prompt length: ${reproductionPrompt.length}`
        })
      };
    }

    // Generate image
    const imageResponse = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "venice-sd35",
        prompt: reproductionPrompt,
        n: 1,
        size: "1024x1024",
        quality: "auto",
        style: "natural",
        response_format: "url"
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('Venice image generation error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Venice image generation failed: ${imageResponse.status}`,
          details: errorText.substring(0, 200)
        })
      };
    }

    const imageResult = await imageResponse.json();
    
    // Handle different response formats
    let imageUrl;
    if (imageResult.data && imageResult.data[0] && imageResult.data[0].url) {
      imageUrl = imageResult.data[0].url;
    } else if (imageResult.url) {
      imageUrl = imageResult.url;
    } else if (imageResult.images && imageResult.images[0]) {
      imageUrl = imageResult.images[0];
    } else {
      console.error('Venice response structure:', imageResult);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'No image URL found in Venice response', 
          debug: Object.keys(imageResult)
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageUrl,
        sceneAnalysis: sceneAnalysis,
        reproductionPrompt: reproductionPrompt,
        visionModel: visionModel,
        imageModel: "venice-sd35",
        testPhase: "Optimized for speed"
      })
    };

  } catch (err) {
    console.error('Venice function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message
      })
    };
  }
};
