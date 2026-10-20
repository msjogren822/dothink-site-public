import { getStore } from "@netlify/blobs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Use POST to run the Blobs smoke test." }),
      { status: 405, headers: { "content-type": "application/json", "allow": "POST" } }
    );
  }

  try {
    const store = getStore("dogify-blobs-smoke-test");
    const payload = {
      message: "Netlify Blobs write/read test succeeded",
      checkedAt: new Date().toISOString()
    };

    await store.set("smoke-test.json", JSON.stringify(payload));
    const stored = await store.get("smoke-test.json", { type: "json" });

    if (!stored || stored.message !== payload.message) {
      throw new Error("The test blob was written but could not be read back.");
    }

    return new Response(
      JSON.stringify({ ok: true, store: "dogify-blobs-smoke-test", key: "smoke-test.json", stored }),
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  } catch (error) {
    console.error("Netlify Blobs smoke test failed:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Unknown Blobs error" }),
      { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
}
