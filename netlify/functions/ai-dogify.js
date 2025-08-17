// netlify/functions/ai-dogify.js
const { GoogleGenerativeAI, Modality } = require('@google/generative-ai');

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

    // Initialize the Google AI client with your API key
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

    // --- Step 1: Create the text prompt for the image editing task ---
    const promptMap = {
      cartoon: "Add a friendly, cartoon-style dog wearing sunglasses to this scene. Make the entire image look like a playful, modern animated movie.",
      renaissance: "Add an elegant dog wearing a small ruff collar to this scene. Transform the entire image into a Renaissance-style oil painting with rich colors and dramatic lighting.",
      superhero: "Add a heroic dog wearing a small cape as a sidekick in this scene. Redraw the entire image in a dynamic, vibrant comic book style.",
      steampunk: "Add a dog wearing brass goggles to this scene. Reimagine the entire image in a steampunk style, with intricate gears, copper pipes, and a sepia tone.",
      space: "Add a dog wearing a small astronaut helmet to this scene. Set the entire image in outer space, with nebulae and planets in the background, in a sci-fi concept art style.",
      fairy: "Add a magical dog with faint, glowing wings to this scene. Transform the image into an enchanted fairy tale illustration with soft, sparkling light.",
      pixel: "Add a dog to this scene and redraw the entire image in a 16-bit pixel art style, like a classic video game."
    };
    const finalPrompt = promptMap[prompt] || `Add a dog to this scene in a creative ${prompt} style.`;

    // --- Step 2: Prepare the content parts for the API call ---
    // This follows the "Image editing (text-and-image-to-image)" example you found.
    const contentParts = [
      { text: finalPrompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: userImage.split(',')[1], // Remove the "data:image/png;base64," prefix
        },
      },
    ];

    // --- Step 3: Call the correct Gemini image generation model ---
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation", // The correct model from the docs
      contents: contentParts,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE], // Required config
      },
    });

    // --- Step 4: Process the response to find the generated image ---
    let generatedImageData = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        generatedImageData = part.inlineData.data;
        break; // Stop once we find the first image
      }
    }

    if (!generatedImageData) {
      console.error("API Response did not contain an image:", JSON.stringify(response, null, 2));
      throw new Error("The AI did not return an image. It might have only returned text. Check the function logs.");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImage: `data:image/png;base64,${generatedImageData}`,
        prompt: finalPrompt
      })
    };

  } catch (err) {
    console.error('AI function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message
      })
    };
  }
};
