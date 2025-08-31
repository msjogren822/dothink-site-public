/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {limitFunction} from 'p-limit'

const timeoutMs = 123_333
const maxRetries = 5
const baseDelay = 1_233

// Use Netlify function instead of direct API call
async function callGeminiAPI(model, prompt, inputFile, signal) {
  try {
    const response = await fetch('/.netlify/functions/gemini-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        imageData: inputFile ? inputFile.split(',')[1] : null,
        mimeType: 'image/jpeg'
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

export default limitFunction(
  async ({model, prompt, inputFile, signal}) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )

        const apiPromise = callGeminiAPI(model, prompt, inputFile, signal)

        const response = await Promise.race([apiPromise, timeoutPromise])

        return response
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') {
          return
        }

        if (attempt === maxRetries - 1) {
          throw error
        }

        const delay = baseDelay * 2 ** attempt
        await new Promise(res => setTimeout(res, delay))
        console.warn(
          `Attempt ${attempt + 1} failed, retrying after ${delay}ms...`
        )
      }
    }
  },
  {concurrency: 2}
)
