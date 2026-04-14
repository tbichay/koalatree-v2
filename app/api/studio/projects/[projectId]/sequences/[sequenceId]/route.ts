/**
 * Studio Sequence API — CRUD for sequences
 *
 * PUT: Update sequence fields (costumes, location, etc.)
 * DELETE: Remove a sequence and reindex remaining
 * PATCH: Move sequence up/down (reorder)
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
    scenes?: unknown[];
    location?: string;
    atmosphereText?: string;
    landscapeRefUrl?: string;
    status?: string;
  };

  const updateData: Record<string, unknown> = {};

  if (body.costumes !== undefined) {
    updateData.costumes = body.costumes ? JSON.parse(JSON.stringify(body.costumes)) : null;
  }
  if (body.scenes !== undefined) {
    updateData.scenes = JSON.parse(JSON.stringify(body.scenes));
  }
  if (body.location !== undefined) updateData.location = body.location;
  if (body.atmosphereText !== undefined) updateData.atmosphereText = body.atmosphereText;
  if (body.landscapeRefUrl !== undefined) updateData.landscapeRefUrl = body.landscapeRefUrl;
  if (body.status !== undefined) updateData.status = body.status;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: "Keine Aenderungen" }, { status: 400 });
  }

  const updated = await prisma.studioSequence.update({
    where: { id: sequenceId },
    data: updateData,
  });

  return Response.json({ ok: true, sequence: updated });
}

/** Delete a sequence and reindex remaining sequences */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;

  const sequence = await prisma.studioSequence.findFirst({
    where: { id: sequenceId, project: { id: projectId, userId: session.user.id } },
  });
  if (!sequence) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // Delete the sequence
  await prisma.studioSequence.delete({ where: { id: sequenceId } });

  // Reindex remaining sequences
  const remaining = await prisma.studioSequence.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].orderIndex !== i) {
      await prisma.studioSequence.update({
        where: { id: remaining[i].id },
        data: { orderIndex: i },
      });
    }
  }

  return Response.json({ ok: true, remaining: remaining.length });
}

/** Move a sequence up or down */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sequenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sequenceId } = await params;
  const body = await request.json() as { direction: "up" | "down" };

  const sequences = await prisma.studioSequence.findMany({
    where: { projectId, project: { userId: session.user.id } },
    orderBy: { orderIndex: "asc" },
  });

  const idx = sequences.findIndex((s) => s.id === sequenceId);
  if (idx === -1) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const swapIdx = body.direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sequences.length) {
    return Response.json({ error: "Kann nicht weiter verschoben werden" }, { status: 400 });
  }

  // Swap orderIndex values
  await prisma.$transaction([
    prisma.studioSequence.update({
      where: { id: sequences[idx].id },
      data: { orderIndex: sequences[swapIdx].orderIndex },
    }),
    prisma.studioSequence.update({
      where: { id: sequences[swapIdx].id },
      data: { orderIndex: sequences[idx].orderIndex },
    }),
  ]);

  return Response.json({ ok: true });
}
