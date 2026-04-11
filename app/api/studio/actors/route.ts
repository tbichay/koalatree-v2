/**
 * Studio Actors API — CRUD for Digital Actors
 *
 * GET: List all actors for the current user
 * POST: Create a new actor
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const actors = await prisma.digitalActor.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { characters: true } } },
  });

  return Response.json({ actors });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    name: string;
    description?: string;
    voiceDescription?: string;
    voiceId?: string;
    voiceSettings?: Record<string, unknown>;
    voicePreviewUrl?: string;
    portraitAssetId?: string;
    style?: string;
    outfit?: string;
    traits?: string;
    tags?: string[];
  };

  if (!body.name) {
    return Response.json({ error: "Name ist erforderlich" }, { status: 400 });
  }

  const actor = await prisma.digitalActor.create({
    data: {
      userId: session.user.id,
      name: body.name,
      description: body.description,
      voiceDescription: body.voiceDescription,
      voiceId: body.voiceId,
      voiceSettings: body.voiceSettings ? JSON.parse(JSON.stringify(body.voiceSettings)) : undefined,
      voicePreviewUrl: body.voicePreviewUrl,
      portraitAssetId: body.portraitAssetId,
      style: body.style,
      outfit: body.outfit,
      traits: body.traits,
      tags: body.tags || [],
    },
  });

  return Response.json({ actor }, { status: 201 });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    id: string;
    updates: {
      name?: string;
      description?: string;
      voiceDescription?: string | null;
      voiceId?: string;
      voiceSettings?: Record<string, unknown>;
      voicePreviewUrl?: string;
      portraitAssetId?: string;
      style?: string;
      outfit?: string | null;
      traits?: string | null;
      tags?: string[];
    };
  };

  if (!body.id) {
    return Response.json({ error: "Actor ID ist erforderlich" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.digitalActor.findFirst({
    where: { id: body.id, userId: session.user.id },
  });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const updateData: Record<string, unknown> = { ...body.updates };
  if (updateData.voiceSettings) {
    updateData.voiceSettings = JSON.parse(JSON.stringify(updateData.voiceSettings));
  }
  const actor = await prisma.digitalActor.update({
    where: { id: body.id },
    data: updateData as Parameters<typeof prisma.digitalActor.update>[0]["data"],
  });

  return Response.json({ actor });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "ID ist erforderlich" }, { status: 400 });

  // Verify ownership
  const existing = await prisma.digitalActor.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  await prisma.digitalActor.delete({ where: { id } });

  return Response.json({ deleted: true });
}
