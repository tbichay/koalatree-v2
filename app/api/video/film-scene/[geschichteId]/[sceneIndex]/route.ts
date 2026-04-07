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
  const idx = String(sceneIndex).padStart(3, "0");

  try {
    const { blobs } = await list({ prefix: `films/${geschichteId}/scene-${idx}`, limit: 3 });
    const clip = blobs.find((b) => b.pathname.endsWith(".mp4"));

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
