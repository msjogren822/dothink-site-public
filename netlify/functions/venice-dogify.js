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

    console.log('Venice.ai: STEP 1 - Testing background reproduction with venice-sd35...');

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
              text: "Describe this image in extreme detail for accurate reproduction. Focus on: exact lighting conditions, specific colors, textures, objects, furniture placement, wall colors, floor materials, background elements, shadows, perspective. Be precise and factual, not artistic." 
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

    let sceneAnalysis = ""; // Remove the hardcoded indoor assumption
    
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      sceneAnalysis = visionResult.choices[0].message.content;
      console.log('Venice scene analysis:', sceneAnalysis);
    } else {
      const errorText = await visionResponse.text();
      console.error('Venice vision error:', errorText);
      // Better fallback that doesn't assume anything about the location
      sceneAnalysis = "a scene with various lighting and environmental elements";
    }

    // Only proceed if we actually got a scene analysis
    if (!sceneAnalysis || sceneAnalysis.length < 10) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Could not analyze the captured image properly',
          details: 'Vision analysis failed or returned insufficient data'
        })
      };
    }

    // STEP 1 TEST: More precise reproduction prompt
    const reproductionPrompt = `Photorealistic reproduction of this exact scene: ${sceneAnalysis}. Maintain precise accuracy in lighting, colors, object placement, and composition. No artistic interpretation, just faithful reproduction.`;
    
    console.log('Venice reproduction prompt:', reproductionPrompt);

    // Generate using Venice.ai with venice-sd35 model
    const imageResponse = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "venice-sd35", // Changed to Venice's homegrown model
        prompt: reproductionPrompt,
        n: 1,
        size: "1024x1024",
        quality: "auto",
        style: "natural", // Keep natural style for realism
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
        sceneAnalysis: sceneAnalysis, // This will show what the AI "saw"
        reproductionPrompt: reproductionPrompt,
        model: "venice-sd35",
        testPhase: "Background reproduction test with venice-sd35",
        visionDebug: sceneAnalysis // Extra field to make it clear
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
