/**
 * Asset CRUD API — Single asset operations
 *
 * GET:    Load asset with metadata
 * PUT:    Update name, tags, category
 * DELETE: Remove asset (DB record)
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { assetId } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: session.user.id },
  });

  if (!asset) return Response.json({ error: "Asset nicht gefunden" }, { status: 404 });

  return Response.json({ asset });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { assetId } = await params;
  const body = await request.json() as {
    name?: string;
    tags?: string[];
    category?: string;
  };

  // Verify ownership
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, userId: session.user.id },
  });
  if (!existing) return Response.json({ error: "Asset nicht gefunden" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.category !== undefined) updateData.category = body.category;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: "Keine Aenderungen" }, { status: 400 });
  }

  const asset = await prisma.asset.update({
    where: { id: assetId },
    data: updateData,
  });

  return Response.json({ asset });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { assetId } = await params;

  // Verify ownership
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, userId: session.user.id },
  });
  if (!existing) return Response.json({ error: "Asset nicht gefunden" }, { status: 404 });

  await prisma.asset.delete({ where: { id: assetId } });

  return Response.json({ ok: true });
}
