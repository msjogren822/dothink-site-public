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
    
    if (!userImage || !dogImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or dogImage' })
      };
    }

    console.log('Venice.ai: Analyzing scene and adding happy puppy...');

    // Use the correct vision-capable models
    const visionModels = ["mistral-31-24b", "qwen-2.5-vl"];
    let sceneAnalysis = "";
    let dogAnalysis = "";
    let workingModel = "";

    // Step 1: Analyze the captured scene
    for (const visionModel of visionModels) {
      console.log(`Trying vision model: ${visionModel}`);
      
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
                text: "Describe this scene concisely: lighting, setting, main objects, colors. Keep under 400 characters." 
              },
              { 
                type: "image_url", 
                image_url: { url: userImage } 
              }
            ]
          }],
          max_tokens: 200
        })
      });

      if (visionResponse.ok) {
        const visionResult = await visionResponse.json();
        sceneAnalysis = visionResult.choices?.[0]?.message?.content || "";
        if (sceneAnalysis && sceneAnalysis.length > 10) {
          workingModel = visionModel;
          console.log(`SUCCESS with ${visionModel} for scene: ${sceneAnalysis.length} chars`);
          break;
        }
      } else {
        const errorText = await visionResponse.text();
        console.error(`Failed with ${visionModel}:`, errorText);
        continue;
      }
    }

    // Step 2: Analyze the dog image using the same working model
    if (workingModel) {
      console.log(`Analyzing dog with ${workingModel}`);
      
      const dogVisionResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: workingModel,
          messages: [{
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Describe this dog concisely: breed, size, color, distinctive features. Keep under 200 characters." 
              },
              { 
                type: "image_url", 
                image_url: { url: dogImage } 
              }
            ]
          }],
          max_tokens: 100
        })
      });

      if (dogVisionResponse.ok) {
        const dogResult = await dogVisionResponse.json();
        dogAnalysis = dogResult.choices?.[0]?.message?.content || "a small puppy";
        console.log(`Dog analysis: ${dogAnalysis}`);
      } else {
        const errorText = await dogVisionResponse.text();
        console.error('Dog vision failed:', errorText);
        dogAnalysis = "a small, happy puppy";
      }
    }

    if (!sceneAnalysis || sceneAnalysis.length < 10) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Could not analyze the captured scene',
          details: 'Scene vision analysis failed'
        })
      };
    }
    
    console.log(`Scene: ${sceneAnalysis}`);
    console.log(`Dog: ${dogAnalysis}`);

    // Step 3: Create simple placement prompt (like OpenAI version)
    const placementPrompt = `Recreate this scene: ${sceneAnalysis}. Add this spritely, happy puppy: ${dogAnalysis}. Place the puppy naturally in the environment so it looks like it belongs there.`;
    
    console.log(`Placement prompt (${placementPrompt.length} chars):`, placementPrompt);

    if (placementPrompt.length > 1400) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Placement prompt too long',
          details: `Prompt length: ${placementPrompt.length}`
        })
      };
    }

    // Step 4: Generate the combined image
    const imageResponse = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "venice-sd35",
        prompt: placementPrompt, // Use single prompt like OpenAI
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
        dogAnalysis: dogAnalysis,
        placementPrompt: placementPrompt, // Changed from combinationPrompt
        visionModel: workingModel,
        imageModel: "venice-sd35",
        testPhase: "Simple puppy placement like OpenAI"
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
