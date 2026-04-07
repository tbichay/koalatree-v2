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

    return new Response(result.stream, {
      headers: {
        "Content-Type": "video/mp4",
        ...(result.blob.size ? { "Content-Length": String(result.blob.size) } : {}),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
