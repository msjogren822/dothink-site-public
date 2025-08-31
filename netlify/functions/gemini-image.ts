import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';

const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { model, prompt, imageData, mimeType } = JSON.parse(event.body || '{}');
    
    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing prompt' }),
      };
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use the image preview model for image generation and editing
    const genModel = genAI.getGenerativeModel({ 
      model: model || 'gemini-2.5-flash-image-preview' 
    });

    const parts: any[] = [{ text: prompt }];
    
    // Add image if provided
    if (imageData) {
      parts.push({
        inlineData: {
          data: imageData,
          mimeType: mimeType || 'image/jpeg'
        }
      });
    }

    const result = await genModel.generateContent(parts);
    const response = await result.response;
    
    // Check if response contains image data
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const candidate = candidates[0];
      if (candidate.content && candidate.content.parts) {
        const imagePart = candidate.content.parts.find((part: any) => part.inlineData);
        if (imagePart && imagePart.inlineData) {
          // Return as base64 data URL
          const dataUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: JSON.stringify({ result: dataUrl }),
          };
        }
      }
    }

    // If no image in response, return text
    const text = response.text();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ result: text }),
    };
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
