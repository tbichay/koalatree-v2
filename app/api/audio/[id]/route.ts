import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { head } from "@vercel/blob";

export const dynamic = "force-dynamic"; // Never cache on edge — auth required

export async function GET(
  request: Request,
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
    // Get blob metadata for size info
    const blobMeta = await head(geschichte.audioUrl);
    const totalSize = blobMeta.size;
    const contentType = blobMeta.contentType || "audio/wav";
    const rangeHeader = request.headers.get("Range");

    // Use the authenticated download URL from head() response
    const downloadUrl = blobMeta.downloadUrl;

    if (rangeHeader) {
      // Parse range request (e.g. "bytes=0-1023")
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        const rangeRes = await fetch(downloadUrl, {
          headers: { Range: `bytes=${start}-${end}` },
        });

        if (rangeRes.body) {
          return new Response(rangeRes.body, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(chunkSize),
              "Content-Range": `bytes ${start}-${end}/${totalSize}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, max-age=3600",
            },
          });
        }
      }
    }

    // Full request — stream the entire file
    const fullRes = await fetch(downloadUrl);

    if (!fullRes.ok || !fullRes.body) {
      console.error("[Audio Proxy] Download failed:", fullRes.status);
      return new Response("Audio temporarily unavailable", { status: 503 });
    }

    return new Response(fullRes.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Audio Proxy] Error fetching blob:", error);
    return new Response("Error fetching audio", { status: 500 });
  }
}
