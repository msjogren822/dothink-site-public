// netlify/functions/ai-dogify.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    const { userImage, dogImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or prompt' })
      };
    }

    // Initialize the Google AI client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'imagen-4' });

    // Map prompt values to creative descriptions
    const promptMap = {
      cartoon: "Transform this person into a playful cartoon dog adventure scene with bright colors, whimsical style, and the person as a cartoon character alongside a cute dog",
      renaissance: "Create a Renaissance-style portrait featuring this person with an elegant dog companion, using classical painting techniques, rich colors, and ornate details",
      superhero: "Transform this person into a superhero scene with a heroic dog sidekick, dramatic lighting, action poses, and comic book style",
      steampunk: "Create a steampunk masterpiece featuring this person with a Victorian-era dog companion, brass gears, mechanical details, and steampunk aesthetics",
      space: "Send this person on a space exploration adventure with a dog astronaut companion, cosmic backgrounds, planets, and futuristic elements",
      fairy: "Transform this person into a magical fairy tale scene with an enchanted dog companion, sparkles, mystical creatures, and fantasy elements",
      pixel: "Convert this person into pixel art style with a retro gaming dog companion, 8-bit aesthetics, blocky details, and retro gaming vibes"
    };

    const fullPrompt = promptMap[prompt] || `Transform this person into a creative ${prompt} style scene with a dog companion`;

    // First, analyze the user image to get a description
    const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const visionResult = await visionModel.generateContent([
      "Describe this person's appearance, pose, and setting for image generation (focus on visual details):",
      {
        inlineData: {
          data: userImage.split(',')[1],
          mimeType: 'image/png'
        }
      }
    ]);

    const personDescription = visionResult.response.text();
    const enhancedPrompt = `${fullPrompt}. Person details: ${personDescription}`;

    // Generate the new image using Imagen 4
    const result = await model.generate({
      prompt: enhancedPrompt,
      responseModalities: ['IMAGE'],
      // You might need to adjust these parameters based on the actual Imagen 4 API
    });

    // Extract the generated image
    let generatedImageData;
    if (result.image && result.image[0]) {
      if (result.image[0].imageUri) {
        // If it returns a URI, fetch the image and convert to base64
        const imageResponse = await fetch(result.image[0].imageUri);
        const imageBuffer = await imageResponse.buffer();
        generatedImageData = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      } else if (result.image[0].base64) {
        // If it returns base64 directly
        generatedImageData = `data:image/png;base64,${result.image[0].base64}`;
      }
    }

    if (!generatedImageData) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'No image generated',
          debug: result
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImage: generatedImageData,
        prompt: enhancedPrompt,
        personDescription
      })
    };

  } catch (err) {
    console.error('Imagen function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      })
    };
  }
};
