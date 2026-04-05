import { list, get } from "@vercel/blob";
import { HELP_CLIPS } from "@/lib/help-clips";

export const dynamic = "force-dynamic";

// Public proxy for help audio clips — no auth needed.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;

  if (!HELP_CLIPS[clipId]) {
    return new Response("Unknown clip", { status: 404 });
  }

  try {
    const { blobs } = await list({ prefix: `help-clips/${clipId}`, limit: 3 });

    const audioBlob = blobs.find((b) =>
      b.pathname.endsWith(".mp3") || b.pathname.endsWith(".wav")
    );

    if (!audioBlob) {
      return new Response("Help clip not yet generated", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const result = await get(audioBlob.url, { access: "private" });

    if (!result || !result.stream) {
      return new Response("Audio temporarily unavailable", { status: 503 });
    }

    const contentType = result.blob.contentType || "audio/mpeg";
    const size = result.blob.size || 0;

    return new Response(result.stream, {
      headers: {
        "Content-Type": contentType,
        ...(size > 0 ? { "Content-Length": String(size) } : {}),
        "Cache-Control": "public, max-age=604800, s-maxage=604800", // 1 week
      },
    });
  } catch (error) {
    console.error(`[Help Audio] Error for ${clipId}:`, error);
    return new Response("Error fetching help audio", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
