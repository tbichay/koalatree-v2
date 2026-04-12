/**
 * Studio Sequence API — Update sequence metadata
 *
 * PUT: Update sequence fields (costumes, location, etc.)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;

  // Verify ownership
  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
  });

  if (!sequence)
    return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = await request.json() as {
    costumes?: Record<string, { description: string; imageUrl?: string }> | null;
    location?: string;
    atmosphereText?: string;
    landscapeRefUrl?: string;
  };

  const updateData: Record<string, unknown> = {};

  if (body.costumes !== undefined) {
    updateData.costumes = body.costumes ? JSON.parse(JSON.stringify(body.costumes)) : null;
  }
  if (body.location !== undefined) updateData.location = body.location;
  if (body.atmosphereText !== undefined) updateData.atmosphereText = body.atmosphereText;
  if (body.landscapeRefUrl !== undefined) updateData.landscapeRefUrl = body.landscapeRefUrl;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: "Keine Aenderungen" }, { status: 400 });
  }

  const updated = await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: updateData,
  });

  return Response.json({ ok: true, sequence: updated });
}
