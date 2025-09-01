const { GoogleGenerativeAI } = require('@google/generative-ai');

const STYLE_MAP = {
  cartoon: {
    label: 'cartoon',
    render: 'simplified forms, flat colors, bold outlines, limited shading, high contrast blocks, no photorealistic detail',
  },
  bauhaus: {
    label: 'bauhaus',
    render: 'geometric abstraction, primary colors (red, yellow, blue), black and white accents, strong composition, minimal detail',
  },
  impressionist: {
    label: 'impressionist',
    render: 'visible broken brushstrokes, soft edges, atmospheric perspective, emphasis on light and color over fine detail',
  },
  cubist: {
    label: 'cubist',
    render: 'faceted planes, geometric decomposition, multiple viewpoints, limited palette, strong angular edges',
  },
  art_deco: {
    label: 'art deco',
    render: 'streamlined forms, metallic accents, bold geometric patterns, poster-like simplification, limited gradients',
  },
  watercolor: {
    label: 'watercolor',
    render: 'soft washes, bleeding edges, paper texture, translucent layers, low micro-detail, no hard specular highlights',
  },
  oil_painting: {
    label: 'oil painting',
    render: 'heavy impasto texture, thick palette-knife strokes, visible brushwork, layered paint buildup, classical pigment mixing',
  },
  cyberpunk: {
    label: 'cyberpunk',
    render: 'neon rim lighting, chromatic aberration, scanlines, gritty film grain, saturated magenta-cyan highlights',
  },
  minimalist: {
    label: 'minimalist',
    render: 'radically simplified shapes, few colors, strong negative space, flat shading, no texture detail',
  },
  vintage_poster: {
    label: 'vintage poster',
    render: 'halftone or lithograph texture, limited color inks, bold typography feel, flattened perspective, paper grain',
  },
};

async function callGeminiImagePreview(genAI, parts) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });
  const result = await model.generateContent(parts);
  const response = await result.response;
  const candidates = response && response.candidates;
  if (candidates && candidates.length > 0) {
    const candidate = candidates[0];
    if (candidate.content && candidate.content.parts) {
      const imagePart = candidate.content.parts.find((p) => p.inlineData);
      if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
        return imagePart.inlineData.data; // base64 image (no data URL prefix)
      }
    }
  }
  const text = response && response.text ? response.text() : 'Model did not return an image.';
  throw new Error(typeof text === 'string' ? text : 'Model did not return an image.');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      imageData, // background data URL or base64
      mimeType,
      foregroundImageData, // foreground data URL or base64
      foregroundMimeType,
      styleKey = 'cartoon',
      enforceStyle = true,
      promptExtras = '',
    } = body;

    if (!imageData || !foregroundImageData) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing images' }) };
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const style = STYLE_MAP[styleKey] || STYLE_MAP.cartoon;
    const antiPhoto = enforceStyle
      ? ' Strictly avoid photorealistic rendering, photographic textures, lens blur/bokeh, or natural camera lighting.'
      : '';

    const bgData = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const fgData = foregroundImageData.includes(',') ? foregroundImageData.split(',')[1] : foregroundImageData;

    // Pass 1 & 2 in parallel: Stylize background and subject
    const bgPrompt = `Render this image entirely in ${style.label} style with ${style.render}.${antiPhoto}` +
      (promptExtras ? ` Also consider: ${promptExtras}` : '');
    const fgPrompt = `Render this image entirely in ${style.label} style with ${style.render}.${antiPhoto}` +
      (promptExtras ? ` Also consider: ${promptExtras}` : '');

    const [bgStylizedB64, fgStylizedB64] = await Promise.all([
      callGeminiImagePreview(genAI, [
        { text: bgPrompt },
        { inlineData: { data: bgData, mimeType: mimeType || 'image/jpeg' } },
      ]),
      callGeminiImagePreview(genAI, [
        { text: fgPrompt },
        { inlineData: { data: fgData, mimeType: foregroundMimeType || 'image/jpeg' } },
      ]),
    ]);

    // Pass 3: Blend stylized images
    const blendPrompt = `Combine these two ${style.label}-styled images: use the first image as the background scene and place the subject from the second image naturally into that scene. Maintain consistent ${style.label} aesthetics, palette, material treatment, lighting, and shadows across both. Ensure seamless edges and integration.${antiPhoto}` +
      (promptExtras ? ` Also consider: ${promptExtras}` : '');
  const finalB64 = await callGeminiImagePreview(genAI, [
      { text: blendPrompt },
      { inlineData: { data: bgStylizedB64, mimeType: 'image/png' } },
      { inlineData: { data: fgStylizedB64, mimeType: 'image/png' } },
    ]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ result: `data:image/png;base64,${finalB64}` }),
    };
  } catch (err) {
    console.error('Pipeline error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err && err.message ? err.message : 'Internal server error' }) };
  }
};
