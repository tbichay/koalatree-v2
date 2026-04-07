import { auth } from "@/lib/auth";
import { list, get } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ geschichteId: string; sceneIndex: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { geschichteId, sceneIndex } = await params;
  const idx = parseInt(sceneIndex);
  const paddedIdx = String(idx).padStart(3, "0");

  try {
    // Search for both naming conventions: scene-0.mp4 and scene-000.mp4
    const { blobs } = await list({ prefix: `films/${geschichteId}/scene-`, limit: 100 });
    const clip = blobs
      .filter((b) => b.pathname.endsWith(".mp4"))
      .find((b) => {
        const match = b.pathname.match(/scene-(\d+)\.mp4$/);
        return match && parseInt(match[1]) === idx;
      });

    if (!clip) return new Response("Clip not found", { status: 404 });

    const result = await get(clip.url, { access: "private" });
    if (!result?.stream) return new Response("Unavailable", { status: 503 });

    // Read full buffer for proper Content-Length (required for video playback/seeking)
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);

    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
