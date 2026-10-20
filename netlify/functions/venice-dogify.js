// netlify/functions/venice-dogify.js
exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }
    if (!process.env.VENICE_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Venice API key not configured' }) };
    }

    const { userImage, dogImage } = JSON.parse(event.body || '{}');
    if (!userImage || !dogImage) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing userImage or dogImage' }) };
    }

    const headers = {
      'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
      'Content-Type': 'application/json'
    };

    // Use a vision-capable text model for short descriptions, then one inexpensive
    // text-to-image generation call. No image-edit endpoint or per-edit premium fee.
    const visionModels = ['mistral-31-24b', 'qwen-2.5-vl'];
    let sceneAnalysis = '';
    let dogAnalysis = '';
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

    const dogResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: workingModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this mascot in at most 120 characters: its appearance, clothing, colors, and logo. Only mention visible details.' },
            { type: 'image_url', image_url: { url: dogImage } }
          ]
        }],
        max_tokens: 65
      })
    });
    if (dogResponse.ok) {
      const result = await dogResponse.json();
      dogAnalysis = (result.choices?.[0]?.message?.content || '').slice(0, 150);
    }
    if (!dogAnalysis) dogAnalysis = 'a small orange Shiba-like dog wearing an orange hoodie with a white Bitcoin symbol';

    // Keep the prompt comfortably below Venice's 1,500-character limit.
    const placementPrompt = `Editorial cartoon, not a photo. Recreate this scene: ${sceneAnalysis}. Keep the same camera view, composition, background, object positions, lighting, and colors. Use clean ink outlines, simplified accurate shapes, subtle painterly texture, and a restrained palette. Add this Bitcoin dog: ${dogAnalysis}. Keep its orange hoodie and white Bitcoin symbol clear. Match scale, perspective, and lighting. Do not invent or rearrange scene elements. No photorealism, extra dogs, captions, or watermark.`;
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
        style: 'natural',
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
        processingMode: 'vision-description-plus-cartoon-generation'
      })
    };
  } catch (err) {
    console.error('Venice function error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message || 'Unexpected image processing error' }) };
  }
};
