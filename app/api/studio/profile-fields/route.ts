/**
 * Studio CRUD for ProfileFieldDef.
 *
 * GET  /api/studio/profile-fields          — list (system + admin-owned)
 * POST /api/studio/profile-fields          — create a new field definition
 *
 * Edits go to /api/studio/profile-fields/[id].
 *
 * Why live on Koalatree and not on Canzoia?
 *   The story prompter runs here and needs to know which profile keys are
 *   first-class so they can be referenced in prompts. Putting the field
 *   catalog next to the story engine keeps the two in lock-step: Canzoia
 *   pulls the list via /api/canzoia/profile-fields (signed HMAC) to drive
 *   its onboarding chatbot.
 */

import { prisma } from "@/lib/db";
import { requireAdmin, unauthorized } from "@/lib/studio/admin-auth";

const KIND_VALUES = ["text", "number", "select", "multi_select", "boolean", "tags"] as const;
type Kind = (typeof KIND_VALUES)[number];
const KIND_SET = new Set<string>(KIND_VALUES);

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const fields = await prisma.profileFieldDef.findMany({
    where: {
      OR: [{ ownerUserId: null }, { ownerUserId: session.user.id }],
    },
    orderBy: [{ ownerUserId: "asc" }, { order: "asc" }, { label: "asc" }],
  });

  return Response.json({ fields });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  const body = (await request.json()) as {
    id?: string;
    label: string;
    kind: Kind;
    description?: string | null;
    placeholder?: string | null;
    options?: Array<{ value: string; label: string }>;
    required?: boolean;
    isActive?: boolean;
    order?: number;
    category?: string | null;
    minAlter?: number | null;
    maxAlter?: number | null;
    aiPrompt?: string | null;
  };

  if (!body.label?.trim())
    return Response.json({ error: "label fehlt" }, { status: 400 });
  if (!body.kind || !KIND_SET.has(body.kind))
    return Response.json(
      { error: `kind muss eines sein: ${KIND_VALUES.join(", ")}` },
      { status: 400 }
    );
  if ((body.kind === "select" || body.kind === "multi_select") && (!body.options || body.options.length === 0))
    return Response.json(
      { error: "select / multi_select brauchen mindestens eine Option" },
      { status: 400 }
    );

  // Slug from id-or-label; collision-safe via timestamp suffix.
  const rawId =
    body.id?.trim() ||
    body.label
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" }[c] as string))
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  if (!rawId) return Response.json({ error: "Kein gueltiger Slug" }, { status: 400 });

  const existing = await prisma.profileFieldDef.findUnique({ where: { id: rawId } });
  const id = existing ? `${rawId}-${Date.now().toString(36).slice(-4)}` : rawId;

  const field = await prisma.profileFieldDef.create({
    data: {
      id,
      label: body.label.trim(),
      kind: body.kind,
      description: body.description ?? null,
      placeholder: body.placeholder ?? null,
      options: body.options ? (body.options as unknown as object) : undefined,
      required: body.required ?? false,
      isActive: body.isActive ?? true,
      order: body.order ?? 0,
      category: body.category ?? null,
      minAlter: body.minAlter ?? null,
      maxAlter: body.maxAlter ?? null,
      aiPrompt: body.aiPrompt ?? null,
      ownerUserId: session.user.id,
    },
  });

  return Response.json({ field }, { status: 201 });
}
