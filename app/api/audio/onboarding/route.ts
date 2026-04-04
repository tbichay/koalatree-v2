import { list, get } from "@vercel/blob";

export const dynamic = "force-dynamic"; // Never cache this route on Vercel edge

// Public proxy for the onboarding audio — no auth needed
// Finds the blob automatically by prefix instead of relying on env var
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "audio/onboarding-willkommen.wav", limit: 1 });

    if (blobs.length === 0) {
      return new Response("Onboarding audio not yet generated", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const blobMeta = blobs[0];

    // Use get() to access private blob data
    const result = await get(blobMeta.url, { access: "private" });

    if (!result || result.statusCode !== 200 || !result.stream) {
      console.error("[Onboarding Audio] Blob not available");
      return new Response("Audio temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "audio/wav",
        "Content-Length": String(result.blob.size),
        "Cache-Control": "public, max-age=3600, s-maxage=3600", // 1h cache (was 24h)
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("[Onboarding Audio] Error:", error);
    return new Response("Error fetching onboarding audio", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
