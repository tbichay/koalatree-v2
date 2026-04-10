/**
 * Studio Project API — Get and update a single project
 *
 * GET: Fetch project with characters and sequences
 * PUT: Update project fields (name, storyText, style, etc.)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await prisma.studioProject.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: {
      characters: { orderBy: { orderIndex: "asc" } },
      sequences: { orderBy: { orderIndex: "asc" } },
    },
  });

  if (!project) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  return Response.json({ project });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json() as {
    name?: string;
    storyText?: string;
    storySource?: string;
    description?: string;
    language?: string;
    stylePrompt?: string;
    directingStyle?: string;
    atmosphere?: string;
    format?: string;
    status?: string;
  };

  const project = await prisma.studioProject.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const updated = await prisma.studioProject.update({
    where: { id: projectId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.storyText !== undefined && { storyText: body.storyText }),
      ...(body.storySource !== undefined && { storySource: body.storySource }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.language !== undefined && { language: body.language }),
      ...(body.stylePrompt !== undefined && { stylePrompt: body.stylePrompt }),
      ...(body.directingStyle !== undefined && { directingStyle: body.directingStyle }),
      ...(body.atmosphere !== undefined && { atmosphere: body.atmosphere }),
      ...(body.format !== undefined && { format: body.format }),
      ...(body.status !== undefined && { status: body.status }),
    },
    include: {
      characters: { select: { id: true, name: true, emoji: true, role: true } },
      sequences: { select: { id: true, name: true, status: true, orderIndex: true } },
    },
  });

  return Response.json({ project: updated });
}
