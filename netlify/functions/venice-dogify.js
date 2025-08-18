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

    console.log('Venice.ai: Testing venice-uncensored and mistral-31-24b vision models...');

    // Try the working vision models
    const visionModels = ["venice-uncensored", "mistral-31-24b"];
    let sceneAnalysis = "";
    let workingModel = "";

    for (const model of visionModels) {
      console.log(`Trying vision model: ${model}`);
      
      const visionResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Describe this image in extreme detail for accurate reproduction. Focus on: exact lighting conditions, specific colors, textures, objects, furniture placement, wall colors, floor materials, background elements, shadows, perspective. Be precise and factual." 
              },
              { 
                type: "image_url", 
                image_url: { url: userImage } 
              }
            ]
          }],
          max_tokens: 500
        })
      });

      const responseText = await visionResponse.text();
      console.log(`${model} response status:`, visionResponse.status);
      console.log(`${model} response:`, responseText);

      if (visionResponse.ok) {
        try {
          const visionResult = JSON.parse(responseText);
          sceneAnalysis = visionResult.choices?.[0]?.message?.content || "";
          if (sceneAnalysis && sceneAnalysis.length > 10) {
            workingModel = model;
            console.log(`SUCCESS with ${model}:`, sceneAnalysis);
            break; // Stop trying other models
          }
        } catch (parseError) {
          console.error(`Parse error with ${model}:`, parseError);
          continue;
        }
      } else {
        console.error(`Failed with ${model}:`, responseText);
        continue; // Try next model
      }
    }

    // If no vision model worked
    if (!sceneAnalysis || sceneAnalysis.length < 10) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Both venice-uncensored and mistral-31-24b vision models failed',
          details: 'Could not get accurate scene description from available vision models'
        })
      };
    }

    console.log('Scene analysis:', sceneAnalysis);

    // For now, just return the vision analysis to see if it's accurate
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generatedImageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjUxMiIgeT0iNTEyIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzMzMzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+VmlzaW9uIFRlc3Q6IENoZWNrIEFuYWx5c2lzIEJlbG93PC90ZXh0Pgo8L3N2Zz4K", // Placeholder SVG
        sceneAnalysis: sceneAnalysis,
        visionModel: workingModel,
        testPhase: "Testing venice-uncensored and mistral-31-24b vision models",
        debugInfo: {
          workingModel: workingModel,
          analysisLength: sceneAnalysis.length
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
