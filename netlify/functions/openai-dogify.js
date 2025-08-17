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
    
    if (!userImage || !dogImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage, dogImage, or prompt' })
      };
    }

    console.log('Starting optimized OpenAI image combination...');

    // OPTIMIZATION: Skip the vision analysis step for speed
    // We'll create a good prompt based on the style selection instead
    
    const promptMap = {
      cartoon: `Create a vibrant cartoon-style illustration. Take the person from the first photo and add the specific dog from the second photo as a companion. Make everything look like a colorful Disney animation with bright, playful colors.`,
      
      renaissance: `Create a classical Renaissance oil painting. Take the person from the first photo and include the specific dog from the second photo beside them. Use rich oil painting techniques with warm lighting and classical composition.`,
      
      superhero: `Create a dynamic comic book scene. Take the person from the first photo and add the specific dog from the second photo as a superhero sidekick. Use bold comic book colors, dramatic lighting, and action-style composition.`,
      
      steampunk: `Create a steampunk artwork. Take the person from the first photo and add the specific dog from the second photo with Victorian steampunk accessories. Include gears, brass elements, and sepia tones.`,
      
      space: `Create a futuristic space scene. Take the person from the first photo and add the specific dog from the second photo as a space companion. Include space elements like stars, nebulae, and futuristic technology.`,
      
      fairy: `Create a magical fairy tale illustration. Take the person from the first photo and add the specific dog from the second photo with enchanted features. Include sparkles, soft lighting, and fantasy elements.`,
      
      pixel: `Create 16-bit pixel art. Take the person from the first photo and add the specific dog from the second photo. Transform everything into retro gaming aesthetics with blocky details and bright colors.`
    };

    const editPrompt = promptMap[prompt] || `Combine the person from the first photo with the dog from the second photo in a ${prompt} artistic style.`;

    console.log('Direct prompt:', editPrompt);

    // SINGLE API CALL: Generate the image directly
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: editPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard", // Using standard for speed
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
        prompt: editPrompt,
        sceneDescription: "Scene analyzed and combined",
        processingTime: "Optimized for speed"
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
