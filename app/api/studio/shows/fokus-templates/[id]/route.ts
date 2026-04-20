/**
 * FokusTemplate detail — GET / PATCH / DELETE.
 *
 * Admin can edit any template (including system seeds). Deletion is blocked
 * if any ShowFokus references the template — caller must detach first.
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const template = await prisma.fokusTemplate.findUnique({
    where: { id },
    include: { _count: { select: { shows: true } } },
  });
  if (!template) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  return Response.json({ template });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const existing = await prisma.fokusTemplate.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = (await request.json()) as {
    displayName?: string;
    description?: string | null;
    emoji?: string | null;
    systemPromptSkeleton?: string;
    interactionStyle?: string | null;
    defaultCastRoles?: Record<string, unknown>;
    defaultUserInputSchema?: Record<string, unknown>;
    defaultDurationMin?: number;
    minAlter?: number;
    maxAlter?: number;
    supportedCategories?: string[];
  };

  const template = await prisma.fokusTemplate.update({
    where: { id },
    data: {
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.emoji !== undefined && { emoji: body.emoji }),
      ...(body.systemPromptSkeleton !== undefined && {
        systemPromptSkeleton: body.systemPromptSkeleton,
      }),
      ...(body.interactionStyle !== undefined && { interactionStyle: body.interactionStyle }),
      ...(body.defaultCastRoles !== undefined && {
        defaultCastRoles: body.defaultCastRoles as object,
      }),
      ...(body.defaultUserInputSchema !== undefined && {
        defaultUserInputSchema: body.defaultUserInputSchema as object,
      }),
      ...(body.defaultDurationMin !== undefined && {
        defaultDurationMin: body.defaultDurationMin,
      }),
      ...(body.minAlter !== undefined && { minAlter: body.minAlter }),
      ...(body.maxAlter !== undefined && { maxAlter: body.maxAlter }),
      ...(body.supportedCategories !== undefined && {
        supportedCategories: body.supportedCategories,
      }),
    },
  });

  return Response.json({ template });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const existing = await prisma.fokusTemplate.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  // Block system-seed deletion (ownerUserId=null) — admins can edit but not remove
  // base templates, otherwise a re-seed is required.
  if (!existing.ownerUserId) {
    return Response.json(
      { error: "System-Templates koennen nicht geloescht werden." },
      { status: 409 }
    );
  }

  // Block if any Show still references this template via ShowFokus.
  const inUse = await prisma.showFokus.count({ where: { fokusTemplateId: id } });
  if (inUse > 0) {
    return Response.json(
      { error: `Template ist in ${inUse} Show-Fokus/Foki aktiv — erst dort entfernen.` },
      { status: 409 }
    );
  }

  await prisma.fokusTemplate.delete({ where: { id } });
  return Response.json({ deleted: true });
}
