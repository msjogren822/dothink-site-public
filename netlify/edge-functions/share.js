// Share page for /share/{uuid}, backed by context-specific Netlify Blobs.
import { getStore } from "@netlify/blobs";

const STORE_PREFIX = "dogify-images";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function page(title, message, status = 404) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main style="max-width:600px;margin:3rem auto;padding:1rem;font-family:system-ui,sans-serif;text-align:center"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/dogify.html">Create your own $DOGified photo →</a></p></main></body></html>`, {
    status, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
  });
}

export default async (request, context) => {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments[segments.length - 1];

  if (!id || !UUID_PATTERN.test(id)) return page("Invalid image ID", "This share link is not valid.", 400);

  try {
    const contextName = context?.deploy?.context || "unknown";
    const store = getStore(`${STORE_PREFIX}-${contextName}`);
    const record = await store.get(`${id}.json`, { type: "json" });
    if (!record || record.id !== id || !record.image_key) {
      return page("Image not found", "This $DOGified image may have been removed or the link is incorrect.", 404);
    }

    const imageUrl = `https://${url.host}/.netlify/functions/serve-dogify-blob?id=${encodeURIComponent(id)}`;
    const shareUrl = `https://${url.host}/share/${id}`;
    const title = "Check out my $DOGified photo!";
    const description = "I used AI to add a cute dog to my photo! Create your own at dothink.in";
    const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:image" content="${imageUrl}"><meta property="og:image:width" content="600"><meta property="og:image:height" content="600">
<meta property="og:image:type" content="${escapeHtml(record.image_content_type || "image/jpeg")}"><meta property="og:url" content="${shareUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="$DOGify - AI Photo Generator">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${imageUrl}">
<link rel="stylesheet" href="/assets/css/dogify.css">
</head><body>
<script async src="https://static.addtoany.com/menu/page.js"></script>
<main class="share-page" style="text-align:center;max-width:600px;margin:2rem auto;padding:1rem">
<h1>🐕 ${title}</h1><img src="${imageUrl}" alt="AI Generated Dogified Image" class="shared-image" style="max-width:100%;height:auto;border-radius:12px">
<section style="margin:2rem 0;padding:1rem;background:#f0f8ff;border-radius:8px;border:2px solid #0070f3"><h2>Create Your Own $DOGified Photo!</h2><p>Turn your selfies into fun AI art with cute dogs added to the scene.</p><a href="/dogify.html">🎨 Try $DOGify →</a></section>
<h3>Share this photo:</h3><div class="a2a_kit a2a_kit_size_32 a2a_default_style" data-a2a-url="${shareUrl}" data-a2a-title="${title}"><a class="a2a_button_facebook"></a><a class="a2a_button_x"></a><a class="a2a_button_linkedin"></a><a class="a2a_dd" href="https://www.addtoany.com/share"></a></div>
<details style="margin-top:2rem;text-align:left"><summary>Technical details</summary>
<p><strong>Generated:</strong> ${escapeHtml(record.created_at || "Unknown")}</p><p><strong>Model:</strong> ${escapeHtml(record.model_used || "Venice AI")}</p>
${record.scene_analysis ? `<p><strong>Scene analysis:</strong> ${escapeHtml(record.scene_analysis)}</p>` : ""}
${record.generation_prompt ? `<p><strong>Generation prompt:</strong> ${escapeHtml(record.generation_prompt)}</p>` : ""}
<p><strong>Share URL:</strong> <code>${shareUrl}</code></p><p><strong>Image URL:</strong> <code>${imageUrl}</code></p>
</details></main><footer style="text-align:center;margin-top:2rem">Powered by <a href="https://venice.ai/chat?ref=aHYnVr">Venice.ai</a></footer></body></html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=60" } });
  } catch (error) {
    console.error("Dogify share page error:", error);
    return page("Unable to load image", "There was a problem reading this share record from storage.", 500);
  }
};
