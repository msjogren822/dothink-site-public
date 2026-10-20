// Save Dogify images and share-history metadata in Netlify Blobs.
// No Supabase dependency: each share URL is backed by an image and a JSON record.

import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const STORE_NAME = "dogify-blobs-smoke-test";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { imageData, sceneAnalysis, generationPrompt, modelUsed, generationTimeSeconds, userSession } = body;
    if (typeof imageData !== "string" || !imageData) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing imageData" }) };
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
      return { statusCode: 413, headers, body: JSON.stringify({ ok: false, error: "Image too large", details: "Maximum image size is 1.5 MB." }) };
    }

    const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;
    const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4e && imageBuffer[3] === 0x47;
    if (!isJpeg && !isPng) throw new Error("The image bytes are not a valid JPEG or PNG.");
    contentType = isPng ? "image/png" : "image/jpeg";

    const id = randomUUID();
    const extension = isPng ? "png" : "jpg";
    const imageKey = `${id}.${extension}`;
    const createdAt = new Date().toISOString();
    const store = getStore(STORE_NAME);

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

    // Write image first, then its JSON record. If metadata writing fails, remove the image.
    await store.set(imageKey, imageBuffer, { metadata: { contentType } });
    try {
      await store.set(`${id}.json`, JSON.stringify(record), { metadata: { contentType: "application/json" } });
    } catch (error) {
      await store.delete(imageKey).catch(() => {});
      throw error;
    }

    const host = event.headers?.["x-forwarded-host"] || event.headers?.host || event.headers?.Host;
    const origin = host ? `https://${host}` : "";
    const imageUrl = `${origin}/.netlify/functions/serve-dogify-blob?id=${id}`;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, id, url: imageUrl, size: imageBuffer.length, message: "Image and share history saved to Netlify Blobs." })
    };
  } catch (error) {
    console.error("Dogify Blobs save failed:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: "Failed to save image", details: error?.message || "Unknown error" })
    };
  }
}
