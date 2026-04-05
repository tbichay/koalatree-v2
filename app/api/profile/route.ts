import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const profile = await prisma.hoererProfil.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(profile, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const data = await request.json();

  // Duplikat-Check: gleicher Name für diesen User
  const existing = await prisma.hoererProfil.findFirst({
    where: { userId, name: data.name },
  });
  if (existing) {
    return Response.json(
      { error: "Ein Profil mit diesem Namen existiert bereits" },
      { status: 409 }
    );
  }

  const profil = await prisma.hoererProfil.create({
    data: {
      userId,
      name: data.name,
      geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : null,
      alter: data.alter ?? null,
      geschlecht: data.geschlecht || null,
      interessen: data.interessen || [],
      lieblingsfarbe: data.lieblingsfarbe || null,
      lieblingstier: data.lieblingstier || null,
      charaktereigenschaften: data.charaktereigenschaften || [],
      herausforderungen: data.herausforderungen || [],
      tags: data.tags || [],
    },
  });

  return Response.json(profil);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  await prisma.hoererProfil.deleteMany({
    where: { id, userId },
  });

  return Response.json({ ok: true });
}
