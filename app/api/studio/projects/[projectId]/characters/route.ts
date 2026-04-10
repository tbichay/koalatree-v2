/**
 * Studio Characters API — Manage characters for a project
 *
 * GET: List characters
 * POST: Add or extract characters
 * PUT: Update a character
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
  const characters = await prisma.studioCharacter.findMany({
    where: { project: { id: projectId, userId: session.user.id } },
    orderBy: { orderIndex: "asc" },
  });

  return Response.json({ characters });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json() as {
    action: "extract" | "add";
    character?: {
      name: string;
      markerId: string;
      description?: string;
      personality?: string;
      species?: string;
      role?: string;
      voiceId?: string;
      voiceSettings?: Record<string, number>;
      emoji?: string;
      color?: string;
    };
  };

  const project = await prisma.studioProject.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  if (body.action === "extract") {
    if (!project.storyText) return Response.json({ error: "Keine Geschichte" }, { status: 400 });

    const { extractCharacters } = await import("@/lib/studio/character-extractor");
    const extracted = await extractCharacters(project.storyText);

    // Delete old characters and replace with fresh extraction
    await prisma.studioCharacter.deleteMany({ where: { projectId } });

    const created: Awaited<ReturnType<typeof prisma.studioCharacter.create>>[] = [];
    for (const c of extracted) {
      const char = await prisma.studioCharacter.create({
        data: {
          projectId,
          name: c.name,
          markerId: c.markerId,
          description: c.description,
          personality: c.personality,
          species: c.species,
          role: c.role,
          emoji: c.emoji,
          portraitUrl: c.portraitUrl,
          voiceId: c.voiceId,
          voiceSettings: c.voiceSettings ? JSON.parse(JSON.stringify(c.voiceSettings)) : undefined,
          orderIndex: created.length,
        },
      });
      created.push(char);
    }

    return Response.json({ characters: created, extracted: true, count: created.length });
  }

  if (body.action === "add" && body.character) {
    const count = await prisma.studioCharacter.count({ where: { projectId } });
    const char = await prisma.studioCharacter.create({
      data: {
        projectId,
        name: body.character.name,
        markerId: body.character.markerId,
        description: body.character.description,
        personality: body.character.personality,
        species: body.character.species,
        role: body.character.role,
        voiceId: body.character.voiceId,
        voiceSettings: body.character.voiceSettings ? JSON.parse(JSON.stringify(body.character.voiceSettings)) : undefined,
        emoji: body.character.emoji,
        color: body.character.color,
        orderIndex: count,
      },
    });

    return Response.json({ character: char }, { status: 201 });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json() as {
    characterId: string;
    updates: Record<string, unknown>;
  };

  const char = await prisma.studioCharacter.findFirst({
    where: { id: body.characterId, project: { id: projectId, userId: session.user.id } },
  });
  if (!char) return Response.json({ error: "Charakter nicht gefunden" }, { status: 404 });

  // ── Actor Casting Logic ──
  const castData: Record<string, unknown> = {};

  if (body.updates.actorId !== undefined) {
    if (body.updates.actorId) {
      // Cast: load actor, create snapshot, copy voice + portrait
      const actor = await prisma.digitalActor.findFirst({
        where: { id: body.updates.actorId as string, userId: session.user.id },
      });
      if (!actor) return Response.json({ error: "Actor nicht gefunden" }, { status: 404 });

      // Resolve portrait URL — portraitAssetId is now a blob URL directly
      let portraitUrl: string | undefined;
      if (actor.portraitAssetId) {
        if (actor.portraitAssetId.startsWith("http")) {
          portraitUrl = actor.portraitAssetId;
        } else {
          // Legacy: might be an asset ID
          const asset = await prisma.asset.findUnique({ where: { id: actor.portraitAssetId } });
          if (asset) portraitUrl = asset.blobUrl;
        }
      }

      const snapshot = {
        voiceId: actor.voiceId,
        voiceSettings: actor.voiceSettings,
        portraitUrl,
        syncedAt: new Date().toISOString(),
      };

      // Push old snapshot to history if re-syncing
      if (char.actorId === actor.id && char.castSnapshot) {
        const history = (char.castHistory as Record<string, unknown>[] | null) || [];
        history.push(char.castSnapshot as Record<string, unknown>);
        castData.castHistory = history;
      }

      castData.actorId = actor.id;
      castData.castSnapshot = snapshot;
      castData.voiceId = actor.voiceId;
      castData.voiceSettings = actor.voiceSettings ? JSON.parse(JSON.stringify(actor.voiceSettings)) : undefined;
      if (portraitUrl) castData.portraitUrl = portraitUrl;
    } else {
      // Uncast: clear actorId, keep voice/portrait data
      castData.actorId = null;
    }
  }

  // ── Version Switch Logic ──
  if (body.updates.switchToSnapshot !== undefined) {
    const history = (char.castHistory as Record<string, unknown>[] | null) || [];
    const idx = body.updates.switchToSnapshot as number;
    if (idx >= 0 && idx < history.length) {
      const chosen = history[idx];
      // Move current snapshot to history, apply chosen
      const newHistory = [...history];
      newHistory.splice(idx, 1);
      if (char.castSnapshot) newHistory.push(char.castSnapshot as Record<string, unknown>);

      castData.castSnapshot = chosen;
      castData.castHistory = newHistory;
      castData.voiceId = chosen.voiceId as string | undefined;
      castData.voiceSettings = chosen.voiceSettings ? JSON.parse(JSON.stringify(chosen.voiceSettings)) : undefined;
      if (chosen.portraitUrl) castData.portraitUrl = chosen.portraitUrl as string;
    }
  }

  const updated = await prisma.studioCharacter.update({
    where: { id: body.characterId },
    data: {
      name: body.updates.name as string | undefined,
      description: body.updates.description as string | undefined,
      personality: body.updates.personality as string | undefined,
      species: body.updates.species as string | undefined,
      role: body.updates.role as string | undefined,
      voiceId: (castData.voiceId as string | undefined) ?? body.updates.voiceId as string | undefined,
      voiceSettings: castData.voiceSettings ?? (body.updates.voiceSettings ? JSON.parse(JSON.stringify(body.updates.voiceSettings)) : undefined),
      portraitUrl: (castData.portraitUrl as string | undefined) ?? body.updates.portraitUrl as string | undefined,
      emoji: body.updates.emoji as string | undefined,
      color: body.updates.color as string | undefined,
      ...(castData.actorId !== undefined ? { actorId: castData.actorId as string | null } : {}),
      ...(castData.castSnapshot !== undefined ? { castSnapshot: castData.castSnapshot as object } : {}),
      ...(castData.castHistory !== undefined ? { castHistory: castData.castHistory as object } : {}),
    },
  });

  return Response.json({ character: updated });
}
