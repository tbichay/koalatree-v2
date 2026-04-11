/**
 * Studio Projects API — CRUD for film projects
 *
 * GET: List all projects for the current user
 * POST: Create a new project
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.studioProject.findMany({
    where: { userId: session.user.id },
    include: {
      characters: { select: { id: true, name: true, emoji: true, role: true, portraitUrl: true, voiceId: true, actorId: true, castSnapshot: true, castHistory: true, description: true, markerId: true, personality: true, species: true, voiceSettings: true } },
      sequences: { orderBy: { orderIndex: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json({ projects });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    name: string;
    description?: string;
    storyText?: string;
    storySource?: string;
    language?: string;
    stylePrompt?: string;
    directingStyle?: string;
    atmosphere?: string;
  };

  const project = await prisma.studioProject.create({
    data: {
      userId: session.user.id,
      name: body.name || "",
      description: body.description,
      storyText: body.storyText,
      storySource: body.storySource || (body.storyText ? "typed" : undefined),
      language: body.language || "de",
      stylePrompt: body.stylePrompt,
      directingStyle: body.directingStyle || "pixar-classic",
      atmosphere: body.atmosphere,
      status: body.storyText ? "draft" : "draft",
    },
  });

  return Response.json({ project }, { status: 201 });
}
