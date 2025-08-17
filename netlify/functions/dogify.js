const sharp = require('sharp');

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
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (err) {
      console.error('JSON parse error:', err);
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) };
    }

    const { userImage, dogImage } = body;
    if (!userImage || !dogImage) {
      return { statusCode: 400, body: JSON.stringify({ 
        ok: false, 
        error: 'Missing required images',
        debug: { hasUser: !!userImage, hasDog: !!dogImage }
      })};
    }

    // Convert images to buffers with error checking
    const user = await dataUrlToBuffer(userImage);
    const dog = await dataUrlToBuffer(dogImage);

    // Process images with detailed error logging
    try {
      const userImg = sharp(user.buffer).rotate();
      const userMeta = await userImg.metadata();
      console.log('User image metadata:', userMeta);

      const dogResized = await sharp(dog.buffer)
        .resize({ 
          width: Math.round(userMeta.width * 0.5), 
          height: Math.round(userMeta.height * 0.5),
          fit: 'inside'
        })
        .toBuffer();
      
      const merged = await userImg
        .composite([{
          input: dogResized,
          gravity: 'southeast',
          top: 10,
          left: 10
        }])
        .jpeg({ quality: 85 })
        .toBuffer();

      const mergedDataUrl = `data:image/jpeg;base64,${merged.toString('base64')}`;

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          ok: true, 
          mergedImage: mergedDataUrl,
          debug: { 
            userSize: userMeta.size,
            dogSize: dogResized.length,
            mergedSize: merged.length
          }
        })
      };
    } catch (err) {
      console.error('Image processing error:', err);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ 
          ok: false, 
          error: 'Image processing failed',
          debug: err.message 
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
