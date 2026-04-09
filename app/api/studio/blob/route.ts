/**
 * Studio Blob Proxy — Serve private Vercel Blob assets
 *
 * GET /api/studio/blob?url=<blob-url>
 *
 * Proxies private Vercel Blob URLs so the browser can access
 * audio, video, and image assets stored in the private store.
 */

import { auth } from "@/lib/auth";
import { get } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const blobUrl = searchParams.get("url");

  if (!blobUrl) return new Response("Missing url parameter", { status: 400 });

  // Only allow Vercel Blob URLs
  if (!blobUrl.includes(".blob.vercel-storage.com") && !blobUrl.includes(".public.blob.vercel-storage.com")) {
    return new Response("Invalid URL", { status: 400 });
  }

  try {
    const blob = await get(blobUrl, { access: "private" });
    if (!blob) return new Response("Not found", { status: 404 });

    const contentType = blobUrl.endsWith(".mp3") ? "audio/mpeg" :
      blobUrl.endsWith(".mp4") ? "video/mp4" :
      blobUrl.endsWith(".png") ? "image/png" :
      blobUrl.endsWith(".jpg") || blobUrl.endsWith(".jpeg") ? "image/jpeg" :
      "application/octet-stream";

    return new Response(blob.stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[Studio Blob Proxy] Error:", err);
    return new Response("Failed to fetch blob", { status: 500 });
  }
}
