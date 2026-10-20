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

    const { userImage, dogImage } = JSON.parse(event.body || '{}');

    if (!userImage || !dogImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage or dogImage' })
      };
    }

    // Convert data URLs to raw base64, as required by Venice's multi-edit endpoint.
    const toBase64 = (value) => {
      const comma = value.indexOf(',');
      return value.startsWith('data:') && comma !== -1 ? value.slice(comma + 1) : value;
    };

    // Keep the captured photo as the base image and use the supplied Bitcoin dog
    // image as a visual reference. No vision/chat LLM calls are needed.
    const placementPrompt = 'Restyle the FIRST image as a polished editorial cartoon with clean ink outlines, simplified shapes, subtle painterly texture, and a tasteful limited color palette. Preserve the original photo composition: same camera angle, framing, background, objects, positions, colors, and spatial relationships. Do not reinterpret, rearrange, add, or remove scene elements. Add the dog from the SECOND reference image naturally into the scene, retaining its distinctive orange hoodie and white Bitcoin symbol. Match perspective, scale, lighting, and contact shadows. No photorealism, no extra dogs, no text, no watermark.';

    console.log('Dogify: cartoonizing source photo with Venice image multi-edit.');

    const imageResponse = await fetch('https://api.venice.ai/api/v1/image/multi-edit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: 'firered-image-edit',
        images: [toBase64(userImage), toBase64(dogImage)],
        prompt: placementPrompt,
        resolution: '1K',
        output_format: 'png',
        enhance_prompt: false
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

    // Venice returns the edited image as raw binary, not JSON or a hosted URL.
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (!imageBuffer.length) {
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, error: 'Venice returned an empty edited image' })
      };
    }

    const imageDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: imageDataUrl,
        sceneAnalysis: 'Direct image editing: original photo used as the base image.',
        dogAnalysis: 'Dog supplied as a visual reference image.',
        placementPrompt,
        visionModel: 'none',
        imageModel: 'firered-image-edit',
        processingMode: 'single-call-image-to-image'
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
