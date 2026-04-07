import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { list } from "@vercel/blob";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { geschichteId } = await request.json();

  // Find scene clips in blob
  const { blobs } = await list({ prefix: `films/${geschichteId}/scene-`, limit: 50 });
  const clips = blobs.filter((b) => b.pathname.endsWith(".mp4")).sort((a, b) => a.pathname.localeCompare(b.pathname));

  if (clips.length === 0) {
    return Response.json({ error: "No film clips found", geschichteId }, { status: 404 });
  }

  // Set the first clip as videoUrl
  await prisma.geschichte.update({
    where: { id: geschichteId },
    data: { videoUrl: clips[0].url },
  });

  return Response.json({
    success: true,
    clipsFound: clips.length,
    videoUrl: `/api/video/film/${geschichteId}`,
    clips: clips.map((c) => ({ name: c.pathname, size: c.size })),
  });
}
