const { default: sharp } = require('sharp');

function dataUrlToBuffer(dataUrl) {
  try {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL format');
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  } catch (err) {
    console.error('dataUrlToBuffer error:', err);
    throw new Error(`Failed to parse data URL: ${err.message}`);
  }
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { 
        statusCode: 405, 
        body: JSON.stringify({ ok: false, error: 'Method not allowed' }) 
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (err) {
      console.error('JSON parse error:', err);
      return { 
        statusCode: 400, 
        body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) 
      };
    }

    const { userImage, dogImage } = body;
    
    // Add size logging
    console.log('Received image sizes:', {
      userImage: userImage?.length,
      dogImage: dogImage?.length
    });

    if (!userImage || !dogImage) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ 
          ok: false, 
          error: 'Missing required images',
          debug: { hasUser: !!userImage, hasDog: !!dogImage }
        })
      };
    }

    // Convert and resize images
    try {
      const user = dataUrlToBuffer(userImage);
      const dog = dataUrlToBuffer(dogImage);

      const userImg = sharp(user.buffer);
      const userMeta = await userImg.metadata();

      // Resize dog image to 30% of user image width
      const dogResized = await sharp(dog.buffer)
        .resize({ 
          width: Math.round(userMeta.width * 0.3),
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();

      const merged = await userImg
        .composite([{
          input: dogResized,
          gravity: 'southeast',
          top: 20,
          left: 20
        }])
        .jpeg({ quality: 80 })
        .toBuffer();

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          mergedImage: `data:image/jpeg;base64,${merged.toString('base64')}`,
          debug: {
            userSize: user.buffer.length,
            dogSize: dogResized.length,
            outputSize: merged.length
          }
        })
      };

    } catch (err) {
      console.error('Image processing error:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: 'Image processing failed: ' + err.message
        })
      };
    }
  } catch (err) {
    console.error('Handler error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
