import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const profil = await prisma.kindProfil.findFirst({
    where: { id, userId },
  });

  if (!profil) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(profil);
}
