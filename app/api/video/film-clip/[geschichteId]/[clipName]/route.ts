import { auth } from "@/lib/auth";
import { list, get } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ geschichteId: string; clipName: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { geschichteId, clipName } = await params;

  try {
    const { blobs } = await list({ prefix: `films/${geschichteId}/${clipName}`, limit: 1 });
    const clip = blobs.find((b) => b.pathname.endsWith(".mp4"));

    if (!clip) return new Response("Clip not found", { status: 404 });

    const result = await get(clip.url, { access: "private" });
    if (!result?.stream) return new Response("Unavailable", { status: 503 });

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
