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

    const { userImage, dogImage } = JSON.parse(event.body);
    
    if (!userImage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'Missing userImage' })
      };
    }

    console.log('Venice.ai: Testing basic vision model connectivity...');

    // Let's try just the basic llama model first to see what error we get
    const visionResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-vision-instruct",
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: "What do you see in this image?" 
            },
            { 
              type: "image_url", 
              image_url: { url: userImage } 
            }
          ]
        }],
        max_tokens: 200
      })
    });

    const responseText = await visionResponse.text();
    console.log('Venice vision response status:', visionResponse.status);
    console.log('Venice vision response:', responseText);

    if (!visionResponse.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: `Venice vision failed: ${visionResponse.status}`,
          details: responseText,
          debugInfo: {
            status: visionResponse.status,
            statusText: visionResponse.statusText,
            headers: Object.fromEntries(visionResponse.headers.entries())
          }
        })
      };
    }

    let visionResult;
    try {
      visionResult = JSON.parse(responseText);
    } catch (parseError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Failed to parse Venice vision response',
          details: responseText,
          parseError: parseError.message
        })
      };
    }

    const sceneAnalysis = visionResult.choices?.[0]?.message?.content || "No analysis returned";
    
    console.log('Scene analysis:', sceneAnalysis);

    // Skip image generation for now, just return the vision analysis
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjUxMiIgeT0iNTEyIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzMzMzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+VmlzaW9uIFRlc3Q8L3RleHQ+Cjwvc3ZnPgo=", // Placeholder SVG
        sceneAnalysis: sceneAnalysis,
        visionModel: "llama-3.2-11b-vision-instruct",
        testPhase: "Vision model diagnostic test",
        debugInfo: {
          visionStatus: visionResponse.status,
          visionResponse: responseText
        }
      })
    };

  } catch (err) {
    console.error('Venice function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        error: err.message,
        stack: err.stack
      })
    };
  }
};
