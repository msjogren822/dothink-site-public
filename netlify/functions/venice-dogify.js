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

    // Step 3: Create playful combination prompts
    const creativePrompts = [
      `Recreate this scene: ${sceneAnalysis}. Add this spritely, happy puppy: ${dogAnalysis}. The puppy is energetic and joyful.`,
      
      `Create this setting: ${sceneAnalysis}. Include this happy puppy: ${dogAnalysis}. The puppy is spritely and playful.`,
      
      `Scene: ${sceneAnalysis}. Add this bouncy, cheerful puppy: ${dogAnalysis}. Show the puppy's happy, energetic nature.`,
      
      `Recreate: ${sceneAnalysis}. Add this joyful puppy: ${dogAnalysis}. The puppy is spritely, happy, and full of energy.`,

      `Setting: ${sceneAnalysis}. Include this lively puppy: ${dogAnalysis}. Capture the puppy's spritely, happy personality.`
    ];

    // Pick a random creative approach
    const combinationPrompt = creativePrompts[Math.floor(Math.random() * creativePrompts.length)];
    
    console.log(`Combination prompt (${combinationPrompt.length} chars):`, combinationPrompt);

    if (combinationPrompt.length > 1400) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Combination prompt too long',
          details: `Prompt length: ${combinationPrompt.length}`
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
        prompt: combinationPrompt,
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
        combinationPrompt: combinationPrompt,
        visionModel: workingModel,
        imageModel: "venice-sd35",
        testPhase: "Adding spritely, happy puppy to scene"
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
