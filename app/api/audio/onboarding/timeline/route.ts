import { list, get } from "@vercel/blob";

export const dynamic = "force-dynamic";

// Public proxy for the onboarding timeline — no auth needed
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "audio/onboarding-willkommen-timeline", limit: 1 });

    if (blobs.length === 0) {
      return Response.json([], {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const blobMeta = blobs[0];
    const result = await get(blobMeta.url, { access: "private" });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json([]);
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // 1h cache
      },
    });
  } catch (error) {
    console.error("[Timeline] Error:", error);
    return Response.json([], { status: 500 });
  }
}
