// netlify/functions/venice-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }
    if (!process.env.VENICE_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Venice API key not configured' }) };
    }

    const { userImage } = JSON.parse(event.body || '{}');
    if (!userImage) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing userImage' }) };
    }

    const headers = {
      'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
      'Content-Type': 'application/json'
    };

    // Use a vision-capable text model for short descriptions, then one inexpensive
    // text-to-image generation call. No image-edit endpoint or per-edit premium fee.
    const visionModels = ['mistral-31-24b', 'qwen-2.5-vl'];
    let sceneAnalysis = '';
    let workingModel = '';

    for (const model of visionModels) {
      const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Describe only visible facts in this photo in at most 280 characters. Include camera view, background, major objects and their positions, lighting, and colors. Do not guess text or invent details.' },
              { type: 'image_url', image_url: { url: userImage } }
            ]
          }],
          max_tokens: 130
        })
      });
      if (!response.ok) {
        console.error('Scene vision failed:', model, response.status, (await response.text()).slice(0, 300));
        continue;
      }
      const result = await response.json();
      const description = result.choices?.[0]?.message?.content || '';
      if (description.length > 10) {
        sceneAnalysis = description.slice(0, 320);
        workingModel = model;
        break;
      }
    }

    if (!sceneAnalysis) {
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not analyze the captured scene with available vision models' }) };
    }

    // Deliberately do not feed the realistic mascot reference into vision analysis.
    // A fixed text description defines the mascot in the same cartoon style as the scene.
    const dogAnalysis = 'a friendly cartoon Shiba-like Bitcoin mascot, orange hoodie, bold white Bitcoin symbol, simplified shapes, thick black outlines, flat colors, cel shading';

    // Keep the prompt comfortably below Venice's 1,500-character limit.
    const placementPrompt = `BOLD 2D EDITORIAL CARTOON ILLUSTRATION — NOT A PHOTO. Recreate this scene: ${sceneAnalysis}. Preserve the camera view, composition, background layout, and positions of major objects, but DRAW THE ENTIRE IMAGE as one cohesive cartoon. Thick confident black ink outlines, simplified graphic shapes, expressive clean linework, flat vivid colors, and clear cel shading. Background and people/objects must be illustrated in the same style. Add this mascot: ${dogAnalysis}. Draw it as a flat 2D cartoon, not a realistic animal. Keep its orange hoodie and white Bitcoin symbol clear. Use simple painted shadows only. ABSOLUTELY NO photorealism, realistic skin or fur texture, photographic lighting, 3D rendering, lens effects, fine photographic detail, extra dogs, captions, or watermark.`;
    if (placementPrompt.length > 1450) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Generation prompt exceeded safe length limit', promptLength: placementPrompt.length }) };
    }

    console.log('Dogify prompt length:', placementPrompt.length, 'vision model:', workingModel);

    const imageResponse = await fetch('https://api.venice.ai/api/v1/images/generations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'venice-sd35',
        prompt: placementPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'auto',
        response_format: 'url'
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('Venice image generation error:', imageResponse.status, errorText);
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          error: `Venice image generation failed: ${imageResponse.status}`,
          details: errorText.substring(0, 500)
        })
      };
    }

    const imageResult = await imageResponse.json();
    const imageUrl = imageResult.data?.[0]?.url || imageResult.url || imageResult.images?.[0];
    if (!imageUrl) {
      console.error('Unexpected Venice response keys:', Object.keys(imageResult));
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'No image URL found in Venice response' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageUrl,
        sceneAnalysis,
        dogAnalysis,
        placementPrompt,
        visionModel: workingModel,
        imageModel: 'venice-sd35',
        processingMode: 'scene-vision-plus-fixed-cartoon-mascot-generation'
      })
    };
  } catch (err) {
    console.error('Venice function error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message || 'Unexpected image processing error' }) };
  }
};
