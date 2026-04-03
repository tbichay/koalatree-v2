import { list, get } from "@vercel/blob";

// Public proxy for the onboarding audio — no auth needed
// Finds the blob automatically by prefix instead of relying on env var
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "audio/onboarding-willkommen", limit: 1 });

    if (blobs.length === 0) {
      return new Response("Onboarding audio not yet generated", { status: 404 });
    }

    const blobMeta = blobs[0];

    // Use get() to access private blob data
    const result = await get(blobMeta.url, { access: "private" });
    if (!result) {
      return new Response("Onboarding audio not found", { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "audio/wav",
        "Content-Length": String(result.blob.size),
        "Cache-Control": "public, max-age=86400", // Cache for 24h
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("[Onboarding Audio] Error:", error);
    return new Response("Error fetching onboarding audio", { status: 500 });
  }
}
