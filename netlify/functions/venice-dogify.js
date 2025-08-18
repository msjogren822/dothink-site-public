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

    console.log('Venice.ai: STEP 1 - Testing background reproduction...');

    // STEP 1: ONLY focus on reproducing the captured background/scene
    const visionResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-vision-instruct",
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Describe this image in extreme detail for perfect reproduction. Include: lighting, colors, textures, objects, furniture, walls, background elements, shadows, perspective, composition. Be very specific about every visual element so it can be recreated exactly." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage } 
            }
          ]
        }],
        max_tokens: 500
      })
    });

    let sceneAnalysis = "indoor scene with natural lighting";
    
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      sceneAnalysis = visionResult.choices[0].message.content;
      console.log('Venice scene analysis:', sceneAnalysis);
    } else {
      const errorText = await visionResponse.text();
      console.error('Venice vision error:', errorText);
    }

    // STEP 1 TEST: Just try to recreate the exact same scene
    const reproductionPrompt = `Recreate this exact scene with perfect accuracy: ${sceneAnalysis}. Match every detail - lighting, colors, objects, composition, perspective. Make it look identical to the original.`;
    
    console.log('Venice reproduction prompt:', reproductionPrompt);

    // Generate using Venice.ai
    const imageResponse = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "hidream",
        prompt: reproductionPrompt,
        n: 1,
        size: "1024x1024",
        quality: "auto",
        style: "natural",
        background: "auto",
        moderation: "auto",
        output_format: "png",
        output_compression: 100,
        response_format: "url",
        user: "dogify_user"
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
    console.log('Venice image result structure:', imageResult);
    
    // Handle different response formats
    let imageUrl;
    if (imageResult.data && imageResult.data[0] && imageResult.data[0].url) {
      imageUrl = imageResult.data[0].url;
    } else if (imageResult.url) {
      imageUrl = imageResult.url;
    } else if (imageResult.images && imageResult.images[0]) {
      imageUrl = imageResult.images[0];
    } else {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'No image URL found in Venice response', debug: imageResult })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageUrl,
        sceneAnalysis: sceneAnalysis,
        reproductionPrompt: reproductionPrompt,
        model: "venice.ai-hidream-step1",
        testPhase: "Background reproduction only"
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
