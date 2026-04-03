import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { get } from "@vercel/blob";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const geschichte = await prisma.geschichte.findUnique({
    where: { id },
    select: { audioUrl: true, userId: true },
  });

  if (!geschichte || !geschichte.audioUrl) {
    return new Response("Not found", { status: 404 });
  }

  // Only allow the owner to access their audio
  if (geschichte.userId !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const result = await get(geschichte.audioUrl, { access: "private" });
    if (!result) {
      return new Response("Blob not found", { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "audio/wav",
        "Content-Length": String(result.blob.size),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("[Audio Proxy] Error fetching blob:", error);
    return new Response("Error fetching audio", { status: 500 });
  }
}
