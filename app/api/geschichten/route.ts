import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const profilId = searchParams.get("profilId");
  const showAll = searchParams.get("all") === "1"; // Admin: show all stories without profile filter

  // For shared profiles: check if user has access, then show ALL stories of that profile
  let where: Record<string, unknown> = showAll ? { userId } : { userId };
  if (profilId) {
    const isOwn = await prisma.hoererProfil.findFirst({ where: { id: profilId, userId } });
    if (isOwn) {
      // Own profile: show own stories for this profile
      where = { userId, hoererProfilId: profilId };
    } else {
      // Check shared access
      const zugriff = await prisma.profilZugriff.findFirst({
        where: { hoererProfilId: profilId, userId },
      });
      if (zugriff) {
        // Shared profile: show ALL stories of this profile (from any user)
        where = { hoererProfilId: profilId };
      } else {
        return Response.json([], { headers: { "Cache-Control": "private, no-store" } });
      }
    }
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
    isOwn: g.userId === userId, // for delete permissions
  })), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
