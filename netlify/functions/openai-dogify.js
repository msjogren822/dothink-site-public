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

    const { userImage, dogImage } = JSON.parse(event.body);
    
    if (!userImage || !dogImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or dogImage' })
      };
    }

    console.log('OpenAI: Analyzing scene and adding happy puppy...');

    let sceneAnalysis = "";
    let dogAnalysis = "";

    // Step 1: Analyze the captured scene (similar to Venice structure)
    console.log('Analyzing scene with gpt-4o');
    
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
              text: "Describe this scene concisely: lighting, setting, main objects, colors. Keep under 400 characters." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage, detail: "low" } 
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
        console.log(`SUCCESS with gpt-4o for scene: ${sceneAnalysis.length} chars`);
      }
    } else {
      const errorText = await visionResponse.text();
      console.error('Failed with gpt-4o:', errorText);
    }

    // Step 2: Analyze the dog image (similar to Venice structure)
    if (sceneAnalysis) {
      console.log('Analyzing dog with gpt-4o');
      
      const dogVisionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                text: "Describe this dog concisely: breed, size, color, distinctive features. Keep under 200 characters." 
              },
              { 
                type: "image_url", 
                image_url: { url: dogImage, detail: "low" } 
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

    // Step 3: Create simple placement prompt (exactly like Venice version)
    const placementPrompt = `Recreate this scene: ${sceneAnalysis}. Add this spritely, happy puppy: ${dogAnalysis}. Place the puppy naturally in the environment so it looks like it belongs there.`;
    
    console.log(`Placement prompt (${placementPrompt.length} chars):`, placementPrompt);

    // Step 4: Generate the combined image
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: placementPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url"
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('OpenAI image generation error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `OpenAI image generation failed: ${imageResponse.status}`,
          details: errorText.substring(0, 200)
        })
      };
    }

    const imageResult = await imageResponse.json();
    
    if (!imageResult.data || !imageResult.data[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'No image URL found in OpenAI response'
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageResult.data[0].url,
        sceneAnalysis: sceneAnalysis,
        dogAnalysis: dogAnalysis,
        placementPrompt: placementPrompt,
        visionModel: "gpt-4o",
        imageModel: "dall-e-3",
        testPhase: "Simple puppy placement like Venice"
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
