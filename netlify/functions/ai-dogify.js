// netlify/functions/ai-dogify.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    const { userImage, prompt } = JSON.parse(event.body);
    
    if (!userImage || !prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or prompt' })
      };
    }

    // Initialize the Google AI client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    
    // Map prompt values to creative descriptions
    const promptMap = {
      cartoon: "Transform this person into a playful cartoon dog adventure scene with bright colors, whimsical style, and the person as a cartoon character alongside a cute dog wearing sunglasses",
      renaissance: "Create a Renaissance-style portrait featuring this person with an elegant dog companion, using classical painting techniques, rich colors, and ornate details",
      superhero: "Transform this person into a superhero scene with a heroic dog sidekick, dramatic lighting, action poses, and comic book style",
      steampunk: "Create a steampunk masterpiece featuring this person with a Victorian-era dog companion, brass gears, mechanical details, and steampunk aesthetics",
      space: "Send this person on a space exploration adventure with a dog astronaut companion, cosmic backgrounds, planets, and futuristic elements",
      fairy: "Transform this person into a magical fairy tale scene with an enchanted dog companion, sparkles, mystical creatures, and fantasy elements",
      pixel: "Convert this person into pixel art style with a retro gaming dog companion, 8-bit aesthetics, blocky details, and retro gaming vibes"
    };

    const fullPrompt = promptMap[prompt] || `Transform this person into a creative ${prompt} style scene with a dog companion`;

    // First, analyze the user image to get a description using Gemini
    const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const visionResult = await visionModel.generateContent([
      "Describe this person's appearance, pose, and setting in detail for image generation:",
      {
        inlineData: {
          data: userImage.split(',')[1],
          mimeType: 'image/png'
        }
      }
    ]);

    const personDescription = visionResult.response.text();
    
    // Create enhanced prompt with person description
    const enhancedPrompt = `${fullPrompt}. Based on this person: ${personDescription}. Create a completely new artistic interpretation that captures their essence while transforming them into the requested style.`;

    // Use Gemini to generate a detailed creative description
    const creativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const creativeResult = await creativeModel.generateContent(
      `Create a detailed, artistic description for: ${enhancedPrompt}. Focus on visual details, colors, composition, and artistic style. Make it creative and imaginative while staying true to the ${prompt} theme.`
    );

    const creativeDescription = creativeResult.response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        // For now, return the creative description as text
        // We'll work on actual image generation in the next step
        generatedDescription: creativeDescription,
        prompt: enhancedPrompt,
        personDescription,
        note: "Image generation coming soon - currently showing AI creative vision"
      })
    };

  } catch (err) {
    console.error('AI function error:', err);
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
