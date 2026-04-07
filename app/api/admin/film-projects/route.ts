import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tom@bichay.de";

async function checkAdmin() {
  const session = await auth();
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return null;
  return session.user.id!;
}

// GET: List all film projects
export async function GET() {
  const userId = await checkAdmin();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 403 });

  const projects = await prisma.filmProject.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json({ projects });
}

// POST: Create or update a film project
export async function POST(request: Request) {
  const userId = await checkAdmin();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const { id, name, description, style, characters, landscapes, introVideoUrl, outroVideoUrl, referenceImages } = body;

  if (id) {
    // Update existing
    const project = await prisma.filmProject.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(style !== undefined ? { style: JSON.parse(JSON.stringify(style)) } : {}),
        ...(characters !== undefined ? { characters } : {}),
        ...(landscapes !== undefined ? { landscapes } : {}),
        ...(introVideoUrl !== undefined ? { introVideoUrl } : {}),
        ...(outroVideoUrl !== undefined ? { outroVideoUrl } : {}),
        ...(referenceImages !== undefined ? { referenceImages } : {}),
      },
    });
    return Response.json({ project });
  }

  // Create new
  const project = await prisma.filmProject.create({
    data: {
      userId,
      name: name || "Neues Projekt",
      description,
      style: style ? JSON.parse(JSON.stringify(style)) : undefined,
      characters: characters || [],
      landscapes: landscapes || [],
      introVideoUrl,
      outroVideoUrl,
      referenceImages: referenceImages || [],
    },
  });

  return Response.json({ project });
}

// DELETE: Remove a film project
export async function DELETE(request: Request) {
  const userId = await checkAdmin();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await prisma.filmProject.deleteMany({ where: { id, userId } });
  return Response.json({ deleted: true });
}
