import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/profile/[id]/history/[eventId]
 * Hard-delete a single profile event. Ownership verified via profile.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id, eventId } = await params;

  // Verify profile ownership
  const profil = await prisma.hoererProfil.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!profil) return Response.json({ error: "Not found" }, { status: 404 });

  // Delete event only if it belongs to this profile
  const event = await prisma.profilEvent.findFirst({
    where: { id: eventId, hoererProfilId: id },
  });

  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });

  await prisma.profilEvent.delete({ where: { id: eventId } });

  return Response.json({ deleted: true });
}
