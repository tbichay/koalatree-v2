import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.kindProfil.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(profile);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const data = await request.json();

  const profil = await prisma.kindProfil.create({
    data: {
      userId,
      name: data.name,
      alter: data.alter,
      geschlecht: data.geschlecht || null,
      interessen: data.interessen || [],
      lieblingsfarbe: data.lieblingsfarbe || null,
      lieblingstier: data.lieblingstier || null,
      charaktereigenschaften: data.charaktereigenschaften || [],
      herausforderungen: data.herausforderungen || [],
    },
  });

  return Response.json(profil);
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  await prisma.kindProfil.deleteMany({
    where: { id, userId },
  });

  return Response.json({ ok: true });
}
