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
              { type: 'text', text: 'Describe the visible scene in at most 280 characters. Identify its main subjects (which may be people, animals, landscapes, buildings, or objects), their positions, camera view, background, and dominant colors. Mention people only if present. Stick to visible facts; do not invent details.' },
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
    const dogAnalysis = 'a separate small, four-legged Shiba Inu mascot with orange-and-cream fur, round friendly face, upright pointed ears, curled fluffy tail, wearing its distinctive orange hoodie with a large clear white Bitcoin ₿ symbol';

    // Keep the prompt comfortably below Venice's 1,500-character limit.
    const placementPrompt = `BOLD 2D EDITORIAL CARTOON — NOT A PHOTO. Scene: ${sceneAnalysis}. Preserve the scene's overall viewpoint, layout, and key subjects. Redraw the entire image as one cohesive 2D cartoon with thick black ink outlines, simplified shapes, flat vivid colors, and cel shading. Add ONE SEPARATE, clearly visible small Shiba Inu mascot: ${dogAnalysis}. Place it naturally in an open area of the scene, beside the main subject when suitable, without covering important details. Keep the mascot a distinct four-legged dog; never merge it with, replace, or transform any person, animal, or object in the original scene. Preserve the original scene's subjects and setting. Keep the orange hoodie and white Bitcoin ₿ symbol clear. No photorealism, 3D rendering, extra mascot dogs, captions, or watermark.`;
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
