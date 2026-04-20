/**
 * Global Actors API (Shows-System)
 *
 * These are the KoalaTree cast used across Shows (Koda, Kiki, Luna, …)
 * — distinct from /api/studio/actors which manages user-owned DigitalActor
 * rows for the Film-Maker. Name-conflict avoided by nesting under /shows.
 *
 * GET  /api/studio/shows/actors          — list all global + admin-owned actors
 * POST /api/studio/shows/actors          — create a custom actor
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  // Global actors (ownerUserId=null) + actors this admin owns.
  const actors = await prisma.actor.findMany({
    where: {
      OR: [{ ownerUserId: null }, { ownerUserId: session.user.id }],
    },
    orderBy: [{ ownerUserId: "asc" }, { displayName: "asc" }],
    include: {
      _count: { select: { shows: true } },
    },
  });

  return Response.json({ actors });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const body = await request.json() as {
    displayName: string;
    species?: string;
    role?: string;
    description?: string;
    emoji?: string;
    color?: string;
    portraitUrl?: string;
    voiceId: string;
    voiceSettings?: Record<string, unknown>;
    persona: string;
    ageStyles?: Record<string, string>;
    expertise?: string[];
    defaultTone?: string;
    personality?: string;
    speechStyle?: string;
    catchphrases?: string[];
    backstory?: string;
    relationships?: Record<string, string>;
  };

  if (!body.displayName?.trim()) return Response.json({ error: "displayName fehlt" }, { status: 400 });
  if (!body.voiceId?.trim()) return Response.json({ error: "voiceId fehlt" }, { status: 400 });
  if (!body.persona?.trim()) return Response.json({ error: "persona fehlt" }, { status: 400 });

  const id = `${body.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${randomUUID().slice(0, 6)}`;

  const actor = await prisma.actor.create({
    data: {
      id,
      displayName: body.displayName.trim(),
      species: body.species ?? null,
      role: body.role ?? null,
      description: body.description ?? null,
      emoji: body.emoji ?? null,
      color: body.color ?? null,
      portraitUrl: body.portraitUrl ?? null,
      voiceProvider: "elevenlabs",
      voiceId: body.voiceId,
      voiceSettings: (body.voiceSettings ?? {}) as object,
      persona: body.persona.trim(),
      ageStyles: (body.ageStyles ?? {}) as object,
      expertise: body.expertise ?? [],
      defaultTone: body.defaultTone ?? null,
      personality: body.personality ?? null,
      speechStyle: body.speechStyle ?? null,
      catchphrases: body.catchphrases ?? [],
      backstory: body.backstory ?? null,
      relationships: (body.relationships ?? {}) as object,
      ownerUserId: session.user.id,
    },
  });

  return Response.json({ actor }, { status: 201 });
}
