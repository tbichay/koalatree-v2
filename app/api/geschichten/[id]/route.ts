import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { del } from "@vercel/blob";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const geschichte = await prisma.geschichte.findFirst({
    where: { id, userId },
    include: {
      hoererProfil: {
        select: { id: true, name: true, alter: true, geburtsdatum: true, geschlecht: true },
      },
    },
  });

  if (!geschichte) return Response.json({ error: "Not found" }, { status: 404 });

  // backwards compat
  return Response.json({
    ...geschichte,
    kindProfil: geschichte.hoererProfil,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const geschichte = await prisma.geschichte.findFirst({
    where: { id, userId },
    select: { id: true, audioUrl: true },
  });

  if (!geschichte) return Response.json({ error: "Not found" }, { status: 404 });

  // Delete audio blob if exists
  if (geschichte.audioUrl && geschichte.audioUrl !== "local") {
    try {
      await del(geschichte.audioUrl);
    } catch (err) {
      console.error("[Delete] Blob deletion failed:", err);
      // Continue with DB deletion even if blob fails
    }
  }

  await prisma.geschichte.delete({ where: { id } });

  return Response.json({ deleted: true });
}
