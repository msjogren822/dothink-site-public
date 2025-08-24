// netlify/edge-functions/share.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async (request, context) => {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
  const imageId = pathSegments[pathSegments.length - 1]; // Get the last non-empty segment
  
  console.log('Share page request:', {
    pathname: url.pathname,
    segments: pathSegments,
    extractedId: imageId
  });

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!imageId || !uuidRegex.test(imageId)) {
    return new Response(`
<!DOCTYPE html>
<html><head><title>Invalid Image ID</title></head>
<body>
  <h1>Invalid Image ID</h1>
  <p><a href="/dogify.html">Create your own $DOGified photo →</a></p>
</body></html>`, { 
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  try {
    // Get image metadata from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_DATABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const { data: imageData, error } = await supabase
      .from('dogify_images')
      .select('id, created_at, scene_analysis, generation_prompt, model_used')
      .eq('id', imageId)
      .single();

    if (error || !imageData) {
      return new Response(`
<!DOCTYPE html>
<html><head><title>Image Not Found</title></head>
<body>
  <h1>Image Not Found</h1>
  <p>This $DOGified image may have been removed or the link is incorrect.</p>
  <p><a href="/dogify.html">Create your own $DOGified photo →</a></p>
</body></html>`, { 
        status: 404,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Construct the absolute image URL
    const imageUrl = `https://${url.host}/.netlify/functions/serve-dogify-image-clean?id=${imageId}`;
    const shareUrl = `https://${url.host}/share/${imageId}`;
    
    // Generate the HTML with proper meta tags - STATIC HTML that crawlers can read
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check out my $DOGified photo!</title>
  
  <!-- Essential Open Graph tags - STATIC, readable by social media crawlers -->
  <meta property="og:title" content="Check out my $DOGified photo!">
  <meta property="og:description" content="I used AI to add a cute dog to my photo! Create your own at dothink.in">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="600">
  <meta property="og:image:height" content="600">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="$DOGify - AI Photo Generator">
  
  <!-- Twitter Card tags - STATIC -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Check out my $DOGified photo!">
  <meta name="twitter:description" content="I used AI to add a cute dog to my photo! Create your own at dothink.in">
  <meta name="twitter:image" content="${imageUrl}">
  
  <link rel="stylesheet" href="/assets/css/dogify.css">
  <style>
    .share-page {
      text-align: center;
      max-width: 600px;
      margin: 2rem auto;
      padding: 1rem;
    }
    .shared-image {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      margin: 1rem 0;
    }
    .create-your-own {
      margin: 2rem 0;
      padding: 1rem;
      background: #f0f8ff;
      border-radius: 8px;
      border: 2px solid #0070f3;
    }
    .create-button {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: #0070f3;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 0.5rem;
    }
    .create-button:hover {
      background: #0051b3;
    }
  </style>
</head>
<body>
  <script async src='https://static.addtoany.com/menu/page.js'></script>
  
  <div class="share-page">
    <h1>🐕 Check out my $DOGified photo!</h1>
    
    <img src="${imageUrl}" alt="AI Generated Dogified Image" class="shared-image" />
    
    <div class="create-your-own">
      <h3>Create Your Own $DOGified Photo!</h3>
      <p>Turn your selfies into fun AI art with cute dogs added to the scene.</p>
      <a href="/dogify.html" class="create-button">🎨 Try $DOGify →</a>
    </div>
    
    <!-- Share buttons with STATIC URLs - these are set before AddToAny script loads -->
    <div style="margin: 1rem 0;">
      <h3>Share this photo:</h3>
      <div class='a2a_kit a2a_kit_size_32 a2a_default_style' 
           data-a2a-url='${shareUrl}' 
           data-a2a-title='Check out my $DOGified photo!' 
           data-a2a-image='${imageUrl}'>
        <a class='a2a_button_facebook'></a>
        <a class='a2a_button_twitter'></a>
        <a class='a2a_button_linkedin'></a>
        <a class='a2a_button_pinterest'></a>
        <a class='a2a_dd' href='https://www.addtoany.com/share'></a>
      </div>
    </div>
    
    <!-- Technical details -->
    <details style="margin-top: 2rem; text-align: left;">
      <summary style="cursor: pointer; font-weight: 600;">Technical Details</summary>
      <div style="margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;">
        <p><strong>Generated:</strong> ${new Date(imageData.created_at).toLocaleString()}</p>
        <p><strong>Model:</strong> ${imageData.model_used || 'Venice AI'}</p>
        ${imageData.scene_analysis ? `<p><strong>Scene Analysis:</strong> ${imageData.scene_analysis}</p>` : ''}
        ${imageData.generation_prompt ? `<p><strong>Generation Prompt:</strong> ${imageData.generation_prompt}</p>` : ''}
        <p><strong>Share URL:</strong> <code>${shareUrl}</code></p>
        <p><strong>Image URL:</strong> <code>${imageUrl}</code></p>
      </div>
    </details>
  </div>
  
  <div class="powered-by" style="text-align: center; margin-top: 2rem;">
    <span style="color: #666;">Powered by</span>
    <a href="https://venice.ai/chat?ref=aHYnVr" target="_blank">
      <img src="/assets/images/venice-logo-lockup-black.svg" alt="Venice.ai" style="height: 24px; margin-left: 0.5rem;" />
    </a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error) {
    console.error('Share page error:', error);
    return new Response(`
<!DOCTYPE html>
<html><head><title>Server Error</title></head>
<body>
  <h1>Server Error</h1>
  <p>Sorry, there was an error loading this shared image.</p>
  <p><a href="/dogify.html">Create your own $DOGified photo →</a></p>
</body></html>`, { 
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
