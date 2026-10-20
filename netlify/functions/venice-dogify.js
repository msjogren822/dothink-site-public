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

    const { userImage } = JSON.parse(event.body || '{}');
    if (!userImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage' })
      };
    }

    // Use a single-image edit: no vision/chat calls and no second image to composite.
    // Venice accepts a data URI directly in the image field.
    const placementPrompt = 'Turn this exact photograph into a polished editorial cartoon with clean ink outlines, simplified shapes, subtle painterly texture, and a tasteful limited color palette. Preserve the original composition, camera angle, framing, background, objects, positions, and spatial relationships. Do not reinterpret, rearrange, add, or remove existing scene elements. Add one small, friendly Shiba-like Bitcoin dog naturally into the scene, wearing a distinctive orange hoodie with a clear white Bitcoin symbol. Match the photo perspective, scale, lighting, and contact shadows. No photorealism, no extra dogs, no other added objects, no text, no watermark.';

    console.log('Dogify: single-image cartoon edit request.');

    const imageResponse = await fetch('https://api.venice.ai/api/v1/image/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'firered-image-edit',
        image: userImage,
        prompt: placementPrompt,
        resolution: '1K',
        enhance_prompt: false,
        safe_mode: true
      })
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('Venice image edit error:', imageResponse.status, errorText);
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          error: `Venice image editing failed: ${imageResponse.status}`,
          details: errorText.substring(0, 500)
        })
      };
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (!imageBuffer.length) {
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, error: 'Venice returned an empty edited image' })
      };
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const imageDataUrl = `data:${contentType};base64,${imageBuffer.toString('base64')}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageDataUrl,
        sceneAnalysis: 'Direct image editing: original photo used as the base image.',
        dogAnalysis: 'Dog added from the text instruction.',
        placementPrompt,
        visionModel: 'none',
        imageModel: 'firered-image-edit',
        processingMode: 'single-call-single-image-edit'
      })
    };
  } catch (err) {
    console.error('Venice function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message || 'Unexpected image processing error' })
    };
  }
};
