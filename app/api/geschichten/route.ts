import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const geschichten = await prisma.geschichte.findMany({
    where: { userId },
    include: {
      hoererProfil: {
        select: { name: true, alter: true, geburtsdatum: true, geschlecht: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Map for frontend compatibility (kindProfil → hoererProfil)
  // Replace blob URLs with proxy URLs for private store access
  return Response.json(geschichten.map(g => ({
    ...g,
    audioUrl: g.audioUrl && g.audioUrl !== "local" ? `/api/audio/${g.id}` : null,
    kindProfil: g.hoererProfil, // backwards compat for frontend
  })), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
