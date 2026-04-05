import { list, get } from "@vercel/blob";

export const dynamic = "force-dynamic";

// Public proxy for the onboarding audio — no auth needed.
export async function GET() {
  try {
    // Search for both .wav and .mp3 variants
    const { blobs } = await list({ prefix: "audio/onboarding-willkommen", limit: 5 });

    if (blobs.length === 0) {
      return new Response("Onboarding audio not yet generated", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Find the audio blob (not the timeline JSON)
    const audioBlob = blobs.find((b) =>
      b.pathname.endsWith(".mp3") || b.pathname.endsWith(".wav")
    );

    if (!audioBlob) {
      return new Response("Onboarding audio not yet generated", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const blob = audioBlob;

    // Use get() which handles auth internally (Bearer token)
    const result = await get(blob.url, { access: "private" });

    if (!result || !result.stream) {
      console.error("[Onboarding Audio] Blob empty:", blob.url);
      return new Response("Audio temporarily unavailable", { status: 503 });
    }

    const contentType = result.blob.contentType || "audio/mpeg";
    const size = result.blob.size || 0;

    return new Response(result.stream, {
      headers: {
        "Content-Type": contentType,
        ...(size > 0 ? { "Content-Length": String(size) } : {}),
        "Cache-Control": "public, max-age=300, s-maxage=300",
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
