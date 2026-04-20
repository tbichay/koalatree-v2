/**
 * ProfileFieldDef detail — GET / PATCH / DELETE.
 *
 * System defs (ownerUserId=null) cannot be deleted, only deactivated. Admin-
 * owned defs are freely removable.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const field = await prisma.profileFieldDef.findUnique({ where: { id } });
  if (!field) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  return Response.json({ field });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const existing = await prisma.profileFieldDef.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const body = (await request.json()) as {
    label?: string;
    kind?: string;
    description?: string | null;
    placeholder?: string | null;
    options?: Array<{ value: string; label: string }> | null;
    required?: boolean;
    isActive?: boolean;
    order?: number;
    category?: string | null;
    minAlter?: number | null;
    maxAlter?: number | null;
    aiPrompt?: string | null;
  };

  const field = await prisma.profileFieldDef.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.kind !== undefined && { kind: body.kind }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.placeholder !== undefined && { placeholder: body.placeholder }),
      ...(body.options !== undefined && {
        // `null` → explicitly clear via Prisma.JsonNull sentinel;
        // otherwise cast the array payload.
        options: body.options === null ? Prisma.JsonNull : (body.options as unknown as object),
      }),
      ...(body.required !== undefined && { required: body.required }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.order !== undefined && { order: body.order }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.minAlter !== undefined && { minAlter: body.minAlter }),
      ...(body.maxAlter !== undefined && { maxAlter: body.maxAlter }),
      ...(body.aiPrompt !== undefined && { aiPrompt: body.aiPrompt }),
    },
  });

  return Response.json({ field });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const { id } = await ctx.params;
  const existing = await prisma.profileFieldDef.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  if (!existing.ownerUserId) {
    return Response.json(
      {
        error:
          "System-Felder koennen nicht geloescht werden — setze isActive=false zum Ausblenden.",
      },
      { status: 409 }
    );
  }

  await prisma.profileFieldDef.delete({ where: { id } });
  return Response.json({ deleted: true });
}
