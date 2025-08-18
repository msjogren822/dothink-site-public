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

    console.log('Venice.ai: Analyzing and regenerating scene...');

    // Try the working vision models
    const visionModels = ["venice-uncensored", "mistral-31-24b"];
    let sceneAnalysis = "";
    let workingModel = "";

    for (const model of visionModels) {
      console.log(`Trying vision model: ${model}`);
      
      const visionResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Describe this image in extreme detail for accurate reproduction. Focus on: exact lighting conditions, specific colors, textures, objects, furniture placement, wall colors, floor materials, background elements, shadows, perspective. Be precise and factual." 
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

      const responseText = await visionResponse.text();
      console.log(`${model} response status:`, visionResponse.status);

      if (visionResponse.ok) {
        try {
          const visionResult = JSON.parse(responseText);
          sceneAnalysis = visionResult.choices?.[0]?.message?.content || "";
          if (sceneAnalysis && sceneAnalysis.length > 10) {
            workingModel = model;
            console.log(`SUCCESS with ${model}: Analysis length ${sceneAnalysis.length} chars`);
            break; // Stop trying other models
          }
        } catch (parseError) {
          console.error(`Parse error with ${model}:`, parseError);
          continue;
        }
      } else {
        console.error(`Failed with ${model}:`, responseText);
        continue; // Try next model
      }
    }

    // If no vision model worked
    if (!sceneAnalysis || sceneAnalysis.length < 10) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Both venice-uncensored and mistral-31-24b vision models failed',
          details: 'Could not get accurate scene description from available vision models'
        })
      };
    }

    console.log(`Using vision model: ${workingModel}`);
    console.log('Scene analysis:', sceneAnalysis.substring(0, 200) + '...');

    // Now generate the image based on the scene analysis
    const reproductionPrompt = `Recreate this scene with photorealistic accuracy: ${sceneAnalysis}. Maintain all details, lighting, colors, and composition exactly as described.`;
    
    console.log('Sending to image generation...');

    // Generate using Venice.ai with venice-sd35 model
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
    console.log('Image generation result keys:', Object.keys(imageResult));
    
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
        visionModel: workingModel,
        imageModel: "venice-sd35",
        testPhase: `Vision analysis by ${workingModel} → Image generation by venice-sd35`
      })
    };

  } catch (err) {
    console.error('Venice function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message,
        stack: err.stack
      })
    };
  }
};
