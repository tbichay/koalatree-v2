/**
 * FokusTemplate list + create.
 *
 * GET  /api/studio/shows/fokus-templates          — list (system + admin-owned)
 * GET  /api/studio/shows/fokus-templates?category — filter by supportedCategories
 * POST /api/studio/shows/fokus-templates          — create a new template (custom, owned)
 *
 * The Show-edit UI's "add Fokus" picker and the /studio/shows/foki CRUD page
 * both consume this endpoint.
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const templates = await prisma.fokusTemplate.findMany({
    where: {
      AND: [
        category ? { supportedCategories: { has: category } } : {},
        // System templates (ownerUserId=null) + admin-owned are both visible
        { OR: [{ ownerUserId: null }, { ownerUserId: session.user.id }] },
      ],
    },
    orderBy: [{ ownerUserId: "asc" }, { minAlter: "asc" }, { displayName: "asc" }],
    include: { _count: { select: { shows: true } } },
  });

  return Response.json({ templates });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const body = (await request.json()) as {
    id?: string;
    displayName: string;
    description?: string | null;
    emoji?: string | null;
    systemPromptSkeleton: string;
    interactionStyle?: string | null;
    defaultCastRoles?: Record<string, unknown>;
    defaultUserInputSchema?: Record<string, unknown>;
    defaultDurationMin?: number;
    minAlter?: number;
    maxAlter?: number;
    supportedCategories?: string[];
  };

  if (!body.displayName?.trim())
    return Response.json({ error: "displayName fehlt" }, { status: 400 });
  if (!body.systemPromptSkeleton?.trim())
    return Response.json({ error: "systemPromptSkeleton fehlt" }, { status: 400 });

  // Slug from displayName if not provided; collision-safe via cuid-ish tail
  const rawId =
    body.id?.trim() ||
    body.displayName
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" }[c] as string))
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

  if (!rawId) return Response.json({ error: "Kein gueltiger Slug moeglich" }, { status: 400 });

  // Collision check (slug is PK)
  const existing = await prisma.fokusTemplate.findUnique({ where: { id: rawId } });
  const id = existing ? `${rawId}-${Date.now().toString(36).slice(-4)}` : rawId;

  const template = await prisma.fokusTemplate.create({
    data: {
      id,
      displayName: body.displayName.trim(),
      description: body.description ?? null,
      emoji: body.emoji ?? null,
      systemPromptSkeleton: body.systemPromptSkeleton.trim(),
      interactionStyle: body.interactionStyle ?? null,
      defaultCastRoles: (body.defaultCastRoles ?? {}) as object,
      defaultUserInputSchema: (body.defaultUserInputSchema ?? { fields: [] }) as object,
      defaultDurationMin: body.defaultDurationMin ?? 5,
      minAlter: body.minAlter ?? 3,
      maxAlter: body.maxAlter ?? 99,
      supportedCategories: body.supportedCategories ?? [],
      ownerUserId: session.user.id,
    },
  });

  return Response.json({ template }, { status: 201 });
}
