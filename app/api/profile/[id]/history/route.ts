import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/profile/[id]/history
 * Returns all profile events, sorted by createdAt desc, max 100.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  // Verify profile ownership
  const profil = await prisma.hoererProfil.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!profil) return Response.json({ error: "Not found" }, { status: 404 });

  const events = await prisma.profilEvent.findMany({
    where: { hoererProfilId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json(events);
}

/**
 * DELETE /api/profile/[id]/history
 * Bulk-delete events. Body: { eventIds: string[] }
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const { eventIds } = (await request.json()) as { eventIds: string[] };

  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return Response.json({ error: "eventIds required" }, { status: 400 });
  }

  // Verify profile ownership
  const profil = await prisma.hoererProfil.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!profil) return Response.json({ error: "Not found" }, { status: 404 });

  // Delete only events belonging to this profile
  const result = await prisma.profilEvent.deleteMany({
    where: {
      id: { in: eventIds },
      hoererProfilId: id,
    },
  });

  return Response.json({ deleted: result.count });
}
