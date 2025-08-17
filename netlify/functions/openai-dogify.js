// netlify/functions/openai-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: 'OpenAI API key not configured' })
      };
    }

    const { userImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or prompt' })
      };
    }

    console.log('Starting real OpenAI vision + image generation...');

    // Step 1: Analyze the actual user photo with GPT-4 Vision
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o", // Vision-capable model
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Describe this person's appearance, clothing, pose, and setting in detail for creating an artistic image. Be specific about visual details, colors, and the scene." 
            },
            { 
              type: "image_url", 
              image_url: { 
                url: userImage,
                detail: "low"
              } 
            }
          ]
        }],
        max_tokens: 300
      })
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Vision analysis failed: ${visionResponse.status}`,
          details: errorText.substring(0, 200)
        })
      };
    }

    const visionResult = await visionResponse.json();
    const personDescription = visionResult.choices[0].message.content;
    console.log('Person description:', personDescription);

    // Step 2: Create detailed prompts for DALL-E based on the style
    const promptMap = {
      cartoon: `Create a vibrant cartoon-style illustration. ${personDescription} Add a friendly cartoon dog wearing red sunglasses as a companion. Use bright, playful colors and a whimsical Disney-like animation style.`,
      
      renaissance: `Create a classical Renaissance oil painting. ${personDescription} Include an elegant dog with a noble expression beside them. Use rich, warm colors and dramatic lighting like a formal portrait from the 1500s.`,
      
      superhero: `Create a dynamic comic book style illustration. ${personDescription} Transform them into a superhero with a heroic dog sidekick wearing a small cape. Use bold colors and classic comic book aesthetics.`,
      
      steampunk: `Create a steampunk artwork. ${personDescription} Show them in Victorian-era clothing with a dog wearing brass goggles. Add gears, copper pipes, and mechanical elements with sepia tones.`,
      
      space: `Create a sci-fi space scene. ${personDescription} Show them as a space explorer with a dog in a space suit. Set it in outer space with nebulae, planets, and stars.`,
      
      fairy: `Create a magical fairy tale illustration. ${personDescription} Place them in an enchanted setting with a mystical dog companion. Add magical elements and soft, dreamy colors.`,
      
      pixel: `Create a 16-bit pixel art scene. ${personDescription} Show them with a pixelated dog companion. Use classic video game aesthetics with blocky details and bright retro colors.`
    };

    const dallePrompt = promptMap[prompt] || `Create an artistic image. ${personDescription} Add a friendly dog companion in a ${prompt} style.`;
    console.log('DALL-E prompt:', dallePrompt);

    // Step 3: Generate the image with DALL-E 3
    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: dallePrompt,
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
        body: JSON.stringify({ ok: false, error: 'No image generated', debug: imageResult })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageResult.data[0].url,
        prompt: dallePrompt,
        personDescription: personDescription
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
