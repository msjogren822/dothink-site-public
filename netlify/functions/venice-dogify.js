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
    if (!userImage || typeof userImage !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing userImage' }) };
    }

    // Venice expects raw base64, not a data:image/...;base64, prefix.
    const comma = userImage.indexOf(',');
    const imageBase64 = userImage.startsWith('data:') && comma >= 0
      ? userImage.slice(comma + 1)
      : userImage;

    const placementPrompt = 'Restyle this exact photo as a polished editorial cartoon with clean ink outlines and a restrained color palette. Preserve the same scene, framing, perspective, background, objects, and positions; do not rearrange or invent anything. Add one small, friendly Shiba-like dog wearing an orange hoodie with a white Bitcoin symbol, naturally matching the photo lighting and perspective. No photorealism, extra dogs, captions, or watermark.';

    console.log('Dogify: direct image-to-image cartoon edit; input base64 chars:', imageBase64.length);

    const startedAt = Date.now();
    const imageResponse = await fetch('https://api.venice.ai/api/v1/image/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'firered-image-edit',
        image: imageBase64,
        prompt: placementPrompt,
        enhance_prompt: false,
        safe_mode: true
      })
    });

    const elapsedMs = Date.now() - startedAt;
    console.log('Venice image edit response:', imageResponse.status, 'elapsed ms:', elapsedMs);

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
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Venice returned an empty edited image' }) };
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const imageDataUrl = `data:${contentType};base64,${imageBuffer.toString('base64')}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageDataUrl,
        sceneAnalysis: 'Original photo edited directly; no text-based scene analysis.',
        dogAnalysis: 'Dog specified directly in the edit instruction.',
        placementPrompt,
        visionModel: 'none',
        imageModel: 'firered-image-edit',
        processingMode: 'single-call-single-image-edit',
        processingTimeMs: elapsedMs
      })
    };
  } catch (err) {
    console.error('Venice function error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message || 'Unexpected image processing error' }) };
  }
};
