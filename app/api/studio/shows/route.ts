/**
 * Shows API — List / Create
 *
 * GET  /api/studio/shows        — list all shows for admin UI
 * POST /api/studio/shows        — create a new show (manual, not via bootstrap)
 *
 * The bootstrap (Claude-generated) flow lives at /api/studio/shows/bootstrap.
 * The Kids-App is unaffected; it keeps using the CHARACTERS/STORY_FORMATE
 * constants directly.
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";
import { computeShowReadinessFromLoaded } from "@/lib/studio/show-readiness";
import { randomUUID } from "crypto";

// Slug helper — deterministic, URL-safe, avoids collisions by suffixing.
function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Reserved — collide with static route segments under /studio/shows/*
const RESERVED_SLUGS = new Set(["new", "actors", "create", "bootstrap", "fokus-templates", "api"]);

async function uniqueSlug(base: string) {
  let root = slugify(base) || "show";
  if (RESERVED_SLUGS.has(root)) root = `${root}-show`;
  let candidate = root;
  for (let i = 0; i < 20; i++) {
    const exists = await prisma.show.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  return `${root}-${randomUUID().slice(0, 6)}`;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  // cast + foki fully included so we can compute readiness per show
  // without N+1 queries. `_count` bleibt fuer die UI-Zahlen erhalten.
  const shows = await prisma.show.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      cast: true,
      foki: true,
      _count: { select: { foki: true, cast: true, episodes: true } },
    },
  });

  const shaped = shows.map((s) => {
    const readiness = computeShowReadinessFromLoaded(s);
    // strip cast/foki arrays — list UI doesn't need them, just the
    // boolean + failure counts. Keeps payload small.
    const { cast: _c, foki: _f, ...rest } = s;
    void _c;
    void _f;
    return {
      ...rest,
      readiness: {
        ready: readiness.ready,
        blockingFailures: readiness.blockingFailures,
        warningFailures: readiness.warningFailures,
      },
    };
  });

  return Response.json({ shows: shaped });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const body = await request.json() as {
    title: string;
    description?: string;
    category?: string;
    ageBand?: string;
    brandVoice?: string;
    palette?: Record<string, string>;
    coverUrl?: string;
    actorIds?: string[];
    fokusTemplateIds?: string[];
  };

  if (!body.title?.trim()) {
    return Response.json({ error: "Titel ist erforderlich" }, { status: 400 });
  }

  const slug = await uniqueSlug(body.title);
  const revisionHash = randomUUID().slice(0, 12);

  const show = await prisma.show.create({
    data: {
      slug,
      title: body.title.trim(),
      description: body.description ?? "",
      category: body.category ?? "kids",
      ageBand: body.ageBand ?? null,
      brandVoice: body.brandVoice ?? "",
      palette: body.palette ? (body.palette as object) : undefined,
      coverUrl: body.coverUrl ?? null,
      revisionHash,
      ownerUserId: session.user.id,
      cast: body.actorIds?.length
        ? {
            create: body.actorIds.map((actorId, idx) => ({ actorId, orderIndex: idx })),
          }
        : undefined,
      // ShowFokus creation is deferred — /api/studio/shows/bootstrap builds
      // the userInputSchema+castRoles JSON properly. Manual-POST just creates
      // the shell; foki are added separately via /[slug]/foki.
    },
    include: { cast: true, foki: true },
  });

  return Response.json({ show }, { status: 201 });
}
