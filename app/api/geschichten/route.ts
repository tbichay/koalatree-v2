import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const profilId = searchParams.get("profilId");

  const where: Record<string, unknown> = { userId };
  if (profilId) {
    where.hoererProfilId = profilId;
  }

  const geschichten = await prisma.geschichte.findMany({
    where,
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
