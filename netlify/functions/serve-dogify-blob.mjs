import { getStore } from "@netlify/blobs";

const STORE_NAME = "dogify-blobs-smoke-test";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !UUID_PATTERN.test(id)) return new Response("Invalid image ID", { status: 400 });

  try {
    const store = getStore(STORE_NAME);
    const record = await store.get(`${id}.json`, { type: "json" });
    if (!record || record.id !== id || !record.image_key) {
      return new Response("Image not found", { status: 404 });
    }

    const image = await store.get(record.image_key, { type: "arrayBuffer" });
    if (!image) return new Response("Image not found", { status: 404 });

    return new Response(image, {
      status: 200,
      headers: {
        "content-type": record.image_content_type || "image/jpeg",
        "cache-control": "public, max-age=86400",
        "content-length": String(image.byteLength),
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Failed to read Dogify image from Netlify Blobs:", error);
    return new Response("Unable to retrieve image", { status: 500 });
  }
}
