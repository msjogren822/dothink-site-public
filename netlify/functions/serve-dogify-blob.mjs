import { getStore } from "@netlify/blobs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET" }
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!id || !uuidPattern.test(id)) {
    return new Response("Invalid image ID", { status: 400 });
  }

  try {
    const store = getStore("dogify-blobs-smoke-test");
    const image = await store.get(`${id}.jpg`, { type: "arrayBuffer" });

    if (!image) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(image, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=86400",
        "content-length": String(image.byteLength)
      }
    });
  } catch (error) {
    console.error("Failed to read Dogify image from Netlify Blobs:", error);
    return new Response("Unable to retrieve image", { status: 500 });
  }
}
