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

    console.log('Venice.ai: Creating composite image...');

    // Step 1: Analyze both images with Venice.ai vision
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
              text: "I need to combine these two images. First image: Describe the person, their pose, clothing, and the background/setting in detail. Second image: Describe this specific dog - breed, size, colors, pose, any accessories. I want to create a new image with this exact person and this exact dog together in the same scene." 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage } 
            },
            { 
              type: "image_url", 
              image_url: { url: dogImage } 
            }
          ]
        }],
        max_tokens: 400
      })
    });

    let combinedAnalysis = "a person with a dog in a scene";
    
    if (visionResponse.ok) {
      const visionResult = await visionResponse.json();
      combinedAnalysis = visionResult.choices[0].message.content;
      console.log('Venice combined analysis:', combinedAnalysis);
    } else {
      const errorText = await visionResponse.text();
      console.error('Venice vision error:', errorText);
    }

    // Step 2: Create a very specific prompt for image combination
    const combinationPrompt = `Create a photorealistic image based on this description: ${combinedAnalysis}. The person and dog should be in the same scene together, both clearly visible and naturally positioned. Make it look like a real photo where both subjects are actually present together.`;
    
    console.log('Venice combination prompt:', combinationPrompt);

    // Step 3: Generate using Venice.ai's correct API format
    const imageResponse = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "hidream", // Using the model from your API docs
        prompt: combinationPrompt,
        n: 1,
        size: "1024x1024",
        quality: "auto",
        style: "natural", // Natural style for realistic photos
        background: "auto",
        moderation: "auto",
        output_format: "png",
        output_compression: 100,
        response_format: "url", // Changed from b64_json to url for easier handling
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
        combinedAnalysis: combinedAnalysis,
        combinationPrompt: combinationPrompt,
        model: "venice.ai-hidream"
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
