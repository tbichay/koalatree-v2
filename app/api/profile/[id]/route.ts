import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const profil = await prisma.hoererProfil.findFirst({
    where: { id, userId },
  });

  if (!profil) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(profil);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const data = await request.json();

  // Verify ownership first
  const existing = await prisma.hoererProfil.findFirst({ where: { id, userId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const updateData = {
    name: data.name,
    geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : undefined,
    alter: data.alter ?? undefined,
    geschlecht: data.geschlecht || null,
    interessen: data.interessen || [],
    lieblingsfarbe: data.lieblingsfarbe || null,
    lieblingstier: data.lieblingstier || null,
    charaktereigenschaften: data.charaktereigenschaften || [],
    herausforderungen: data.herausforderungen || [],
    tags: data.tags || [],
  };

  // Compute profile diff for history tracking
  const { computeProfileDiff } = await import("@/lib/profile-diff");
  const events = computeProfileDiff(existing, updateData);

  // Update profile + create events in a transaction
  const profil = await prisma.$transaction(async (tx) => {
    const updated = await tx.hoererProfil.update({
      where: { id },
      data: updateData,
    });

    if (events.length > 0) {
      await tx.profilEvent.createMany({
        data: events.map((e) => ({
          hoererProfilId: id,
          ...e,
        })),
      });
    }

    return updated;
  });

  return Response.json(profil);
}
