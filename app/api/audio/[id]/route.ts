import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { get } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;

  const { id } = await params;

  const geschichte = await prisma.geschichte.findUnique({
    where: { id },
    select: { audioUrl: true, userId: true, shareSlug: true },
  });

  if (!geschichte || !geschichte.audioUrl) {
    return new Response("Not found", { status: 404 });
  }

  // Zugriff: Owner ODER geteilte Geschichte (hat shareSlug)
  const isOwner = userId && geschichte.userId === userId;
  const isShared = !!geschichte.shareSlug;

  if (!isOwner && !isShared) {
    return new Response(userId ? "Forbidden" : "Unauthorized", { status: userId ? 403 : 401 });
  }

  try {
    const result = await get(geschichte.audioUrl, { access: "private" });

    if (!result || !result.stream) {
      console.error("[Audio Proxy] Blob not found or empty:", geschichte.audioUrl);
      return new Response("Audio not found", { status: 404 });
    }

    const contentType = result.blob.contentType || "audio/mpeg";
    const size = result.blob.size || 0;

    // Stream with proper headers — no Accept-Ranges: none
    // so browser can parse metadata progressively
    return new Response(result.stream, {
      headers: {
        "Content-Type": contentType,
        ...(size > 0 ? { "Content-Length": String(size) } : {}),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Audio Proxy] Error:", error);
    return new Response("Error fetching audio", { status: 500 });
  }
}
