import { get } from "@vercel/blob";

// Public proxy for the onboarding audio — no auth needed
export async function GET() {
  const blobUrl = process.env.ONBOARDING_AUDIO_URL;

  if (!blobUrl) {
    return new Response("Onboarding audio not configured", { status: 404 });
  }

  try {
    const result = await get(blobUrl, { access: "private" });
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
