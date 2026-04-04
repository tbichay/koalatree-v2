import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { get } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const geschichte = await prisma.geschichte.findUnique({
    where: { id },
    select: { audioUrl: true, userId: true },
  });

  if (!geschichte || !geschichte.audioUrl) {
    return new Response("Not found", { status: 404 });
  }

  if (geschichte.userId !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    // Use get() which handles auth internally (Bearer token)
    const result = await get(geschichte.audioUrl, { access: "private" });

    if (!result || !result.stream) {
      console.error("[Audio Proxy] Blob not found or empty:", geschichte.audioUrl);
      return new Response("Audio not found", { status: 404 });
    }

    const contentType = result.blob.contentType || "audio/mpeg";
    const size = result.blob.size || 0;

    return new Response(result.stream, {
      headers: {
        "Content-Type": contentType,
        ...(size > 0 ? { "Content-Length": String(size) } : {}),
        "Accept-Ranges": "none",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Audio Proxy] Error:", error);
    return new Response("Error fetching audio", { status: 500 });
  }
}
