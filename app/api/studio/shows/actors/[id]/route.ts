/**
 * Global Actor — GET / PATCH / DELETE.
 *
 * Global actors (ownerUserId=null) are read-only from the UI: seed-owned,
 * editable only via re-seed. Admin-created actors are fully editable.
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const actor = await prisma.actor.findUnique({
    where: { id },
    include: { _count: { select: { shows: true } } },
  });
  if (!actor) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  return Response.json({ actor });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const existing = await prisma.actor.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // For now, admins can edit any actor (including seeded globals). This is
  // intentional — admin is the show-creator. Non-admin calls are blocked
  // by requireAdmin above.

  const body = await request.json() as {
    displayName?: string;
    species?: string | null;
    role?: string | null;
    description?: string | null;
    emoji?: string | null;
    color?: string | null;
    portraitUrl?: string | null;
    voiceId?: string;
    voiceSettings?: Record<string, unknown>;
    persona?: string;
    ageStyles?: Record<string, string>;
    expertise?: string[];
    defaultTone?: string | null;
    personality?: string | null;
    speechStyle?: string | null;
    catchphrases?: string[];
    backstory?: string | null;
    relationships?: Record<string, string>;
    // Video-/Portrait-Felder (aus Unification Phase 1)
    outfit?: string | null;
    traits?: string | null;
    style?: string | null;
    tags?: string[];
  };

  const actor = await prisma.actor.update({
    where: { id },
    data: {
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.species !== undefined && { species: body.species }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.emoji !== undefined && { emoji: body.emoji }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.portraitUrl !== undefined && { portraitUrl: body.portraitUrl }),
      ...(body.voiceId !== undefined && { voiceId: body.voiceId }),
      ...(body.voiceSettings !== undefined && { voiceSettings: body.voiceSettings as object }),
      ...(body.persona !== undefined && { persona: body.persona }),
      ...(body.ageStyles !== undefined && { ageStyles: body.ageStyles as object }),
      ...(body.expertise !== undefined && { expertise: body.expertise }),
      ...(body.defaultTone !== undefined && { defaultTone: body.defaultTone }),
      ...(body.personality !== undefined && { personality: body.personality }),
      ...(body.speechStyle !== undefined && { speechStyle: body.speechStyle }),
      ...(body.catchphrases !== undefined && { catchphrases: body.catchphrases }),
      ...(body.backstory !== undefined && { backstory: body.backstory }),
      ...(body.relationships !== undefined && { relationships: body.relationships as object }),
      ...(body.outfit !== undefined && { outfit: body.outfit }),
      ...(body.traits !== undefined && { traits: body.traits }),
      ...(body.style !== undefined && { style: body.style }),
      ...(body.tags !== undefined && { tags: body.tags }),
    },
  });

  return Response.json({ actor });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const existing = await prisma.actor.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // Block deletion of the 7 seed actors — deleting them would orphan Show casts.
  if (!existing.ownerUserId) {
    return Response.json(
      { error: "Seed-Actors können nicht gelöscht werden." },
      { status: 409 }
    );
  }

  // Block if in use by any Show.
  const used = await prisma.showActor.count({ where: { actorId: id } });
  if (used > 0) {
    return Response.json(
      { error: `Actor ist in ${used} Show(s) besetzt — vorher auscasten.` },
      { status: 409 }
    );
  }

  await prisma.actor.delete({ where: { id } });
  return Response.json({ deleted: true });
}
