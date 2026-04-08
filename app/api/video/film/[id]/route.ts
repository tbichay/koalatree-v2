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
  const { id: geschichteId } = await params;

  // Find story
  const geschichte = await prisma.geschichte.findUnique({
    where: { id: geschichteId },
    select: { videoUrl: true, userId: true, shareSlug: true, hoererProfilId: true },
  });

  if (!geschichte?.videoUrl) {
    return new Response("Film not found", { status: 404 });
  }

  // Access check: owner, shared profile, or public share
  const isOwner = userId === geschichte.userId;
  const isPublicShared = !!geschichte.shareSlug;
  let hasAccess = isOwner || isPublicShared;

  if (!hasAccess && userId) {
    const zugriff = await prisma.profilZugriff.findFirst({
      where: { hoererProfilId: geschichte.hoererProfilId, userId },
    });
    hasAccess = !!zugriff;
  }

  if (!hasAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const videoUrl = geschichte.videoUrl;

    // S3 URLs (from Remotion Lambda renders) — fetch directly
    if (videoUrl.includes("s3.") || videoUrl.includes("amazonaws.com")) {
      const s3Res = await fetch(videoUrl);
      if (!s3Res.ok) return new Response("Video unavailable from S3", { status: 503 });
      const buffer = Buffer.from(await s3Res.arrayBuffer());
      return new Response(buffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(buffer.byteLength),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    // Vercel Blob URLs — use SDK
    const result = await get(videoUrl, { access: "private" });
    if (!result?.stream) return new Response("Video unavailable", { status: 503 });

    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
    const buffer = Buffer.concat(chunks);

    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
