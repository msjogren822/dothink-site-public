// Save Dogify images and share-history metadata in Netlify Blobs.
// Uses a context-specific store so Deploy Previews cannot write to production data.

import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const STORE_PREFIX = "dogify-images";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await request.json();
    const { imageData, sceneAnalysis, generationPrompt, modelUsed, generationTimeSeconds, userSession } = body;
    if (typeof imageData !== "string" || !imageData) {
      return new Response(JSON.stringify({ ok: false, error: "Missing imageData" }), { status: 400, headers });
    }

    let imageBuffer;
    let contentType;
    if (imageData.startsWith("data:image/")) {
      const match = imageData.match(/^data:(image\/(?:jpeg|jpg|png));base64,([\s\S]+)$/i);
      if (!match) throw new Error("Image must be a base64 JPEG or PNG data URL.");
      contentType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
      imageBuffer = Buffer.from(match[2], "base64");
    } else if (/^https?:\/\//i.test(imageData)) {
      const response = await fetch(imageData);
      if (!response.ok) throw new Error(`Unable to fetch image: HTTP ${response.status}`);
      contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!["image/jpeg", "image/jpg", "image/png"].includes(contentType)) {
        throw new Error("Image URL did not return a JPEG or PNG.");
      }
      if (contentType === "image/jpg") contentType = "image/jpeg";
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error("imageData must be a JPEG/PNG data URL or HTTP(S) URL.");
    }

    if (!imageBuffer.length) throw new Error("The image was empty.");
    if (imageBuffer.length > 1.5 * 1024 * 1024) {
      return new Response(JSON.stringify({ ok: false, error: "Image too large", details: "Maximum image size is 1.5 MB." }), { status: 413, headers });
    }

    const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;
    const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4e && imageBuffer[3] === 0x47;
    if (!isJpeg && !isPng) throw new Error("The image bytes are not a valid JPEG or PNG.");
    contentType = isPng ? "image/png" : "image/jpeg";

    const id = randomUUID();
    const imageKey = `${id}.${isPng ? "png" : "jpg"}`;
    const createdAt = new Date().toISOString();
    const contextName = context?.deploy?.context || "unknown";
    const store = getStore(`${STORE_PREFIX}-${contextName}`);

    const record = {
      id,
      created_at: createdAt,
      image_key: imageKey,
      image_content_type: contentType,
      image_size: imageBuffer.length,
      scene_analysis: sceneAnalysis || null,
      generation_prompt: generationPrompt || null,
      model_used: modelUsed || null,
      generation_time_seconds: Number.isFinite(Number(generationTimeSeconds)) ? Number(generationTimeSeconds) : null,
      user_session: userSession || null
    };

    await store.set(imageKey, imageBuffer, { metadata: { contentType } });
    try {
      await store.set(`${id}.json`, JSON.stringify(record), { metadata: { contentType: "application/json" } });
    } catch (error) {
      await store.delete(imageKey).catch(() => {});
      throw error;
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const origin = host ? `https://${host}` : "";
    const imageUrl = `${origin}/.netlify/functions/serve-dogify-blob?id=${id}`;
    return new Response(JSON.stringify({ ok: true, id, url: imageUrl, size: imageBuffer.length, message: "Image and share history saved to Netlify Blobs." }), { status: 200, headers });
  } catch (error) {
    console.error("Dogify Blobs save failed:", error);
    return new Response(JSON.stringify({ ok: false, error: "Failed to save image", details: error?.message || "Unknown error" }), { status: 500, headers });
  }
}
